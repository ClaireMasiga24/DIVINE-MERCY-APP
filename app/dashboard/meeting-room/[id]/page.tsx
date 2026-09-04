import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMeetingParticipant } from "@/lib/meeting-access";
import { roleSlug } from "@/lib/roles";
import { listSongs, getAutoPlaySong } from "@/lib/songs";
import MeetingRoom from "../../meeting-room-client";
import { KAMPALA_TZ } from "@/lib/alarms";

/**
 * Format a Date as "Sat 16 Aug, 15:00" in Kampala time. Used by the
 * attendance header and per-row "joined at" cells.
 */
function formatKampalaDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KAMPALA_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Format a duration in seconds as "1h 23m" or "12m 04s" or "47s". */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${String(remMins).padStart(2, "0")}m`;
}

/**
 * The in-app video call room. Only the meeting's participants (invitees and
 * the creator) may enter — anyone else sees a "not invited" screen. The
 * Technical Lead can never be an invitee, so they can never join.
 *
 * When the call has ended, leaders (Chairperson / Patron / Technical Lead)
 * get a richer view: ?view=attendance shows the attendance log for the
 * call. The default ended view shows a "View attendance" button for those
 * roles.
 */
export default async function MeetingRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const wantsAttendance = sp.view === "attendance";
  const canSeeAttendance =
    (MEMBER_ADD_ROLES as readonly string[]).includes(user.role);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, startsAt: true, endsAt: true, endedAt: true },
  });
  if (!meeting) redirect(`/dashboard/${roleSlug(user.role)}`);

  // A closed call shows a distinct screen — Patron/Chairperson who pressed
  // End Call and refreshed should see "This call has ended", not the
  // misleading "You're not invited" copy.
  if (meeting.endedAt !== null) {
    if (wantsAttendance && canSeeAttendance) {
      // One row per attendance burst, summed by user so re-joins show as
      // separate bursts AND a "total time in call" line per person.
      const attendance = await prisma.meetingAttendance.findMany({
        where: { meetingId: meeting.id },
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, fullName: true } } },
      });

      type PersonStat = {
        userId: string;
        fullName: string;
        bursts: { joinedAt: Date; leftAt: Date | null; durationSeconds: number | null }[];
        totalSeconds: number;
        currentlyIn: boolean;
      };
      const byUser = new Map<string, PersonStat>();
      for (const a of attendance) {
        const existing = byUser.get(a.userId) ?? {
          userId: a.userId,
          fullName: a.user.fullName,
          bursts: [],
          totalSeconds: 0,
          currentlyIn: false,
        };
        existing.bursts.push({
          joinedAt: a.joinedAt,
          leftAt: a.leftAt,
          durationSeconds: a.durationSeconds,
        });
        if (a.leftAt === null) {
          existing.currentlyIn = true;
        } else if (a.durationSeconds !== null) {
          existing.totalSeconds += a.durationSeconds;
        }
        byUser.set(a.userId, existing);
      }
      const stats = [...byUser.values()].sort(
        (a, b) => b.totalSeconds - a.totalSeconds
      );

      const homeHref = `/dashboard/${roleSlug(user.role)}`;
      return (
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-1 text-lg font-semibold text-ink">
            Attendance · {meeting.title}
          </h1>
          <p className="mb-5 text-sm text-dim">
            {formatKampalaDateTime(meeting.startsAt)} · {stats.length} attended
            {stats.length > 0 && (
              <>
                {" "}·{" "}
                {formatDuration(Math.max(...stats.map((s) => s.totalSeconds)))}{" "}
                longest
              </>
            )}
          </p>

          {stats.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
              Nobody joined this call. The attendance log starts on the next meeting.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-ivory-lift text-[11px] uppercase tracking-[0.15em] text-dim">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Bursts</th>
                    <th className="px-4 py-3 font-semibold">Total time in call</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stats.map((s) => (
                    <tr key={s.userId} className="transition hover:bg-ivory-lift/50">
                      <td className="px-4 py-3 font-medium text-ink">
                        {s.fullName}
                        {s.currentlyIn && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold">
                            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                            in call
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dim">{s.bursts.length}</td>
                      <td className="px-4 py-3 font-mono text-ink">
                        {formatDuration(s.totalSeconds)}
                      </td>
                      <td className="px-4 py-3 text-xs text-dim">
                        {formatKampalaDateTime(s.bursts[0].joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6">
            <Link
              href={homeHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-deep transition hover:bg-gold/20"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      );
    }

    const homeHref = `/dashboard/${roleSlug(user.role)}`;
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-ivory px-6 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image
                src="/Images/SEETA PARISH DIVINE MERCY.png"
                alt=""
                fill
                className="object-cover"
              />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-ink">This call has ended</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-dim">
            The Holy Hour call closed at {meeting.endedAt.toLocaleTimeString("en-GB", {
              hour: "numeric",
              minute: "2-digit",
            })}. Join the next one when the parish rings again.
          </p>
          {canSeeAttendance && (
            <Link
              href={`/dashboard/meeting-room/${meeting.id}?view=attendance`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-deep transition hover:bg-gold/20"
            >
              View attendance
            </Link>
          )}
          <div className="mt-3">
            <Link
              href={homeHref}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-dim transition hover:text-ink"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const allowed = await isMeetingParticipant(meeting.id, user.id);
  if (!allowed) {
    const homeHref = `/dashboard/${roleSlug(user.role)}`;
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-ivory px-6 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image
                src="/Images/SEETA PARISH DIVINE MERCY.png"
                alt=""
                fill
                className="object-cover"
              />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-ink">You&apos;re not invited</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-dim">
            This is a private meeting. Only invited members can join the call.
          </p>
          <Link
            href={homeHref}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-deep transition hover:bg-gold/20"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // The songs library is the same data as the dashboard's Songs section —
  // fetched via the CDN-served manifest. Passed into the room so the
  // per-user songs strip has the song list to play from.
  const [songs, autoPlay] = await Promise.all([listSongs(), getAutoPlaySong()]);

  return (
    <MeetingRoom
      meetingId={meeting.id}
      title={meeting.title}
      fullName={user.fullName}
      homeHref={`/dashboard/${roleSlug(user.role)}`}
      songs={songs}
      autoPlaySong={autoPlay}
    />
  );
}
