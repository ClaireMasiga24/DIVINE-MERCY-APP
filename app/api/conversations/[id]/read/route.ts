import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getConversationForUser, isDiscussionEnabled } from "@/lib/conversations";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Marks a thread as read up to the given message. The client passes the last
 * message it actually fetched, so a message that arrives between the GET and
 * this call isn't marked read unseen.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!(await isDiscussionEnabled())) {
    return NextResponse.json({ error: "Discussion is disabled." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const conversation = await getConversationForUser(id, sessionUser.id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  let body: { lastMessageCreatedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cursor = typeof body.lastMessageCreatedAt === "string" ? new Date(body.lastMessageCreatedAt) : null;

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: sessionUser.id } },
    data: { lastReadAt: cursor ?? new Date() },
  });

  return NextResponse.json({ ok: true });
}
