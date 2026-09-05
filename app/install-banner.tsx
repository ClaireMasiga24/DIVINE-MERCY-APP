"use client";

import { useState } from "react";
import {
  useInstallEvent,
  isIOSLike,
  isIPad,
  isIPhone,
  isAndroid,
  isSamsungBrowser,
  browserMenuLabel,
} from "@/lib/install-store";

/**
 * Install help surface that works on EVERY phone, not just Chromium-with-BIP.
 *
 * Three layers:
 *
 *   1. **A persistent pill** ("Get the app") — shown on the splash, login
 *      and dashboard for any mobile visitor who hasn't installed yet.
 *      Tap it to open the install help card.
 *
 *   2. **Auto native prompt** — if `beforeinstallprompt` has fired, the
 *      help card's "Install" button triggers it directly. One tap, done.
 *
 *   3. **Per-browser instructions** — when no BIP is available, the card
 *      shows step-by-step guidance for the user's actual browser:
 *      iPhone Safari, iPad, Android Chrome, Samsung Internet, etc. The
 *      user can ALWAYS install, even on browsers that don't fire BIP.
 *
 * The dismiss state has a 14-day TTL and is per-user-localStorage. We
 * also add a "How to install" entry in Settings so a dismissed user can
 * always find their way back.
 */
export default function InstallBanner() {
  const { event, installed, dismissed, prompt, dismiss } = useInstallEvent();
  const [open, setOpen] = useState(false);
  // Detect "are we on a phone" lazily on first render so SSR / hydration
  // agree and we don't pay for an effect-driven setState.
  const [mobile] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uaMobile = (navigator as any).userAgentData?.mobile;
    if (typeof uaMobile === "boolean") return uaMobile;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  });

  if (installed) return null;
  if (mobile === false) return null; // desktop users don't need this

  // Don't show the floating pill on its own while the modal is open or
  // after the user dismissed. The pill stays dismissable but the modal
  // is always re-openable from Settings.
  const showPill = !dismissed;

  return (
    <>
      {showPill ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[#C9A24E]/40 bg-white/95 px-4 py-2 text-xs font-semibold text-[#3B2F1E] shadow-[0_4px_14px_rgba(51,38,43,0.18)] backdrop-blur-sm transition hover:brightness-105"
          aria-label="Install Divine Mercy Seeta app"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Get the app
          </span>
        </button>
      ) : null}

      {open ? (
        <InstallModal
          event={event}
          onClose={() => setOpen(false)}
          onDismiss={() => {
            dismiss();
            setOpen(false);
          }}
          onPrompt={async () => {
            const res = await prompt();
            // Native accept → close (the OS install sheet handles the
            // rest). Native dismiss / no-event / error → leave the modal
            // open so the user can fall through to the manual browser
            // instructions underneath.
            if (res.kind === "native" && res.outcome === "accepted") {
              setOpen(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function InstallModal({
  event,
  onClose,
  onDismiss,
  onPrompt,
}: {
  event: Event | null;
  onClose: () => void;
  onDismiss: () => void;
  onPrompt: () => void | Promise<void>;
}) {
  const ios = isIOSLike();
  const ipad = isIPad();
  const iphone = isIPhone();
  const android = isAndroid();
  const samsung = isSamsungBrowser();
  const menu = browserMenuLabel();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 pt-12 sm:items-center sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      onClick={(e) => {
        // Tap backdrop to close (but not when tapping the card).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-3 border-b border-[#F0E8D6] bg-gradient-to-b from-[#F3EEE2] to-white px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 id="install-modal-title" className="text-base font-semibold text-[#2B2115]">
              Install Divine Mercy Seeta
            </h2>
            <p className="mt-0.5 text-xs text-[#8A7C63]">
              Add the app to your home screen for one-tap access and offline prayer alarms.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-[#8A7C63] transition hover:bg-[#F3EEE2] hover:text-[#2B2115]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-[#2B2115]">
          {event ? (
            <>
              <p className="text-xs text-[#8A7C63]">
                Your browser supports one-tap install. Tap the button below.
              </p>
              <button
                type="button"
                onClick={() => onPrompt()}
                className="w-full rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-4 py-2.5 text-sm font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105"
              >
                Install now
              </button>
              <p className="border-t border-[#F0E8D6] pt-3 text-xs text-[#8A7C63]">
                If the button doesn&apos;t open an install sheet, use the manual steps below.
              </p>
            </>
          ) : null}

          {ios ? (
            <IOSInstructions ipad={ipad} iphone={iphone} />
          ) : android ? (
            samsung ? (
              <SamsungInstructions menu={menu} />
            ) : (
              <AndroidChromeInstructions menu={menu} />
            )
          ) : (
            <GenericInstructions menu={menu} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#F0E8D6] bg-[#FBF7EE] px-5 py-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#8A7C63] transition hover:text-[#2B2115]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#2B2115]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[10px] font-bold text-[#3B2F1E]">
        {n}
      </span>
      <span className="flex-1 text-sm text-[#2B2115]">{children}</span>
    </li>
  );
}

function IOSInstructions({ ipad, iphone }: { ipad: boolean; iphone: boolean }) {
  const device = ipad ? "iPad" : iphone ? "iPhone" : "device";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7C63]">
        {device} · Safari
      </p>
      <ol className="space-y-2">
        <Step n={1}>
          Tap the <strong>Share</strong> button at the bottom of Safari.
          <span aria-hidden className="ml-1 inline-block align-middle text-[#3B2F1E]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
              <path d="M12 3v13M5 8l7-5 7 5M5 21h14" />
            </svg>
          </span>
        </Step>
        <Step n={2}>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong> in the top-right. The app will appear on your home screen.
        </Step>
      </ol>
    </div>
  );
}

function AndroidChromeInstructions({ menu }: { menu: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7C63]">
        Android · Chrome
      </p>
      <ol className="space-y-2">
        <Step n={1}>
          Tap the <strong>{menu}</strong> button (top-right of Chrome).
        </Step>
        <Step n={2}>
          Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Install</strong>. The app will appear on your home screen.
        </Step>
      </ol>
      <p className="mt-3 text-xs text-[#8A7C63]">
        Don&apos;t see &quot;Install app&quot;? Chrome only offers it after you&apos;ve used the
        site a few times. Keep the site open for a minute and try again.
      </p>
    </div>
  );
}

function SamsungInstructions({ menu }: { menu: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7C63]">
        Android · Samsung Internet
      </p>
      <ol className="space-y-2">
        <Step n={1}>
          Tap the <strong>{menu}</strong> button at the bottom of the screen.
        </Step>
        <Step n={2}>
          Tap <strong>Add page to</strong> → <strong>Home screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>. The app will appear on your home screen.
        </Step>
      </ol>
    </div>
  );
}

function GenericInstructions({ menu }: { menu: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7C63]">
        Your browser
      </p>
      <ol className="space-y-2">
        <Step n={1}>
          Open the <strong>{menu}</strong> in your browser.
        </Step>
        <Step n={2}>
          Look for <strong>Add to Home Screen</strong> or <strong>Install app</strong>.
        </Step>
        <Step n={3}>
          Confirm. The app will appear on your home screen.
        </Step>
      </ol>
    </div>
  );
}
