import { NextRequest, NextResponse } from "next/server";
import { getGroqClient, VISION_MODEL } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

const MAX_BYTES = 4 * 1024 * 1024;

const PROMPT = `Transcribe ALL text on this document page exactly as written, top to bottom, left to right.
- Keep headings, paragraphs, lists and numbers intact.
- Render tables as simple markdown tables.
- Do not summarise, translate, explain or add anything.
- If there is no readable text, output nothing.
Output only the transcribed text.`;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const image = form.get("image") as File | null;
  if (!image || image.size === 0) {
    return NextResponse.json({ error: "No image" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  try {
    const b64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const completion = await getGroqClient().chat.completions.create({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 4096,
      reasoning_effort: "none",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${image.type || "image/jpeg"};base64,${b64}` } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "OCR failed" }, { status: 502 });
  }
}
