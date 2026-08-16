import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/** Unread notification count for the top-bar bell badge. */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const count = await prisma.notificationDelivery.count({
    where: { userId: sessionUser.id, readAt: null },
  });

  return NextResponse.json({ count });
}
