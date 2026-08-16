import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/**
 * The notification center. GET lists the viewer's notifications (deliveries
 * joined with the notification itself) plus the unread count; POST marks
 * individual deliveries or all of them as read.
 */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [deliveries, unread] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where: { userId: sessionUser.id },
      include: {
        notification: {
          select: { id: true, title: true, body: true, type: true, link: true, createdAt: true },
        },
      },
      orderBy: { deliveredAt: "desc" },
      take: 50,
    }),
    prisma.notificationDelivery.count({ where: { userId: sessionUser.id, readAt: null } }),
  ]);

  return NextResponse.json({
    unread,
    notifications: deliveries.map((d) => ({
      deliveryId: d.id,
      readAt: d.readAt,
      title: d.notification.title,
      body: d.notification.body,
      type: d.notification.type,
      link: d.notification.link,
      createdAt: d.notification.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { deliveryIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const where =
    Array.isArray(body.deliveryIds) && body.deliveryIds.length > 0
      ? {
          userId: sessionUser.id,
          id: { in: body.deliveryIds.filter((x): x is string => typeof x === "string") },
          readAt: null,
        }
      : { userId: sessionUser.id, readAt: null };

  await prisma.notificationDelivery.updateMany({ where, data: { readAt: new Date() } });

  return NextResponse.json({ ok: true });
}
