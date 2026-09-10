# Call Assist

Live-call answer assistant. Brief it once with org/product/policy context, then during a real call
tap record, let the caller's question play near the mic, and get a fast, natural-sounding answer
on screen — no filler, no "as an AI", nothing to hide. Built to be installed like a real app and
used live, on the agent's own device, in the open.

Multi-purpose — customer support is the first use case but the brief is freeform, so it works for
any live Q&A context (support, onboarding calls, interviews you're conducting, etc).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) — installable PWA (manifest + service worker)
- **No database.** The briefing lives in `localStorage` on the agent's device and rides along with
  each `/api/ask` request. No login, no server state, nothing for the client's org to provision —
  matches the trust model (it's on the agent's own phone, in the open).
- **Groq** — `whisper-large-v3-turbo` for transcription, `llama-3.3-70b-versatile` for the answer,
  both chosen for raw inference speed since latency is the whole point of the tool.

## Flow

1. Paste/upload the session briefing → saved to `localStorage` (survives reloads and app restarts;
   "Edit briefing" to change it).
2. Tap record → mic captures the caller's question via `MediaRecorder`.
3. Tap again → clip + brief post to `POST /api/ask`, which streams back over SSE:
   - the transcript, as soon as Whisper returns it
   - the answer, token by token, as Llama generates it
   - a timing frame (`transcribeMs` / `answerMs` / `totalMs`) so real latency is visible, not guessed

## Setup

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY
npm run dev
```

Only one env var: `GROQ_API_KEY` (from console.groq.com).

## Deploy

Push to a GitHub repo, import into Vercel, set `GROQ_API_KEY` in the Vercel project settings.
