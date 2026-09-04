"use client";

import { useEffect, useState } from "react";

// Chrome / Edge / Samsung Internet fire beforeinstallprompt when the PWA
// meets installability criteria. iOS Safari doesn't fire it — users have to
// use the system share sheet ("Add to Home Screen"). We handle both.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "dm:installPromptDismissed";

// Reads true when the app is launched from the home-screen icon (installed).
function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  // Android / ChromeOS / desktop browsers.
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

export default function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalled()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onBIP = (e: Event) => {
      // Prevent the mini-infobar on Chrome — we render our own banner.
      e.preventDefault();
      setBip(e as BIPEvent);
      // Small delay so the prompt doesn't compete with the dashboard shell
      // settling in on first render.
      window.setTimeout(() => setVisible(true), 4000);
    };

    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS users never get a `beforeinstallprompt`. Detect once and offer
    // gentle instructions after they've had a moment to explore the app.
    if (isIOS()) {
      window.setTimeout(() => setShowIOSHelp(true), 4000);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  // Once the app is launched in standalone mode (user installed), hide.
  useEffect(() => {
    if (!visible) return;
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => {
      if (mql.matches) setVisible(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [visible]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowIOSHelp(false);
  };

  const install = async () => {
    if (!bip) return;
    setVisible(false);
    try {
      await bip.prompt();
      const { outcome } = await bip.userChoice;
      if (outcome === "accepted") {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch {
      /* user cancelled at the OS prompt — keep banner dismissed for this session */
    }
  };

  if (!visible && !showIOSHelp) return null;
  // Only show the iOS card if we haven't already shown the BIP card.
  if (visible && !bip && showIOSHelp) {
    // Both are true on iOS only when no BIP fires — let the iOS card render.
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-3 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
        <div className="flex-1 text-xs">
          {visible && bip ? (
            <>
              <p className="font-semibold text-ink">Install Divine Mercy Seeta</p>
              <p className="mt-0.5 text-dim">
                Add to your home screen for one-tap access and offline prayer alarms.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">Install on your iPhone</p>
              <p className="mt-0.5 text-dim">
                Tap the share button
                <span aria-hidden className="mx-1 inline-block align-middle">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
                    <path d="M12 3v13M5 8l7-5 7 5M5 21h14" />
                  </svg>
                </span>
                then choose <strong>Add to Home Screen</strong>.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {visible && bip ? (
            <button
              type="button"
              onClick={install}
              className="rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3.5 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105"
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
