import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

/**
 * The Announcements section. Lists every active announcement, newest first.
 * The body is the parish's official copy. The data is read-only at the
 * app level — announcements are added via the schema's `createdById`
 * relation (admin-only in a future build) or by a future write surface.
 */
export default async function AnnouncementsPanel() {
  const announcements = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { createdBy: { select: { fullName: true } } },
  });

  return (
    <section>
      <SectionLabel>ANNOUNCEMENTS</SectionLabel>
      {announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
          No announcements yet. The parish will post updates here.
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <article
              key={a.id}
              className="overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm"
            >
              {a.imageUrl && (
                <div className="relative aspect-[2/1] w-full bg-ivory-lift">
                  <Image
                    src={a.imageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(min-width: 640px) 48rem, 100vw"
                  />
                </div>
              )}
              <div className="p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-ink">{a.title}</h2>
                  <time className="shrink-0 text-xs text-dim">
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Africa/Kampala",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(a.publishedAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-dim">{a.body}</p>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-dim">
                  <span>
                    {a.createdBy ? `Posted by ${a.createdBy.fullName}` : "Posted by the parish"}
                  </span>
                  {a.sourceUrl && (
                    <Link
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-gold-deep transition hover:underline"
                    >
                      Source ↗
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}