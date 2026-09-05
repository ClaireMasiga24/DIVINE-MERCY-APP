import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * DB-backed, device-bound session model.
 *
 * Cookie shape:
 *   - `dm_session` (httpOnly, secure in prod, sameSite=lax, path=/, 30 days)
 *       opaque UUIDv4 pointing at a Session row.
 *   - `dm_device`  (same flags, 1 year)
 *       random UUID generated on first visit. Pinned to the device,
 *       never the user. Every protected request verifies the Session
 *       row's `deviceId` matches this cookie.
 *
 * Why both:
 *   The sessionId alone isn't enough — it proves the request holds a
 *   valid session token, but a token copied to another browser would
 *   still work. Adding the deviceId match makes the cookie useless on
 *   any device other than the one that minted it.
 *
 * Why a DB row instead of a JWT:
 *   - Revocation is instant (logout sets `revokedAt`).
 *   - The cookie carries an opaque token, not a signed claim set —
 *     nothing to forge.
 *   - Audit: who logged in when, from what device, what UA.
 *
 * Same phone on a second device = a SECOND session row. The first
 * device stays logged in. Two devices, two rows. Logout revokes only
 * the row whose sessionId is in the cookie.
 */

export const SESSION_COOKIE = "dm_session";
export const DEVICE_COOKIE = "dm_device";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export const MEMBER_ADD_ROLES = ["CHAIRPERSON", "PATRON", "TECHNICAL_LEAD"] as const;
export const EVENT_MANAGE_ROLES = ["CHAIRPERSON", "PATRON"] as const;

/**
 * Creates a Session row for a freshly-signed-in user. Returns the
 * opaque sessionId that becomes the `dm_session` cookie value.
 *
 * Caller is responsible for setting both `dm_session` (this id) and
 * `dm_device` (the `deviceId` arg, minted by the caller if needed).
 */
export async function issueSession(
  userId: string,
  phoneNumber: string,
  deviceId: string,
  userAgent: string | null
): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: {
      id,
      userId,
      phoneNumber,
      deviceId,
      userAgent,
      expiresAt,
    },
  });
  return id;
}

/**
 * Marks a session revoked. Idempotent — calling on an already-revoked
 * row is fine. No-op if the sessionId doesn't exist (already cleaned up).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Row already gone or never existed — nothing to do.
  }
}

/**
 * Deletes expired and revoked sessions. Cheap; safe to call frequently.
 * Piggybacked on the alarm sweep (lib/alarms.ts).
 */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { not: null } },
        { expiresAt: { lt: new Date() } },
      ],
    },
  });
}

/**
 * Loads the authenticated user, or null when:
 *   - the `dm_session` cookie is missing
 *   - the cookie points at a row that doesn't exist
 *   - the row is revoked or expired
 *   - the row's `deviceId` doesn't match the `dm_device` cookie
 *     (the session token was copied to another device)
 *   - the linked user no longer exists or is no longer ACTIVE
 *
 * On every null return path, deletes both cookies so the browser stops
 * sending them — a stale cookie should not keep costing a DB hit per
 * request until expiry.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;

  if (!sessionId || !deviceId) {
    // Clean up whatever's there so we don't keep missing.
    if (sessionId) cookieStore.delete(SESSION_COOKIE);
    if (deviceId) cookieStore.delete(DEVICE_COOKIE);
    return null;
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  if (session.revokedAt !== null) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  if (session.deviceId !== deviceId) {
    // The session token was copied to another device. Revoke + clean.
    await revokeSession(sessionId);
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  // 60s debounce on lastSeenAt — every-request writes would hammer the
  // DB on the dashboard layout's per-render call.
  const now = new Date();
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: now },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") {
    await revokeSession(sessionId);
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return user;
}
