import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { roleSlug, roleLabel, ROLE_SECTIONS } from "@/lib/roles";
import HolyHourCard from "../holy-hour-card";
import MeetingsPanel from "../meetings-panel";
import { SectionIcon, SECTION_SUBTITLE, CARD_GRADIENTS } from "../section-icons";

// Faint sun rays behind the hero (CSS conic gradient, no asset).
const HERO_RAYS = `repeating-conic-gradient(from -100deg at 50% -20%, rgba(255,255,255,0.55) 0deg 4deg, transparent 4deg 14deg)`;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const slug = roleSlug(user.role);
  const { role } = await params;
  // The role in the URL must be the viewer's own. Anything else — another
  // role's slug or a bogus segment — silently bounces to their own page, so
  // a Chairperson or Patron never learns a Technical Lead page exists.
  if (role !== slug) redirect(`/dashboard/${slug}`);

  const label = roleLabel(user.role);
  const sections = ROLE_SECTIONS[user.role];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero header: heavenly sky, sun rays, clouds, circular portrait */}
      <section className="relative -mx-5 overflow-hidden rounded-b-[2rem] sm:-mx-8">
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#dcebf8_0%,#eef5fc_55%,#fdf7ec_100%)]" />
          <div className="absolute inset-0" style={{ backgroundImage: HERO_RAYS }} />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,162,78,0.3),transparent_60%)]" />
          {/* soft clouds */}
          <div className="absolute left-[6%] top-8 h-24 w-44 rounded-full bg-white/60 blur-2xl" />
          <div className="absolute right-[4%] top-14 h-20 w-36 rounded-full bg-white/50 blur-2xl" />
        </div>

        <div className="relative px-6 py-12 text-center sm:py-16">
          <div className="mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[3px] shadow-[0_8px_30px_rgba(180,140,60,0.4)]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image
                src="/Images/SEETA PARISH DIVINE MERCY.png"
                alt="Divine Mercy Seeta Parish seal"
                fill
                className="object-cover"
              />
            </div>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gold-deep">
            Jesus, I trust in You
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
            Welcome, {user.fullName}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-dim">
            Your {label} area. Choose a section below to get started.
          </p>
          <span className="mt-4 inline-block rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-gold-deep">
            {label}
          </span>
        </div>
      </section>

      {/* Feature sections as stacked gradient cards */}
      <section className="mt-8">
        <SectionLabel>YOUR SECTIONS</SectionLabel>
        <div className="space-y-4">
          {sections.map((s, i) => {
            const href = `/dashboard/${slug}/${s.slug}`;
            const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
            return (
              <Link
                key={s.slug}
                href={href}
                className={`group block rounded-3xl bg-gradient-to-br ${gradient} p-5 shadow-[0_10px_30px_rgba(51,38,43,0.14)] transition hover:brightness-105 hover:shadow-[0_12px_34px_rgba(51,38,43,0.2)] sm:p-6`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/45 text-ink">
                    <SectionIcon slug={s.slug} className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-ink">{s.label}</h2>
                    <p className="mt-0.5 text-sm text-ink/70">
                      {SECTION_SUBTITLE[s.slug] ?? "Parish section"}
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink shadow-[0_4px_12px_rgba(51,38,43,0.16)] transition group-hover:shadow-[0_6px_16px_rgba(51,38,43,0.24)]">
                    Open
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* The Technical Lead gets no meeting features at all. */}
      {user.role !== "TECHNICAL_LEAD" && <MeetingsPanel user={user} />}

      {user.role !== "TECHNICAL_LEAD" && (
        <section className="mt-8">
          <SectionLabel>DAILY HOLY HOUR ALARM</SectionLabel>
          <HolyHourCard />
        </section>
      )}
    </div>
  );
}
