"use client";

// Keeps installed home-screen copies current. Two independent signals:
// a new service worker taking control, and /api/version reporting a newer
// build than the one running. Either one reloads — but never mid-recording
// or mid-answer; then it waits for idle and shows a refresh pill.

import { useEffect, useRef, useState } from "react";
import { isBusy, onIdle } from "@/lib/busy";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const RELOAD_GUARD = "ca_reloaded_for";
const CHECK_EVERY_MS = 3 * 60 * 1000;

export default function SwRegister() {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    let reloading = false;
    let reg: ServiceWorkerRegistration | null = null;

    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const requestReload = () => {
      if (!isBusy()) {
        reload();
      } else {
        pendingRef.current = true;
        setPending(true);
      }
    };

    const offIdle = onIdle(() => {
      if (pendingRef.current) reload();
    });

    const hadController = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
    const onControllerChange = () => {
      if (hadController) requestReload();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((r) => {
          reg = r;
          r.update().catch(() => {});
        })
        .catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === BUILD || build === "dev") return;
        if (sessionStorage.getItem(RELOAD_GUARD) === build) return;
        sessionStorage.setItem(RELOAD_GUARD, build);
        await reg?.update().catch(() => {});
        requestReload();
      } catch {
        // offline — try again later
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reg?.update().catch(() => {});
      checkVersion();
    };

    checkVersion();
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(checkVersion, CHECK_EVERY_MS);

    return () => {
      offIdle();
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      window.clearInterval(interval);
    };
  }, []);

  if (!pending) return null;

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-70 panel-strong rounded-full pl-3 pr-4 py-2 text-xs font-semibold flex items-center gap-2 rise"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-signal" />
      New version ready · Tap to refresh
    </button>
  );
}
