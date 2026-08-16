import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

const SIGNAL_TYPES = new Set(["offer", "answer", "ice"]);

/**
 * Posts one WebRTC signaling message (offer/answer/ICE candidate) from the
 * caller's session to another session in the same meeting. The recipient
 * picks it up on their next poll of GET /api/meetings/signal/[meetingId].
 * Point-to-point only; join/leave presence comes from MeetingSession rows.
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    meetingId?: unknown;
    sessionId?: unknown;
    toSessionId?: unknown;
    type?: unknown;
    payload?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const toSessionId = typeof body.toSessionId === "string" ? body.toSessionId : "";
  const type = typeof body.type === "string" ? body.type : "";
  const payload = body.payload;

  if (!meetingId || !sessionId || !toSessionId || !type || typeof payload !== "object" || payload === null) {
    return NextResponse.json({ error: "Invalid signaling message." }, { status: 400 });
  }
  if (!SIGNAL_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid signal type." }, { status: 400 });
  }
  if (!(await isMeetingParticipant(meetingId, sessionUser.id))) {
    return NextResponse.json({ error: "You're not invited to this meeting." }, { status: 403 });
  }

  await prisma.meetingSignal.create({
    data: { meetingId, fromSessionId: sessionId, toSessionId, type, payload },
  });

  return NextResponse.json({ ok: true });
}
