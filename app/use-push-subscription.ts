"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared push-subscription state and actions. Used by both the dashboard
 * banner (push-setup.tsx) and the splash-screen opt-in card so they
 * stay in sync — turning it on in either place flips the same state.
 *
 * Returns:
 *   - phase:        "checking" | "unavailable" | "prompt" | "requesting" | "on" | "hidden" | "off"
 *   - permission:   the live Notification.permission value
 *   - enable():     trigger the native permission prompt + subscribe
 *   - disable():    unsubscribe + drop server-side token
 *   - refresh():    re-read permission and phase (call after a user gesture)
 */

const SYNC_KEY = "dm:lastSyncedEndpoint";

export type PushPhase =
  | "checking"
  | "unavailable"
  | "prompt"
  | "requesting"
  | "on"
  | "hidden"
  | "off";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushSubscription() {
  const [phase, setPhase] = useState<PushPhase>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  const syncSubscription = useCallback(
    async (subscription: PushSubscription | null) => {
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      try {
        if (localStorage.getItem(SYNC_KEY) === endpoint) {
          setPhase("on");
          return;
        }
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
        // Transient — retried on the next mount or subscription change.
      }
      setPhase("on");
    },
    []
  );

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
  }, [publicKey, syncSubscription]);

  const enable = useCallback(async () => {
    if (!("Notification" in window) || !publicKey) return;
    setPhase("requesting");
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    setPermission(perm);
    if (perm === "granted") {
      try {
        await ensureSubscription();
        return;
      } catch {
        /* fall through to prompt so user can retry */
      }
    }
    setPhase(perm === "denied" ? "hidden" : "prompt");
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
          /* best effort */
        }
        await sub.unsubscribe().catch(() => {});
      }
    }
    localStorage.removeItem(SYNC_KEY);
    setPhase("off");
  }, []);

  const refresh = useCallback(async () => {
    if (!regRef.current) return;
    const sub = await regRef.current.pushManager.getSubscription();
    if (sub) {
      await syncSubscription(sub);
    } else {
      setPhase(Notification.permission === "denied" ? "hidden" : "prompt");
    }
  }, [syncSubscription]);

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

        setPermission(Notification.permission);
        if (Notification.permission === "granted") {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await syncSubscription(sub);
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

  return { phase, permission, publicKey, enable, disable, refresh, setPhase };
}
