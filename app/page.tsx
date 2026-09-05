"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InstallBanner from "./install-banner";
import SplashPushOptIn from "./splash-push-opt-in";
import { InstallInstructions } from "./install-instructions";
import {
  useInstallEvent,
  isMobile,
  isIOSLike,
  isAndroid,
  isSamsungBrowser,
  isIOSChrome,
  isIOSFirefox,
  isInstalledDisplayMode,
  browserMenuLabel,
  type PromptResult,
} from "@/lib/install-store";

/**
 * The PWA splash route (also the manifest's `start_url`).
 *
 * Two distinct experiences share this single screen:
 *
 *   **A. Desktop user** (the original fast-redirect flow):
 *      Splash shows the parish seal, runs a non-blocking
 *      `/api/auth/check`, waits 1.6 s for the seal animation to land,
 *      then `router.replace`s to `/dashboard/<role>` or `/login`. Fast
 *      and invisible — exactly what you want for someone on a laptop.
 *
 *   **B. Phone user** (always sees the install surface, per product
 *      requirement): Splash shows the parish seal + a large, primary
 *      install CTA below it. There is NO auto-redirect on phones —
 *      installed or not. The user can install, re-trigger the install
 *      steps, or tap "Continue to sign in" to leave. This is the only
 *      way a non-tech parish member is going to install a PWA on their
 *      phone; the previous version's tiny floating pill at the bottom
 *      of `/login` was easy to miss, and the auto-redirect kicked them
 *      past it.
 *
 * Why this matters
 * ----------------
 *   iPhone Safari has no one-tap install path. The browser menu
 *   literally does not contain an "Install app" option. The user MUST
 *   use Share → Add to Home Screen, manually. The only way to teach
 *   this to a non-tech user is to spell it out, on screen, with the
 *   Share icon glyph, in plain language, on the very first page they
 *   see. That's what the modal opened by the splash CTA does.
 *
 *   On Android Chrome, `beforeinstallprompt` does fire, but the
 *   heuristic is slow and unreliable. By giving the user a clear
 *   primary CTA we either trigger the prompt directly (if BIP is
 *   available) or fall through to the per-browser manual steps.
 *
 *   iPhone Chrome / iPhone Firefox cannot install PWAs at all — the
 *   modal on those browsers shows an amber warning telling the user to
 *   switch to Safari.
 *
 * Install-state read
 * ------------------
 *   `isPhone` and `isInstalled` are computed once via lazy
 *   `useState` initializers (mirroring `app/dashboard/app-panel.tsx:36–43`)
 *   so SSR returns `false` for both (the helpers read `navigator` /
 *   `matchMedia` and short-circuit on `typeof window === "undefined"`).
 *   No hydration mismatch — the client simply re-renders with the
 *   correct values on first commit.
 *
 * Push opt-in on this branch
 * --------------------------
 *   The `<SplashPushOptIn />` card is hidden on phones. Two competing
 *   CTAs at the bottom of a phone screen confuse non-tech users; the
 *   install CTA is the higher-priority action for a phone visitor. The
 *   push opt-in still appears on `/login` and on the dashboard where
 *   it's relevant.
 */
export default function Home() {
  const router = useRouter();
  const { event, prompt } = useInstallEvent();
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);

  // Single lazy initializer — no `useEffect` setState, no hydration
  // mismatch. SSR: false. Client first render: real value.
  const [isPhone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isMobile();
  });
  const [isInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isInstalledDisplayMode();
  });

  // Auto-redirect ONLY on desktop. Phone users always see the splash
  // so the install option is available — even if they've already
  // installed the PWA, the user has explicitly asked for the "Get
  // the app" affordance to remain.
  useEffect(() => {
    if (isPhone) return;
    let cancelled = false;
    (async () => {
      const minDisplay = new Promise((r) => setTimeout(r, 1600));
      const authCheck = fetch("/api/auth/check", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { authenticated: false }))
        .catch(() => ({ authenticated: false }));
      const [data] = await Promise.all([authCheck, minDisplay]);
      if (cancelled) return;
      if (data?.authenticated && data?.role) {
        router.replace(`/dashboard/${data.role}`);
      } else {
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, isPhone]);

  // "Continue to sign in" link on the splash. Hits /api/auth/check
  // and routes based on the answer. The `cancelled` guard prevents a
  // late response from replacing after the user has already moved on.
  const continueToSignIn = async () => {
    try {
      const res = await fetch("/api/auth/check", { cache: "no-store" });
      const data = res.ok ? await res.json() : { authenticated: false };
      if (data?.authenticated && data?.role) {
        router.replace(`/dashboard/${data.role}`);
      } else {
        router.replace("/login");
      }
    } catch {
      router.replace("/login");
    }
  };

  const onInstallTap = async () => {
    // iPhone and non-Chrome Android browsers can't fire `event` (no
    // beforeinstallprompt). On those we go straight to the manual
    // instructions modal — that's the only path that works.
    if (!event) {
      setInstallResult(null);
      setInstallModalOpen(true);
      return;
    }
    const res: PromptResult = await prompt();
    if (res.kind === "native" && res.outcome === "accepted") {
      // The OS install sheet handles the rest. The splash re-renders
      // when `installed` flips true (next mount) and the auto-redirect
      // kicks in. Nothing to do here.
      return;
    }
    if (res.kind === "already-installed") {
      // The display-mode check said no, but the prompt said yes.
      // Race: route them to the dashboard.
      router.replace("/dashboard");
      return;
    }
    // Native dismiss, no-event, or error: fall through to the manual
    // steps so the user has something to do.
    setInstallResult(
      res.kind === "native"
        ? "You dismissed the install sheet. You can still install manually below."
        : res.kind === "error"
          ? `Couldn't open the install sheet: ${res.message}`
          : "Chrome isn't ready to install yet. Use the menu steps below — we'll keep trying while you read this."
    );
    setInstallModalOpen(true);
  };

  // Device flags for the install modal. The modal opens the same
  // <InstallInstructions> the floating pill uses, so the steps are
  // always correct for the user's actual browser.
  const ios = isIOSLike();
  const android = isAndroid();
  const samsung = isSamsungBrowser();
  const iosChrome = isIOSChrome();
  const iosFirefox = isIOSFirefox();
  const menu = browserMenuLabel();

  // Primary CTA label + behavior. iPhone Safari has no one-tap install
  // at all, so the primary button opens the manual steps. iPhone Chrome
  // and iPhone Firefox can't install PWAs — they get the manual steps
  // plus a warning to switch to Safari. Android Chrome with BIP gets
  // "Install app" and goes through triggerPrompt. Android Samsung and
  // other browsers get the manual steps.
  const primaryLabel = ios || samsung || (!event && android) ? "Add to Home Screen" : "Install app";

  return (
    <div
      className="flex min-h-screen flex-col items-center bg-[#F3EEE2] px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(6rem,env(safe-area-inset-top))]"
    >
      {/*
        Push opt-in only on desktop. Phone users always see the
        install card, so the push card would be a competing CTA
        at the bottom of the screen. The push opt-in still appears
        on /login and on the dashboard.
      */}
      {!isPhone ? <SplashPushOptIn /> : null}

      <main className="flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex items-center gap-2 text-[#B8975A] sm:mb-10">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3v18M5 8h14" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold tracking-[0.25em] text-[#6B5D4F]">
            DIVINE MERCY
          </span>
        </div>

        {/*
          Seal sized to fit an iPhone SE (375×667) with the install card
          below. Was `h-72 w-72 sm:h-96 sm:w-96` — too tall once the
          install CTA was added. Scales with the existing `sm:` breakpoint
          so bigger phones get a bigger seal.
        */}
        <div className="relative h-48 w-48 float-animate sm:h-72 sm:w-72">
          <div className="absolute inset-0 rounded-full bg-[#D9B76A] blur-2xl opacity-40 glow-animate" />

          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[3px] shadow-[0_8px_30px_rgba(180,140,60,0.35)]">
            <div className="h-full w-full rounded-full bg-white p-2">
              <div className="relative h-full w-full overflow-hidden rounded-full">
                <Image
                  src="/Images/SEETA PARISH DIVINE MERCY.png"
                  alt="Divine Mercy Seeta Parish seal"
                  fill
                  priority
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        {isPhone ? (
          <SplashInstallCard
            primaryLabel={primaryLabel}
            isInstalled={isInstalled}
            onInstallTap={onInstallTap}
            onContinue={continueToSignIn}
          />
        ) : null}
      </main>

      <InstallBanner />
      {installModalOpen ? (
        <SplashInstallModal
          ios={ios}
          iosChrome={iosChrome}
          iosFirefox={iosFirefox}
          android={android}
          samsung={samsung}
          menu={menu}
          message={installResult}
          onClose={() => setInstallModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * In-flow install CTA shown below the seal for phone visitors — both
 * not-yet-installed AND already-installed. The user has explicitly
 * asked for the "Get the app" affordance to remain even after the
 * PWA is installed (so they can re-show it to a friend, for example).
 *
 * Same brand gold gradient as the Sign in button — primary action
 * feel. The "Continue to sign in" link is small and dimmed so it
 * doesn't compete.
 */
function SplashInstallCard({
  primaryLabel,
  isInstalled,
  onInstallTap,
  onContinue,
}: {
  primaryLabel: string;
  isInstalled: boolean;
  onInstallTap: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fade-in mt-8 w-full max-w-sm text-center sm:mt-10">
      {isInstalled ? (
        <>
          <h1 className="text-balance text-xl font-semibold text-[#2B2115] sm:text-2xl">
            App is installed
          </h1>
          <p className="mt-2 text-balance text-sm text-[#6B5D4F]">
            The Divine Mercy Seeta app is on your home screen. Tap its
            icon to open, or use the button below to open it now.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-balance text-xl font-semibold text-[#2B2115] sm:text-2xl">
            Add the parish app to your phone
          </h1>
          <p className="mt-2 text-balance text-sm text-[#6B5D4F]">
            One tap. Works offline. Sends you Holy Hour alarms even when
            the app is closed.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onInstallTap}
        className="mt-5 h-12 w-full rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-sm font-semibold text-[#3B2F1E] shadow-[0_6px_20px_rgba(180,140,60,0.4)] transition hover:brightness-105"
      >
        {isInstalled ? "How to install on another phone" : primaryLabel}
      </button>
      <button
        type="button"
        onClick={onContinue}
        className="mt-3 inline-block w-full rounded-full px-3 py-1.5 text-xs font-semibold text-[#8A7C63] transition hover:text-[#2B2115]"
      >
        Continue to sign in
      </button>
    </div>
  );
}

/**
 * Backdrop modal for the splash. Mirrors `InstallBanner`'s modal look
 * but with the splash's own copy. Opens the shared
 * `<InstallInstructions variant="modal" />` so the per-browser steps
 * are identical to the floating pill and the dashboard help page.
 */
function SplashInstallModal({
  ios,
  iosChrome,
  iosFirefox,
  android,
  samsung,
  menu,
  message,
  onClose,
}: {
  ios: boolean;
  iosChrome: boolean;
  iosFirefox: boolean;
  android: boolean;
  samsung: boolean;
  menu: string;
  message: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 pt-12 sm:items-center sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="splash-install-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-3 border-b border-[#F0E8D6] bg-gradient-to-b from-[#F3EEE2] to-white px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 id="splash-install-modal-title" className="text-base font-semibold text-[#2B2115]">
              Install Divine Mercy Seeta
            </h2>
            <p className="mt-0.5 text-xs text-[#8A7C63]">
              {ios
                ? "On iPhone, install is a few taps. Follow the steps below."
                : android
                  ? samsung
                    ? "On Samsung Internet, install is a few taps. Follow the steps below."
                    : menu
                      ? `Tap the ${menu} button in Chrome, then Install app.`
                      : "Install is a few taps. Follow the steps below."
                  : "Install is a few taps. Follow the steps below."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-[#8A7C63] transition hover:bg-[#F3EEE2] hover:text-[#2B2115]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-[#2B2115]">
          {message ? <p className="text-xs text-[#8A7C63]">{message}</p> : null}
          <InstallInstructions />
          {iosChrome ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Heads up: iOS Chrome can&apos;t install apps. Switch to Safari to
              install the parish app.
            </p>
          ) : null}
          {iosFirefox ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Heads up: iOS Firefox can&apos;t install apps. Switch to Safari to
              install the parish app.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#F0E8D6] bg-[#FBF7EE] px-5 py-3">
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
