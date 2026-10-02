"use client";

import { useRef, useState } from "react";

interface QA {
  id: number;
  question: string;
  answer: string;
  pending: boolean;
  error?: string;
  transcribeMs?: number;
  answerMs?: number;
  totalMs?: number;
}

function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const o of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o)) return o;
  }
  return "";
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function RecordPanel({ brief, orgLabel }: { brief: string; orgLabel: string }) {
  const [items, setItems] = useState<QA[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function toggle() {
    if (recording) {
      stop();
    } else {
      await start();
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleStop(recorder.mimeType || "audio/webm");
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setStatus("recording");
    } catch {
      setStatus("idle");
    }
  }

  function stop() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorder.stop();
    }
    setRecording(false);
    setStatus("processing");
  }

  async function handleStop(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, question: "", answer: "", pending: true }]);

    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);

    const form = new FormData();
    form.append("audio", blob, "clip.webm");
    form.append("brief", brief);

    try {
      const res = await fetch("/api/ask", { method: "POST", body: form });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(6);
          const payload = decodeBase64Utf8(dataLine.slice(5));

          if (event === "question") {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, question: payload || "(no speech detected)" } : it)));
          } else if (event === "answer") {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, answer: it.answer + payload } : it)));
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          } else if (event === "timing") {
            const t = JSON.parse(payload);
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, transcribeMs: t.transcribeMs, answerMs: t.answerMs, totalMs: t.totalMs } : it)));
          } else if (event === "error") {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, error: payload, pending: false } : it)));
          } else if (event === "done") {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, pending: false } : it)));
          }
        }
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, pending: false, error: err instanceof Error ? err.message : "Failed" } : it))
      );
    } finally {
      setStatus("idle");
    }
  }

  const statusText =
    status === "recording" ? "Listening..." :
    status === "processing" ? "Working..." :
    "Tap to record";

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-lg w-full mx-auto px-4">
      {/* Session badge */}
      <div className="flex items-center gap-2.5 py-2.5 px-1 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-signal/60" />
        <p className="mono-label truncate text-signal/60">{orgLabel || "Active session"}</p>
      </div>

      {/* Q&A area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto rounded-2xl flex flex-col gap-3 py-2">
        {items.length === 0 && (
          <div className="m-auto text-center px-6 py-12 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-panel-strong flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-ink-dim font-medium">Ready for questions</p>
              <p className="text-xs text-ink-faint leading-relaxed max-w-[28ch]">
                Tap record, hold up to the caller, tap again when they finish
              </p>
            </div>
          </div>
        )}

        {items.map((it) => (
          <div key={it.id} className="qa-card rise">
            {/* Question */}
            {it.question ? (
              <div className="flex items-start gap-2.5 mb-3">
                <span className="mono-label text-[9px] mt-0.5 shrink-0 text-ink-faint/80">Q</span>
                <p className="text-sm text-ink-dim italic leading-relaxed">{it.question}</p>
              </div>
            ) : it.pending ? (
              <div className="flex items-center gap-2.5 mb-3">
                <div className="spinner" />
                <span className="text-xs text-ink-faint">Transcribing...</span>
              </div>
            ) : null}

            {/* Answer */}
            {it.error ? (
              <div className="flex items-start gap-2.5">
                <span className="mono-label text-[9px] mt-0.5 shrink-0 text-rec/70">!</span>
                <p className="text-sm text-rec">{it.error}</p>
              </div>
            ) : it.answer ? (
              <div className="flex items-start gap-2.5">
                <span className="mono-label text-[9px] mt-0.5 shrink-0 text-signal/60">A</span>
                <p className={`text-[15px] leading-relaxed ${it.pending ? "caret" : ""}`}>
                  {it.answer}
                </p>
              </div>
            ) : it.pending && it.question ? (
              <div className="flex items-center gap-2.5">
                <div className="spinner" />
                <span className="text-xs text-ink-faint">Thinking...</span>
              </div>
            ) : null}

            {/* Timing */}
            {it.totalMs != null && (
              <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-line">
                <span className="text-[10px] font-mono text-ink-faint">
                  {formatMs(it.totalMs)} total
                </span>
                {it.transcribeMs != null && (
                  <span className="text-[10px] font-mono text-ink-faint/60">
                    STT {formatMs(it.transcribeMs)}
                  </span>
                )}
                {it.answerMs != null && (
                  <span className="text-[10px] font-mono text-ink-faint/60">
                    LLM {formatMs(it.answerMs)}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Record button dock */}
      <div className="flex flex-col items-center gap-3 py-6 shrink-0">
        <button
          onClick={toggle}
          className={`rec-btn ${recording ? "recording" : ""}`}
          aria-label="Record"
        />
        <span className={`text-xs font-medium ${
          status === "recording" ? "text-signal" :
          status === "processing" ? "text-ink-dim" :
          "text-ink-faint"
        }`}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
