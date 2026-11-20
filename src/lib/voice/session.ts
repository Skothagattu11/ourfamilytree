import { create } from 'zustand';
import { useData } from '../../store';
import { families, fullName } from '../family';
import { Mic, Speaker } from './audio';
import { cancelProposal, confirmProposal, runTool, useProposals } from './tools';

export type VoiceStatus = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export interface Line { who: 'user' | 'agent' | 'note'; text: string }

interface VoiceStore {
  open: boolean;
  status: VoiceStatus;
  error: string;
  lines: Line[];
  level: number;
  muted: boolean;
}
export const useVoice = create<VoiceStore>(() => ({ open: false, status: 'off', error: '', lines: [], level: 0, muted: false }));

let ws: WebSocket | null = null;
let mic: Mic | null = null;
let speaker: Speaker | null = null;
let lastWho: Line['who'] | null = null;

const setV = (p: Partial<VoiceStore>) => useVoice.setState(p);
const push = (who: Line['who'], text: string) => {
  useVoice.setState(s => {
    const lines = s.lines.slice();
    if (lastWho === who && who !== 'note' && lines.length) lines[lines.length - 1] = { who, text: lines[lines.length - 1].text + text };
    else lines.push({ who, text: text.trimStart() });
    return { lines: lines.slice(-40) };
  });
  lastWho = who;
};
const send = (m: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function context() {
  const d = useData.getState();
  const ps = d.people;
  return {
    name: d.tree?.name,
    total: Object.keys(ps).length,
    empty: !Object.keys(ps).length,
    families: Object.keys(families(ps)),
    me: d.me && ps[d.me] ? { id: d.me, name: fullName(ps[d.me]) } : null,
  };
}

export async function startVoice() {
  if (ws) return;
  const tree = useData.getState().tree;
  if (!tree) return;
  setV({ open: true, status: 'connecting', error: '', lines: [], level: 0, muted: false });
  useProposals.setState({ list: [] });
  lastWho = null;
  speaker = new Speaker();
  speaker.unlock().catch(() => {});                // call inside the tap; don't wait on it
  speaker.onIdle = () => { if (useVoice.getState().status === 'speaking') setV({ status: 'listening' }); };
  try {
    mic = new Mic();
    mic.muted = useVoice.getState().muted;
    await mic.start(b64 => send({ type: 'audio', data: b64 }), level => setV({ level }));
  } catch (e) {
    // no microphone (plain http, blocked, or none) — carry on by typing
    console.warn('mic unavailable', e);
    mic?.stop(); mic = null;
    setV({ muted: true });
    push('note', window.isSecureContext ? '🎙 Microphone blocked — you can type instead.' : '🎙 Microphone needs https — you can type instead.');
    lastWho = null;
  }

  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/voice`);
  ws.onopen = () => send({ type: 'start', treeId: tree.id, treeKey: tree.key, lang: useData.getState().lang, context: context() });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'ready': setV({ status: 'listening' }); break;
      case 'audio': speaker?.play(m.data); setV({ status: 'speaking' }); break;
      case 'interrupted': speaker?.stop(); setV({ status: 'listening' }); break;
      case 'turn_complete': lastWho = null; if (!speaker?.speaking) setV({ status: 'listening' }); break;
      case 'transcript': push(m.who, m.text); if (m.who === 'user') setV({ status: 'thinking' }); break;
      case 'tool_call':
        setV({ status: 'thinking' });
        for (const c of m.calls) send({ type: 'tool_result', id: c.id, name: c.name, response: runTool(c.name, c.args) });
        break;
      case 'error': setV({ status: 'error', error: m.message }); break;
      case 'closed': stopVoice(true); break;
    }
  };
  ws.onclose = () => { if (useVoice.getState().status !== 'error') stopVoice(true); else stopVoice(true, true); };
}

/** End the conversation (keeps the panel open with the transcript unless asked to close). */
export function stopVoice(keepOpen = false, keepError = false) {
  const w = ws; ws = null;
  try { w?.close(); } catch { /* closed */ }
  mic?.stop(); mic = null;
  speaker?.close(); speaker = null;
  setV({ status: keepError ? 'error' : 'off', level: 0, ...(keepOpen ? {} : { open: false }) });
}

export function setMuted(muted: boolean) {
  if (!mic) return;                                // typing-only session
  mic.muted = muted;
  setV({ muted });
}

/** Typed message instead of speech. */
export function sendText(text: string) {
  const t = text.trim();
  if (!t || !ws) return;
  push('user', t); lastWho = null;
  send({ type: 'text', text: t });
  setV({ status: 'thinking' });
}

/** Confirm / cancel tapped on screen — tell the assistant so the conversation stays in sync. */
export function tapConfirm(id: string) {
  const r = confirmProposal(id);
  push('note', r.status === 'ok' ? '✓ Saved' : r.status === 'needs_second_confirmation' ? 'Tap Confirm once more to remove' : String(r.message)); lastWho = null;
  send({ type: 'note', text: `(On screen, the user tapped Confirm for proposal ${id}. Result: ${JSON.stringify(r)})` });
}
export function tapCancel(id: string) {
  cancelProposal(id);
  push('note', '✕ Cancelled'); lastWho = null;
  send({ type: 'note', text: `(On screen, the user tapped Cancel for proposal ${id}. Nothing was saved.)` });
}
