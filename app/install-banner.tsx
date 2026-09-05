"use client";

import { useInstallEvent } from "@/lib/install-store";

/**
 * Universal install banner. Mounts anywhere. Pulls the cached
 * beforeinstallprompt event from the global store (started by the root
 * layout's InstallCapture) and renders the install button.
 *
 * On iOS, where BIP never fires, falls back to a help card explaining
 * Share → Add to Home Screen.
 */
function isIPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod/.test(navigator.userAgent);
}

function isIPad(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad/.test(navigator.userAgent)) return true;
  const platform =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
  return /Mac/.test(platform) && navigator.maxTouchPoints > 1;
}

function isIOSLike(): boolean {
  return isIPhone() || isIPad();
}

export default function InstallBanner() {
  const { event, installed, dismissed, prompt, dismiss } = useInstallEvent();

  if (installed) return null;
  if (dismissed && !event) return null;

  // Show the BIP banner as soon as we have the event. The banner waits
  // 1.5s so the page has settled.
  if (event) {
    return (
      <Banner
        title="Install Divine Mercy Seeta"
        body="Add to your home screen for one-tap access and offline prayer alarms."
        primaryLabel="Install"
        onPrimary={prompt}
        onDismiss={dismiss}
        showDismiss
      />
    );
  }

  // iOS / iPadOS — there's no native prompt. Always show the help card
  // (even if `dismissed` is set, until the user accepts install). On
  // Android/Chrome the BIP flow will fire and replace this.
  if (isIOSLike()) {
    return (
      <Banner
        title={`Install on your ${isIPad() ? "iPad" : "iPhone"}`}
        body={
          <>
            Tap the share button
            <span aria-hidden className="mx-1 inline-block align-middle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
                <path d="M12 3v13M5 8l7-5 7 5M5 21h14" />
              </svg>
            </span>
            then choose <strong>Add to Home Screen</strong>.
          </>
        }
        onDismiss={dismiss}
        showDismiss
      />
    );
  }

  return null;
}

function Banner({
  title,
  body,
  primaryLabel,
  onPrimary,
  onDismiss,
  showDismiss,
}: {
  title: string;
  body: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void | Promise<unknown>;
  onDismiss: () => void;
  showDismiss: boolean;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-ivory px-4 py-3 shadow-[0_4px_14px_rgba(51,38,43,0.12)]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
        <div className="flex-1 text-xs">
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-dim">{body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {primaryLabel && onPrimary ? (
            <button
              type="button"
              onClick={() => onPrimary()}
              className="rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3.5 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105"
            >
              {primaryLabel}
            </button>
          ) : null}
          {showDismiss ? (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
