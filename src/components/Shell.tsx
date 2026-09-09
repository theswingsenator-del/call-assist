"use client";

import { useState } from "react";
import BriefForm from "./BriefForm";
import RecordPanel from "./RecordPanel";

interface Props {
  initialBrief: string;
  initialOrgLabel: string;
  dbConfigured: boolean;
}

export default function Shell({ initialBrief, initialOrgLabel, dbConfigured }: Props) {
  const [brief, setBrief] = useState(initialBrief);
  const [orgLabel, setOrgLabel] = useState(initialOrgLabel);
  const [editing, setEditing] = useState(!initialBrief);

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

      {hasBrief ? (
        <RecordPanel orgLabel={orgLabel} />
      ) : (
        <BriefForm
          initialBrief={brief}
          initialOrgLabel={orgLabel}
          dbConfigured={dbConfigured}
          onCancel={brief ? () => setEditing(false) : undefined}
          onSaved={(savedBrief, savedOrgLabel) => {
            setBrief(savedBrief);
            setOrgLabel(savedOrgLabel);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
