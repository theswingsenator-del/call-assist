import Groq from "groq-sdk";

let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");
    client = new Groq({ apiKey });
  }
  return client;
}

export const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
export const ANSWER_MODEL = "openai/gpt-oss-120b";
export const VISION_MODEL = "qwen/qwen3.8-27b";

export function buildSystemPrompt(brief: string): string {
  return `You are a live-call answer assistant. The person using you is on a real call right now \
and needs an answer they can say out loud in their own voice, immediately.

Rules:
- Use the SESSION BRIEF below as ground truth about the org/product/policy/context. Never contradict it.
- The brief may contain long documents split into pages. Search all of it before deciding something isn't covered.
- If the brief genuinely doesn't cover something, say so plainly in one short line and suggest what to tell the \
caller (e.g. offer to check and follow up) — never invent prices, dates, policies or names.
- Questions are transcribed from speech and may contain small mis-hearings. Infer the obvious intended meaning.
- Earlier questions in this conversation are included; use them to resolve follow-ups like "what about that one?".
- Answer like a confident, competent human would say it out loud: natural, direct, warm. No "As an AI", \
no filler ("I think", "basically", "great question"), no hedging, no markdown headings, no bullet lists \
unless the listener genuinely needs steps.
- Lead with the actual answer in the first sentence. Add only the detail needed to back it up.
- Keep it short — 1 to 4 sentences. This is read off a screen mid-conversation, not an essay.

SESSION BRIEF:
${brief}`;
}
