import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

const ALLOWED_ADD_ROLES = new Set<string>(MEMBER_ADD_ROLES);

/**
 * Same lenient YYYY-MM-DD parse as `app/api/members/add/route.ts`. Empty
 * string clears the birthday. Anything else that's non-null/non-string
 * is rejected by the caller before this runs.
 */
function parseBirthday(input: unknown): Date | null {
  if (input === null) return null;
  if (typeof input !== "string") return new Date(NaN);
  if (input.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(NaN);
  const d = new Date(input + "T00:00:00Z");
  return d;
}

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

  let body: {
    role?: unknown;
    status?: unknown;
    fullName?: unknown;
    phoneNumber?: unknown;
    birthday?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const role = typeof body.role === "string" ? body.role : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;
  // Only treat fullName/phoneNumber/birthday as "present" if the key was
  // sent in the JSON. `undefined` means "leave alone", an empty string
  // means "clear" (for birthday) or "invalid" (for fullName/phone).
  const fullNameRaw = body.fullName;
  const phoneRaw = body.phoneNumber;
  const birthdayRaw = body.birthday;

  const data: {
    role?: Role;
    status?: Status;
    fullName?: string;
    phoneNumber?: string;
    birthday?: Date | null;
  } = {};

  if (role !== undefined) {
    if (!(Object.values(Role) as string[]).includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    data.role = role as Role;
  }
  if (status !== undefined) {
    if (!(Object.values(Status) as string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = status as Status;
  }
  if (fullNameRaw !== undefined) {
    if (typeof fullNameRaw !== "string" || fullNameRaw.trim().length === 0) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }
    if (fullNameRaw.trim().length > 120) {
      return NextResponse.json({ error: "Full name is too long." }, { status: 400 });
    }
    data.fullName = fullNameRaw.trim();
  }
  if (phoneRaw !== undefined) {
    if (typeof phoneRaw !== "string") {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }
    data.phoneNumber = phone;
  }
  if (birthdayRaw !== undefined) {
    const parsed = parseBirthday(birthdayRaw);
    if (parsed === null || Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Birthday must be a YYYY-MM-DD date, or empty to clear." },
        { status: 400 }
      );
    }
    data.birthday = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one field to update." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // The Technical Lead's account is invisible to other account managers: they
  // can neither edit the Technical Lead's account nor promote anyone to that role.
  if (sessionUser.role !== "TECHNICAL_LEAD" && (target.role === "TECHNICAL_LEAD" || data.role === "TECHNICAL_LEAD")) {
    return NextResponse.json(
      { error: "Only the Technical Lead can manage the Technical Lead role." },
      { status: 403 }
    );
  }

  const isSelf = target.id === sessionUser.id;
  if (isSelf && (data.role !== undefined || data.status === "DEACTIVATED")) {
    return NextResponse.json(
      { error: "You can't change your own role or deactivate your own account." },
      { status: 400 }
    );
  }

  // Phone uniqueness: if the phone is being changed to one that already
  // belongs to another user, surface the same 409 the add endpoint does.
  if (data.phoneNumber && data.phoneNumber !== target.phoneNumber) {
    const existing = await prisma.user.findUnique({ where: { phoneNumber: data.phoneNumber } });
    if (existing && existing.id !== target.id) {
      return NextResponse.json(
        { error: "A member with this number already exists." },
        { status: 409 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      birthday: user.birthday?.toISOString() ?? null,
    },
  });
}

/**
 * Hard-delete a member. Gated by the same `MEMBER_ADD_ROLES` as add and
 * edit (Chairperson, Patron, Technical Lead). The Technical Lead's own
 * account is invisible to the other two — same guard as PATCH above.
 * Self-delete is blocked to prevent an account manager from accidentally
 * removing themselves.
 *
 * Cascades through Post, Comment, MeetingParticipant, MeetingSession,
 * NotificationDelivery, DeviceToken, ConversationParticipant, Message,
 * and the rest of the schema's `onDelete: Cascade` FKs. Destructive and
 * irreversible — confirmed in the UI by a `confirm()` dialog.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_ADD_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow deleting members." },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // The Technical Lead's account is invisible to other account managers.
  if (sessionUser.role !== "TECHNICAL_LEAD" && target.role === "TECHNICAL_LEAD") {
    return NextResponse.json(
      { error: "Only the Technical Lead can delete the Technical Lead." },
      { status: 403 }
    );
  }

  if (target.id === sessionUser.id) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
