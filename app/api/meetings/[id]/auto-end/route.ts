import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * Clock-driven close: each client fires this at T+0 (the moment its
 * countdown hits zero) to make "the room is closed" a server-side fact.
 * Without it, a regular Member's tab would silently fail to write
 * `endedAt` (the leader-only `end_call` action rejects them) and the
 * row's `endedAt` would stay null — leaving peers without a redirect,
 * late joiners able to enter an empty room, and the MeetingsPanel Join
 * pill still rendering.
 *
 * Allowed for any participant (Members included) because the trigger is
 * the meeting clock, not a leader's decision.
 *
 * Rejects requests that arrive more than 5 seconds before `endsAt` to
 * tolerate minor clock skew without letting a malicious or buggy client
 * close the room early.
 */
const CLOCK_SKEW_GRACE_MS = 5_000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, endedAt: true, endsAt: true, isAuto: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (meeting.endedAt !== null) {
    return NextResponse.json({ error: "Call has ended." }, { status: 410 });
  }

  const allowed = await isMeetingParticipant(meetingId, sessionUser.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not a participant." }, { status: 403 });
  }

  // Only auto-end `isAuto` Holy Hour rooms. Manual meetings (when you add
  // them back later) should close via the leader's End Call button.
  if (!meeting.isAuto) {
    return NextResponse.json(
      { error: "Auto-end is only available on auto Holy Hour calls." },
      { status: 400 }
    );
  }

  const now = Date.now();
  const endsAtMs = meeting.endsAt ? meeting.endsAt.getTime() : null;
  if (endsAtMs !== null && now < endsAtMs - CLOCK_SKEW_GRACE_MS) {
    return NextResponse.json(
      { error: "Too early to end this call." },
      { status: 400 }
    );
  }

  // Stamp `endedAt` with the meeting's scheduled endsAt, not the wall clock
    // — that way a leader's `end_call` at T+0.4s (which writes `new Date()`)
    // is distinguishable in the audit log but produces the same closed
    // boolean state. The atomic guard handles the race: whichever update
    // lands first wins, the second is a no-op.
  await prisma.meeting.updateMany({
    where: { id: meetingId, endedAt: null },
    data: {
      endedAt: meeting.endsAt ?? new Date(),
      endedById: sessionUser.id,
    },
  });

  // Close any open attendance rows for this meeting — a meeting that's
  // ended means nobody can still be in it. Use the meeting's endsAt (or
  // now() if missing) as the leave time so totals match the closed
  // boolean state.
  const closeAt = meeting.endsAt ?? new Date();
  const open = await prisma.meetingAttendance.findMany({
    where: { meetingId, leftAt: null },
    select: { id: true, joinedAt: true },
  });
  for (const a of open) {
    await prisma.meetingAttendance.update({
      where: { id: a.id },
      data: {
        leftAt: closeAt,
        durationSeconds: Math.max(
          0,
          Math.floor((closeAt.getTime() - a.joinedAt.getTime()) / 1000)
        ),
      },
    });
  }

  const after = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { endedAt: true },
  });

  return NextResponse.json({
    ok: true,
    endedAt: after?.endedAt?.toISOString() ?? null,
  });
}