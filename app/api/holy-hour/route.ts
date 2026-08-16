import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNextHolyHourUtc, HOLY_HOUR_TIMES } from "@/lib/alarms";

/**
 * The Holy Hour alarm is inbuilt and always on — there is nothing to
 * configure. This endpoint exists so clients can display the schedule and the
 * next occurrence.
 */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const next = getNextHolyHourUtc();

  return NextResponse.json({
    times: [...HOLY_HOUR_TIMES],
    nextOccurrence: next.toISOString(),
    nextOccurrenceLabel: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Kampala",
      weekday: "long",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(next),
  });
}
