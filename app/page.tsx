"use client";

import Image from "next/image";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace("/login");
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE2] px-6 py-24">
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

        <div className="relative h-72 w-72 sm:h-96 sm:w-96 float-animate">
          <div className="absolute inset-0 rounded-full bg-[#D9B76A] blur-2xl opacity-40 glow-animate" />

          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[3px] shadow-[0_8px_30px_rgba(180,140,60,0.35)]">
            <div className="h-full w-full rounded-full bg-white p-2">
              <div className="relative h-full w-full overflow-hidden rounded-full">
                <Image
                  src="/Images/SEETA PARISH DIVINE MERCY.png"
                  alt="Divine Mercy Seeta Parish seal"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
