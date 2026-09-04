import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isMeetingParticipant } from "@/lib/meeting-access";

/**
 * Leader-only meeting controls. Each action is one atomic `updateMany`
 * with a guard clause on the prior state, so two simultaneous presses
 * (e.g. two Patron tabs) both return 200 but only one update happens.
 *
 * Action gates:
 *   stop_music  / start_music   — Patron, Chairperson
 *   end_call                    — Patron, Chairperson, Technical Lead,
 *                                 and only on `isAuto` Holy Hour rooms
 *
 * Auto-end (when the room's clock hits endsAt) is a separate endpoint
 * (`/api/meetings/[id]/auto-end`) so regular members can close the room
 * without needing leader privileges.
 */
const MUSIC_ROLES: Role[] = [Role.PATRON, Role.CHAIRPERSON];
const END_CALL_ROLES: Role[] = [Role.PATRON, Role.CHAIRPERSON, Role.TECHNICAL_LEAD];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id: meetingId } = await params;

  const body = (await req.json().catch(() => null)) as {
    action?: "stop_music" | "start_music" | "end_call";
  } | null;
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, isAuto: true, endedAt: true, musicPlaying: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }

  const allowed = await isMeetingParticipant(meetingId, sessionUser.id);
  if (!allowed) {
    return NextResponse.json({ error: "Not a participant." }, { status: 403 });
  }

  const role = sessionUser.role as Role;

  if (body.action === "stop_music" || body.action === "start_music") {
    if (!MUSIC_ROLES.includes(role)) {
      return NextResponse.json({ error: "Patron or Chairperson only." }, { status: 403 });
    }
    if (meeting.endedAt !== null) {
      return NextResponse.json({ error: "Call has ended." }, { status: 410 });
    }
    if (body.action === "stop_music") {
      await prisma.meeting.updateMany({
        where: { id: meetingId, musicPlaying: true },
        data: {
          musicPlaying: false,
          musicPausedAt: new Date(),
          musicPausedById: sessionUser.id,
        },
      });
    } else {
      await prisma.meeting.updateMany({
        where: { id: meetingId, musicPlaying: false },
        data: {
          musicPlaying: true,
          musicPausedAt: null,
          musicPausedById: null,
        },
      });
    }
    const after = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { musicPlaying: true, endedAt: true },
    });
    return NextResponse.json({
      ok: true,
      musicPlaying: after?.musicPlaying ?? true,
      endedAt: after?.endedAt?.toISOString() ?? null,
    });
  }

  if (body.action === "end_call") {
    if (!END_CALL_ROLES.includes(role)) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
    if (!meeting.isAuto) {
      return NextResponse.json(
        { error: "End Call is only available on auto Holy Hour calls." },
        { status: 400 }
      );
    }
    if (meeting.endedAt !== null) {
      return NextResponse.json({ error: "Call has ended." }, { status: 410 });
    }
    await prisma.meeting.updateMany({
      where: { id: meetingId, endedAt: null },
      data: {
        endedAt: new Date(),
        endedById: sessionUser.id,
      },
    });
    // Close any open attendance rows for this meeting — the call is over,
    // nobody can still be in it.
    const closeAt = new Date();
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
      select: { endedAt: true, musicPlaying: true },
    });
    return NextResponse.json({
      ok: true,
      musicPlaying: after?.musicPlaying ?? true,
      endedAt: after?.endedAt?.toISOString() ?? null,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}