import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { roleSlug } from "@/lib/roles";

/**
 * Read-only auth probe used by the splash screen (`/`). Returns the
 * viewer's role slug if the session cookie is valid, or 401 otherwise.
 *
 * Cheap on purpose: one Prisma user lookup (which is already indexed
 * on the session-validated `id`). No side effects.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    role: roleSlug(user.role),
  });
}