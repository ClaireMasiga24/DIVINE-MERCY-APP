import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listConversations } from "@/lib/conversations";
import DiscussionClient from "./discussion-client";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

/**
 * The Discussion section: a member directory (every ACTIVE member except the
 * viewer and the Technical Lead) plus private 1:1 chats. Gated by the
 * Discussion toggle in Settings — when disabled the section is a notice card.
 */
export default async function DiscussionPanel({ user }: { user: User }) {
  const settings = await prisma.appSetting.findUnique({ where: { id: "global" } });

  if (settings?.discussionEnabled === false) {
    return (
      <section className="space-y-4">
        <SectionLabel>DISCUSSION</SectionLabel>
        <div className="rounded-2xl border border-line bg-ivory px-5 py-10 text-center text-sm text-dim shadow-sm">
          Discussion is currently disabled by the parish admin.
        </div>
      </section>
    );
  }

  const [members, initialConversations] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "TECHNICAL_LEAD" }, id: { not: user.id } },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    listConversations(user.id),
  ]);

  return (
    <section className="space-y-4">
      <SectionLabel>DISCUSSION</SectionLabel>
      <DiscussionClient
        user={{ id: user.id }}
        members={members}
        initialConversations={initialConversations.map((c) => ({
          ...c,
          lastMessage: c.lastMessage
            ? { ...c.lastMessage, createdAt: c.lastMessage.createdAt.toISOString() }
            : null,
          lastActivity: c.lastActivity.toISOString(),
        }))}
      />
    </section>
  );
}
