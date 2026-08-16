import { prisma } from "@/lib/prisma";

/**
 * Shared helpers for the Discussion section's private 1:1 chats. Used by the
 * conversation API routes and the DiscussionPanel server component so the
 * conversation list logic lives in one place.
 */

/** Deterministic key for a 1:1 conversation: the two participant ids, sorted. */
export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/**
 * Whether the Discussion section is turned on. The AppSetting row may not
 * exist yet — the model default is enabled, so a missing row means enabled.
 */
export async function isDiscussionEnabled(): Promise<boolean> {
  const settings = await prisma.appSetting.findUnique({ where: { id: "global" } });
  return settings?.discussionEnabled ?? true;
}

export type ConversationSummary = {
  id: string;
  other: { id: string; fullName: string };
  lastMessage: { body: string; senderId: string; createdAt: Date } | null;
  unreadCount: number;
  lastActivity: Date;
};

/**
 * The viewer's conversation list: each thread with the other participant, the
 * last message (for the preview and the sort key), and the number of unread
 * messages since the viewer's read cursor. Dates are returned as Date objects —
 * JSON.stringify serializes them to ISO strings for API responses.
 */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const myParticipants = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });
  const lastRead = new Map(myParticipants.map((p) => [p.conversationId, p.lastReadAt]));

  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: { id: true, fullName: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 50,
  });

  const unreadCounts = await Promise.all(
    conversations.map((c) =>
      prisma.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: userId },
          createdAt: { gt: lastRead.get(c.id) ?? new Date(0) },
        },
      })
    )
  );

  return conversations
    .map((c, i) => {
      const lastMessage = c.messages[0] ?? null;
      return {
        id: c.id,
        other: c.participants.find((p) => p.userId !== userId)?.user ?? c.participants[0].user,
        lastMessage: lastMessage
          ? { body: lastMessage.body, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt }
          : null,
        unreadCount: unreadCounts[i],
        lastActivity: lastMessage?.createdAt ?? c.createdAt,
      };
    })
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}

/**
 * Loads a conversation with its participants if (and only if) the given user
 * is a participant. Returns null otherwise, so callers can 404.
 */
export async function getConversationForUser(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });
  if (!conversation) return null;
  if (!conversation.participants.some((p) => p.userId === userId)) return null;
  return conversation;
}
