"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import InstallBanner from "./install-banner";
import SplashPushOptIn from "./splash-push-opt-in";

/**
 * The PWA splash route (also the manifest's `start_url`).
 *
 * This is the parish seal animation that plays for a moment before the
 * app routes forward. The user always sees this screen on relaunch —
 * it's part of the brand and gives a calm, deliberate feel.
 *
 * The previous version of this file was a server component that
 * redirected immediately (no splash). That was wrong: the splash is the
 * app's identity and removing it felt like losing the brand. This
 * version keeps the splash, and fixes the underlying bug — the old
 * client version always sent users to /login even if they were
 * already signed in, which felt like "I got logged out" on every
 * relaunch.
 *
 * The fix: this client component fetches /api/auth/check (a tiny
 * read-only endpoint that just reports whether the session cookie is
 * valid), and routes the user based on the answer. Signed-in users
 * land on their role dashboard; signed-out users land on /login.
 *
 * The fetch is non-blocking: the splash animation starts immediately
 * and the redirect happens as soon as the auth check resolves. On a
 * healthy connection the user barely sees the splash before they land;
 * on a slow one the splash is the only thing on screen, which is fine.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The splash is also the install surface for first-time phone
      // visitors. Give them enough time to see the floating "Get the app"
      // pill and decide whether to tap it before we kick them off the
      // page. 1.6 s is long enough to register the button without feeling
      // like a stuck loader on a fast connection.
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
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE2] px-6 py-24">
      <SplashPushOptIn />
      <main className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-10 flex items-center gap-2 text-[#B8975A]">
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

        <div className="relative h-72 w-72 float-animate sm:h-96 sm:w-96">
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
      </main>
      <InstallBanner />
    </div>
  );
}