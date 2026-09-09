# Call Assist

Live-call answer assistant. Brief it once with org/product/policy context, then during a real call
tap record, let the caller's question play near the mic, and get a fast, natural-sounding answer
on screen — no filler, no "as an AI", nothing to hide. Built to be installed like a real app and
used live, on the agent's own device, in the open.

Multi-purpose — customer support is the first use case but the brief is freeform, so it works for
any live Q&A context (support, onboarding calls, interviews you're conducting, etc).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) — installable PWA (manifest + service worker)
- **Supabase** — per-device session (cookie token → `sessions` row holding the briefing) + `calls`
  log for every question/answer pair with timing, for auditing speed and accuracy after the fact
- **Groq** — `whisper-large-v3-turbo` for transcription, `llama-3.3-70b-versatile` for the answer,
  both chosen for raw inference speed since latency is the whole point of the tool

## Flow

1. Paste/upload the session briefing → `POST /api/session` stores it against a per-device cookie
   token (survives reloads/reinstalls of the tab, not tied to a login).
2. Tap record → mic captures the caller's question via `MediaRecorder`.
3. Tap again → clip posts to `POST /api/ask`, which streams back over SSE:
   - the transcript, as soon as Whisper returns it
   - the answer, token by token, as Llama generates it
   - a timing frame (`transcribeMs` / `answerMs` / `totalMs`) so real latency is visible, not guessed
4. Every Q&A pair also gets logged to `calls` (fire-and-forget, never blocks the on-screen response).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Groq keys
npm run dev
```

Run `supabase/schema.sql` against your Supabase project before first use — the app degrades to a
"database not configured" state (briefing won't persist, `/api/ask` 400s) until that's done and the
env vars are set.

### Env vars

| Var | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | same — server-only, all writes go through this, never the anon key |
| `GROQ_API_KEY` | console.groq.com |

## Deploy

Same as every other project on this stack: push to a GitHub repo, import into Vercel, set the env
vars above in the Vercel project settings.
