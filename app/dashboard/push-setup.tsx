"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registers the push service worker and lets the member turn prayer alarms
 * on/off. The ring is delivered by the server (web push) even when the app
 * tab is closed — this widget only sets up the subscription.
 */
const DISMISS_KEY = "dm:alarmPromptDismissed";
const SYNC_KEY = "dm:lastSyncedEndpoint";

type Phase = "hidden" | "unavailable" | "checking" | "prompt" | "requesting" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushSetup() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  const syncSubscription = useCallback(async (subscription: PushSubscription | null) => {
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    if (localStorage.getItem(SYNC_KEY) === endpoint) return;
    try {
      const sub = subscription.toJSON();
      const keys = (sub.keys ?? {}) as { p256dh?: string; auth?: string };
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: { endpoint: sub.endpoint, keys },
        }),
      });
      if (res.ok) localStorage.setItem(SYNC_KEY, endpoint);
    } catch {
      // Transient failure — retried on the next mount or subscription change.
    }
  }, []);

  const ensureSubscription = useCallback(async () => {
    if (!regRef.current || !publicKey) return;
    let subscription = await regRef.current.pushManager.getSubscription();
    if (!subscription) {
      subscription = await regRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await syncSubscription(subscription);
    setPhase("on");
  }, [publicKey, syncSubscription]);

  const enable = useCallback(async () => {
    if (!("Notification" in window) || !publicKey) return;
    setPhase("requesting");
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission === "granted") {
      try {
        await ensureSubscription();
        return;
      } catch {
        // Fall through to the prompt so the user can retry.
      }
    }
    setPhase(permission === "denied" ? "hidden" : "prompt");
  }, [publicKey, ensureSubscription]);

  const disable = useCallback(async () => {
    const reg = regRef.current;
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await fetch("/api/notifications/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        } catch {
          // Best effort — the push service will drop us anyway.
        }
        await sub.unsubscribe().catch(() => {});
      }
    }
    localStorage.removeItem(SYNC_KEY);
    setPhase("prompt");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setPhase("unavailable");
        return;
      }

      try {
        const res = await fetch("/api/vapid-public-key");
        const data = await res.json();
        if (cancelled) return;
        if (!data.publicKey) {
          setPhase("unavailable");
          return;
        }
        setPublicKey(data.publicKey as string);
      } catch {
        if (!cancelled) setPhase("unavailable");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        regRef.current = reg;
        if (cancelled) return;

        if (localStorage.getItem(DISMISS_KEY)) {
          setPhase("hidden");
          return;
        }
        if (Notification.permission === "granted") {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await syncSubscription(sub);
            setPhase("on");
          } else {
            setPhase("prompt");
          }
        } else if (Notification.permission === "denied") {
          setPhase("hidden");
        } else {
          setPhase("prompt");
        }
      } catch {
        if (!cancelled) setPhase("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncSubscription]);

  // The push service may rotate the subscription — re-subscribe and re-sync.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "PUSH_SUBSCRIPTION_CHANGED" && publicKey) {
        ensureSubscription().catch(() => setPhase("prompt"));
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [publicKey, ensureSubscription]);

  if (phase !== "prompt" && phase !== "requesting" && phase !== "on") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      {phase === "on" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-2.5 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
          <span className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Prayer alarms on — the Holy Hour will ring on this device.
          </span>
          <button
            type="button"
            onClick={disable}
            className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-dim transition hover:bg-ivory-lift hover:text-ink"
          >
            Off
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-2.5 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
          <p className="text-xs text-dim">
            Enable prayer alarms — the Holy Hour rings on this device even when the app is closed.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={enable}
              disabled={phase === "requesting"}
              className="rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3.5 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105 disabled:opacity-50"
            >
              {phase === "requesting" ? "Enabling…" : "Enable"}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem(DISMISS_KEY, "1");
                setPhase("hidden");
              }}
              className="rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
