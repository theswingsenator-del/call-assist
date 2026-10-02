"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setBusy } from "@/lib/busy";
import { CheckIcon, CopyIcon, KeyboardIcon, MicIcon, RefreshIcon, SendIcon, StopIcon, XIcon } from "./icons";

interface QA {
  id: number;
  question: string;
  answer: string;
  pending: boolean;
  typed?: boolean;
  error?: string;
  totalMs?: number;
  firstTokenMs?: number;
}

type Phase = "idle" | "recording" | "processing";

interface Props {
  active: boolean;
  brief: string;
  label: string;
  sourceCount: number;
  onNewConversation: () => void;
}

const MAX_RECORD_MS = 120_000;
const MIN_CLIP_BYTES = 1200;

function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  for (const o of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o)) return o;
  }
  return "";
}

function extFor(mime: string) {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}

export default function RecordPanel({ active, brief, label, sourceCount, onNewConversation }: Props) {
  const [items, setItems] = useState<QA[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sendRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const startedAtRef = useRef(0);
  const levelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QA[]>([]);
  const nextId = useRef(0);
  const toastTimer = useRef<number>(0);

  itemsRef.current = items;
  const answering = items.some((i) => i.pending);

  useEffect(() => {
    setBusy(phase !== "idle" || answering);
  }, [phase, answering]);

  useEffect(() => () => setBusy(false), []);

  // Keep the screen awake while the session is open — the phone sleeping mid-call is the worst failure.
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) lock.release().catch(() => {});
        }
      } catch {
        // not supported / denied
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const scrollToEnd = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (force || nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: force ? "smooth" : "auto" });
  }, []);

  const patch = (id: number, fn: (q: QA) => QA) => setItems((prev) => prev.map((it) => (it.id === id ? fn(it) : it)));

  async function ask(input: { audio?: Blob; text?: string }) {
    const id = nextId.current++;
    const history = itemsRef.current
      .filter((i) => !i.pending && !i.error && i.question && i.answer)
      .slice(-4)
      .map((i) => ({ q: i.question, a: i.answer }));

    setItems((prev) => [...prev, { id, question: input.text ?? "", answer: "", pending: true, typed: Boolean(input.text) }]);
    requestAnimationFrame(() => scrollToEnd(true));

    const form = new FormData();
    if (input.audio) form.append("audio", input.audio, `clip.${extFor(input.audio.type)}`);
    if (input.text) form.append("text", input.text);
    form.append("brief", brief);
    form.append("label", label);
    form.append("history", JSON.stringify(history));

    try {
      const res = await fetch("/api/ask", { method: "POST", body: form });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);

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
          const lines = frame.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(6);
          const payload = decodeBase64Utf8(dataLine.slice(5));

          if (event === "question") {
            if (!payload) {
              patch(id, (it) => ({ ...it, pending: false, error: "Didn't catch any speech — try again closer to the speaker." }));
            } else {
              patch(id, (it) => ({ ...it, question: payload }));
            }
          } else if (event === "answer") {
            patch(id, (it) => ({ ...it, answer: it.answer + payload }));
            scrollToEnd();
          } else if (event === "timing") {
            const t = JSON.parse(payload) as { totalMs: number; firstTokenMs?: number };
            patch(id, (it) => ({ ...it, totalMs: t.totalMs, firstTokenMs: t.firstTokenMs }));
          } else if (event === "error") {
            patch(id, (it) => ({ ...it, pending: false, error: payload }));
          } else if (event === "done") {
            patch(id, (it) => ({ ...it, pending: false }));
          }
        }
      }
      patch(id, (it) => (it.pending ? { ...it, pending: false } : it));
    } catch (err) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      patch(id, (it) => ({
        ...it,
        pending: false,
        error: offline ? "You're offline — check your connection." : err instanceof Error ? err.message : "Something went wrong.",
      }));
    }
  }

  function teardownAudio() {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    levelRef.current?.style.setProperty("--level", "0");
  }

  async function startRecording() {
    if (phase !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      sendRef.current = true;

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (!sendRef.current) {
          setPhase("idle");
          return;
        }
        if (blob.size < MIN_CLIP_BYTES) {
          setPhase("idle");
          showToast("Too short — hold on a little longer");
          return;
        }
        setPhase("idle");
        void ask({ audio: blob });
      };
      recorder.start(250);
      recorderRef.current = recorder;

      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        const data = new Uint8Array(analyser.fftSize);
        let smooth = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          smooth = smooth * 0.7 + Math.min(1, rms * 5) * 0.3;
          levelRef.current?.style.setProperty("--level", smooth.toFixed(3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // level meter is cosmetic
      }

      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsed(ms);
        if (ms >= MAX_RECORD_MS) stopRecording(true);
      }, 200);

      setTyping(false);
      setPhase("recording");
      buzz();
    } catch (err) {
      teardownAudio();
      const name = (err as { name?: string })?.name;
      showToast(
        name === "NotAllowedError"
          ? "Microphone blocked — allow it in your browser settings"
          : name === "NotFoundError"
            ? "No microphone found"
            : "Couldn't start the microphone"
      );
    }
  }

  function stopRecording(send: boolean) {
    const recorder = recorderRef.current;
    sendRef.current = send;
    if (recorder && recorder.state !== "inactive") {
      setPhase(send ? "processing" : "idle");
      recorder.stop();
    } else {
      setPhase("idle");
    }
    recorderRef.current = null;
    teardownAudio();
    buzz(send ? 18 : 8);
  }

  useEffect(() => () => {
    sendRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    teardownAudio();
  }, []);

  function onRecPress() {
    if (phase === "recording") stopRecording(true);
    else if (phase === "idle") void startRecording();
  }

  function submitTyped() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void ask({ text });
    inputRef.current?.blur();
  }

  async function copy(it: QA) {
    try {
      await navigator.clipboard.writeText(it.answer);
      setCopied(it.id);
      window.setTimeout(() => setCopied((c) => (c === it.id ? null : c)), 1500);
    } catch {
      showToast("Couldn't copy");
    }
  }

  const recording = phase === "recording";
  const lastId = items.length ? items[items.length - 1].id : -1;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 scroll-area scroll-fade">
        <div className="max-w-lg mx-auto px-4 pt-2 pb-4 min-h-full flex flex-col gap-3">
          {items.length === 0 ? (
            <div className="m-auto w-full py-8 flex flex-col items-center text-center rise">
              <div className="relative w-16 h-16 mb-5">
                <div className="absolute inset-0 rounded-full bg-signal/10 blur-xl" />
                <div className="relative w-16 h-16 rounded-full panel flex items-center justify-center text-signal">
                  <MicIcon size={26} />
                </div>
              </div>
              <h2 className="text-xl font-bold">Ready when they ask</h2>
              <p className="text-sm text-ink-dim mt-1.5 max-w-[30ch]">
                Briefed on {sourceCount > 0 ? `${sourceCount} document${sourceCount === 1 ? "" : "s"}` : "your notes"}
                {label ? ` for ${label}` : ""}.
              </p>
              <ol className="mt-7 w-full max-w-xs flex flex-col gap-2.5 text-left">
                {[
                  ["Tap record", "the moment the caller starts their question"],
                  ["Tap stop", "when they finish"],
                  ["Read it out", "the answer streams in instantly"],
                ].map(([title, sub], i) => (
                  <li key={title} className="flex items-center gap-3 panel rounded-2xl px-3.5 py-3">
                    <span className="w-7 h-7 rounded-lg bg-signal-muted text-signal text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-snug">
                      <span className="font-semibold text-ink">{title}</span>
                      <span className="text-ink-faint"> — {sub}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            items.map((it) => {
              const latest = it.id === lastId;
              return (
                <article key={it.id} className={`qa-card rise ${latest ? "latest" : ""}`}>
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <span className="mono-label text-[9px]! mt-0.75 shrink-0">{it.typed ? "Typed" : "Heard"}</span>
                    {it.question ? (
                      <p className="selectable text-[13px] text-ink-dim leading-relaxed">{it.question}</p>
                    ) : (
                      <span className="dots mt-1.5">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </div>

                  {it.error ? (
                    <p className="text-sm text-[#ff8a8a] leading-relaxed">{it.error}</p>
                  ) : it.answer ? (
                    <p
                      className={`selectable leading-relaxed ${
                        latest ? "text-[19px] font-medium text-ink" : "text-[15px] text-ink/80"
                      } ${it.pending ? "caret" : ""}`}
                    >
                      {it.answer}
                    </p>
                  ) : it.question && it.pending ? (
                    <div className="flex items-center gap-2 text-xs text-ink-faint py-1">
                      <div className="spinner" />
                      Finding the answer…
                    </div>
                  ) : null}

                  {!it.pending && it.answer && (
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
                      <span className="text-[10px] font-mono text-ink-faint">
                        {it.totalMs != null ? `${formatMs(it.totalMs)} total` : ""}
                        {it.firstTokenMs ? ` · first words ${formatMs(it.firstTokenMs)}` : ""}
                      </span>
                      <button
                        onClick={() => copy(it)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint active:text-ink px-2 py-1 -mr-2 rounded-lg"
                      >
                        {copied === it.id ? <CheckIcon size={13} className="text-signal" /> : <CopyIcon size={13} />}
                        {copied === it.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      {toast && (
        <div className="toast panel-strong rounded-full px-4 py-2.5 text-[13px] font-medium">{toast}</div>
      )}

      <div className="shrink-0 relative z-10 border-t border-line bg-[rgba(5,7,11,0.88)] backdrop-blur-xl pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {typing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
            className="max-w-lg mx-auto px-4 pt-3 flex gap-2 fade"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type the caller's question…"
              className="field flex-1 rounded-2xl px-4 py-3"
              enterKeyHint="send"
              autoFocus
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="btn-primary w-12 rounded-2xl flex items-center justify-center shrink-0"
              aria-label="Ask"
            >
              <SendIcon size={18} />
            </button>
          </form>
        )}

        <div className="max-w-lg mx-auto px-6 pt-4 flex items-center justify-between">
          <div className="w-16 flex flex-col items-center gap-1.5">
            {recording ? (
              <>
                <button onClick={() => stopRecording(false)} className="dock-btn cancel" aria-label="Cancel recording">
                  <XIcon size={20} />
                </button>
                <span className="text-[10px] text-ink-faint">Discard</span>
              </>
            ) : (
              <>
                <button
                  onClick={onNewConversation}
                  disabled={items.length === 0 || answering || phase !== "idle"}
                  className="dock-btn"
                  aria-label="New call — clear answers"
                >
                  <RefreshIcon size={19} />
                </button>
                <span className="text-[10px] text-ink-faint">New call</span>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className={`rec-wrap ${recording ? "recording" : ""}`} ref={levelRef}>
              <div className="rec-level" />
              <button
                onClick={onRecPress}
                className={`rec-btn ${recording ? "recording" : ""} ${phase === "processing" ? "processing" : ""}`}
                aria-label={recording ? "Stop and get answer" : "Start recording"}
              >
                {recording ? <StopIcon size={26} /> : <MicIcon size={30} />}
                {phase === "processing" && <span className="rec-ring" />}
              </button>
            </div>
            <span
              className={`text-xs font-semibold tabular-nums h-4 ${
                recording ? "text-signal" : phase === "processing" ? "text-ink-dim" : "text-ink-faint"
              }`}
            >
              {recording ? `Listening · ${formatClock(elapsed)}` : phase === "processing" ? "Sending…" : "Tap to listen"}
            </span>
          </div>

          <div className="w-16 flex flex-col items-center gap-1.5">
            <button
              onClick={() => setTyping((t) => !t)}
              disabled={recording}
              className={`dock-btn ${typing ? "active" : ""}`}
              aria-label="Type a question"
            >
              <KeyboardIcon size={20} />
            </button>
            <span className="text-[10px] text-ink-faint">Type</span>
          </div>
        </div>
      </div>
    </div>
  );
}
