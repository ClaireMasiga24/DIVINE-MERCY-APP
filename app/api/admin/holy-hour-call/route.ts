import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import {
  CALL_RING_MS,
  HOLY_HOUR_CALL_BODY,
  HOLY_HOUR_CALL_MAX_ATTEMPTS,
  HOLY_HOUR_CALL_TITLE,
  ensureHolyHourCall,
  getCurrentHolyHourTarget,
  holyHourCallStatus,
  sendPushToUser,
} from "@/lib/alarms";

/**
 * Manual Holy Hour call trigger + delivery report.
 *
 * Exists because the Holy Hour ring is otherwise only reachable by waiting
 * for the real scheduled time. This lets leadership (or a terminal, using
 * CRON_SECRET) place the call immediately and see exactly which devices
 * accepted it.
 *
 * Authorisation is either:
 *   - `Authorization: Bearer <CRON_SECRET>` or `?token=<CRON_SECRET>`, so it
 *     can be driven from a shell or a scheduler; or
 *   - a signed-in session for CHAIRPERSON, PATRON or TECHNICAL_LEAD.
 *
 * POST body (exactly one of):
 *   { "to": "+2567XXXXXXXX" }  ring one member, identified by phone number
 *   { "all": true }            ring every active member
 *
 * Deliberately does NOT touch AppSetting.holyHourLastFiredAt, so running a
 * test can never consume or suppress the real scheduled occurrence. It does
 * create the call room if one doesn't exist (reusing the current occurrence's
 * room when we're inside a ring window, otherwise a room starting now), which
 * is what makes the "Accept" button lead somewhere real.
 */

const ALLOWED_ROLES = new Set<string>(MEMBER_ADD_ROLES);

async function authorize(req: Request): Promise<
  { ok: true; actor: string } | { ok: false; response: Response }
> {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const viaSecret =
    Boolean(secret) &&
    (url.searchParams.get("token") === secret ||
      req.headers.get("authorization") === `Bearer ${secret}`);

  if (viaSecret) return { ok: true, actor: "CRON_SECRET" };

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  if (!ALLOWED_ROLES.has(sessionUser.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden. Chairperson, Patron or Technical Lead only." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, actor: `${sessionUser.fullName} (${sessionUser.role})` };
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: { to?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const all = body.all === true;

  if (!to && !all) {
    return NextResponse.json(
      {
        error:
          'Pass either { "to": "+2567XXXXXXXX" } to ring one member, or { "all": true } to ring every active member.',
      },
      { status: 400 }
    );
  }

  // Resolve the members to ring.
  type Target = { id: string; fullName: string; phoneNumber: string };
  let targets: Target[];

  if (to) {
    const normalized = normalizePhone(to);
    if (!normalized) {
      return NextResponse.json(
        { error: `"${to}" isn't a valid Ugandan phone number.` },
        { status: 400 }
      );
    }
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalized },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: `No member with phone number ${normalized}.` },
        { status: 404 }
      );
    }
    targets = [user];
  } else {
    targets = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, phoneNumber: true },
      orderBy: { fullName: "asc" },
    });
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: "No active members to ring." }, { status: 404 });
  }

  // Create (or reuse) the call room, then ring.
  const callAt = getCurrentHolyHourTarget();
  const call = await ensureHolyHourCall(callAt);
  const link = `/dashboard/meeting-room/${call.id}`;

  const rows = await Promise.all(
    targets.map(async (t) => {
      const r = await sendPushToUser(t.id, HOLY_HOUR_CALL_TITLE, HOLY_HOUR_CALL_BODY, link, {
        call: true,
        ringMs: CALL_RING_MS,
      });
      return {
        fullName: t.fullName,
        phoneNumber: t.phoneNumber,
        status: holyHourCallStatus(r),
        devices: r.tokens,
        delivered: r.delivered,
        failed: r.failed,
        error: r.lastError ?? null,
      };
    })
  );

  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    callAt: callAt.toISOString(),
    meetingId: call.id,
    joinLink: link,
    retry: {
      maxAttempts: HOLY_HOUR_CALL_MAX_ATTEMPTS,
      note: "FAILED rows are retried automatically by the alarm sweep while the room is still current.",
    },
    summary: {
      rung: rows.length,
      delivered: count("DELIVERED"),
      noSubscription: count("NO_SUBSCRIPTION"),
      failed: count("FAILED"),
    },
    results: rows,
  });
}

/**
 * Delivery report: the outcome of the most recent Holy Hour call, one row
 * per member. This is the "failures are visible, not silent" surface — the
 * old code discarded every push result.
 */
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  const meeting = await prisma.meeting.findFirst({
    where: { isAuto: true },
    orderBy: { startsAt: "desc" },
    select: { id: true, startsAt: true, title: true, endedAt: true },
  });

  if (!meeting) {
    return NextResponse.json({ meeting: null, summary: null, results: [] });
  }

  const logs = await prisma.holyHourCallLog.findMany({
    where: { meetingId: meeting.id },
    select: {
      status: true,
      attempts: true,
      delivered: true,
      failures: true,
      lastAttemptAt: true,
      lastError: true,
      user: { select: { fullName: true, phoneNumber: true, role: true, status: true } },
    },
    orderBy: [{ status: "asc" }, { user: { fullName: "asc" } }],
  });

  const count = (s: string) => logs.filter((l) => l.status === s).length;

  return NextResponse.json({
    meeting,
    retryPolicy: { maxAttempts: HOLY_HOUR_CALL_MAX_ATTEMPTS },
    summary: {
      logged: logs.length,
      delivered: count("DELIVERED"),
      noSubscription: count("NO_SUBSCRIPTION"),
      failed: count("FAILED"),
      pending: count("PENDING"),
    },
    results: logs.map((l) => ({
      fullName: l.user.fullName,
      phoneNumber: l.user.phoneNumber,
      role: l.user.role,
      accountStatus: l.user.status,
      status: l.status,
      attempts: l.attempts,
      delivered: l.delivered,
      failures: l.failures,
      lastAttemptAt: l.lastAttemptAt,
      error: l.lastError,
    })),
  });
}
