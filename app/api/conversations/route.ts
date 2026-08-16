import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { conversationKey, isDiscussionEnabled, listConversations } from "@/lib/conversations";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!(await isDiscussionEnabled())) {
    return NextResponse.json({ error: "Discussion is disabled." }, { status: 403 });
  }

  const conversations = await listConversations(sessionUser.id);
  return NextResponse.json({ conversations });
}

/**
 * Start (or resume) a 1:1 conversation with another member. Find-or-create by
 * conversationKey keeps this race-proof — a P2002 just means the other side
 * won the race, so we re-read their thread.
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!(await isDiscussionEnabled())) {
    return NextResponse.json({ error: "Discussion is disabled." }, { status: 403 });
  }

  let body: { otherUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { otherUserId } = body;
  if (typeof otherUserId !== "string" || otherUserId.length === 0) {
    return NextResponse.json({ error: "Choose a member to message." }, { status: 400 });
  }
  if (otherUserId === sessionUser.id) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
  }

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other || other.status !== "ACTIVE" || other.role === "TECHNICAL_LEAD") {
    return NextResponse.json({ error: "That member isn't available." }, { status: 404 });
  }

  const key = conversationKey(sessionUser.id, otherUserId);
  const existing = await prisma.conversation.findUnique({ where: { conversationKey: key } });
  if (existing) {
    return NextResponse.json({
      conversation: { id: existing.id, other: { id: other.id, fullName: other.fullName } },
    });
  }

  try {
    const created = await prisma.conversation.create({
      data: {
        conversationKey: key,
        participants: {
          create: [{ userId: sessionUser.id }, { userId: otherUserId }],
        },
      },
    });
    return NextResponse.json(
      { conversation: { id: created.id, other: { id: other.id, fullName: other.fullName } } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.conversation.findUnique({ where: { conversationKey: key } });
      if (winner) {
        return NextResponse.json({
          conversation: { id: winner.id, other: { id: other.id, fullName: other.fullName } },
        });
      }
    }
    throw err;
  }
}
