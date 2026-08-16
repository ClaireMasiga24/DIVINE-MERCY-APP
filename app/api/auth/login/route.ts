import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth";

/**
 * Phone-number login (no OTP step): the number must already exist in the
 * register and the account must be ACTIVE, then a session is issued directly.
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

  const token = await signSession({
    id: user.id,
    role: user.role,
    phoneNumber: user.phoneNumber,
  });

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, fullName: user.fullName, role: user.role, phoneNumber: user.phoneNumber },
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
