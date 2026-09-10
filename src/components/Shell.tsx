"use client";

import { useEffect, useState } from "react";
import BriefForm from "./BriefForm";
import RecordPanel from "./RecordPanel";
import { loadBrief, saveBrief } from "@/lib/brief";

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal shadow-[0_0_8px_rgba(52,224,161,0.7)]" />
          <h1 className="text-[15px] font-bold tracking-tight">Call Assist</h1>
        </div>
        {hasBrief && (
          <button onClick={() => setEditing(true)} className="mono-label text-ink-dim!">
            Edit briefing
          </button>
        )}
      </header>

      {!hydrated ? null : hasBrief ? (
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
