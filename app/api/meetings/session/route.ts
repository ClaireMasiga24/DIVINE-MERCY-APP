import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * Presence: one MeetingSession row per joined browser session.
 *
 * `action: "join"` upserts (idempotent under reconnects) and returns the
 * meeting state the room needs to render itself in one round-trip: the
 * caller's role for the leader-button toolbar, the music flag, endsAt for
 * the 15-minute countdown, and endedAt so a freshly-opened client can show
 * the "call has ended" screen without waiting for a poll.
 *
 * `action: "leave"` deletes the session row. The `pagehide` sendBeacon
 * path in the room client uses this so a tab close still drops presence.
 *
 * Closed rooms (`endedAt` set) reject join with 410.
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    meetingId?: string;
    sessionId?: string;
    action?: "join" | "leave";
  } | null;
  if (!body?.meetingId || !body.sessionId || !body.action) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: body.meetingId },
    select: {
      id: true,
      endedAt: true,
      musicPlaying: true,
      endsAt: true,
      isAuto: true,
    },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }

  const allowed = await isMeetingParticipant(body.meetingId, sessionUser.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not a participant." }, { status: 403 });
  }

  if (body.action === "join") {
    if (meeting.endedAt !== null) {
      return NextResponse.json({ error: "Call has ended." }, { status: 410 });
    }
    // Upsert by meetingId+sessionId so a reconnecting tab doesn't double-count.
    await prisma.meetingSession.upsert({
      where: {
        // Prisma's compound unique — schema doesn't declare one explicitly,
        // but the pair (meetingId, id-as-sessionId) is unique by row ID.
        // The id field is the sessionId itself; the lookup below uses that.
        id: body.sessionId,
      },
      update: { joinedAt: new Date(), meetingId: body.meetingId, userId: sessionUser.id },
      create: {
        id: body.sessionId,
        meetingId: body.meetingId,
        userId: sessionUser.id,
      },
    });
    // Attendance: open a fresh attendance row for this user. If they're
    // joining with a different sessionId (e.g. after a tab reload that lost
    // the old one), we still want a new row for the new burst; existing
    // attendance rows for the same user+meeting stay closed (leftAt set).
    await prisma.meetingAttendance.create({
      data: {
        meetingId: body.meetingId,
        userId: sessionUser.id,
        joinedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      role: sessionUser.role,
      isAuto: meeting.isAuto,
      musicPlaying: meeting.musicPlaying,
      endsAt: meeting.endsAt?.toISOString() ?? null,
      endedAt: null,
    });
  }

  if (body.action === "leave") {
    // Drop presence regardless of whether the room has ended — a closing tab
    // should always clear its session row.
    await prisma.meetingSession
      .delete({ where: { id: body.sessionId } })
      .catch(() => {});
    // Attendance: find the most-recent open attendance row for this user
    // (leftAt IS NULL) and close it. If a previous burst was never closed
    // (e.g. server crashed mid-call), we keep its leftAt as-is and just
    // close the most recent one.
    const open = await prisma.meetingAttendance.findFirst({
      where: { meetingId: body.meetingId, userId: sessionUser.id, leftAt: null },
      orderBy: { joinedAt: "desc" },
    });
    if (open) {
      const leftAt = new Date();
      const durationSeconds = Math.max(
        0,
        Math.floor((leftAt.getTime() - open.joinedAt.getTime()) / 1000)
      );
      await prisma.meetingAttendance.update({
        where: { id: open.id },
        data: { leftAt, durationSeconds },
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}