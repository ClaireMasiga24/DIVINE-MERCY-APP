import { NotificationType, type Role } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Alarm + call engine: the daily Holy Hour group call and per-event reminders.
 *
 * At each Holy Hour time the sweep spawns a system-created Meeting (the call
 * room) and rings every active member with an incoming-call push; joining is
 * one tap. Every function here is idempotent (atomic claims), so
 * runAlarmCheck() can be called safely from three places at once:
 *   1. instrumentation.ts  (setInterval, every 30 s, on next start hosts)
 *   2. /api/cron/alarms     (external cron, guarded by CRON_SECRET)
 *   3. /api/alarms/check    (opportunistically, when any member polls)
 *
 * If VAPID keys are missing from .env, push is skipped silently — in-app
 * ringer/banner and the Notification rows still work.
 */

export const KAMPALA_TZ = "Africa/Kampala";
// Ring at the start, stay fireable for the hour that follows. Wide window on
// purpose: Vercel Hobby cron may invoke up to an hour late, and a late ring
// beats no ring. The atomic claim prevents double-firing.
const HOLY_HOUR_WINDOW_MS = 60 * 60 * 1000;

/** The Holy Hour rings every day at these two times (Africa/Kampala). */
export const HOLY_HOUR_TIMES = ["03:00", "15:00"] as const;

/**
 * The full weekly schedule. The `HOLY_HOUR_TIMES` array above is the union
 * across the week — kept exported for backwards-compat with consumers that
 * just want the time list for UI labels. The sweep and the "next occurrence"
 * helper walk this table directly.
 *
 * Saturday: 3 AM only (no afternoon call).
 * Sunday: no call at all.
 */
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const HOLY_HOUR_SCHEDULE: Record<WeekdayKey, readonly string[]> = {
  mon: ["03:00", "15:00"],
  tue: ["03:00", "15:00"],
  wed: ["03:00", "15:00"],
  thu: ["03:00", "15:00"],
  fri: ["03:00", "15:00"],
  sat: ["03:00"],
  sun: [],
};

/** Kampala-local weekday as one of `mon`..`sun`. */
export function getKampalaWeekdayKey(d: Date): WeekdayKey {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: KAMPALA_TZ,
    weekday: "short",
  }).format(d);
  switch (short) {
    case "Mon": return "mon";
    case "Tue": return "tue";
    case "Wed": return "wed";
    case "Thu": return "thu";
    case "Fri": return "fri";
    case "Sat": return "sat";
    case "Sun": return "sun";
    default: return "mon";
  }
}

/** How long each member's incoming-call ringer stays up before "missed". */
export const CALL_RING_MS = 45_000;

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
  // Walk today, then +1 day, … up to +7 days. For each candidate day, look up
  // its times in the schedule — empty days (Sunday) and days whose times
  // have all passed (Saturday after 3am) are skipped to the next day. This
  // keeps the label honest when the schedule has gaps.
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const base = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KAMPALA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(base);
    const p = (t: string) => parts.find((x) => x.type === t)?.value;
    const year = Number(p("year"));
    const month = Number(p("month"));
    const day = Number(p("day"));
    const wd = getKampalaWeekdayKey(base);
    const todaysTimes = HOLY_HOUR_SCHEDULE[wd];
    if (todaysTimes.length === 0) continue;

    let bestForDay: Date | null = null;
    for (const time of todaysTimes) {
      const [hh, mm] = time.split(":").map(Number);
      const candidate = new Date(
        Date.UTC(year, month - 1, day, hh, mm, 0) - kampalaOffsetMs(now)
      );
      if (candidate.getTime() <= now.getTime()) continue; // already past
      if (!bestForDay || candidate.getTime() < bestForDay.getTime()) {
        bestForDay = candidate;
      }
    }
    if (bestForDay) return bestForDay;
  }
  // 7-day walk exhausted — defensive fallback (shouldn't happen in practice).
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/** Sends a web push to every device token of a user. Deletes dead tokens (404/410). */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  link?: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!vapidConfigured()) return;
  setupVapid();

  const tokens = await prisma.deviceToken.findMany({
    where: { userId, platform: "web", p256dh: { not: null }, authKey: { not: null } },
  });
  if (tokens.length === 0) return;

  const payload = JSON.stringify({ title, body, url: link, ...extra });

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
  excludeRoles: Role[] = [],
  pushExtra?: Record<string, unknown>
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
    users.map((u) => sendPushToUser(u.id, title, body, link ?? undefined, pushExtra))
  );
}

/**
 * The system-created Holy Hour group call for a given occurrence. Idempotent:
 * the findFirst guard means concurrent sweeps or retries converge on one
 * Meeting row per occurrence time. Every active member (including the
 * Technical Lead) becomes an invitee; members registered later are still
 * covered by the isAuto fallback in lib/meeting-access.ts.
 */
export async function ensureHolyHourCall(target: Date): Promise<{ id: string }> {
  const existing = await prisma.meeting.findFirst({
    where: { isAuto: true, startsAt: target },
    select: { id: true },
  });
  if (existing) return existing;

  const meeting = await prisma.meeting.create({
    data: {
      title: "Holy Hour",
      type: "VIDEO",
      startsAt: target,
      endsAt: new Date(target.getTime() + 60 * 60 * 1000),
      isAuto: true,
      reminderMinutesBefore: 0,
    },
    select: { id: true },
  });

  // Every active member is invited — the Technical Lead is included so they
  // can be paged for the Holy Hour call.
  const members = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  await prisma.meetingParticipant.createMany({
    data: members.map((u) => ({ meetingId: meeting.id, userId: u.id })),
    skipDuplicates: true,
  });

  return meeting;
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

  const todaysTimes = HOLY_HOUR_SCHEDULE[getKampalaWeekdayKey(now)];
  for (const time of todaysTimes) {
    const target = getDailyHolyHourTargetUtc(time, now);
    if (
      now.getTime() < target.getTime() ||
      now.getTime() > target.getTime() + HOLY_HOUR_WINDOW_MS
    ) {
      continue;
    }

    // Atomic claim: only one caller may fire this occurrence, even with
    // concurrent pollers and multiple server instances.
    const before = await prisma.appSetting.findUnique({
      where: { id: "global" },
      select: { holyHourLastFiredAt: true },
    });
    const claimed = await prisma.appSetting.updateMany({
      where: { id: "global", holyHourLastFiredAt: { lt: target } },
      data: { holyHourLastFiredAt: target },
    });
    if (claimed.count === 0) continue;

    // Spawn the group call, then ring everyone. If either fails after the
    // claim, roll the claim back so a later sweep retries instead of the
    // occurrence being lost forever.
    try {
      const call = await ensureHolyHourCall(target);
      await notifyAllActiveUsers(
        "Incoming call",
        "Holy Hour is starting — tap to join.",
        "MEETING",
        `/dashboard/meeting-room/${call.id}`,
        target,
        [], // every active member, including the Technical Lead
        { call: true, ringMs: CALL_RING_MS }
      );
    } catch (err) {
      console.error("[alarms] holy hour call failed, rolling back claim:", err);
      await prisma.appSetting
        .updateMany({
          where: { id: "global", holyHourLastFiredAt: target },
          data: { holyHourLastFiredAt: before?.holyHourLastFiredAt ?? new Date(0) },
        })
        .catch(() => {});
    }
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

/** Runs every alarm sweep: daily Holy Hour + due event reminders + birthdays. */
export async function runAlarmCheck(now: Date = new Date()): Promise<void> {
  await Promise.all([fireDailyHolyHour(now), fireEventReminders(now), fireBirthdays(now)]);
}

/**
 * Returns the UTC instant of midnight Kampala for the same calendar day
 * that `now` falls on. Used by the birthday claim: the sweep fires once
 * per Kampala day, and the marker `AppSetting.birthdayLastFiredAt` is
 * stored as this same instant so a same-day re-fire is rejected.
 */
function todayKampalaMidnight(now: Date): Date {
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
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - kampalaOffsetMs(now));
}

/**
 * Fires a "🎂 It's <name>'s birthday today" notification to all active
 * members (except the Technical Lead) when someone's birthday lands on
 * the current Kampala date. Idempotent under retries: the
 * `birthdayLastFiredAt` claim uses an `OR[null, lt]` guard so a late
 * same-day re-fire (where the claim timestamp is now `===` today's
 * midnight) is correctly rejected.
 */
export async function fireBirthdays(now: Date = new Date()): Promise<void> {
  // Same preamble as fireDailyHolyHour — make sure the AppSetting row
  // exists before the claim, otherwise the updateMany below fails on a
  // fresh DB.
  await prisma.appSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });

  const todayMidnight = todayKampalaMidnight(now);

  // Find every active member with a birthday, then filter in JS for the
  // (month, day) match. Postgres EXTRACT would work but JS keeps the
  // round-trip cost trivial and the code uniform with the rest of the
  // alarm engine.
  const candidates = await prisma.user.findMany({
    where: { status: "ACTIVE", birthday: { not: null } },
    select: { id: true, fullName: true, birthday: true },
  });
  const birthdayPeople = candidates.filter((u) => {
    if (!u.birthday) return false;
    return (
      u.birthday.getUTCMonth() === todayMidnight.getUTCMonth() &&
      u.birthday.getUTCDate() === todayMidnight.getUTCDate()
    );
  });

  // Atomic claim. The guard is OR[null, lt] so:
  //   - First ever run (birthdayLastFiredAt IS NULL): first branch matches.
  //   - Yesterday's claim (birthdayLastFiredAt < todayMidnight): second branch matches.
  //   - Today's claim already done (birthdayLastFiredAt === todayMidnight): neither
  //     branch matches, count=0, we bail.
  const before = await prisma.appSetting.findUnique({
    where: { id: "global" },
    select: { birthdayLastFiredAt: true },
  });
  const claimed = await prisma.appSetting.updateMany({
    where: {
      id: "global",
      OR: [
        { birthdayLastFiredAt: null },
        { birthdayLastFiredAt: { lt: todayMidnight } },
      ],
    },
    data: { birthdayLastFiredAt: todayMidnight },
  });
  if (claimed.count === 0) return;

  // Even when no one has a birthday today, we've still claimed today —
  // the next sweep on the same day bails, but that's correct (nothing
  // to do).
  if (birthdayPeople.length === 0) return;

  try {
    for (const person of birthdayPeople) {
      await notifyAllActiveUsers(
        `🎂 It's ${person.fullName}'s birthday today`,
        "Wish them a blessed day.",
        "ANNOUNCEMENT",
        "/dashboard/notifications",
        todayMidnight,
        [] // every active member, including the Technical Lead
      );
    }
  } catch (err) {
    // Roll the claim back so a later sweep (next day's run, or a manual
    // re-trigger) can retry instead of treating today as "fired".
    console.error("[alarms] birthday sweep failed, rolling back claim:", err);
    await prisma.appSetting
      .updateMany({
        where: { id: "global", birthdayLastFiredAt: todayMidnight },
        data: { birthdayLastFiredAt: before?.birthdayLastFiredAt ?? new Date(0) },
      })
      .catch(() => {});
  }
}
