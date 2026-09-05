"use client";

import {
  isIOSLike,
  isIPad,
  isIPhone,
  isAndroid,
  isSamsungBrowser,
  isIOSChrome,
  isIOSFirefox,
  isMobile,
  browserMenuLabel,
} from "@/lib/install-store";

/**
 * Shared, per-browser install instructions.
 *
 * Three call sites render this:
 *
 *   1. `app/install-banner.tsx` — the floating "Get the app" pill's modal.
 *   2. `app/page.tsx` — the splash's primary install surface and its
 *      "Add to Home Screen" modal for iPhone / Samsung.
 *   3. `app/dashboard/app-panel.tsx` — the `/dashboard/<role>/app` help
 *      page (uses the shared ShareGlyph).
 *
 * One source of truth: the iOS / Android Chrome / Samsung Internet /
 * generic copy and icons are written once here. Browsers that don't
 * fire `beforeinstallprompt` (iOS Safari quirks, Samsung Internet, iOS
 * Chrome / Firefox) get the only path that works for them — manual
 * Share / menu → Add to Home Screen.
 *
 * Pure presentational. Reads UA once at render; the parent decides when
 * to mount. Safe to SSR — the UA reads only fire on the client, but the
 * rendered output is a static list, so a server-render mismatch is
 * benign (the client re-renders the right thing on hydration).
 *
 * The "variant" prop is reserved for future use; today both call sites
 * render the same numbered list. Keeping the surface minimal.
 */
export function InstallInstructions() {
  const ios = isIOSLike();
  const ipad = isIPad();
  const iphone = isIPhone();
  const android = isAndroid();
  const samsung = isSamsungBrowser();
  const iosChrome = isIOSChrome();
  const iosFirefox = isIOSFirefox();
  const mobile = isMobile();
  const menu = browserMenuLabel();

  if (ios) {
    return (
      <IOSInstructions
        ipad={ipad}
        iphone={iphone}
        iosChrome={iosChrome}
        iosFirefox={iosFirefox}
      />
    );
  }

  if (android) {
    return samsung ? (
      <SamsungInstructions menu={menu} />
    ) : (
      <AndroidChromeInstructions menu={menu} />
    );
  }

  return <GenericInstructions menu={menu} mobile={mobile} />;
}

/** Up-arrow-out-of-box glyph used by iOS to mean "Share". */
export function ShareGlyph({ size = 13 }: { size?: number }) {
  return (
    <span aria-hidden className="mx-1 inline-block align-middle text-[#3B2F1E]">
      <svg
        width={size}
        height={size}
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

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {children}
    </p>
  );
}

function HintBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[#F0E8D6] bg-[#FBF7EE] px-3 py-2 text-xs text-[#8A7C63]">
      {children}
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7C63]">
      {children}
    </p>
  );
}

function IOSInstructions({
  ipad,
  iphone,
  iosChrome,
  iosFirefox,
}: {
  ipad: boolean;
  iphone: boolean;
  iosChrome: boolean;
  iosFirefox: boolean;
}) {
  const device = ipad ? "iPad" : iphone ? "iPhone" : "device";
  return (
    <div>
      <SectionLabel>{device} · Safari</SectionLabel>
      <ol className="space-y-2.5">
        <Step n={1}>
          Open this page in <strong>Safari</strong> (the install option is only
          available there).
        </Step>
        <Step n={2}>
          Tap the <strong>Share</strong> button
          <ShareGlyph /> at the bottom of Safari.
        </Step>
        <Step n={3}>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={4}>
          Tap <strong>Add</strong> in the top-right. The app will appear on
          your home screen.
        </Step>
      </ol>
      {iosChrome ? (
        <div className="mt-3">
          <WarningBox>
            Heads up: iOS Chrome can&apos;t install apps. Switch to Safari to
            install the parish app.
          </WarningBox>
        </div>
      ) : null}
      {iosFirefox ? (
        <div className="mt-3">
          <WarningBox>
            Heads up: iOS Firefox can&apos;t install apps. Switch to Safari to
            install the parish app.
          </WarningBox>
        </div>
      ) : null}
    </div>
  );
}

function AndroidChromeInstructions({ menu }: { menu: string }) {
  return (
    <div>
      <SectionLabel>Android · Chrome</SectionLabel>
      <ol className="space-y-2.5">
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
      <div className="mt-3">
        <HintBox>
          Don&apos;t see &quot;Install app&quot;? Chrome only offers it after you&apos;ve
          used the site a few times. Keep the site open for a minute and try
          again.
        </HintBox>
      </div>
    </div>
  );
}

function SamsungInstructions({ menu }: { menu: string }) {
  return (
    <div>
      <SectionLabel>Android · Samsung Internet</SectionLabel>
      <ol className="space-y-2.5">
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

function GenericInstructions({
  menu,
  mobile,
}: {
  menu: string;
  mobile: boolean;
}) {
  return (
    <div>
      <SectionLabel>Your browser</SectionLabel>
      <ol className="space-y-2.5">
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
      {mobile === false ? (
        <div className="mt-3">
          <HintBox>
            Detected a desktop browser. The app installs on phones &mdash; on
            a laptop you can use the browser&apos;s &quot;Install&quot; menu (e.g.
            Chrome&apos;s address-bar icon).
          </HintBox>
        </div>
      ) : null}
    </div>
  );
}
