"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OfflinePage() {
  // Lazy initializer runs once at mount — safe for SSR (returns `true` when
  // navigator is undefined), and avoids the "setState in effect" lint.
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

  // If the connection comes back, bounce to the dashboard — there's nothing
  // useful on /offline once we're online again.
  useEffect(() => {
    if (online) window.location.replace("/dashboard");
  }, [online]);

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
        still available &mdash; once you&rsquo;re back online, the latest
        prayer times and announcements will refresh automatically.
      </p>
      <div className="mt-8 flex flex-col items-center gap-2 text-xs text-dim">
        <p>
          Push alarms you enabled still ring even while you&rsquo;re offline.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-full border border-gold/40 bg-ivory px-4 py-1.5 font-semibold text-ink transition hover:bg-ivory-lift"
        >
          Try the dashboard
        </Link>
      </div>
    </div>
  );
}
