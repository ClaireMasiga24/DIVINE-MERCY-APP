import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

const ALLOWED_ADD_ROLES = new Set<string>(MEMBER_ADD_ROLES);

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_ADD_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow adding members." },
      { status: 403 }
    );
  }

  let body: { phoneNumber?: unknown; fullName?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const phoneNumber = normalizePhone(typeof body.phoneNumber === "string" ? body.phoneNumber : "");
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";

  if (!phoneNumber) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!(Object.values(Role) as string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (role === "TECHNICAL_LEAD" && sessionUser.role !== "TECHNICAL_LEAD") {
    return NextResponse.json(
      { error: "Only the Technical Lead can assign that role." },
      { status: 403 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { phoneNumber } });
  if (existing) {
    return NextResponse.json(
      { error: "A member with this number already exists." },
      { status: 409 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        phoneNumber,
        fullName,
        role: role as Role,
        status: "ACTIVE",
        addedById: sessionUser.id,
      },
    });
    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, role: user.role, status: user.status },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "A member with this number already exists." },
        { status: 409 }
      );
    }
    throw e;
  }
}
