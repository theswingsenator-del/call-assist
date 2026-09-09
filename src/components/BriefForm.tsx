"use client";

import { useState } from "react";

interface Props {
  initialBrief: string;
  initialOrgLabel: string;
  dbConfigured: boolean;
  onSaved: (brief: string, orgLabel: string) => void;
  onCancel?: () => void;
}

export default function BriefForm({ initialBrief, initialOrgLabel, dbConfigured, onSaved, onCancel }: Props) {
  const [text, setText] = useState(initialBrief);
  const [orgLabel, setOrgLabel] = useState(initialOrgLabel);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!text.trim() && !file) {
      setError("Give it something to work with first.");
      return;
    }
    setSaving(true);
    setError("");
    const form = new FormData();
    form.append("text", text);
    form.append("orgLabel", orgLabel);
    if (file) form.append("file", file);

    try {
      const res = await fetch("/api/session", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(text.trim() + (file ? `\n\n[+ ${file.name}]` : ""), orgLabel.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-4 px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-lg w-full mx-auto rise">
      <div>
        <p className="mono-label mb-2">Session briefing</p>
        <p className="text-sm text-ink-dim leading-relaxed">
          Paste or upload what it should know before the call — org info, product, policy, prior conversation. It only answers from this.
        </p>
      </div>

      {!dbConfigured && (
        <div className="panel rounded-xl px-4 py-3 text-xs text-ink-dim">
          Database isn&apos;t wired up yet — briefing won&apos;t persist across reloads until Supabase env vars are set.
        </div>
      )}

      <input
        value={orgLabel}
        onChange={(e) => setOrgLabel(e.target.value)}
        placeholder="Label this session (e.g. Acme Support — Sept)"
        className="panel rounded-xl px-4 py-3 text-sm outline-none focus:border-signal/40 border border-transparent"
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste briefing here..."
        className="panel rounded-xl px-4 py-3 text-sm outline-none focus:border-signal/40 border border-transparent flex-1 min-h-55 resize-none"
      />

      <label className="panel rounded-xl px-4 py-3 text-xs text-ink-dim flex items-center gap-3 cursor-pointer">
        <span className="mono-label text-ink-dim! shrink-0">FILE</span>
        <span className="truncate">{file ? file.name : "optional .txt/.md upload"}</span>
        <input
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {error && <p className="text-rec text-xs">{error}</p>}

      <div className="flex gap-3 mt-auto pt-2">
        {onCancel && (
          <button onClick={onCancel} className="panel rounded-xl px-4 py-3.5 text-sm font-semibold text-ink-dim">
            Cancel
          </button>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary rounded-xl px-4 py-3.5 text-sm font-extrabold flex-1"
        >
          {saving ? "Saving..." : "Start session"}
        </button>
      </div>
    </div>
  );
}
