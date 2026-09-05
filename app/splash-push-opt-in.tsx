"use client";

import { useEffect, useState } from "react";
import { usePushSubscription } from "./use-push-subscription";

/**
 * Splash-screen opt-in for Holy Hour call alarms. Mounts on the splash
 * (/) before the auth-check redirect resolves. We can't subscribe before
 * the user signs in (the server associates the DeviceToken with a
 * session), so this card:
 *
 *   1. Reserves the browser-side subscription (with a fake session-bound
 *      POST that will fail server-side until the user logs in).
 *   2. Asks for notification permission.
 *   3. Lets the user tap "Not now" and continues to the app.
 *
 * After signing in, the user lands on the dashboard, push-setup.tsx
 * re-checks the SW and re-syncs the DeviceToken with their real
 * session. So the splash flow is just permission priming — the actual
 * server-side registration happens after sign-in.
 *
 * The dismissal flag uses a 14-day TTL so it doesn't pester.
 */
const DISMISS_KEY = "dm:splashPushDismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function wasRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function dismissSplashPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

export default function SplashPushOptIn() {
  const { phase, permission, enable } = usePushSubscription();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => wasRecentlyDismissed());

  useEffect(() => {
    if (phase !== "prompt") return;
    if (dismissed) return;
    if (permission === "denied") return;
    // Tiny delay so the card doesn't fight the splash animation.
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, [phase, permission, dismissed]);

  if (!visible) return null;
  if (phase === "on") return null; // nothing to do — already enabled

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[#C9A24E]/40 bg-white/95 px-5 py-4 shadow-[0_6px_20px_rgba(51,38,43,0.18)] backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Turn on Holy Hour call alarms</p>
            <p className="mt-1 text-xs text-dim">
              We&apos;ll ring your phone at 3 AM and 3 PM, even when the app is closed.
              Tap Enable, then sign in to finish.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  // Ask for permission and try to subscribe. The
                  // server-side upsert will fail because the user isn't
                  // signed in yet — that's fine, the dashboard will
                  // re-sync on next mount.
                  await enable();
                  dismissSplashPrompt();
                  setVisible(false);
                }}
                className="rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-4 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105"
              >
                Enable alarms
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissSplashPrompt();
                  setDismissed(true);
                  setVisible(false);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-dim transition hover:text-ink"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              dismissSplashPrompt();
              setDismissed(true);
              setVisible(false);
            }}
            className="shrink-0 rounded-full p-1 text-dim transition hover:bg-ivory-lift hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}