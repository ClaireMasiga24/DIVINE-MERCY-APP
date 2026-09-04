"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on every page load. This is separate
 * from push-setup.tsx because that file only mounts inside the dashboard
 * — we want the SW (and its offline shell cache) installed for *every*
 * visitor, including those who only land on the splash or login pages.
 */
export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Defer registration until after first paint so we don't compete with
    // the LCP-critical splash image for the main thread.
    const handle = window.setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* SW registration failed — push will also fail, handled separately */
        });
    }, 1500);

    return () => window.clearTimeout(handle);
  }, []);

  return null;
}
