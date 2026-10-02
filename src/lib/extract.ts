// Client-side document reading. PDFs are parsed in the browser with pdf.js
// (no upload size limit, handles modern PDFs); pages with no usable text
// layer — scans, photos, broken font encodings — are rendered and OCR'd.

export interface Progress {
  stage: "reading" | "scanning";
  done: number;
  total: number;
}

export interface Extracted {
  text: string;
  pages?: number;
  ocrPages?: number;
  skippedPages?: number;
}

const MIN_PAGE_CHARS = 40;
const MAX_OCR_PAGES = 40;
const OCR_CONCURRENCY = 3;
const OCR_TARGET_WIDTH = 1600;

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

// Rebuild lines from glyph positions. Joining items blindly with spaces is what
// garbles many PDFs ("T h i s" / words glued together).
function itemsToText(raw: unknown[]): string {
  const items = raw.filter((i): i is TextItem => typeof (i as TextItem)?.str === "string");
  let out = "";
  let prev: TextItem | null = null;
  for (const it of items) {
    if (prev) {
      const px = prev.transform[4];
      const py = prev.transform[5];
      const x = it.transform[4];
      const y = it.transform[5];
      const size = Math.max(Math.abs(it.transform[3]) || it.height || 10, 1);
      const dy = Math.abs(y - py);
      if (dy > size * 0.5) {
        out += dy > size * 1.9 ? "\n\n" : "\n";
      } else {
        const gap = x - (px + prev.width);
        if (gap > size * 0.12 && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
      }
    }
    out += it.str;
    if (it.hasEOL) {
      out += "\n";
      prev = null;
    } else {
      prev = it;
    }
  }
  return out;
}

function cleanText(t: string): string {
  return t
    .replace(/\u0000/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/(\w)-\n(?=[a-z])/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Custom font encodings come out as private-use / replacement glyphs — the
// text "exists" but is junk. Treat those pages like scans.
function isJunk(t: string): boolean {
  const compact = t.replace(/\s/g, "");
  if (!compact) return false;
  const junk = compact.match(/[-�\u0000-\u001F]/g)?.length ?? 0;
  const letters = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return junk / compact.length > 0.15 || letters / compact.length < 0.5;
}

function isUnreadable(t: string): boolean {
  return t.replace(/\s/g, "").length < MIN_PAGE_CHARS || isJunk(t);
}

async function ocrBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("image", blob, "page.jpg");
  const res = await fetch("/api/ocr", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(json.error || "OCR failed");
  return json.text ?? "";
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/jpeg", 0.82)
  );
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function extractPdf(file: File, onProgress?: (p: Progress) => void): Promise<Extracted> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  let doc: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    if ((err as { name?: string })?.name === "PasswordException") {
      throw new Error("This PDF is password-protected. Remove the password and try again.");
    }
    throw new Error("Couldn't open this PDF — the file may be damaged.");
  }

  const total = doc.numPages;
  const texts: string[] = new Array(total).fill("");
  const needOcr: number[] = [];

  for (let n = 1; n <= total; n++) {
    try {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const t = cleanText(itemsToText(content.items as unknown[]));
      texts[n - 1] = isJunk(t) ? "" : t;
      if (isUnreadable(t)) needOcr.push(n);
      page.cleanup();
    } catch {
      needOcr.push(n);
    }
    onProgress?.({ stage: "reading", done: n, total });
  }

  const targets = needOcr.slice(0, MAX_OCR_PAGES);
  let scanned = 0;
  let ocrPages = 0;
  if (targets.length) onProgress?.({ stage: "scanning", done: 0, total: targets.length });

  await pool(targets, OCR_CONCURRENCY, async (n) => {
    try {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, OCR_TARGET_WIDTH / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await canvasToJpeg(canvas);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      const text = cleanText(await ocrBlob(blob));
      if (text.replace(/\s/g, "").length > texts[n - 1].replace(/\s/g, "").length) {
        texts[n - 1] = text;
        ocrPages++;
      }
    } catch {
      // keep whatever the text layer gave us for this page
    }
    scanned++;
    onProgress?.({ stage: "scanning", done: scanned, total: targets.length });
  });

  await doc.loadingTask.destroy();

  const text = texts
    .map((t, i) => (t.trim() ? (total > 1 ? `[Page ${i + 1}]\n${t.trim()}` : t.trim()) : ""))
    .filter(Boolean)
    .join("\n\n");

  return { text, pages: total, ocrPages, skippedPages: needOcr.length - targets.length };
}

export async function extractImage(file: File): Promise<Extracted> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, OCR_TARGET_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that image.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvasToJpeg(canvas);
  return { text: cleanText(await ocrBlob(blob)) };
}

export type FileKind = "pdf" | "text" | "image" | null;

export function fileKind(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/.test(name)) return "image";
  if (file.type.startsWith("text/") || /\.(txt|md|markdown|csv|json|tsv|log)$/.test(name)) return "text";
  return null;
}

export const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.json,.tsv,.png,.jpg,.jpeg,.webp,application/pdf,text/*,image/*";
