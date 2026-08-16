import { NextResponse } from "next/server";
import { runMeetingCheck } from "@/lib/meeting-reminders";

/**
 * External-cron entry point for the meeting reminder sweep.
 *
 * This is a separate path from the daily Holy Hour alarm cron
 * (/api/cron/alarms) — meetings carry their own start time and reminder
 * offset, and each meeting is claimed with its own `notified` flag.
 *
 * Guards: the request must carry the CRON_SECRET either as an
 * Authorization: Bearer header (cron-job.org, UptimeRobot) or as a
 * ?token= query param (Vercel cron sends GET with no headers).
 *
 * Example (cron-job.org, every minute):
 *   POST https://your-app/api/cron/meetings
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Example (Vercel cron):
 *   GET https://your-app/api/cron/meetings?token=<CRON_SECRET>
 */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured. Add it to your .env file." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const authHeader = req.headers.get("authorization");
  const authorized = queryToken === secret || authHeader === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await runMeetingCheck();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
