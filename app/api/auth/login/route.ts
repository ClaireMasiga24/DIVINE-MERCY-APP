import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import {
  DEVICE_COOKIE,
  DEVICE_TTL_SECONDS,
  issueSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";

/**
 * Phone-number login (no OTP step): the number must already exist in the
 * register and the account must be ACTIVE, then a session is issued.
 *
 * On success sets two cookies:
 *   - `dm_device`  — random UUID, pinned to this device/browser, 1y.
 *                    Minted on first visit; reused on subsequent visits.
 *   - `dm_session` — opaque Session-row id, 30 days.
 *
 * Both are httpOnly + (secure in prod) + sameSite=lax. The session is
 * device-bound — the row stores the deviceId and `getSessionUser`
 * verifies it matches on every request.
 */
export async function POST(req: Request) {
  let body: { phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "This number isn't registered. Contact parish leadership." },
      { status: 403 }
    );
  }

  // Read the deviceId cookie from the incoming request. If absent, mint
  // a new one — this is the device-binding anchor that makes the
  // session cookie useless if copied to another browser.
  const incomingDeviceId = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${DEVICE_COOKIE}=`))
    ?.slice(DEVICE_COOKIE.length + 1) ?? null;
  const deviceId = incomingDeviceId ?? randomUUID();
  const userAgent = req.headers.get("user-agent");

  const sessionId = await issueSession(user.id, user.phoneNumber, deviceId, userAgent);

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, fullName: user.fullName, role: user.role, phoneNumber: user.phoneNumber },
  });
  // Same flags as before; path=/ so every page sees them.
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  response.cookies.set(SESSION_COOKIE, sessionId, {
    ...cookieOptions,
    maxAge: SESSION_TTL_SECONDS,
  });
  response.cookies.set(DEVICE_COOKIE, deviceId, {
    ...cookieOptions,
    maxAge: DEVICE_TTL_SECONDS,
  });
  return response;
}
