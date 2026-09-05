"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Shown when the SW has no cached copy of a page and the network is
 * down. Important: this page does NOT auto-redirect to /dashboard.
 * Previously it did — but when the SW fails /dashboard and falls back
 * here, an auto-redirect would loop forever:
 *
 *   SW serves /offline → page sees online=true → location.replace(/dashboard)
 *   → fetch fails again → SW serves /offline → repeat
 *
 * Captive portals (airport wifi, etc.) report `online=true` while
 * still blocking real traffic. So we treat the manual "Try again"
 * button as the only legitimate path back into the app.
 */
export default function OfflinePage() {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sky px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E] shadow-[0_8px_24px_rgba(180,140,60,0.35)]">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M5 12.86a10 10 0 0 1 14 0" />
          <path d="M8.5 16.43a5 5 0 0 1 7 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold text-ink">You&rsquo;re offline</h1>
      <p className="mt-3 max-w-md text-sm text-dim">
        Divine Mercy Seeta couldn&rsquo;t reach the internet. The app shell is
        still available &mdash; tap below once you&rsquo;re back online to
        refresh the latest prayer times and announcements.
      </p>
      {online ? (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-900">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Connection detected
        </p>
      ) : null}
      <div className="mt-8 flex flex-col items-center gap-3 text-xs text-dim">
        <p>Push alarms you enabled still ring even while you&rsquo;re offline.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-gold/40 bg-ivory px-5 py-2 font-semibold text-ink transition hover:bg-ivory-lift"
        >
          Try again
        </button>
        <Link
          href="/login"
          className="rounded-full border border-line bg-white px-5 py-2 font-semibold text-dim transition hover:border-gold hover:text-ink"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
