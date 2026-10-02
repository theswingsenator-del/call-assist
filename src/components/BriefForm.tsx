"use client";

import { useRef, useState } from "react";

interface Props {
  initialBrief: string;
  initialOrgLabel: string;
  onSaved: (brief: string, orgLabel: string) => void;
  onCancel?: () => void;
}

export default function BriefForm({ initialBrief, initialOrgLabel, onSaved, onCancel }: Props) {
  const [text, setText] = useState(initialBrief);
  const [orgLabel, setOrgLabel] = useState(initialOrgLabel);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError("");
    setUploading(true);

    try {
      const name = file.name.toLowerCase();
      let content: string;

      if (name.endsWith(".pdf")) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed");
        content = json.text;
      } else {
        content = await file.text();
      }

      setText((prev) => [prev.trim(), content.trim()].filter(Boolean).join("\n\n"));
      setFileName(file.name);
    } catch {
      setError("Couldn't read that file. Try a .txt, .md, or .pdf.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    if (!text.trim()) {
      setError("Give it something to work with first.");
      return;
    }
    onSaved(text.trim(), orgLabel.trim());
  }

  return (
    <div className="flex-1 flex flex-col gap-5 px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-lg w-full mx-auto rise">
      {/* Header block */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold">Session Briefing</h2>
        <p className="text-sm text-ink-dim leading-relaxed">
          Paste or upload what it should know — org info, product details, policy docs, prior conversation. It only answers from this.
        </p>
      </div>

      {/* Session label */}
      <div className="flex flex-col gap-1.5">
        <label className="mono-label">Session label</label>
        <input
          value={orgLabel}
          onChange={(e) => setOrgLabel(e.target.value)}
          placeholder="e.g. Acme Support — October"
          className="panel rounded-xl px-4 py-3.5 text-sm outline-none focus:border-signal/30 border border-transparent transition-colors"
        />
      </div>

      {/* Briefing textarea */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <label className="mono-label">Briefing content</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste briefing content here..."
          className="panel rounded-xl px-4 py-3.5 text-sm outline-none focus:border-signal/30 border border-transparent flex-1 min-h-44 resize-none leading-relaxed transition-colors"
        />
      </div>

      {/* File upload */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`file-chip rounded-xl px-4 py-3.5 flex items-center gap-3 cursor-pointer ${fileName ? "has-file" : ""}`}
        disabled={uploading}
      >
        {uploading ? (
          <div className="spinner shrink-0" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint shrink-0">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        )}
        <span className="text-sm text-ink-dim truncate">
          {uploading ? "Reading file..." : fileName || "Attach a file (.txt, .md, .pdf)"}
        </span>
        {fileName && !uploading && (
          <span className="ml-auto text-[10px] font-mono text-signal/70 shrink-0">attached</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="text-rec text-xs rise">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-auto pt-1">
        {onCancel && (
          <button
            onClick={onCancel}
            className="btn-ghost rounded-xl px-5 py-3.5 text-sm"
          >
            Cancel
          </button>
        )}
        <button
          onClick={save}
          className="btn-primary rounded-xl px-5 py-3.5 text-sm flex-1"
        >
          Start session
        </button>
      </div>
    </div>
  );
}
