import type { User } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatKampalaLabel } from "@/lib/alarms";
import { MEMBER_ADD_ROLES } from "@/lib/auth";

/** Joinable from 5 minutes before the start; auto calls close at their endsAt. */
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
 * The automatic Holy Hour group-call list. Calls are spawned by the system at
 * each Holy Hour time (see lib/alarms.ts) — there is no manual scheduling.
 * Everyone sees them; when a call is inside its window, a "Join call" pill
 * opens the WebRTC room.
 */
export default async function MeetingsPanel({ user }: { user: User }) {
  const nowMs = new Date().getTime();
  const canSeeAttendance = (MEMBER_ADD_ROLES as readonly string[]).includes(user.role);

  const meetings = await prisma.meeting.findMany({
    where: {
      startsAt: { gte: new Date(nowMs - JOIN_AFTER_MS) },
      // Auto calls belong to everyone; manual-era rows stay visible to their
      // invitees/creator for history.
      OR: [
        { participants: { some: { userId: user.id } } },
        { createdById: user.id },
        { isAuto: true },
      ],
    },
    orderBy: { startsAt: "asc" },
    take: 10,
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { participants: true } },
    },
  });

  // Filter ended calls out of the Join list, but keep them visible in the
  // list itself so members can see what happened (the title bar still says
  // when it was, the participants count shows who was invited).
  const visibleMeetings = meetings.map((m) => ({
    ...m,
    joinable:
      m.endedAt === null &&
      nowMs >= m.startsAt.getTime() - JOIN_EARLY_MS &&
      nowMs <= (m.endsAt?.getTime() ?? m.startsAt.getTime() + JOIN_AFTER_MS),
  }));

  return (
    <section className="mt-8">
      <SectionLabel>HOLY HOUR CALLS</SectionLabel>

      {visibleMeetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-8 text-center text-sm text-dim">
          No calls right now. The parish is called together automatically at Holy
          Hour times — 3:00 am and 3:00 pm.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleMeetings.map((m) => {
            return (
              <div key={m.id} className="rounded-2xl border border-line bg-ivory p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{m.title}</h3>
                    <p className="mt-0.5 text-xs text-dim">
                      {formatKampalaLabel(m.startsAt)} · {m.createdBy?.fullName ?? "Automatic"}
                      {m.endedAt !== null && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                          Ended
                        </span>
                      )}
                    </p>
                    {m.location && <p className="mt-1 text-xs text-gold">{m.location}</p>}
                    {m.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-dim">{m.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-line bg-ivory-lift px-2.5 py-1 text-[11px] font-medium text-dim">
                      {m._count.participants} invited
                    </span>
                    {m.joinable && (
                      <Link
                        href={`/dashboard/meeting-room/${m.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[0_4px_12px_rgba(37,211,102,0.35)] transition hover:brightness-105"
                      >
                        <VideoCallIcon className="h-3.5 w-3.5" />
                        Join call
                      </Link>
                    )}
                    {m.endedAt !== null && canSeeAttendance && (
                      <Link
                        href={`/dashboard/meeting-room/${m.id}?view=attendance`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-deep transition hover:bg-gold/20"
                      >
                        Attendance
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
