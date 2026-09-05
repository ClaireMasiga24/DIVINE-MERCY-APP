"use client";

import { useState } from "react";
import { usePushSubscription } from "../use-push-subscription";

/**
 * The dashboard-side prayer-alarm banner. Driven by the shared
 * usePushSubscription hook so the splash-screen opt-in and this banner
 * stay in sync — turning alarms on in either place flips both.
 *
 * The dismissal flag uses a 14-day TTL: "not now" ≠ "never". After two
 * weeks we re-show the banner so users who didn't understand it the first
 * time get another chance before the next Holy Hour.
 */
const DISMISS_KEY = "dm:alarmPromptDismissed";
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

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked — banner reappears next visit */
  }
}

export default function PushSetup() {
  const { phase, permission, enable, disable } = usePushSubscription();
  // Read the dismissal flag lazily on first client render. SSR returns
  // false; the post-hydration value drives the actual render.
  const [dismissed, setDismissed] = useState<boolean>(() => wasRecentlyDismissed());

  // Once the user grants permission (or it was already granted), the
  // persistent dismiss flag is meaningless — clear it so the next visit
  // doesn't show the banner under a green "alarms on" pill.
  if (phase === "on" && dismissed) {
    setDismissed(false);
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }

  if (phase === "checking" || phase === "unavailable") return null;

  // Persistent "off" indicator — small chip in the bottom-left, only
  // shown when alarms are not active.
  if (
    phase === "off" ||
    phase === "hidden" ||
    (phase === "prompt" && permission === "denied")
  ) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button
          type="button"
          onClick={async () => {
            // Try to re-enable. If permission was previously denied this
            // is a no-op until the user re-allows it in browser settings.
            if (permission === "denied") {
              alert(
                "Notifications are blocked in your browser settings. Allow them for this site, then tap again."
              );
              return;
            }
            await enable();
          }}
          className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900 shadow-[0_2px_8px_rgba(180,140,60,0.18)] transition hover:bg-amber-100"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Prayer alarms: off · Tap to turn on
        </button>
      </div>
    );
  }

  // Banner is dismissed for this user this session — only the "on" pill
  // and the "off" chip are shown above. Nothing else to render.
  if (dismissed) return null;

  if (phase === "on") {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-2.5 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
          <span className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Prayer alarms on — the Holy Hour will ring on this device.
          </span>
          <button
            type="button"
            onClick={async () => {
              await disable();
            }}
            className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-dim transition hover:bg-ivory-lift hover:text-ink"
          >
            Off
          </button>
        </div>
      </div>
    );
  }

  // phase === "prompt" or "requesting" — the onboarding banner
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-2.5 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
        <p className="text-xs text-dim">
          Enable prayer alarms — the Holy Hour rings on this device even when the app is closed.
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await enable();
            }}
            disabled={phase === "requesting"}
            className="rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3.5 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105 disabled:opacity-50"
          >
            {phase === "requesting" ? "Enabling…" : "Enable"}
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              dismiss();
              setDismissed(true);
            }}
            className="rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
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