import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * Pushes a WebRTC signal (offer / answer / ICE candidate) from one browser
 * session to another inside the same meeting. The recipient picks it up on
 * their next poll. Closed rooms reject with 410.
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    meetingId?: string;
    sessionId?: string;
    toSessionId?: string;
    type?: string;
    payload?: unknown;
  } | null;
  if (
    !body?.meetingId ||
    !body.sessionId ||
    !body.toSessionId ||
    !body.type ||
    body.payload === undefined
  ) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }
  if (!["offer", "answer", "ice"].includes(body.type)) {
    return NextResponse.json({ error: "Unknown signal type." }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: body.meetingId },
    select: { endedAt: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (meeting.endedAt !== null) {
    return NextResponse.json({ error: "Call has ended." }, { status: 410 });
  }

  const allowed = await isMeetingParticipant(body.meetingId, sessionUser.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not a participant." }, { status: 403 });
  }

  await prisma.meetingSignal.create({
    data: {
      meetingId: body.meetingId,
      fromSessionId: body.sessionId,
      toSessionId: body.toSessionId,
      type: body.type,
      payload: body.payload as object,
    },
  });

  return NextResponse.json({ ok: true });
}