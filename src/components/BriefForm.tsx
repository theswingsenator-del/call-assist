"use client";

import { useMemo, useRef, useState } from "react";
import { ACCEPT, extractImage, extractPdf, fileKind, type Progress } from "@/lib/extract";
import { composeBrief, countWords, MAX_BRIEF_CHARS, type Session, type Source } from "@/lib/brief";
import { AlertIcon, BoltIcon, ChevronIcon, FileIcon, UploadIcon, XIcon } from "./icons";

interface Job {
  id: string;
  name: string;
  progress?: Progress;
  error?: string;
}

interface Props {
  initial: Session;
  onStart: (s: Session) => void;
}

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function kindBadge(kind: Source["kind"]) {
  if (kind === "pdf") return { label: "PDF", cls: "text-rec bg-rec/10 border-rec/25" };
  if (kind === "image") return { label: "IMG", cls: "text-amber bg-amber/10 border-amber/25" };
  return { label: "TXT", cls: "text-signal bg-signal-muted border-signal/25" };
}

export default function BriefForm({ initial, onStart }: Props) {
  const [label, setLabel] = useState(initial.label);
  const [notes, setNotes] = useState(initial.notes);
  const [sources, setSources] = useState<Source[]>(initial.sources);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const draft: Session = { label, notes, sources };
  const brief = useMemo(() => composeBrief({ label, notes, sources }), [label, notes, sources]);
  const words = useMemo(() => countWords(brief), [brief]);
  const tooLong = brief.length > MAX_BRIEF_CHARS;
  const working = jobs.some((j) => !j.error);
  const ready = (notes.trim() || sources.length > 0) && !working;

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function processFile(file: File) {
    const id = uid();
    const kind = fileKind(file);
    setJobs((prev) => [...prev, { id, name: file.name }]);

    if (!kind) {
      patchJob(id, { error: "Unsupported file. Use PDF, TXT, MD, CSV or an image." });
      return;
    }

    try {
      let text = "";
      let pages: number | undefined;
      let ocrPages: number | undefined;
      let skipped = 0;

      if (kind === "pdf") {
        const r = await extractPdf(file, (progress) => patchJob(id, { progress }));
        text = r.text;
        pages = r.pages;
        ocrPages = r.ocrPages;
        skipped = r.skippedPages ?? 0;
      } else if (kind === "image") {
        patchJob(id, { progress: { stage: "scanning", done: 0, total: 1 } });
        text = (await extractImage(file)).text;
      } else {
        text = (await file.text()).trim();
      }

      if (!text.trim()) {
        patchJob(id, { error: "No readable text found in this file." });
        return;
      }

      const src: Source = { id, name: file.name, kind, text, pages, ocrPages };
      setSources((prev) => [...prev, src]);
      setJobs((prev) =>
        skipped > 0
          ? prev.map((j) =>
              j.id === id ? { ...j, progress: undefined, error: `Added — ${skipped} scanned pages beyond the first 40 were skipped.` } : j
            )
          : prev.filter((j) => j.id !== id)
      );
    } catch (err) {
      patchJob(id, { error: err instanceof Error ? err.message : "Couldn't read that file." });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((f) => void processFile(f));
  }

  function removeSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (open === id) setOpen(null);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 scroll-area scroll-fade">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-6 flex flex-col gap-6 rise">
          <div>
            <h2 className="text-[26px] font-bold leading-tight">Brief your assistant</h2>
            <p className="text-sm text-ink-dim mt-1.5 leading-relaxed">
              Give it everything it should know before the call. It answers only from this — and it never leaves this device except to answer.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="mono-label">Session name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Acme Support — October"
              className="field rounded-2xl px-4 py-3.5"
              enterKeyHint="next"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="mono-label">Documents</span>
              {sources.length > 0 && <span className="text-[11px] text-ink-faint">{sources.length} added</span>}
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`dropzone rounded-2xl px-4 py-5 flex items-center gap-4 text-left ${dragging ? "dragging" : ""}`}
            >
              <span className="w-11 h-11 rounded-xl bg-signal-muted text-signal flex items-center justify-center shrink-0">
                <UploadIcon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">Add documents</span>
                <span className="block text-xs text-ink-faint mt-0.5">PDF, text, or photos of pages · scanned PDFs are read too</span>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {jobs.map((j) => (
              <div key={j.id} className={`rounded-2xl px-4 py-3.5 fade ${j.error ? "bg-amber/5 border border-amber/20" : "panel"}`}>
                <div className="flex items-center gap-3">
                  {j.error ? <AlertIcon size={18} className="text-amber shrink-0" /> : <div className="spinner" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{j.name}</p>
                    <p className={`text-xs mt-0.5 ${j.error ? "text-amber/90" : "text-ink-faint"}`}>
                      {j.error ??
                        (j.progress
                          ? j.progress.stage === "reading"
                            ? `Reading page ${j.progress.done} of ${j.progress.total}`
                            : `Scanning image pages ${j.progress.done} of ${j.progress.total}`
                          : "Opening…")}
                    </p>
                  </div>
                  {j.error && (
                    <button
                      onClick={() => setJobs((prev) => prev.filter((x) => x.id !== j.id))}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-ink-faint active:bg-panel-hover"
                      aria-label="Dismiss"
                    >
                      <XIcon size={16} />
                    </button>
                  )}
                </div>
                {!j.error && (
                  <div className={`progress mt-3 ${j.progress && j.progress.total > 1 ? "" : "indeterminate"}`}>
                    <span style={{ width: j.progress ? `${(j.progress.done / Math.max(1, j.progress.total)) * 100}%` : "35%" }} />
                  </div>
                )}
              </div>
            ))}

            {sources.map((s) => {
              const badge = kindBadge(s.kind);
              const isOpen = open === s.id;
              return (
                <div key={s.id} className="panel rounded-2xl overflow-hidden fade">
                  <div className="flex items-center gap-3 pl-3.5 pr-2 py-3">
                    <button onClick={() => setOpen(isOpen ? null : s.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                      <span className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-1 rounded-md border shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{s.name}</span>
                        <span className="block text-[11px] text-ink-faint mt-0.5">
                          {[
                            s.pages ? `${s.pages} page${s.pages === 1 ? "" : "s"}` : null,
                            s.ocrPages ? `${s.ocrPages} scanned` : null,
                            `${fmt(countWords(s.text))} words`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronIcon size={16} className={`text-ink-faint shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint active:bg-panel-hover shrink-0"
                      aria-label={`Remove ${s.name}`}
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-line px-4 py-3 max-h-56 scroll-area">
                      <p className="mono-label mb-2">What it read</p>
                      <pre className="selectable whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
                        {s.text.length > 3000 ? `${s.text.slice(0, 3000)}\n\n… ${fmt(s.text.length - 3000)} more characters` : s.text}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <label className="flex flex-col gap-2">
            <span className="mono-label">Notes & talking points</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste anything else — prices, policies, who you're speaking to, what to push, what to avoid…"
              className="field rounded-2xl px-4 py-3.5 min-h-40 resize-none leading-relaxed"
            />
          </label>

          <p className="text-[10px] font-mono text-ink-faint/60 text-center">build {BUILD}</p>
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-[rgba(5,7,11,0.85)] backdrop-blur-xl px-4 pt-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2.5 text-[11px]">
            <span className="text-ink-faint">
              {words > 0 ? `${fmt(words)} words of context` : "Add a document or notes to begin"}
            </span>
            {tooLong ? (
              <span className="text-amber">Very long — will be trimmed</span>
            ) : words > 0 ? (
              <span className="text-signal/80 flex items-center gap-1">
                <BoltIcon size={11} /> Ready
              </span>
            ) : null}
          </div>
          <button onClick={() => onStart(draft)} disabled={!ready} className="btn-primary w-full rounded-2xl py-4 text-[15px]">
            {working ? "Reading documents…" : initial.notes || initial.sources.length ? "Save & go live" : "Start session"}
          </button>
        </div>
      </div>
    </div>
  );
}
