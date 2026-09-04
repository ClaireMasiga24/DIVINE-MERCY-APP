import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * WebRTC signaling poll. Returns the meeting's state and any messages
 * addressed to this browser session, then deletes the consumed messages in
 * the same transaction so two concurrent pollers can't double-deliver.
 *
 * Auth + access are checked once at the top. Closed rooms (`endedAt` set)
 * still return the state so the client can show the "call has ended"
 * screen, but signals and presence are returned empty.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { meetingId } = await params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
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

  const allowed = await isMeetingParticipant(meetingId, sessionUser.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not a participant." }, { status: 403 });
  }

  // Closed room: hand back enough for the client to show the ended screen,
  // but no signals and no peer presence (everyone else has been kicked).
  if (meeting.endedAt !== null) {
    return NextResponse.json({
      signals: [],
      presence: [],
      musicPlaying: meeting.musicPlaying,
      endedAt: meeting.endedAt.toISOString(),
      endsAt: meeting.endsAt?.toISOString() ?? null,
      isAuto: meeting.isAuto,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.meetingSignal.findMany({
      where: { meetingId, toSessionId: sessionId },
      orderBy: { createdAt: "asc" },
    });
    if (pending.length > 0) {
      await tx.meetingSignal.deleteMany({
        where: { id: { in: pending.map((s) => s.id) } },
      });
    }
    const sessions = await tx.meetingSession.findMany({
      where: { meetingId },
      include: { user: { select: { fullName: true } } },
    });
    return {
      signals: pending.map((s) => ({
        fromSessionId: s.fromSessionId,
        type: s.type,
        payload: s.payload,
      })),
      presence: sessions.map((s) => ({
        sessionId: s.id,
        fullName: s.user.fullName,
      })),
    };
  });

  return NextResponse.json({
    ...result,
    musicPlaying: meeting.musicPlaying,
    endedAt: null,
    endsAt: meeting.endsAt?.toISOString() ?? null,
    isAuto: meeting.isAuto,
  });
}