import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";

const ALLOWED_ADD_ROLES = new Set<string>(MEMBER_ADD_ROLES);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_ADD_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow managing members." },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  let body: { role?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const role = typeof body.role === "string" ? body.role : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;

  if (role !== undefined && !(Object.values(Role) as string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (status !== undefined && !(Object.values(Status) as string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if (role === undefined && status === undefined) {
    return NextResponse.json(
      { error: "Provide a role and/or status to update." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // The Technical Lead's account is invisible to other account managers: they
  // can neither edit the Technical Lead's account nor promote anyone to that role.
  if (sessionUser.role !== "TECHNICAL_LEAD" && (target.role === "TECHNICAL_LEAD" || role === "TECHNICAL_LEAD")) {
    return NextResponse.json(
      { error: "Only the Technical Lead can manage the Technical Lead role." },
      { status: 403 }
    );
  }

  const isSelf = target.id === sessionUser.id;
  if (isSelf && (role !== undefined || status === "DEACTIVATED")) {
    return NextResponse.json(
      { error: "You can't change your own role or deactivate your own account." },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined ? { role: role as Role } : {}),
      ...(status !== undefined ? { status: status as Status } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, role: user.role, status: user.status },
  });
}
