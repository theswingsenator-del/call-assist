import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    const text = await file.text();
    return NextResponse.json({ text: text.trim() });
  }

  if (name.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const buf = Buffer.from(await file.arrayBuffer());
      const result = await pdfParse(buf);
      return NextResponse.json({ text: result.text.trim() });
    } catch {
      return NextResponse.json({ error: "Could not read PDF" }, { status: 422 });
    }
  }

  return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
}
