import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, EVENT_MANAGE_ROLES } from "@/lib/auth";

const ALLOWED_MANAGE_ROLES = new Set<string>(EVENT_MANAGE_ROLES);

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_MANAGE_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow deleting events." },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  try {
    await prisma.event.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
