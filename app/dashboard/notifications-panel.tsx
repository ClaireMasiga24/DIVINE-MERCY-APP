import type { User } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import MarkAllReadButton from "./mark-all-read-button";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

const TYPE_ICONS: Record<string, string> = {
  MEETING:
    "M16 3h5v5M4 20 21 3M21 3l-5.5 5.5M21 3l-5.5 5.5M4 20l5.5-5.5M4 20l5.5-5.5",
  PRAYER: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  EVENT: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ANNOUNCEMENT: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
};

function TypeIcon({ type }: { type: string }) {
  const d = TYPE_ICONS[type] ?? TYPE_ICONS.PRAYER;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The Notifications section: the viewer's notification feed (deliveries joined
 * with their notifications), newest first, with unread markers and a
 * mark-all-read action. Meeting invites and reminders appear here automatically
 * via NotificationDelivery.
 */
export default async function NotificationsPanel({ user }: { user: User }) {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { userId: user.id },
    include: {
      notification: {
        select: { title: true, body: true, type: true, link: true, createdAt: true },
      },
    },
    orderBy: { deliveredAt: "desc" },
    take: 50,
  });

  const unread = deliveries.filter((d) => d.readAt === null).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>
          {unread > 0 ? `NOTIFICATIONS · ${unread} NEW` : "NOTIFICATIONS"}
        </SectionLabel>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      {deliveries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-12 text-center text-sm text-dim">
          No notifications yet. Meeting invites and prayer alarms will appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => {
            const unreadItem = d.readAt === null;
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-2xl border bg-ivory p-4 shadow-sm transition hover:shadow-md ${
                  unreadItem ? "border-gold/40" : "border-line"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    unreadItem ? "bg-gold/15 text-gold-deep" : "bg-ivory-lift text-dim"
                  }`}
                >
                  <TypeIcon type={d.notification.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {unreadItem && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                    <h3
                      className={`truncate text-sm ${
                        unreadItem ? "font-semibold text-ink" : "font-medium text-ink/80"
                      }`}
                    >
                      {d.notification.title}
                    </h3>
                  </div>
                  {d.notification.body && (
                    <p className="mt-0.5 text-sm text-dim">{d.notification.body}</p>
                  )}
                  <p className="mt-1.5 text-[11px] uppercase tracking-wider text-dim/70">
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Africa/Kampala",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(d.notification.createdAt)}
                  </p>
                </div>
              </div>
            );
            return d.notification.link ? (
              <Link key={d.id} href={d.notification.link} className="block">
                {inner}
              </Link>
            ) : (
              <div key={d.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
