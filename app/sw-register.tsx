"use client";

import { useEffect } from "react";
import { BUILD_ID, registerServiceWorker } from "@/lib/sw-version";

/**
 * Registers the PWA service worker on every page load. This is separate
 * from push-setup.tsx because that file only mounts inside the dashboard
 * — we want the SW (and its offline fallback) installed for *every*
 * visitor, including those who only land on the splash or login pages.
 *
 * It also does the recovery handshake for the stale-cache bug: the worker
 * is told which build this page came from ("SET_BUILD_ID"). If a worker
 * from an older build is still controlling the page, it drops its caches
 * immediately — before it can serve any of them — which is what heals an
 * installed phone that would otherwise be stuck on chunk URLs the current
 * deployment no longer serves. See public/sw.js.
 */
export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Heal first, and synchronously: if an older worker is controlling this
    // page, its caches must go before this document's chunks are requested.
    const tellBuild = (worker: ServiceWorker | null) => {
      if (worker) worker.postMessage({ type: "SET_BUILD_ID", buildId: BUILD_ID });
    };
    tellBuild(navigator.serviceWorker.controller);

    // Defer registration until after first paint so we don't compete with
    // the LCP-critical splash image for the main thread.
    const handle = window.setTimeout(() => {
      registerServiceWorker().then((reg) => {
        // A worker that exists but isn't controlling this page yet never
        // received the message above — send it directly.
        if (reg && !navigator.serviceWorker.controller) tellBuild(reg.active);
      });
    }, 1500);

    return () => window.clearTimeout(handle);
  }, []);

  return null;
}
