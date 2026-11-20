// Family Tree server: serves the built app and relays the voice assistant
// between the browser and Gemini Live on Vertex AI.
//
//   browser ──ws /api/voice──▶ this server ──Live API──▶ gemini-3.8-live (Vertex, us-central1)
//
// Tool calls are forwarded to the browser, which runs them against the same
// store as the UI (so the tree updates on screen) and sends the result back.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import tools from '../shared/voice-tools.json' with { type: 'json' };
import { systemInstruction } from './prompt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_LIVE_MODEL || 'gemini-3.8-live';
const VOICE = process.env.VOICE_NAME || 'Aoede';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY;
const MAX_SESSION_MS = 15 * 60 * 1000;

if (!PROJECT) console.warn('[voice] GOOGLE_CLOUD_PROJECT is not set — voice sessions will fail.');
const ai = new GoogleGenAI({ enterprise: true, project: PROJECT, location: LOCATION });

/** Only people holding a tree's key may start a voice session (keeps the endpoint from being used freely). */
async function treeOk(treeId, treeKey) {
  if (!/^[0-9a-f-]{36}$/i.test(String(treeId)) || !/^[0-9a-f]{20,}$/i.test(String(treeKey))) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/trees?id=eq.${treeId}&select=id`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'x-tree-key': treeKey },
    });
    return r.ok && (await r.json()).length === 1;
  } catch {
    return false;
  }
}

// ---------------- static app ----------------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
};
async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200).end('ok'); return; }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  let st = await stat(file).catch(() => null);
  if (!st || st.isDirectory()) { file = path.join(DIST, 'index.html'); st = await stat(file).catch(() => null); }
  if (!st) { res.writeHead(404).end('Not built — run npm run build'); return; }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  serveStatic(req, res).catch(err => { console.error(err); res.writeHead(500).end(); });
});

// ---------------- voice relay ----------------
const wss = new WebSocketServer({ server, path: '/api/voice', maxPayload: 1 << 20 });

wss.on('connection', ws => {
  let session = null;
  let setupSeen = false, kicked = false, closed = false;
  const send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const kick = () => {
    if (kicked || !session || !setupSeen) return;
    kicked = true;
    send({ type: 'ready' });
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: '(The user just opened the voice assistant.)' }] }], turnComplete: true });
  };
  const timer = setTimeout(() => { send({ type: 'error', message: 'time_limit' }); ws.close(); }, MAX_SESSION_MS);

  const relay = msg => {
    if (msg.setupComplete) { setupSeen = true; kick(); }
    const sc = msg.serverContent;
    if (sc) {
      for (const part of sc.modelTurn?.parts || []) if (part.inlineData?.data) send({ type: 'audio', data: part.inlineData.data });
      if (sc.inputTranscription?.text) send({ type: 'transcript', who: 'user', text: sc.inputTranscription.text });
      if (sc.outputTranscription?.text) send({ type: 'transcript', who: 'agent', text: sc.outputTranscription.text });
      if (sc.interrupted) send({ type: 'interrupted' });
      if (sc.turnComplete) send({ type: 'turn_complete' });
    }
    if (msg.toolCall?.functionCalls?.length)
      send({ type: 'tool_call', calls: msg.toolCall.functionCalls.map(c => ({ id: c.id, name: c.name, args: c.args || {} })) });
    if (msg.toolCallCancellation?.ids) send({ type: 'tool_cancel', ids: msg.toolCallCancellation.ids });
    if (msg.goAway) send({ type: 'error', message: 'go_away' });
  };

  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'start') {
      if (session) return;
      if (!(await treeOk(m.treeId, m.treeKey))) { send({ type: 'error', message: 'bad_tree' }); ws.close(); return; }
      const lang = m.lang === 'te' ? 'te' : 'en';
      try {
        session = await ai.live.connect({
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
              ...(lang === 'te' ? { languageCode: 'te-IN' } : {}),
            },
            systemInstruction: { parts: [{ text: systemInstruction(lang, m.context) }] },
            tools: [{ functionDeclarations: tools.map(t => ({ ...t, behavior: 'BLOCKING' })) }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: { slidingWindow: {} },
          },
          callbacks: {
            onmessage: relay,
            onerror: e => { console.error('[voice] live error', e?.message || e); send({ type: 'error', message: 'live_error' }); },
            onclose: e => { if (!closed) { send({ type: 'closed', reason: e?.reason || '' }); ws.close(); } },
          },
        });
        if (closed) { session.close(); return; }
        kick();
      } catch (e) {
        console.error('[voice] connect failed', e?.message || e);
        send({ type: 'error', message: 'connect_failed' });
        ws.close();
      }
      return;
    }

    if (!session) return;
    try {
      if (m.type === 'audio' && typeof m.data === 'string') session.sendRealtimeInput({ audio: { data: m.data, mimeType: 'audio/pcm;rate=16000' } });
      else if (m.type === 'audio_end') session.sendRealtimeInput({ audioStreamEnd: true });
      else if (m.type === 'text') session.sendRealtimeInput({ text: String(m.text).slice(0, 2000) });
      else if (m.type === 'note') session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: String(m.text).slice(0, 2000) }] }], turnComplete: true });
      else if (m.type === 'tool_result') session.sendToolResponse({ functionResponses: [{ id: m.id, name: m.name, response: m.response }] });
    } catch (e) {
      console.error('[voice] send failed', e?.message || e);
    }
  });

  ws.on('close', () => {
    closed = true;
    clearTimeout(timer);
    try { session?.close(); } catch { /* already closed */ }
  });
});

server.listen(PORT, () => console.log(`[family-tree] http://localhost:${PORT}  (voice model ${MODEL} @ ${LOCATION}, project ${PROJECT || '—'})`));
