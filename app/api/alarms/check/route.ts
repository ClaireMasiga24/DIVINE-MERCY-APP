import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { runAlarmCheck } from "@/lib/alarms";

/**
 * Polled by the in-app alarm listener. Runs the sweep (idempotent, so Holy
 * Hour calls and event reminders each fire at most once), then returns this
 * user's alarms from the last few minutes so the client can ring the incoming
 * call / banner.
 */
export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Safe to run on every poll: occurrences and reminders are claimed
  // atomically, so nothing fires twice.
  await runAlarmCheck().catch((err) => {
    console.error("[alarms] opportunistic sweep failed:", err);
  });

  const recent = await prisma.notificationDelivery.findMany({
    where: {
      userId: sessionUser.id,
      deliveredAt: { gte: new Date(Date.now() - 3 * 60 * 1000) },
      notification: { type: { in: ["EVENT", "PRAYER", "MEETING"] } },
    },
    include: {
      notification: { select: { id: true, title: true, body: true, link: true, type: true } },
    },
    orderBy: { deliveredAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    alarms: recent.map((d) => ({
      deliveryId: d.id,
      notificationId: d.notification.id,
      title: d.notification.title,
      body: d.notification.body,
      link: d.notification.link,
      type: d.notification.type,
    })),
  });
}
