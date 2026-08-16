"use client";

import Image from "next/image";
import { useState } from "react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const phoneDigits = phone.replace(/\D/g, "").slice(0, 9);
  const phoneValid = phoneDigits.length === 9;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid || signingIn) return;
    setError(null);
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+256${phoneDigits}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE2] px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <main className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-8 flex items-center gap-2 text-[#B8975A]">
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

        <div className="float-animate relative mb-10 h-36 w-36">
          <div className="glow-animate absolute inset-0 rounded-full bg-[#D9B76A] opacity-40 blur-2xl" />

          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[3px] shadow-[0_8px_30px_rgba(180,140,60,0.35)]">
            <div className="h-full w-full rounded-full bg-white p-1.5">
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

        <form onSubmit={signIn} className="w-full">
            <h1 className="text-center text-2xl font-semibold text-[#4A3826]">
              Welcome to the parish
            </h1>
            <p className="mt-2 mb-8 text-center text-sm text-[#6B5D4F]">
              Sign in with the phone number registered with Divine Mercy Seeta.
            </p>

            <label
              htmlFor="phone"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]"
            >
              Your phone number
            </label>
            <div className="flex overflow-hidden rounded-xl border border-[#E2D9C4] bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#B8975A]">
              <span className="flex items-center border-r border-[#E2D9C4] bg-[#FBF7EC] px-4 text-sm font-semibold text-[#6B5D4F]">
                +256
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="7XX XXX XXX"
                maxLength={9}
                value={phoneDigits}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 w-full bg-transparent px-4 text-base font-medium text-[#2B2115] outline-none placeholder:text-[#B5A98F]"
              />
            </div>
            <p className="mt-2 text-xs text-[#8A7C63]">
              We&apos;ll check it against the parish register.
            </p>

            <button
              type="submit"
              disabled={!phoneValid || signingIn}
              className="mt-6 h-12 w-full rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-sm font-semibold text-[#3B2F1E] shadow-[0_6px_20px_rgba(180,140,60,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </button>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-[#E2CD9C] bg-[#FBF3DF] px-4 py-3 text-sm text-[#6B5D4F]"
              >
                <svg
                  className="mt-0.5 shrink-0 text-[#B8975A]"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </form>

        <p className="mt-10 text-center text-xs text-[#8A7C63]">
          Divine Mercy Seeta Parish · Jesus, I trust in You
        </p>
      </main>
    </div>
  );
}
