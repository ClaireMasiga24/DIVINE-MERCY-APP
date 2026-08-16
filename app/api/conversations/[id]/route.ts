import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getConversationForUser, isDiscussionEnabled } from "@/lib/conversations";

const MAX_MESSAGE_LENGTH = 2000;

type RouteContext = { params: Promise<{ id: string }> };

/** Latest 100 messages of a thread, oldest first. Pure — never mutates state. */
export async function GET(_req: Request, ctx: RouteContext) {
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

  const other = conversation.participants.find((p) => p.userId !== sessionUser.id);
  const latest = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    conversation: {
      id,
      other: other ? { id: other.user.id, fullName: other.user.fullName } : null,
    },
    messages: latest
      .reverse()
      .map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt })),
  });
}

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

  let body: { body?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (${MAX_MESSAGE_LENGTH} characters max).` },
      { status: 400 }
    );
  }

  const message = await prisma.message.create({
    data: { conversationId: id, senderId: sessionUser.id, body: text },
  });

  return NextResponse.json(
    { message: { id: message.id, senderId: message.senderId, body: message.body, createdAt: message.createdAt } },
    { status: 201 }
  );
}
