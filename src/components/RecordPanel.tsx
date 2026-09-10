"use client";

import { useRef, useState } from "react";

interface QA {
  id: number;
  question: string;
  answer: string;
  pending: boolean;
  error?: string;
  timingMs?: number;
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

export default function RecordPanel({ brief, orgLabel }: { brief: string; orgLabel: string }) {
  const [items, setItems] = useState<QA[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Tap to record");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nextId = useRef(0);

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
      setStatus("Listening — tap to stop");
    } catch {
      setStatus("Mic access denied");
    }
  }

  function stop() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorder.stop();
    }
    setRecording(false);
    setStatus("Working...");
  }

  async function handleStop(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, question: "Listening...", answer: "", pending: true }]);

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
          } else if (event === "timing") {
            const t = JSON.parse(payload) as { totalMs: number };
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, timingMs: t.totalMs } : it)));
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
      setStatus("Tap to record");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-lg w-full mx-auto px-4">
      <div className="flex items-center justify-between py-3 shrink-0">
        <p className="mono-label truncate">{orgLabel || "SESSION ACTIVE"}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto panel rounded-2xl p-4 flex flex-col gap-5">
        {items.length === 0 && (
          <p className="m-auto text-center text-sm text-ink-faint max-w-[26ch]">
            Tap the button, hold up to the caller, tap again when they finish the question.
          </p>
        )}
        {items.map((it) => (
          <div key={it.id} className="rise flex flex-col gap-1.5">
            <p className="text-xs text-ink-faint italic">{it.question}</p>
            {it.error ? (
              <p className="text-sm text-rec">{it.error}</p>
            ) : (
              <p className={`text-[17px] leading-snug ${it.pending ? "caret" : ""}`}>{it.answer}</p>
            )}
            {it.timingMs != null && (
              <p className="text-[10px] font-mono text-ink-faint">{it.timingMs}ms</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 py-6 shrink-0">
        <button onClick={toggle} className={`rec-btn ${recording ? "recording" : ""}`} aria-label="Record" />
        <span className="text-xs text-ink-dim">{status}</span>
      </div>
    </div>
  );
}
