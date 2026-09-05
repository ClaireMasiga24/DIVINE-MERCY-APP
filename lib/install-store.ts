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
 *   const { event, prompt, dismissed, ... } = useInstallEvent();
 *
 * Why a manual-install surface matters:
 *
 *   `beforeinstallprompt` is *unreliable* on phones. Chrome only fires it
 *   after the user has interacted with the page for some time, has at
 *   least one successful navigation, and the PWA meets a strict set of
 *   heuristics (manifest + SW + HTTPS + a 192/512 icon set). Many phones
 *   never reach that bar on the splash screen — the user lands, gets
 *   redirected to /login, and never sees the prompt. Other Android
 *   browsers (Samsung Internet, MIUI Browser, Huawei Browser) don't fire
 *   it at all.
 *
 *   So this store ALSO exposes a "trigger" surface: any component can ask
 *   for the current install options (BIP if available, otherwise the
 *   best-effort browser-specific guidance) and let the user pick up the
 *   install flow from a help card. That makes install possible on every
 *   phone, not just the ones Chromium feels like prompting today.
 */

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type InstallState = {
  event: BIPEvent | null;
  installed: boolean;
  dismissed: boolean;
  /** Increments every time `beforeinstallprompt` fires so the UI can react. */
  promptRevision: number;
};

const DISMISS_KEY = "dm:installPromptDismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// We no longer permanently set INSTALLED_KEY — display-mode is the source
// of truth. A separate "install-acknowledged" key is kept so the banner
// can stay quiet for a short while after a successful install.
const INSTALLED_KEY = "dm:installPromptInstalled";
const INSTALLED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedEvent: BIPEvent | null = null;
const listeners = new Set<() => void>();
let captureStarted = false;
let promptRevision = 0;

function snapshot(): InstallState {
  return {
    event: cachedEvent,
    installed: isInstalledDisplayMode(),
    dismissed: wasRecentlyDismissed(),
    promptRevision,
  };
}

function notify() {
  for (const l of listeners) l();
}

// A single mutable cell. `getClientSnapshot` returns this exact reference
// and only swaps in a new object when one of the fields actually
// changed. useSyncExternalStore's getSnapshot must be referentially
// stable for unchanged state, and a single-cell pattern is the
// recommended way to guarantee that without per-render allocation.
let clientSnapshot: InstallState = {
  event: null,
  installed: false,
  dismissed: false,
  promptRevision: 0,
};

function refreshClientSnapshot(): InstallState {
  const next = snapshot();
  if (
    clientSnapshot.event === next.event &&
    clientSnapshot.installed === next.installed &&
    clientSnapshot.dismissed === next.dismissed &&
    clientSnapshot.promptRevision === next.promptRevision
  ) {
    return clientSnapshot;
  }
  clientSnapshot = next;
  return clientSnapshot;
}

const SERVER_SNAPSHOT: InstallState = {
  event: null,
  installed: false,
  dismissed: false,
  promptRevision: 0,
};

/**
 * Source-of-truth for "is this app currently running as an installed PWA?".
 * Only the real display-mode counts — we don't trust a localStorage flag
 * because users clear app data / uninstall / reinstall without our
 * knowing, and a stale flag would silently block the install UI forever.
 */
function isInstalledDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((navigator as any).standalone === true) return true;
  } catch {
    /* matchMedia not supported */
  }
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
  // Soft marker — only suppresses the banner for INSTALLED_TTL_MS. After
  // that the banner reappears if the user is somehow not in standalone
  // mode, which is a graceful way to recover from uninstall + reinstall.
  try {
    localStorage.setItem(INSTALLED_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

function recentlyMarkedInstalled(): boolean {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < INSTALLED_TTL_MS;
  } catch {
    return false;
  }
}

// ---------- User-Agent sniffing for the manual-install fallback ----------

function readUA(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

export function isIPhone(): boolean {
  return /iPhone|iPod/.test(readUA());
}

export function isIPad(): boolean {
  if (/iPad/.test(readUA())) return true;
  if (typeof navigator === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
  return /Mac/.test(platform) && navigator.maxTouchPoints > 1;
}

export function isIOSLike(): boolean {
  return isIPhone() || isIPad();
}

export function isAndroid(): boolean {
  return /Android/.test(readUA());
}

export function isSamsungBrowser(): boolean {
  return /SamsungBrowser/i.test(readUA());
}

export function isFirefox(): boolean {
  return /Firefox/i.test(readUA()) && !/FxiOS/i.test(readUA());
}

export function isIOSChrome(): boolean {
  return /CriOS/i.test(readUA());
}

export function isIOSFirefox(): boolean {
  return /FxiOS/i.test(readUA());
}

export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any).userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(readUA());
  return Boolean(platform);
}

/**
 * Best label for the "browser menu" the user needs to open. Used in
 * the manual-install help card.
 */
export function browserMenuLabel(): string {
  if (isSamsungBrowser()) return "menu (≡)";
  if (isIOSChrome()) return "•••";
  if (isIOSFirefox()) return "•••";
  if (isAndroid()) return "⋮";
  return "browser menu";
}

/** Start listening for the global beforeinstallprompt event. Idempotent. */
export function startInstallCapture(): void {
  if (captureStarted) return;
  if (typeof window === "undefined") return;
  captureStarted = true;

  // If the user is already running as an installed PWA, don't bother
  // capturing — they're done.
  if (isInstalledDisplayMode()) {
    notify();
    return;
  }

  const onBIP = (e: Event) => {
    // Suppress the browser's own mini-infobar so our banner is the only
    // one the user sees.
    e.preventDefault();
    cachedEvent = e as BIPEvent;
    promptRevision += 1;
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
    if (isInstalledDisplayMode()) {
      cachedEvent = null;
      markInstalled();
    }
    notify();
  };
  mql.addEventListener("change", onDisplayChange);

  window.addEventListener("beforeinstallprompt", onBIP);
  window.addEventListener("appinstalled", onInstalled);
}

/**
 * Manually re-check the install state. Call this from a Settings button
 * or after the user dismisses the banner, so they can re-open the help
 * card without reloading the page.
 */
export function recheckInstallability(): void {
  if (!captureStarted) startInstallCapture();
  notify();
}

/**
 * Triggers the native install prompt if the browser has fired
 * `beforeinstallprompt`. Returns one of:
 *   - { kind: "native", outcome: "accepted" | "dismissed" } — BIP fired
 *   - { kind: "no-event" } — no BIP available; caller should show manual
 *     install instructions
 *   - { kind: "already-installed" } — running as standalone, nothing to do
 *   - { kind: "error", message } — the prompt() call threw
 */
export type PromptResult =
  | { kind: "native"; outcome: "accepted" | "dismissed" }
  | { kind: "no-event" }
  | { kind: "already-installed" }
  | { kind: "error"; message: string };

export async function triggerPrompt(): Promise<PromptResult> {
  if (isInstalledDisplayMode()) {
    return { kind: "already-installed" };
  }
  if (!cachedEvent) {
    return { kind: "no-event" };
  }
  try {
    await cachedEvent.prompt();
    const { outcome } = await cachedEvent.userChoice;
    if (outcome === "accepted") {
      markInstalled();
      cachedEvent = null;
      promptRevision += 1;
      notify();
      return { kind: "native", outcome: "accepted" };
    }
    // User dismissed the native prompt — back off for DISMISS_TTL_MS.
    markDismissed();
    promptRevision += 1;
    notify();
    return { kind: "native", outcome: "dismissed" };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
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
  try {
    localStorage.removeItem(INSTALLED_KEY);
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
  promptRevision: number;
  prompt: () => Promise<PromptResult>;
  dismiss: () => void;
  reset: () => void;
  recheck: () => void;
} {
  // Start the global capture the first time anyone calls this hook. The
  // capture is idempotent and module-scoped so it's safe to call many
  // times from many components.
  useEffect(() => {
    startInstallCapture();
  }, []);

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
    promptRevision: state.promptRevision,
    prompt: triggerPrompt,
    dismiss: dismissInstall,
    reset: resetInstallDismissal,
    recheck: recheckInstallability,
  };
}

// Re-export so call-sites that used the standalone helpers keep working.
export { recentlyMarkedInstalled };
