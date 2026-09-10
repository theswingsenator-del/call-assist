"use client";

import { useState } from "react";

interface Props {
  initialBrief: string;
  initialOrgLabel: string;
  onSaved: (brief: string, orgLabel: string) => void;
  onCancel?: () => void;
}

export default function BriefForm({ initialBrief, initialOrgLabel, onSaved, onCancel }: Props) {
  const [text, setText] = useState(initialBrief);
  const [orgLabel, setOrgLabel] = useState(initialOrgLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | null) {
    if (!file) return;
    try {
      const content = await file.text();
      setText((prev) => [prev.trim(), content.trim()].filter(Boolean).join("\n\n"));
    } catch {
      setError("Couldn't read that file.");
    }
  }

  function save() {
    if (!text.trim()) {
      setError("Give it something to work with first.");
      return;
    }
    setSaving(true);
    setError("");
    onSaved(text.trim(), orgLabel.trim());
    setSaving(false);
  }

  return (
    <div className="flex-1 flex flex-col gap-4 px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-lg w-full mx-auto rise">
      <div>
        <p className="mono-label mb-2">Session briefing</p>
        <p className="text-sm text-ink-dim leading-relaxed">
          Paste or upload what it should know before the call — org info, product, policy, prior conversation. It only answers from this. Stays on this device.
        </p>
      </div>

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
        <span className="truncate">append a .txt/.md file</span>
        <input
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
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
