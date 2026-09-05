"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Global store for the PWA install event.
 *
 * The browser dispatches `beforeinstallprompt` on whatever page is loaded
 * at the moment the PWA becomes installable — which is rarely the page we
 * want the banner on. Returning users hit `/` -> `/login` -> `/dashboard`
 * in under a second, so a listener inside the dashboard component misses
 * the event entirely.
 *
 * This module hoists the listener to module scope and caches the event so
 * any component, mounted on any page, can render the install button.
 *
 *   import { useInstallEvent, startInstallCapture } from "@/lib/install-store";
 *
 *   // In root layout:
 *   useEffect(() => { startInstallCapture(); }, []);
 *
 *   // In any component:
 *   const { event, prompt, dismissed } = useInstallEvent();
 */

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  event: BIPEvent | null;
  installed: boolean;
  dismissed: boolean;
};

const DISMISS_KEY = "dm:installPromptDismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const INSTALLED_KEY = "dm:installPromptInstalled";

let cachedEvent: BIPEvent | null = null;
const listeners = new Set<() => void>();
let captureStarted = false;

function snapshot(): InstallState {
  return {
    event: cachedEvent,
    installed: isInstalled() || isMarkedInstalled(),
    dismissed: wasRecentlyDismissed(),
  };
}

function notify() {
  for (const l of listeners) l();
}

// A single mutable cell. `getClientSnapshot` returns this exact reference
// and only swaps in a new object when one of the three fields actually
// changed. useSyncExternalStore's getSnapshot must be referentially
// stable for unchanged state, and a single-cell pattern is the
// recommended way to guarantee that without per-render allocation.
let clientSnapshot: InstallState = {
  event: null,
  installed: false,
  dismissed: false,
};

function refreshClientSnapshot(): InstallState {
  const next = snapshot();
  if (
    clientSnapshot.event === next.event &&
    clientSnapshot.installed === next.installed &&
    clientSnapshot.dismissed === next.dismissed
  ) {
    return clientSnapshot;
  }
  clientSnapshot = next;
  return clientSnapshot;
}

const SERVER_SNAPSHOT: InstallState = { event: null, installed: false, dismissed: false };

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true;
  return false;
}

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

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

function isMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) !== null;
  } catch {
    return false;
  }
}

/** Start listening for the global beforeinstallprompt event. Idempotent. */
export function startInstallCapture(): void {
  if (captureStarted) return;
  if (typeof window === "undefined") return;
  captureStarted = true;

  // If the user already installed, don't bother.
  if (isInstalled() || isMarkedInstalled()) {
    cachedEvent = null;
    notify();
    return;
  }

  const onBIP = (e: Event) => {
    // Suppress the browser's own mini-infobar so our banner is the only
    // one the user sees.
    e.preventDefault();
    cachedEvent = e as BIPEvent;
    notify();
  };

  const onInstalled = () => {
    cachedEvent = null;
    markInstalled();
    notify();
  };

  // Re-evaluate "installed" if the user changes the display mode (e.g.
  // installs via the URL bar after the page is already loaded).
  const mql = window.matchMedia("(display-mode: standalone)");
  const onDisplayChange = () => {
    if (isInstalled() || isMarkedInstalled()) {
      cachedEvent = null;
      markInstalled();
    }
    notify();
  };
  mql.addEventListener("change", onDisplayChange);

  window.addEventListener("beforeinstallprompt", onBIP);
  window.addEventListener("appinstalled", onInstalled);
}

/** Triggers the install prompt. Returns true on accept, false on dismiss. */
export async function promptInstall(): Promise<boolean> {
  if (!cachedEvent) return false;
  try {
    await cachedEvent.prompt();
    const { outcome } = await cachedEvent.userChoice;
    if (outcome === "accepted") {
      markInstalled();
      cachedEvent = null;
      notify();
      return true;
    }
    markDismissed();
    notify();
    return false;
  } catch {
    markDismissed();
    notify();
    return false;
  }
}

/** Marks the install banner as dismissed (for the "Not now" button). */
export function dismissInstall(): void {
  markDismissed();
  notify();
}

/** Clears any prior dismissal — for testing or explicit re-show. */
export function resetInstallDismissal(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/**
 * Hook for components that want to render the install banner. Re-renders
 * when any of {event, installed, dismissed} change. Safe to call from
 * any page.
 */
export function useInstallEvent(): {
  event: BIPEvent | null;
  installed: boolean;
  dismissed: boolean;
  prompt: () => Promise<boolean>;
  dismiss: () => void;
} {
  // Start the global capture the first time anyone calls this hook. The
  // capture is idempotent and module-scoped so it's safe to call many
  // times from many components.
  useEffect(() => {
    startInstallCapture();
  }, []);

  // useSyncExternalStore: a single subscription that re-runs the
  // `getSnapshot` callback on every `notify()`. The snapshot is a
  // single mutable cell — refreshClientSnapshot only swaps the
  // reference when the underlying state actually changed, so React
  // never sees a new object for unchanged state.
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => refreshClientSnapshot(),
    () => SERVER_SNAPSHOT
  );

  return {
    event: state.event,
    installed: state.installed,
    dismissed: state.dismissed,
    prompt: promptInstall,
    dismiss: dismissInstall,
  };
}
