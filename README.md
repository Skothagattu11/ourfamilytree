# Family Tree

Mobile-first family tree web app (English + తెలుగు). Records are saved in Supabase (see `supabase/README.md`); no login yet — each tree is unlocked by a secret key shared through an invite link.

```bash
npm install
npm run dev        # web app  → http://localhost:5173
npm run server     # voice relay → :8787 (Vite proxies /api to it). Needs `gcloud auth application-default login`
npm run build && npm start   # production: one server for the app + voice on $PORT
./deploy.sh        # Cloud Run (project entropy-lifestyle, us-central1)
```

## Voice assistant ("Vamsha")
- Browser mic → 16 kHz PCM over WebSocket `/api/voice` → `server/index.mjs` → **Gemini Live `gemini-3.8-live` on Vertex AI** (us-central1) → 24 kHz audio back.
- Tools are declared in `shared/voice-tools.json` and **run in the browser** (`src/lib/voice/tools.ts`) against the same store as the UI, so the tree updates on screen and saves through the normal Supabase path.
- Every write is a *proposal* (card on screen) — saved only after the user says yes or taps Confirm. Removals need two confirmations (enforced in code, not just the prompt).
- The relay only opens a session for a valid tree id + key (checked against Supabase), max 15 min per session.
- Prompt: `server/prompt.mjs`. Model/voice via env `VERTEX_LIVE_MODEL`, `VOICE_NAME`.
- Mic needs https (or localhost). Without a mic the assistant still works by typing.

- **Stack:** React 19 + Vite + TypeScript, Tailwind v4, React Flow (`@xyflow/react`) canvas,
  `vaul` sheets, `cmdk` search, `sonner` toasts, `zustand`, `@supabase/supabase-js`.
- **3D icons:** Microsoft Fluent Emoji 3D (MIT) in `public/icons/`.
- **Layout:** `src/lib/layout.ts` (generation rows, partner households, barycentre sweeps).
- **Relationships:** `src/lib/relations.ts` (cousins/removed, in-laws, shortest path).
- **Telugu:** UI strings in `src/lib/i18n.ts`; kinship terms (అన్నయ్య, బాబాయి, మరదలు…) in `src/lib/telugu.ts`.
- **Share as image:** `src/lib/shareImage.ts` (html-to-image → PNG, native share sheet on phones).
- `.env.local` holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` (publishable key).
- `legacy.html` is the original single-file version.
