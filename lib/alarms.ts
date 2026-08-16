import { NotificationType, type Role } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Alarm engine: the daily Holy Hour and per-event reminders.
 *
 * Every function here is idempotent (atomic claims), so runAlarmCheck() can be
 * called safely from three places at once:
 *   1. instrumentation.ts  (setInterval, every 30 s, on next start hosts)
 *   2. /api/cron/alarms     (external cron, guarded by CRON_SECRET)
 *   3. /api/alarms/check    (opportunistically, when any member polls)
 *
 * If VAPID keys are missing from .env, push is skipped silently — in-app
 * chime/banner and the Notification rows still work.
 */

const KAMPALA_TZ = "Africa/Kampala";
const HOLY_HOUR_WINDOW_MS = 10 * 60 * 1000; // ring at the start, stay ringable for 10 min

/** The Holy Hour rings every day at these two times (Africa/Kampala). */
export const HOLY_HOUR_TIMES = ["03:00", "15:00"] as const;

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

function setupVapid(): void {
  if (vapidConfigured()) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
  }
}

/** UTC offset (ms) of Africa/Kampala at the given instant. No DST in Uganda, but compute properly. */
function kampalaOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KAMPALA_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "+00:00";
  const m = /([+-])(\d{2}):(\d{2})/.exec(offset);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60 * 1000;
}

/** Most recent Kampala occurrence of ("HH:mm") that is <= now, as a UTC Date. */
function getDailyHolyHourTargetUtc(time: string, now: Date): Date {
  const [hh, mm] = time.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KAMPALA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value;
  const year = Number(p("year"));
  const month = Number(p("month"));
  const day = Number(p("day"));

  const candidate = new Date(Date.UTC(year, month - 1, day, hh, mm, 0) - kampalaOffsetMs(now));
  // If the candidate is still in the future (today's time hasn't arrived),
  // step back to yesterday's occurrence.
  if (candidate.getTime() > now.getTime()) {
    candidate.setTime(candidate.getTime() - 24 * 60 * 60 * 1000);
  }
  return candidate;
}

/** Next future Holy Hour occurrence in Kampala, as a UTC Date (used for the preview). */
export function getNextHolyHourUtc(now: Date = new Date()): Date {
  let best: Date | null = null;
  for (const time of HOLY_HOUR_TIMES) {
    const [hh, mm] = time.split(":").map(Number);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KAMPALA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const p = (t: string) => parts.find((x) => x.type === t)?.value;
    const year = Number(p("year"));
    const month = Number(p("month"));
    const day = Number(p("day"));

    const candidate = new Date(Date.UTC(year, month - 1, day, hh, mm, 0) - kampalaOffsetMs(now));
    // When today's occurrence has already passed, roll to tomorrow's.
    if (candidate.getTime() <= now.getTime()) {
      candidate.setTime(candidate.getTime() + 24 * 60 * 60 * 1000);
    }
    if (!best || candidate.getTime() < best.getTime()) {
      best = candidate;
    }
  }
  return best as Date;
}

/** Sends a web push to every device token of a user. Deletes dead tokens (404/410). */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  if (!vapidConfigured()) return;
  setupVapid();

  const tokens = await prisma.deviceToken.findMany({
    where: { userId, platform: "web", p256dh: { not: null }, authKey: { not: null } },
  });
  if (tokens.length === 0) return;

  const payload = JSON.stringify({ title, body, url: link });

  await Promise.allSettled(
    tokens.map(async (t) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: t.token,
            keys: { p256dh: t.p256dh as string, auth: t.authKey as string },
          },
          payload
        );
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410: the subscription no longer exists on the push service.
        if (status === 404 || status === 410 || status === 400) {
          await prisma.deviceToken.delete({ where: { id: t.id } }).catch(() => {});
        }
      }
    })
  );
}

async function notifyAllActiveUsers(
  title: string,
  body: string,
  type: NotificationType,
  link: string | null,
  scheduledFor: Date,
  excludeRoles: Role[] = []
): Promise<void> {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", ...(excludeRoles.length > 0 ? { role: { notIn: excludeRoles } } : {}) },
    select: { id: true },
  });
  if (users.length === 0) return;

  const notification = await prisma.notification.create({
    data: { title, body, type, link, scheduledFor, sentAt: now },
  });

  await prisma.notificationDelivery.createMany({
    data: users.map((u) => ({ notificationId: notification.id, userId: u.id })),
    skipDuplicates: true,
  });

  await Promise.allSettled(
    users.map((u) => sendPushToUser(u.id, title, body, link ?? undefined))
  );
}

/**
 * Fires the daily Holy Hour alarm at each scheduled time, exactly once per
 * occurrence. holyHourLastFiredAt holds the UTC instant of the last occurrence
 * that fired; occurrences are strictly ordered in time, so one timestamp is
 * enough to claim each one atomically.
 */
export async function fireDailyHolyHour(now: Date = new Date()): Promise<void> {
  // The alarm is inbuilt and always on. A fresh database has no AppSetting row
  // yet, so make sure it exists before claiming occurrences against it.
  await prisma.appSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });

  for (const time of HOLY_HOUR_TIMES) {
    const target = getDailyHolyHourTargetUtc(time, now);
    if (
      now.getTime() < target.getTime() ||
      now.getTime() > target.getTime() + HOLY_HOUR_WINDOW_MS
    ) {
      continue;
    }

    // Atomic claim: only one caller may fire this occurrence, even with
    // concurrent pollers and multiple server instances.
    const claimed = await prisma.appSetting.updateMany({
      where: { id: "global", holyHourLastFiredAt: { lt: target } },
      data: { holyHourLastFiredAt: target },
    });
    if (claimed.count === 0) continue;

    await notifyAllActiveUsers(
      "Holy Hour",
      "It is time for the Holy Hour. Let us pray.",
      "PRAYER",
      null,
      target,
      ["TECHNICAL_LEAD"]
    );
  }
}

/** Fires one-off event reminders whose time has arrived. Each reminder claims atomically. */
export async function fireEventReminders(now: Date = new Date()): Promise<void> {
  const due = await prisma.reminder.findMany({
    where: { remindAt: { lte: now }, isSent: false },
    select: { id: true, userId: true, eventId: true, event: { select: { id: true, title: true, type: true } } },
  });
  if (due.length === 0) return;

  const claimed = await prisma.reminder.updateMany({
    where: { id: { in: due.map((r) => r.id) }, isSent: false },
    data: { isSent: true },
  });
  if (claimed.count === 0) return;

  // One Notification per event, with a delivery per reminded user.
  const byEvent = new Map<
    string,
    { title: string; type: NotificationType; userIds: string[] }
  >();
  for (const r of due) {
    const key = r.eventId ?? "standalone";
    const existing = byEvent.get(key);
    if (existing) {
      existing.userIds.push(r.userId);
    } else {
      byEvent.set(key, {
        title: r.event ? `${r.event.title} is starting` : "Prayer reminder",
        type: r.event && r.event.type === "MEETING" ? "MEETING" : "EVENT",
        userIds: [r.userId],
      });
    }
  }

  const nowMs = now.getTime();
  for (const [, group] of byEvent) {
    const notification = await prisma.notification.create({
      data: {
        title: group.title,
        body: "Your scheduled time is here. Join in prayer.",
        type: group.type,
        scheduledFor: new Date(nowMs),
        sentAt: now,
      },
    });
    await prisma.notificationDelivery.createMany({
      data: group.userIds.map((userId) => ({ notificationId: notification.id, userId })),
      skipDuplicates: true,
    });
  }

  await Promise.allSettled(
    due.map((r) => sendPushToUser(r.userId, "Prayer time", "Your scheduled prayer time is here."))
  );
}

/** Runs every alarm sweep: daily Holy Hour + due event reminders. */
export async function runAlarmCheck(now: Date = new Date()): Promise<void> {
  await Promise.all([fireDailyHolyHour(now), fireEventReminders(now)]);
}
