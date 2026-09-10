import { NextRequest } from "next/server";
import { getGroqClient, buildSystemPrompt, TRANSCRIBE_MODEL, ANSWER_MODEL } from "@/lib/groq";

export const runtime = "nodejs";

function sse(event: string, data: string): Uint8Array {
  // Base64 the payload so newlines in it never collide with the SSE frame delimiter.
  const b64 = Buffer.from(data, "utf-8").toString("base64");
  return new TextEncoder().encode(`event:${event}\ndata:${b64}\n\n`);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const brief = ((form.get("brief") as string) ?? "").trim();
  const audio = form.get("audio") as File | null;

  if (!brief) {
    return new Response("No briefing provided.", { status: 400 });
  }
  if (!audio || audio.size === 0) {
    return new Response("Empty audio.", { status: 400 });
  }

  const t0 = Date.now();
  const groq = getGroqClient();
  const audioBuffer = Buffer.from(await audio.arrayBuffer());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const transcript = await groq.audio.transcriptions.create({
          file: new File([audioBuffer], audio.name || "clip.webm", { type: audio.type || "audio/webm" }),
          model: TRANSCRIBE_MODEL,
          response_format: "text",
        });
        const question = String(transcript).trim();
        const transcribeMs = Date.now() - t0;
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
            { role: "user", content: question },
          ],
          temperature: 0.4,
          max_tokens: 500,
          // gpt-oss is a reasoning model — keep it on the lowest setting so it
          // spends tokens on the answer, not deliberation. Speed is the point.
          reasoning_effort: "low",
          stream: true,
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(sse("answer", delta));
        }

        const answerMs = Date.now() - t1;
        const totalMs = Date.now() - t0;
        controller.enqueue(sse("timing", JSON.stringify({ transcribeMs, answerMs, totalMs })));
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
