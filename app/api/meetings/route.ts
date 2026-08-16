import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, EVENT_MANAGE_ROLES } from "@/lib/auth";
import { sendPushToUser } from "@/lib/alarms";
import { formatKampalaLabel } from "@/lib/meeting-reminders";

const ALLOWED_MANAGE_ROLES = new Set<string>(EVENT_MANAGE_ROLES);
const REMINDER_OFFSETS = new Set([0, 15, 60, 1440]);
const MAX_INVITEES = 50;

/**
 * Creates a parish meeting (video call). Scheduling is leadership-only
 * (Chairperson, Patron) — same gate as event scheduling. The creator picks
 * which members are invited; each invitee gets an invitation notification now
 * and a reminder at startsAt − reminderMinutesBefore from the meeting sweep
 * (lib/meeting-reminders.ts). The creator is always a participant.
 */
export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (!ALLOWED_MANAGE_ROLES.has(sessionUser.role)) {
      return NextResponse.json(
        { error: "Your role doesn't allow scheduling meetings." },
        { status: 403 }
      );
    }

    let body: {
      title?: unknown;
      description?: unknown;
      startTime?: unknown;
      location?: unknown;
      reminderMinutesBefore?: unknown;
      participantIds?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const startTime = typeof body.startTime === "string" ? new Date(body.startTime) : null;
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const reminderMinutesBefore =
      typeof body.reminderMinutesBefore === "number" && Number.isFinite(body.reminderMinutesBefore)
        ? Math.round(body.reminderMinutesBefore)
        : 15;

    if (!title || title.length > 120) {
      return NextResponse.json({ error: "Enter a title (max 120 characters)." }, { status: 400 });
    }
    if (description.length > 500) {
      return NextResponse.json({ error: "Description is too long (max 500 characters)." }, { status: 400 });
    }
    if (!startTime || Number.isNaN(startTime.getTime())) {
      return NextResponse.json({ error: "Enter a valid date and time." }, { status: 400 });
    }
    // Same 5-minute past slack the events route allows (datetime pickers can
    // round to the current minute).
    if (startTime.getTime() < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({ error: "The meeting can't be in the past." }, { status: 400 });
    }
    if (location.length > 200) {
      return NextResponse.json({ error: "Location is too long (max 200 characters)." }, { status: 400 });
    }
    if (!REMINDER_OFFSETS.has(reminderMinutesBefore)) {
      return NextResponse.json({ error: "Choose a valid reminder time." }, { status: 400 });
    }

    // Invitee validation: array of user ids, deduped, capped, all ACTIVE, and
    // never the Technical Lead (admin account gets no meeting notifications).
    let inviteeIds: string[] = [];
    if (body.participantIds !== undefined) {
      if (!Array.isArray(body.participantIds)) {
        return NextResponse.json({ error: "Invalid invitees." }, { status: 400 });
      }
      const raw = [...new Set(body.participantIds.filter((x): x is string => typeof x === "string"))];
      if (raw.length > MAX_INVITEES) {
        return NextResponse.json({ error: `You can invite up to ${MAX_INVITEES} members.` }, { status: 400 });
      }
      const valid = await prisma.user.findMany({
        where: { id: { in: raw }, status: "ACTIVE", role: { not: "TECHNICAL_LEAD" } },
        select: { id: true },
      });
      const validIds = new Set(valid.map((u) => u.id));
      inviteeIds = raw.filter((id) => validIds.has(id));
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description || null,
        startsAt: startTime,
        location: location || null,
        reminderMinutesBefore,
        createdById: sessionUser.id,
        // The creator is always a participant (host); invites are the rest.
        participants: {
          create: [...new Set([sessionUser.id, ...inviteeIds])].map((userId) => ({ userId })),
        },
      },
      include: { createdBy: { select: { fullName: true } } },
    });

    // Invitation notification to every invitee (not the creator — they
    // scheduled it). Type MEETING so the in-app alarm listener surfaces it.
    if (inviteeIds.length > 0) {
      const roomLink = `/dashboard/meeting-room/${meeting.id}`;
      const when = formatKampalaLabel(meeting.startsAt);
      const notification = await prisma.notification.create({
        data: {
          title: "Meeting invitation",
          body: `${meeting.createdBy.fullName} invited you to ${meeting.title} · ${when}`,
          type: NotificationType.MEETING,
          link: roomLink,
          scheduledFor: meeting.startsAt,
          sentAt: new Date(),
        },
      });
      await prisma.notificationDelivery.createMany({
        data: inviteeIds.map((userId) => ({ notificationId: notification.id, userId })),
        skipDuplicates: true,
      });
      await Promise.allSettled(
        inviteeIds.map((userId) =>
          sendPushToUser(
            userId,
            "Meeting invitation",
            `${meeting.createdBy.fullName} invited you to ${meeting.title} · ${when}`,
            roomLink
          )
        )
      );
    }

    return NextResponse.json({
      ok: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        participantCount: inviteeIds.length + 1,
      },
    });
  } catch (err) {
    console.error("[meetings] create failed:", err);
    return NextResponse.json({ error: "Couldn't schedule the meeting. Try again." }, { status: 500 });
  }
}
