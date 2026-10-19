# Call Assist

Live-call AI assistant. Real-time voice transcription and AI-generated responses for customer support, sales calls, and onboarding.

**Tech:** Next.js, WebSocket, Groq API, FastAPI, Real-time Audio Processing

## Features

- Real-time speech-to-text transcription
- AI-powered response generation (gpt-oss-20b, llama-3.3-70b)
- Sub-500ms end-to-end latency
- Rate-limited API to prevent key burn
- Demo: [call-assist-green.vercel.app](https://call-assist-green.vercel.app)

## Setup

```bash
# Backend
export GROQ_API_KEY="your_key"
python -m uvicorn app.main:app --port 8000

# Frontend
npm install
npm run dev
```

**Note:** Demo includes built-in rate limiting. Commercial use requires proper quota management.
