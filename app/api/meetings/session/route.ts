import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * Call presence. Joining uses a fresh client-generated sessionId (the
 * MeetingSession row id) and atomically replaces any prior session for the
 * same user+meeting (rejoin or a second tab), so presence never shows the
 * same person twice. Leaving deletes the session, idempotently.
 *
 * POST accepts `action: "join" | "leave"` — the "leave" form exists so a
 * closing tab can fire it via navigator.sendBeacon (POST-only). DELETE is the
 * explicit equivalent.
 */
async function readBody(req: Request): Promise<{ meetingId: string; sessionId: string } | null> {
  try {
    const body = await req.json();
    const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    return meetingId && sessionId ? { meetingId, sessionId } : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { meetingId?: unknown; sessionId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const action = body.action === "leave" ? "leave" : "join";
  if (!meetingId || !sessionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!(await isMeetingParticipant(meetingId, sessionUser.id))) {
    return NextResponse.json({ error: "You're not invited to this meeting." }, { status: 403 });
  }

  if (action === "leave") {
    await prisma.meetingSession.deleteMany({
      where: { meetingId, id: sessionId, userId: sessionUser.id },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.meetingSession.deleteMany({ where: { meetingId, userId: sessionUser.id } });
    await tx.meetingSession.create({ data: { id: sessionId, meetingId, userId: sessionUser.id } });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await readBody(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!(await isMeetingParticipant(body.meetingId, sessionUser.id))) {
    return NextResponse.json({ error: "You're not invited to this meeting." }, { status: 403 });
  }

  await prisma.meetingSession.deleteMany({
    where: { meetingId: body.meetingId, id: body.sessionId, userId: sessionUser.id },
  });

  return NextResponse.json({ ok: true });
}
