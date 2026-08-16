import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";

const ALLOWED_ADD_ROLES = new Set<string>(MEMBER_ADD_ROLES);

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!ALLOWED_ADD_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Your role doesn't allow managing system settings." },
      { status: 403 }
    );
  }

  let body: { discussionEnabled?: unknown; commentsEnabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const discussionEnabled = body.discussionEnabled;
  const commentsEnabled = body.commentsEnabled;

  if (
    (discussionEnabled !== undefined && typeof discussionEnabled !== "boolean") ||
    (commentsEnabled !== undefined && typeof commentsEnabled !== "boolean")
  ) {
    return NextResponse.json({ error: "Invalid setting value." }, { status: 400 });
  }
  if (discussionEnabled === undefined && commentsEnabled === undefined) {
    return NextResponse.json(
      { error: "Provide at least one setting to update." },
      { status: 400 }
    );
  }

  const settings = await prisma.appSetting.upsert({
    where: { id: "global" },
    update: {
      ...(discussionEnabled !== undefined ? { discussionEnabled } : {}),
      ...(commentsEnabled !== undefined ? { commentsEnabled } : {}),
      updatedById: sessionUser.id,
    },
    create: {
      id: "global",
      discussionEnabled: discussionEnabled ?? true,
      commentsEnabled: commentsEnabled ?? true,
      updatedById: sessionUser.id,
    },
  });

  return NextResponse.json({
    ok: true,
    settings: { discussionEnabled: settings.discussionEnabled, commentsEnabled: settings.commentsEnabled },
  });
}
