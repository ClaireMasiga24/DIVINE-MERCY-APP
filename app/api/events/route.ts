import { NextResponse } from "next/server";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, EVENT_MANAGE_ROLES } from "@/lib/auth";

const ALLOWED_MANAGE_ROLES = new Set<string>(EVENT_MANAGE_ROLES);
const EVENT_TYPES = Object.values(EventType) as string[];

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const events = await prisma.event.findMany({
    where: { startTime: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { startTime: "asc" },
    include: { createdBy: { select: { fullName: true } } },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime?.toISOString() ?? null,
      location: e.location,
      createdBy: e.createdBy.fullName,
    })),
  });
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_MANAGE_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow scheduling events." },
      { status: 403 }
    );
  }

  let body: {
    title?: unknown;
    type?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    location?: unknown;
    alarmEnabled?: unknown;
    alarmLeadMinutes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  const startTime = typeof body.startTime === "string" ? new Date(body.startTime) : null;
  const endTime = typeof body.endTime === "string" && body.endTime ? new Date(body.endTime) : null;
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const alarmEnabled = typeof body.alarmEnabled === "boolean" ? body.alarmEnabled : false;
  const alarmLeadMinutes =
    typeof body.alarmLeadMinutes === "number" && Number.isFinite(body.alarmLeadMinutes)
      ? Math.round(body.alarmLeadMinutes)
      : 0;

  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Enter a title (max 120 characters)." }, { status: 400 });
  }
  if (!EVENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
  }
  if (!startTime || Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: "Enter a valid start date and time." }, { status: 400 });
  }
  if (startTime.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: "The event can't be in the past." }, { status: 400 });
  }
  if (endTime && endTime.getTime() <= startTime.getTime()) {
    return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
  }
  if (alarmLeadMinutes < 0 || alarmLeadMinutes > 120) {
    return NextResponse.json({ error: "Alarm lead time must be between 0 and 120 minutes." }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      title,
      type: type as EventType,
      startTime,
      endTime,
      location: location || null,
      createdById: sessionUser.id,
    },
  });

  // One reminder per active member when the alarm is on; each fires once
  // (isSent claim) and is delivered as a push + in-app notification.
  if (alarmEnabled) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    if (users.length > 0) {
      const remindAt = new Date(startTime.getTime() - alarmLeadMinutes * 60 * 1000);
      await prisma.reminder.createMany({
        data: users.map((u) => ({ eventId: event.id, userId: u.id, remindAt })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    event: { id: event.id, title: event.title, type: event.type, startTime: event.startTime.toISOString() },
  });
}
