"use client";

import { useEffect, useState } from "react";
import BriefForm from "./BriefForm";
import RecordPanel from "./RecordPanel";
import { loadBrief, saveBrief, clearBrief } from "@/lib/brief";

export default function Shell() {
  const [brief, setBrief] = useState("");
  const [orgLabel, setOrgLabel] = useState("");
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadBrief();
    setBrief(stored.brief);
    setOrgLabel(stored.orgLabel);
    setEditing(!stored.brief);
    setHydrated(true);
  }, []);

  const hasBrief = Boolean(brief) && !editing;

  function endSession() {
    clearBrief();
    setBrief("");
    setOrgLabel("");
    setEditing(true);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="block w-2.5 h-2.5 rounded-full bg-signal" />
            <span className="absolute inset-0 rounded-full bg-signal animate-ping opacity-20" />
          </div>
          <h1 className="text-base font-bold tracking-tight">Call Assist</h1>
        </div>
        {hasBrief && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(true)}
              className="mono-label text-ink-dim! hover:text-ink! transition-colors"
            >
              Edit
            </button>
            <span className="w-px h-3 bg-line" />
            <button
              onClick={endSession}
              className="mono-label text-rec/70 hover:text-rec! transition-colors"
            >
              End
            </button>
          </div>
        )}
      </header>

      {!hydrated ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="spinner" />
        </div>
      ) : hasBrief ? (
        <RecordPanel brief={brief} orgLabel={orgLabel} />
      ) : (
        <BriefForm
          initialBrief={brief}
          initialOrgLabel={orgLabel}
          onCancel={brief ? () => setEditing(false) : undefined}
          onSaved={(nextBrief, nextOrgLabel) => {
            setBrief(nextBrief);
            setOrgLabel(nextOrgLabel);
            saveBrief({ brief: nextBrief, orgLabel: nextOrgLabel });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
