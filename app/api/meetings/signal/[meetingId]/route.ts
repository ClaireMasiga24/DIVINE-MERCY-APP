import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/** Sessions older than this are assumed to be crashed tabs — pruned on poll. */
const STALE_SESSION_MS = 15 * 60 * 1000;

/**
 * The room's poll endpoint. Returns (a) signaling messages addressed to the
 * caller's session — consumed (deleted) so they are delivered exactly once,
 * and (b) live presence: every joined session in the meeting with its user's
 * name. Prunes stale sessions left behind by closed tabs.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ meetingId: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { meetingId } = await ctx.params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }
  if (!(await isMeetingParticipant(meetingId, sessionUser.id))) {
    return NextResponse.json({ error: "You're not invited to this meeting." }, { status: 403 });
  }

  const staleBefore = new Date(Date.now() - STALE_SESSION_MS);
  const result = await prisma.$transaction(async (tx) => {
    await tx.meetingSession.deleteMany({ where: { meetingId, joinedAt: { lt: staleBefore } } });

    const signals = await tx.meetingSignal.findMany({
      where: { meetingId, toSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    if (signals.length > 0) {
      await tx.meetingSignal.deleteMany({ where: { id: { in: signals.map((s) => s.id) } } });
    }

    const sessions = await tx.meetingSession.findMany({
      where: { meetingId },
      include: { user: { select: { fullName: true } } },
    });

    return { signals, sessions };
  });

  return NextResponse.json({
    signals: result.signals.map((s) => ({
      id: s.id,
      fromSessionId: s.fromSessionId,
      toSessionId: s.toSessionId,
      type: s.type,
      payload: s.payload,
    })),
    presence: result.sessions.map((s) => ({
      sessionId: s.id,
      userId: s.userId,
      fullName: s.user.fullName,
      joinedAt: s.joinedAt.toISOString(),
    })),
  });
}
