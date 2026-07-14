import Image from "next/image";
import Link from "next/link";

export default function Home() {
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

        <div className="relative mb-10 h-72 w-72 sm:h-96 sm:w-96 float-animate">
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

        <div className="mb-6 flex items-center gap-4">
          <span className="h-px w-8 bg-[#C9A24E]/50" />
          <p className="whitespace-nowrap font-serif text-xl italic text-[#B8975A]">
            Jesus, I Trust In You
          </p>
          <span className="h-px w-8 bg-[#C9A24E]/50" />
        </div>

        <p className="mb-10 max-w-sm text-[15px] leading-7 text-[#8A8172]">
          Welcome to the Divine Mercy community of Seeta Parish, a place of
          prayer, fellowship, and devotion.
        </p>

        <Link
          href="/login"
          className="flex items-center gap-2 rounded-full bg-gradient-to-b from-[#E4C170] to-[#C9A24E] px-7 py-3.5 text-sm font-semibold text-[#4A3A1A] shadow-[0_4px_14px_rgba(190,150,60,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
          </svg>
          Enter Sanctuary
        </Link>
      </main>
    </div>
  );
}