import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";

/**
 * Diagnostics for parish leadership: how many active members have a
 * working push subscription, broken down by role. Useful for chasing
 * down the "the Holy Hour didn't ring on my phone" report — if a
 * member isn't in the opted-in list, that's the why.
 *
 * Gated to MEMBER_ADD_ROLES (CHAIRPERSON, PATRON, TECHNICAL_LEAD) so
 * the data isn't exposed to ordinary members. Memberships are checked
 * on a server-side set, not a client-supplied claim.
 */
const ALLOWED_ROLES = new Set<string>(MEMBER_ADD_ROLES);

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(sessionUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [activeMembers, tokens, byRole, vapidConfigured] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.deviceToken.findMany({
      where: { platform: "web", p256dh: { not: null }, authKey: { not: null } },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        user: { select: { fullName: true, phoneNumber: true, role: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    Promise.resolve(
      Boolean(
        process.env.VAPID_PUBLIC_KEY &&
          process.env.VAPID_PRIVATE_KEY &&
          process.env.VAPID_SUBJECT
      )
    ),
  ]);

  // One device per user — a member with two browsers/subscriptions shows
  // up once. We keep the most recently created token.
  const seen = new Set<string>();
  const deduped = tokens.filter((t) => {
    if (seen.has(t.userId)) return false;
    seen.add(t.userId);
    return true;
  });

  return NextResponse.json({
    vapidConfigured,
    activeMembers,
    optedIn: deduped.length,
    coveragePct: activeMembers === 0 ? 0 : Math.round((deduped.length / activeMembers) * 100),
    byRole: byRole.map((r) => ({ role: r.role, count: r._count._all })),
    recent: deduped.slice(0, 25).map((t) => ({
      fullName: t.user.fullName,
      phoneNumber: t.user.phoneNumber,
      role: t.user.role,
      status: t.user.status,
      since: t.createdAt,
    })),
  });
}
