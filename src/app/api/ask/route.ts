import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { getSessionByToken, SESSION_COOKIE } from "@/lib/session";
import { getGroqClient, buildSystemPrompt, TRANSCRIBE_MODEL, ANSWER_MODEL } from "@/lib/groq";

export const runtime = "nodejs";

function sse(event: string, data: string): Uint8Array {
  // Encode as one SSE line per call — data is base64'd so newlines in the
  // payload never collide with the SSE frame delimiter.
  const b64 = Buffer.from(data, "utf-8").toString("base64");
  return new TextEncoder().encode(`event:${event}\ndata:${b64}\n\n`);
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionByToken(token);
  if (!session || !session.brief) {
    return new Response("No session brief set. Save a briefing first.", { status: 400 });
  }

  const form = await req.formData();
  const audio = form.get("audio") as File | null;
  if (!audio || audio.size === 0) {
    return new Response("Empty audio.", { status: 400 });
  }

  const t0 = Date.now();
  const groq = getGroqClient();
  const audioBuffer = Buffer.from(await audio.arrayBuffer());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let question = "";
      let answer = "";
      let transcribeMs = 0;

      try {
        const transcript = await groq.audio.transcriptions.create({
          file: new File([audioBuffer], audio.name || "clip.webm", { type: audio.type || "audio/webm" }),
          model: TRANSCRIBE_MODEL,
          response_format: "text",
        });
        question = String(transcript).trim();
        transcribeMs = Date.now() - t0;
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
            { role: "system", content: buildSystemPrompt(session.brief) },
            { role: "user", content: question },
          ],
          temperature: 0.4,
          max_tokens: 300,
          stream: true,
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            answer += delta;
            controller.enqueue(sse("answer", delta));
          }
        }

        const answerMs = Date.now() - t1;
        const totalMs = Date.now() - t0;
        controller.enqueue(sse("timing", JSON.stringify({ transcribeMs, answerMs, totalMs })));
        controller.enqueue(sse("done", ""));
        controller.close();

        // Fire-and-forget log — never block the response the agent is staring at.
        const db = getAdminClient();
        if (db) {
          db.from("calls")
            .insert({
              session_id: session.id,
              question,
              answer,
              transcribe_ms: transcribeMs,
              answer_ms: answerMs,
              total_ms: totalMs,
            })
            .then(() => {});
        }
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
