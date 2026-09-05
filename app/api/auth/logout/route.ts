import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, revokeSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Logout. Marks the Session row revoked and clears both cookies.
 *
 * Revocation is immediate — the cookie value is now useless even if
 * someone copied it. The row itself is preserved (soft-delete via
 * `revokedAt`) for audit; the alarm sweep's pruneExpiredSessions()
 * cleans it up.
 */
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await revokeSession(sessionId);
  }

  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(SESSION_COOKIE, "", cookieOptions);
  response.cookies.set(DEVICE_COOKIE, "", cookieOptions);
  return response;
}
