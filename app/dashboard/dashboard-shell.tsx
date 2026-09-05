"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import SignOutButton from "./sign-out-button";
import PushSetup from "./push-setup";
import AlarmListener from "./alarm-listener";
import InstallBanner from "../install-banner";
import { SectionIcon } from "./section-icons";

type Section = { slug: string; label: string };

type Props = {
  user: {
    fullName: string;
    phoneNumber: string;
    roleLabel: string;
    slug: string;
    role: string;
    sections: Section[];
  };
  children: React.ReactNode;
};

// Faint sun rays from the top of the screen (CSS conic gradient, no asset).
const RAYS = `repeating-conic-gradient(from -100deg at 50% -10%, rgba(255,255,255,0.5) 0deg 4deg, transparent 4deg 14deg)`;

function Seal({ size = "h-11 w-11" }: { size?: string }) {
  return (
    <div
      className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px] shadow-[0_4px_14px_rgba(180,140,60,0.3)]`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
        <Image
          src="/Images/SEETA PARISH DIVINE MERCY.png"
          alt="Divine Mercy Seeta Parish seal"
          fill
          className="object-cover"
        />
      </div>
    </div>
  );
}

export default function DashboardShell({ user, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const overviewHref = `/dashboard/${user.slug}`;
  const isTechLead = user.role === "TECHNICAL_LEAD";

  // Close the drawer when the route changes — adjusting state during render
  // (the React-recommended pattern for state derived from props/route).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Escape closes the drawer; the body is scroll-locked while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Unread notification count for the bell badge — refreshed every minute.
  useEffect(() => {
    if (isTechLead) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/notifications/unread");
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled) setUnread(data.count ?? 0);
      } catch {
        // Offline or transient — next poll retries.
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isTechLead]);

  const isActive = (href: string) => pathname === href;

  const rowClass = (href: string) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive(href)
        ? "bg-gold/15 text-ink ring-1 ring-gold/40"
        : "text-dim hover:bg-ivory-lift hover:text-ink"
    }`;

  const rows = [
    { slug: "overview", label: "Overview", href: overviewHref },
    ...user.sections.map((s) => ({
      slug: s.slug,
      label: s.label,
      href: `/dashboard/${user.slug}/${s.slug}`,
    })),
  ];

  return (
    <div className="relative min-h-screen bg-sky text-ink">
      {/* Heavenly fixed backdrop: sky gradient + sun rays */}
      <div aria-hidden className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#dcebf8_0%,#eef5fc_45%,#fdf7ec_100%)]" />
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: RAYS }} />
      </div>

      {/* Fixed top bar with the hamburger menu */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-sky/85 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/60 text-ink transition hover:bg-white"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-ink">DIVINE MERCY</div>
          <div className="text-[9px] tracking-[0.2em] text-dim">SEETA PARISH</div>
        </div>
        {isTechLead ? (
          <div className="w-9" aria-hidden />
        ) : (
          <Link
            href={`/dashboard/${user.slug}/notifications`}
            aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/60 text-ink transition hover:bg-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        )}
      </header>

      {/* Drawer backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-[80] flex w-72 max-w-[85vw] flex-col bg-ivory shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-5">
          <Seal />
          <div>
            <div className="text-xs font-semibold tracking-[0.25em] text-ink">DIVINE MERCY</div>
            <div className="text-[11px] tracking-[0.2em] text-dim">SEETA PARISH · ADMIN</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="ml-auto rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {rows.map((r) => (
            <Link key={r.slug} href={r.href} className={rowClass(r.href)}>
              <SectionIcon slug={r.slug} className="h-[18px] w-[18px] shrink-0 opacity-80" />
              <span className="flex-1">{r.label}</span>
              {r.slug === "notifications" && unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-40"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </nav>

        <div className="border-t border-line px-4 py-4">
          <div className="mb-3 px-1">
            <div className="text-sm font-semibold text-ink">{user.fullName}</div>
            <div className="text-xs text-dim">{user.phoneNumber}</div>
            <span className="mt-1.5 inline-block rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-gold">
              {user.roleLabel}
            </span>
          </div>
          <SignOutButton />
        </div>
      </div>

      {/* Main column — padded for the fixed top bar */}
      <div className="relative z-10 pt-14">
        <main className="px-5 pb-16 pt-6 sm:px-8">{children}</main>
      </div>

      {/* Web push setup + in-app alarm listener */}
      <PushSetup />
      <AlarmListener />
      <InstallBanner />
    </div>
  );
}
