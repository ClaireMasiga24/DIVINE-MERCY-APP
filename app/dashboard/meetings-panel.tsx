import type { User } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EVENT_MANAGE_ROLES } from "@/lib/auth";
import { formatKampalaLabel } from "@/lib/meeting-reminders";
import MeetingForm from "./meeting-form";

const REMINDER_LABEL: Record<number, string> = {
  0: "At start time",
  15: "15 min before",
  60: "1 hour before",
  1440: "1 day before",
};

/** Joinable from 5 minutes before the start until 90 minutes after. */
const JOIN_EARLY_MS = 5 * 60 * 1000;
const JOIN_AFTER_MS = 90 * 60 * 1000;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

function VideoCallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

/**
 * The Set Meeting card + Upcoming Meetings list. Scheduling is leadership-only
 * (Chairperson, Patron); the scheduler picks invitees and they get notified.
 * Each member only sees meetings they're invited to (or created). When a
 * meeting is within its join window, a "Join call" pill opens the WebRTC room.
 */
export default async function MeetingsPanel({ user }: { user: User }) {
  const canCreate = (EVENT_MANAGE_ROLES as readonly string[]).includes(user.role);
  const nowMs = new Date().getTime();

  const meetings = await prisma.meeting.findMany({
    where: {
      startsAt: { gte: new Date(nowMs - JOIN_AFTER_MS) },
      OR: [{ participants: { some: { userId: user.id } } }, { createdById: user.id }],
    },
    orderBy: { startsAt: "asc" },
    take: 10,
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { participants: true } },
    },
  });

  const members = canCreate
    ? await prisma.user.findMany({
        where: { status: "ACTIVE", role: { not: "TECHNICAL_LEAD" } },
        select: { id: true, fullName: true, phoneNumber: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  return (
    <section className="mt-8">
      <SectionLabel>UPCOMING MEETINGS</SectionLabel>

      {canCreate ? (
        <MeetingForm members={members} />
      ) : (
        <p className="mb-4 rounded-xl border border-line bg-ivory px-4 py-3 text-xs text-dim">
          Only the Chairperson or Patron can schedule meetings.
        </p>
      )}

      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-8 text-center text-sm text-dim">
          No upcoming meetings. {canCreate ? "Schedule the first one above." : "Check back later."}
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const startMs = m.startsAt.getTime();
            const joinable = nowMs >= startMs - JOIN_EARLY_MS && nowMs <= startMs + JOIN_AFTER_MS;
            return (
              <div key={m.id} className="rounded-2xl border border-line bg-ivory p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{m.title}</h3>
                    <p className="mt-0.5 text-xs text-dim">
                      {formatKampalaLabel(m.startsAt)} · {m.createdBy.fullName}
                    </p>
                    {m.location && <p className="mt-1 text-xs text-gold">{m.location}</p>}
                    {m.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-dim">{m.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold">
                      {REMINDER_LABEL[m.reminderMinutesBefore] ??
                        `${m.reminderMinutesBefore} min before`}
                    </span>
                    <span className="rounded-full border border-line bg-ivory-lift px-2.5 py-1 text-[11px] font-medium text-dim">
                      {m._count.participants} invited
                    </span>
                    {joinable && (
                      <Link
                        href={`/dashboard/meeting-room/${m.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[0_4px_12px_rgba(37,211,102,0.35)] transition hover:brightness-105"
                      >
                        <VideoCallIcon className="h-3.5 w-3.5" />
                        Join call
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
