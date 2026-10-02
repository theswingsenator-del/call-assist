"use client";

import { useEffect, useMemo, useState } from "react";
import BriefForm from "./BriefForm";
import RecordPanel from "./RecordPanel";
import { PencilIcon, PowerIcon, RefreshIcon, XIcon } from "./icons";
import {
  clearSession,
  composeBrief,
  emptySession,
  hasContent,
  loadSession,
  saveSession,
  type Session,
} from "@/lib/brief";

type Mode = "loading" | "setup" | "live";

export default function Shell() {
  const [session, setSession] = useState<Session>(emptySession);
  const [mode, setMode] = useState<Mode>("loading");
  const [convoKey, setConvoKey] = useState(0);
  const [endSheet, setEndSheet] = useState(false);
  const [notSaved, setNotSaved] = useState(false);

  useEffect(() => {
    const stored = loadSession();
    setSession(stored);
    setMode(hasContent(stored) ? "live" : "setup");
  }, []);

  const brief = useMemo(() => composeBrief(session), [session]);
  const live = mode === "live";
  const canCancelSetup = mode === "setup" && hasContent(session);

  function start(next: Session) {
    setSession(next);
    setNotSaved(!saveSession(next));
    setMode("live");
  }

  function newConversation() {
    setConvoKey((k) => k + 1);
    setEndSheet(false);
  }

  function endSession() {
    clearSession();
    setSession(emptySession());
    setConvoKey((k) => k + 1);
    setEndSheet(false);
    setNotSaved(false);
    setMode("setup");
  }

  return (
    <div className="fixed inset-0 flex flex-col pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <header className="relative z-20 shrink-0 flex items-center justify-between gap-3 px-4 h-14">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-[10px] bg-gradient-to-br from-signal/25 to-signal/5 border border-signal/25 flex items-center justify-center shrink-0">
            <span className={`w-2 h-2 rounded-full bg-signal ${live ? "live-dot" : ""}`} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold leading-tight">Call Assist</h1>
            {live && (
              <p className="text-[11px] text-ink-faint truncate leading-tight">{session.label || "Session live"}</p>
            )}
          </div>
        </div>

        {live && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setMode("setup")} className="chip-btn btn-ghost" aria-label="Edit briefing">
              <PencilIcon size={14} />
              Edit
            </button>
            <button onClick={() => setEndSheet(true)} className="chip-btn btn-danger" aria-label="End session">
              <PowerIcon size={14} />
              End
            </button>
          </div>
        )}

        {canCancelSetup && (
          <button onClick={() => setMode("live")} className="chip-btn btn-ghost" aria-label="Back to session">
            <XIcon size={14} />
            Close
          </button>
        )}
      </header>

      {notSaved && live && (
        <div className="mx-4 mb-2 rounded-xl px-3 py-2 text-[12px] text-amber bg-amber/10 border border-amber/25 fade">
          Briefing too large to save on this device — it works now, but re-add it if you close the app.
        </div>
      )}

      <main className="relative z-10 flex-1 min-h-0 flex flex-col">
        {mode === "loading" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="spinner" />
          </div>
        )}
        {mode !== "loading" && hasContent(session) && (
          <div className={live ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <RecordPanel
              key={convoKey}
              active={live}
              brief={brief}
              label={session.label}
              sourceCount={session.sources.length}
              onNewConversation={newConversation}
            />
          </div>
        )}
        {mode === "setup" && <BriefForm initial={session} onStart={start} />}
      </main>

      {endSheet && (
        <>
          <div className="backdrop" onClick={() => setEndSheet(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="End or restart">
            <div className="w-10 h-1 rounded-full bg-ink-faint/40 mx-auto mb-5" />
            <h2 className="text-lg font-bold mb-1">Done with this call?</h2>
            <p className="text-sm text-ink-dim mb-5">Start fresh for the next caller, or wipe the whole session.</p>

            <button
              onClick={newConversation}
              className="w-full flex items-center gap-3.5 rounded-2xl p-4 mb-2.5 btn-ghost text-left"
            >
              <span className="w-10 h-10 rounded-xl bg-signal-muted text-signal flex items-center justify-center shrink-0">
                <RefreshIcon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-ink">New call</span>
                <span className="block text-xs text-ink-faint">Keep the briefing, clear the answers</span>
              </span>
            </button>

            <button
              onClick={endSession}
              className="w-full flex items-center gap-3.5 rounded-2xl p-4 mb-4 btn-danger text-left"
            >
              <span className="w-10 h-10 rounded-xl bg-rec/15 flex items-center justify-center shrink-0">
                <PowerIcon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">End session</span>
                <span className="block text-xs text-rec/70 font-normal">Wipe briefing & answers from this device</span>
              </span>
            </button>

            <button onClick={() => setEndSheet(false)} className="w-full py-3 text-sm font-semibold text-ink-dim">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
