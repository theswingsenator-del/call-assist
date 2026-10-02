import { NextRequest } from "next/server";
import { getGroqClient, buildSystemPrompt, TRANSCRIBE_MODEL, ANSWER_MODEL } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BRIEF_CHARS = 400_000;
const MAX_HISTORY = 4;

function sse(event: string, data: string): Uint8Array {
  // Base64 the payload so newlines in it never collide with the SSE frame delimiter.
  const b64 = Buffer.from(data, "utf-8").toString("base64");
  return new TextEncoder().encode(`event:${event}\ndata:${b64}\n\n`);
}

interface Turn {
  q: string;
  a: string;
}

function parseHistory(raw: FormDataEntryValue | null): Turn[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as Turn[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => typeof t?.q === "string" && typeof t?.a === "string" && t.q && t.a)
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const brief = ((form.get("brief") as string) ?? "").trim().slice(0, MAX_BRIEF_CHARS);
  const label = ((form.get("label") as string) ?? "").trim().slice(0, 120);
  const typed = ((form.get("text") as string) ?? "").trim();
  const audio = form.get("audio") as File | null;
  const history = parseHistory(form.get("history"));

  if (!brief) {
    return new Response("No briefing provided.", { status: 400 });
  }
  if (!typed && (!audio || audio.size === 0)) {
    return new Response("Nothing to answer.", { status: 400 });
  }

  const t0 = Date.now();
  const groq = getGroqClient();
  const audioBuffer = audio && !typed ? Buffer.from(await audio.arrayBuffer()) : null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let question = typed;
        let transcribeMs = 0;

        if (audioBuffer && audio) {
          const transcript = await groq.audio.transcriptions.create({
            file: new File([audioBuffer], audio.name || "clip.webm", { type: audio.type || "audio/webm" }),
            model: TRANSCRIBE_MODEL,
            response_format: "text",
            temperature: 0,
            ...(label ? { prompt: `Live call. Context: ${label}.` } : {}),
          });
          question = String(transcript).trim();
          transcribeMs = Date.now() - t0;
        }

        controller.enqueue(sse("question", question));

        if (!question) {
          controller.enqueue(sse("done", ""));
          controller.close();
          return;
        }

        const t1 = Date.now();
        const completion = await groq.chat.completions.create({
          model: ANSWER_MODEL,
          messages: [
            { role: "system", content: buildSystemPrompt(brief) },
            ...history.flatMap((t) => [
              { role: "user" as const, content: t.q },
              { role: "assistant" as const, content: t.a },
            ]),
            { role: "user", content: question },
          ],
          temperature: 0.4,
          max_tokens: 600,
          // gpt-oss is a reasoning model — keep it on the lowest setting so it
          // spends tokens on the answer, not deliberation. Speed is the point.
          reasoning_effort: "low",
          stream: true,
        });

        let firstTokenMs = 0;
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            if (!firstTokenMs) firstTokenMs = Date.now() - t0;
            controller.enqueue(sse("answer", delta));
          }
        }

        const answerMs = Date.now() - t1;
        const totalMs = Date.now() - t0;
        controller.enqueue(sse("timing", JSON.stringify({ transcribeMs, answerMs, totalMs, firstTokenMs })));
        controller.enqueue(sse("done", ""));
        controller.close();
      } catch (err) {
        controller.enqueue(sse("error", err instanceof Error ? err.message : "Unknown error"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
