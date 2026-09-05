"use client";

import { useEffect, useState } from "react";
import {
  useInstallEvent,
  isIOSLike,
  isAndroid,
  isSamsungBrowser,
  isIOSChrome,
  isIOSFirefox,
  isMobile,
  browserMenuLabel,
} from "@/lib/install-store";

/**
 * In-app install help for the dashboard. Mounted under /dashboard/<role>/app.
 *
 * Why this exists separately from the floating InstallBanner:
 *
 *   The floating pill auto-hides after dismissal (14-day TTL). Some users
 *   will hit dismiss by accident and have no way to recover — Settings
 *   only exists for leadership roles. The /app section is always reachable
 *   from the sidebar for every role, so anyone can find it again.
 *
 *   It also doubles as a "system status" page: shows SW state, display
 *   mode, and lets the user force-recheck installability (useful after
 *   clearing browser data).
 */
export default function AppPanel() {
  const { event, installed, dismissed, prompt, dismiss, reset, recheck, promptRevision } =
    useInstallEvent();
  // Device / display mode are pure browser reads — do them in lazy
  // initial state so SSR + hydration agree without an effect-driven
  // setState (which the React-hooks lint rule flags as cascading).
  const [mobile] = useState<boolean>(() => isMobile());
  const [standalone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((navigator as any).standalone === true)
    );
  });
  const [swState, setSwState] = useState<string>("checking…");
  const [installResult, setInstallResult] = useState<string | null>(null);

  // Probe the SW registration on mount and whenever the install prompt
  // re-fires. setSwState is always called from an async callback, never
  // synchronously inside the effect body, which keeps the
  // cascading-render lint rule happy.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      // Defer the sync setState to a microtask so React doesn't see it
      // as a cascading render from the effect body.
      Promise.resolve().then(() => setSwState("not supported"));
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => {
      setSwState(
        reg
          ? reg.active
            ? "active"
            : reg.installing
              ? "installing"
              : reg.waiting
                ? "waiting"
                : "registered"
          : "not registered",
      );
    });
  }, [promptRevision]);

  const ios = isIOSLike();
  const android = isAndroid();
  const samsung = isSamsungBrowser();
  const iosChrome = isIOSChrome();
  const iosFirefox = isIOSFirefox();
  const menu = browserMenuLabel();

  return (
    <div className="space-y-5">
      {/* Install card */}
      <div className="rounded-2xl border border-[#E2D9C4] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-[#2B2115]">Install the app on your phone</h2>
            <p className="mt-1 text-sm text-[#8A7C63]">
              Get the Divine Mercy Seeta app on your home screen for one-tap access
              and offline prayer alarms.
            </p>
          </div>
        </div>

        {installed || standalone ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <strong>You&apos;re already running the installed app.</strong> No further
            action needed.
          </div>
        ) : event ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[#2B2115]">
              Your browser supports one-tap install. Tap the button below.
            </p>
            <button
              type="button"
              onClick={async () => {
                const res = await prompt();
                if (res.kind === "native") {
                  setInstallResult(
                    res.outcome === "accepted"
                      ? "Install sheet opened — confirm on your phone to finish."
                      : "You dismissed the install sheet. Tap the button again any time.",
                  );
                } else if (res.kind === "already-installed") {
                  setInstallResult("You're already running the installed app.");
                } else if (res.kind === "no-event") {
                  setInstallResult("The native prompt is no longer available. Use the manual steps below.");
                } else {
                  setInstallResult(`Couldn't open the install sheet: ${res.message}`);
                }
              }}
              className="w-full rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-4 py-2.5 text-sm font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105 sm:w-auto"
            >
              Install now
            </button>
            {installResult ? (
              <p className="text-xs text-[#8A7C63]">{installResult}</p>
            ) : null}
            <p className="border-t border-[#F0E8D6] pt-3 text-xs text-[#8A7C63]">
              If the button doesn&apos;t open an install sheet on your phone, use the manual
              steps for your browser below.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#8A7C63]">
            One-tap install isn&apos;t available on this device yet. Follow the
            steps for your browser below.
          </p>
        )}

        {/* Per-browser instructions */}
        {!installed && !standalone ? (
          <div className="mt-5 border-t border-[#F0E8D6] pt-5">
            {ios ? (
              <ol className="space-y-2.5 text-sm">
                <IOSInstructionsRow
                  n={1}
                  text={
                    <>
                      Open this page in <strong>Safari</strong> (the install option is only
                      available there).
                    </>
                  }
                />
                <IOSInstructionsRow
                  n={2}
                  text={
                    <>
                      Tap the <strong>Share</strong> button
                      <ShareGlyph /> at the bottom of Safari.
                    </>
                  }
                />
                <IOSInstructionsRow
                  n={3}
                  text={
                    <>
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </>
                  }
                />
                <IOSInstructionsRow
                  n={4}
                  text={
                    <>
                      Tap <strong>Add</strong> in the top-right. The app will appear on
                      your home screen.
                    </>
                  }
                />
                {iosChrome ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Heads up: iOS Chrome and other iOS browsers can&apos;t install PWAs.
                    Switch to Safari to install the app.
                  </p>
                ) : null}
                {iosFirefox ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Heads up: iOS Firefox can&apos;t install PWAs. Switch to Safari to
                    install the app.
                  </p>
                ) : null}
              </ol>
            ) : android ? (
              <ol className="space-y-2.5 text-sm">
                {samsung ? (
                  <>
                    <Row n={1}>
                      Tap the <strong>{menu}</strong> button at the bottom of the screen.
                    </Row>
                    <Row n={2}>
                      Tap <strong>Add page to</strong> → <strong>Home screen</strong>.
                    </Row>
                    <Row n={3}>
                      Tap <strong>Add</strong>. The app will appear on your home screen.
                    </Row>
                  </>
                ) : (
                  <>
                    <Row n={1}>
                      Tap the <strong>{menu}</strong> button (top-right of Chrome).
                    </Row>
                    <Row n={2}>
                      Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                    </Row>
                    <Row n={3}>
                      Tap <strong>Install</strong>. The app will appear on your home screen.
                    </Row>
                    <p className="rounded-xl border border-[#F0E8D6] bg-[#FBF7EE] px-3 py-2 text-xs text-[#8A7C63]">
                      Don&apos;t see &quot;Install app&quot;? Chrome only offers it after you&apos;ve
                      used the site a few times. Open this page and tap{" "}
                      <strong>Re-check below</strong> to retry, or keep the site open for a minute
                      and try again.
                    </p>
                  </>
                )}
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm">
                <Row n={1}>
                  Open the <strong>{menu}</strong> in your browser.
                </Row>
                <Row n={2}>
                  Look for <strong>Add to Home Screen</strong> or <strong>Install app</strong>.
                </Row>
                <Row n={3}>
                  Confirm. The app will appear on your home screen.
                </Row>
              </ol>
            )}
            {mobile === false ? (
              <p className="mt-3 rounded-xl border border-[#F0E8D6] bg-[#FBF7EE] px-3 py-2 text-xs text-[#8A7C63]">
                Detected a desktop browser. The app installs on phones &mdash; on a laptop
                you can use the browser&apos;s &quot;Install&quot; menu (e.g. Chrome&apos;s
                address-bar icon).
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Re-check / reset controls */}
        {!installed && !standalone ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F0E8D6] pt-4">
            <button
              type="button"
              onClick={recheck}
              className="rounded-full border border-[#E2D9C4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2B2115] transition hover:bg-[#FBF7EE]"
            >
              Re-check install
            </button>
            {dismissed ? (
              <button
                type="button"
                onClick={() => {
                  reset();
                }}
                className="rounded-full border border-[#E2D9C4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2B2115] transition hover:bg-[#FBF7EE]"
              >
                Show banner again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  dismiss();
                }}
                className="rounded-full border border-[#E2D9C4] bg-white px-3 py-1.5 text-xs font-semibold text-[#8A7C63] transition hover:bg-[#FBF7EE]"
              >
                Hide banner
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* System info card — purely informational, helps users debug. */}
      <div className="rounded-2xl border border-[#E2D9C4] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-[#2B2115]">App status</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <Item label="Device" value={mobile === null ? "checking…" : mobile ? "Mobile" : "Desktop"} />
          <Item
            label="Browser"
            value={
              ios
                ? `iOS${iosChrome ? " Chrome" : iosFirefox ? " Firefox" : " Safari"}`
                : samsung
                  ? "Samsung Internet"
                  : android
                    ? "Android Chrome"
                    : "Other"
            }
          />
          <Item
            label="Display mode"
            value={standalone === null ? "checking…" : standalone ? "Installed (standalone)" : "Browser tab"}
          />
          <Item label="Service worker" value={swState} />
          <Item
            label="Native install"
            value={
              installed
                ? "Already installed"
                : event
                  ? "Available (tap Install above)"
                  : "Not available — use manual steps"
            }
          />
          <Item
            label="One-tap prompt"
            value={dismissed ? "Dismissed (14 days)" : "Active"}
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[10px] font-bold text-[#3B2F1E]">
        {n}
      </span>
      <span className="flex-1 text-sm text-[#2B2115]">{children}</span>
    </li>
  );
}

function IOSInstructionsRow({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[10px] font-bold text-[#3B2F1E]">
        {n}
      </span>
      <span className="flex-1 text-sm text-[#2B2115]">{text}</span>
    </li>
  );
}

function ShareGlyph() {
  return (
    <span aria-hidden className="mx-1 inline-block align-middle text-[#3B2F1E]">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block"
      >
        <path d="M12 3v13M5 8l7-5 7 5M5 21h14" />
      </svg>
    </span>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#FBF7EE] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#8A7C63]">{label}</dt>
      <dd className="text-xs font-medium text-[#2B2115]">{value}</dd>
    </div>
  );
}
