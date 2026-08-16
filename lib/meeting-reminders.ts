import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/alarms";

/**
 * Meeting reminder engine — a distinct path from the daily Holy Hour alarm.
 *
 * Where the Holy Hour rings at fixed times (03:00 / 15:00 Kampala) for
 * everyone, each meeting carries its own start time and reminder offset, and
 * is claimed with a per-meeting `notified` flag so a reminder sends exactly
 * once no matter how many sweeps run concurrently.
 *
 * Reminders go to the meeting's invitees (MeetingParticipant rows) — the
 * Technical Lead can never be invited, so they never receive meeting
 * notifications. Meetings created before invitations existed have no
 * participants; those fall back to notifying only the creator.
 *
 * runMeetingCheck() is idempotent and safe to call from three places at once:
 *   1. instrumentation.ts  (setInterval, every 30 s, on next start hosts)
 *   2. /api/cron/meetings   (external cron, guarded by CRON_SECRET)
 *   3. /api/alarms/check    (opportunistically, when any member polls)
 */

const KAMPALA_TZ = "Africa/Kampala";

/** Reminders older than this after the meeting start are too late to be useful. */
const GRACE_AFTER_START_MS = 30 * 60 * 1000;

/** Max lead time we need to look ahead for (1 day before start). */
const MAX_LEAD_MS = 24 * 60 * 60 * 1000;

/** Human-readable Kampala label, e.g. "Sat 16 Aug, 3:00 pm". */
export function formatKampalaLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KAMPALA_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

type DueMeeting = {
  id: string;
  title: string;
  startsAt: Date;
  location: string | null;
  reminderMinutesBefore: number;
  createdById: string;
};

async function notifyMeetingReminder(m: DueMeeting): Promise<void> {
  const now = new Date();
  const when = formatKampalaLabel(m.startsAt);
  const body = `Video call · ${m.location ? `${m.location} · ` : ""}${when}`;
  // Tapping the notification (push or in-app) opens the call room.
  const roomLink = `/dashboard/meeting-room/${m.id}`;

  // Invitees only; meetings with no invitees yet fall back to the creator.
  const invitees = await prisma.meetingParticipant.findMany({
    where: { meetingId: m.id },
    select: { userId: true },
  });
  const userIds = invitees.length > 0 ? invitees.map((p) => p.userId) : [m.createdById];

  // One Notification with a delivery per invitee, so the in-app alarm
  // listener picks it up on its next poll.
  const notification = await prisma.notification.create({
    data: {
      title: m.title,
      body,
      type: NotificationType.MEETING,
      link: roomLink,
      scheduledFor: m.startsAt,
      sentAt: now,
    },
  });

  if (userIds.length > 0) {
    await prisma.notificationDelivery.createMany({
      data: userIds.map((userId) => ({ notificationId: notification.id, userId })),
      skipDuplicates: true,
    });
  }

  // Web push (app closed). The room link lets sw.js open the call on tap.
  // Silently skipped when VAPID keys are missing.
  await Promise.allSettled(
    userIds.map((u) => sendPushToUser(u, m.title, body, roomLink))
  );
}

export async function runMeetingCheck(now: Date = new Date()): Promise<void> {
  const candidates = await prisma.meeting.findMany({
    where: {
      notified: false,
      startsAt: {
        gte: new Date(now.getTime() - GRACE_AFTER_START_MS),
        lte: new Date(now.getTime() + MAX_LEAD_MS),
      },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      location: true,
      reminderMinutesBefore: true,
      createdById: true,
    },
  });
  if (candidates.length === 0) return;

  const nowMs = now.getTime();
  const due: DueMeeting[] = [];
  const tooLate: string[] = [];
  for (const m of candidates) {
    const trigger = m.startsAt.getTime() - m.reminderMinutesBefore * 60 * 1000;
    if (trigger > nowMs) continue; // not due yet
    if (nowMs <= m.startsAt.getTime() + GRACE_AFTER_START_MS) due.push(m);
    else tooLate.push(m.id);
  }

  // Fire each due meeting with its own atomic claim — the sweep that flips the
  // flag is the one that notifies, so concurrent callers can never double-send.
  for (const m of due) {
    const claimed = await prisma.meeting.updateMany({
      where: { id: m.id, notified: false },
      data: { notified: true },
    });
    if (claimed.count === 0) continue; // another sweep won this one
    await notifyMeetingReminder(m).catch((err) => {
      console.error(`[meetings] reminder for ${m.id} failed after claim:`, err);
    });
  }

  // Meetings whose reminder passed long after the start are marked notified so
  // they drop out of every future sweep without ever ringing.
  if (tooLate.length > 0) {
    await prisma.meeting.updateMany({
      where: { id: { in: tooLate }, notified: false },
      data: { notified: true },
    });
  }
}
