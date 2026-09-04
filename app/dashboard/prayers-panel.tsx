import Link from "next/link";
import { prisma } from "@/lib/prisma";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  NOVENA: "Novena",
  CHAPLET: "Chaplet",
  ROSARY: "Rosary",
  OTHER: "Other",
};

const TYPE_GOLD_BG: Record<string, string> = {
  NOVENA: "from-[#7B5D27] to-[#5E4319]",
  CHAPLET: "from-[#5D2A6B] to-[#3F1A4B]",
  ROSARY: "from-[#1F4F2E] to-[#13321D]",
  OTHER: "from-[#2C2C2C] to-[#161616]",
};

/**
 * The Prayer Resources section. Lists every active PrayerResource (novena,
 * chaplet, rosary, etc.) grouped by type. The data is read-only at the
 * app level — the parish seeds these via a migration. Members browse,
 * read the content, and (when sourceUrl is set) jump to the official
 * Divine Mercy website for the full text.
 */
export default async function PrayersPanel() {
  const resources = await prisma.prayerResource.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { dayNumber: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      dayNumber: true,
      content: true,
      sourceUrl: true,
      imageUrl: true,
    },
  });

  // Group by type for the sectioned layout.
  const byType = new Map<string, typeof resources>();
  for (const r of resources) {
    const list = byType.get(r.type) ?? [];
    list.push(r);
    byType.set(r.type, list);
  }
  const typeOrder = ["NOVENA", "CHAPLET", "ROSARY", "OTHER"] as const;
  const grouped = typeOrder
    .map((t) => ({ type: t, items: byType.get(t) ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <section>
      <SectionLabel>PRAYER RESOURCES</SectionLabel>
      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
          No prayer resources have been added yet. Check back soon — the parish
          is preparing a Novena, Chaplet, and Rosary collection.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.type}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-deep">
                {TYPE_LABEL[g.type] ?? g.type}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((r) => (
                  <article
                    key={r.id}
                    className="overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm transition hover:shadow-md"
                  >
                    <div
                      className={`bg-gradient-to-br ${TYPE_GOLD_BG[g.type] ?? "from-[#2C2C2C] to-[#161616]"} p-4 text-white`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold leading-snug">
                          {r.title}
                        </h3>
                        {r.dayNumber !== null && (
                          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            Day {r.dayNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 p-4">
                      {r.content && (
                        <p className="line-clamp-3 text-sm text-dim">{r.content}</p>
                      )}
                      {r.sourceUrl && (
                        <Link
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gold-deep transition hover:underline"
                        >
                          Read on the official site
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 17 17 7" />
                            <path d="M8 7h9v9" />
                          </svg>
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}