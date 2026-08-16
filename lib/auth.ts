import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "dm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const MEMBER_ADD_ROLES = ["CHAIRPERSON", "PATRON", "TECHNICAL_LEAD"] as const;
export const EVENT_MANAGE_ROLES = ["CHAIRPERSON", "PATRON"] as const;

export type SessionPayload = {
  userId: string;
  role: string;
  phoneNumber: string;
};

function secretKey(): Uint8Array {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Add it to your .env file.");
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export async function signSession(user: Pick<User, "id" | "role" | "phoneNumber">): Promise<string> {
  return new SignJWT({ userId: user.id, role: user.role, phoneNumber: user.phoneNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Loads the authenticated user from the session cookie, or null when the
 * session is missing, invalid, or the account is no longer ACTIVE.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload?.userId) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}
