import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionUser, MEMBER_ADD_ROLES } from "@/lib/auth";
import { roleSlug, roleLabel, ROLE_SECTIONS } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { listSongs } from "@/lib/songs";
import MemberManagement from "../../member-management";
import EventManagement from "../../event-management";
import MeetingsPanel from "../../meetings-panel";
import NotificationsPanel from "../../notifications-panel";
import DiscussionPanel from "../../discussion-panel";
import SettingsPanel from "../../settings-panel";
import SongsPanel from "../../songs-panel";
import PrayersPanel from "../../prayers-panel";
import AnnouncementsPanel from "../../announcements-panel";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

export default async function RoleSectionPage({
  params,
}: {
  params: Promise<{ role: string; section: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const slug = roleSlug(user.role);
  const { role, section } = await params;
  // Same guard as the role page: the URL role must be the viewer's own.
  if (role !== slug) redirect(`/dashboard/${slug}`);

  const found = ROLE_SECTIONS[user.role].find((s) => s.slug === section);
  if (!found) redirect(`/dashboard/${slug}`);

  // Roles with account authority (Chairperson, Patron, Technical Lead) get the
  // real account-management UI in their Members section; everyone else keeps
  // the placeholder.
  if (found.slug === "members" && (MEMBER_ADD_ROLES as readonly string[]).includes(user.role)) {
    return (
      <div className="mx-auto max-w-5xl">
        <MemberManagement user={user} />
      </div>
    );
  }

  // The Events section holds the inbuilt daily Holy Hour alarm. It is shown
  // for every role that has an Events section — the Technical Lead's Events
  // section was removed, so they never reach this page.
  if (found.slug === "events") {
    return (
      <div className="mx-auto max-w-5xl">
        <EventManagement />
      </div>
    );
  }

  // The Meetings section (SECRETARY) hosts the Set Meeting card and the
  // upcoming meetings list. Creation stays leadership-only, so the Secretary
  // sees the list plus the "Chairperson or Patron" note.
  if (found.slug === "meetings") {
    return (
      <div className="mx-auto max-w-3xl">
        <MeetingsPanel user={user} />
      </div>
    );
  }

  // The Notifications section shows the viewer's notification feed. The
  // Technical Lead has no Notifications section (they get no meeting
  // notifications at all), so they never reach this page.
  if (found.slug === "notifications") {
    return (
      <div className="mx-auto max-w-3xl">
        <NotificationsPanel user={user} />
      </div>
    );
  }

  // The Discussion section hosts the member directory and private chats. The
  // Technical Lead has no Discussion section, so they never reach this page.
  if (found.slug === "discussion") {
    return (
      <div className="mx-auto max-w-3xl">
        <DiscussionPanel user={user} />
      </div>
    );
  }

  // The Settings section (Chairperson, Patron, Technical Lead) hosts the
  // Discussion/Comments toggles and other app preferences.
  if (found.slug === "settings") {
    const settings = await prisma.appSetting.findUnique({ where: { id: "global" } });
    return (
      <div className="mx-auto max-w-3xl">
        <SettingsPanel
          initial={{
            discussionEnabled: settings?.discussionEnabled ?? true,
            commentsEnabled: settings?.commentsEnabled ?? true,
          }}
        />
      </div>
    );
  }

  // Divine Mercy Songs — per-user music library. The song list comes from
  // a CDN-served manifest (lib/songs.ts) since Vercel doesn't expose the
  // filesystem to server components. The SongsPanel is the only thing
  // that touches the audio element.
  if (found.slug === "songs") {
    const songs = await listSongs();
    return (
      <div className="mx-auto max-w-3xl">
        <SongsPanel songs={songs} variant="dashboard" />
      </div>
    );
  }

  // Prayer Resources — Novena, Chaplet, Rosary, and other prayers seeded
  // by the parish. Read-only at the app level; managed via a migration.
  if (found.slug === "prayers") {
    return (
      <div className="mx-auto max-w-3xl">
        <PrayersPanel />
      </div>
    );
  }

  // Announcements — parish updates, newest first. Read-only at the app
  // level; the createdById FK is for the future write surface.
  if (found.slug === "announcements") {
    return (
      <div className="mx-auto max-w-3xl">
        <AnnouncementsPanel />
      </div>
    );
  }

  // Contributions — Treasurer-only section. The schema doesn't have a
  // Contribution model yet; this is a placeholder that the parish fills
  // in once a model is added. Renders a clear, non-404 placeholder so the
  // section doesn't look broken.
  if (found.slug === "contributions") {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionLabel>CONTRIBUTIONS</SectionLabel>
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-14 w-14 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image src="/Images/SEETA PARISH DIVINE MERCY.png" alt="" fill className="object-cover" />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-ink">Contributions</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
            The contributions ledger is being prepared by the parish. This
            section will let you record and review tithes, donations, and
            parish expenses here once it&apos;s ready.
          </p>
        </div>
      </div>
    );
  }

  // Holy God — placeholder. Reach and slot are reserved; the parish fills
  // the actual prayers/reflections content in later.
  if (found.slug === "holy-god") {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionLabel>HOLY GOD</SectionLabel>
        <div className="rounded-2xl border border-line bg-ivory px-5 py-12 text-center shadow-sm sm:py-16">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image src="/Images/SEETA PARISH DIVINE MERCY.png" alt="" fill className="object-cover" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-ink">Holy God</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-dim">
            Prayers and reflections for Holy God will appear here. This section is
            being prepared by the parish.
          </p>
        </div>
      </div>
    );
  }

  // Chaplet — the Divine Mercy Chaplet video, embedded with the privacy-
  // enhanced `youtube-nocookie.com` domain so we don't drop third-party
  // cookies just from loading the page. Members watch inside the app
  // instead of being bounced to YouTube.
  if (found.slug === "chaplet") {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionLabel>CHAPLET</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm">
          <div className="relative aspect-video w-full">
            <iframe
              src="https://www.youtube-nocookie.com/embed/HKlOLyYs3Os?rel=0"
              title="Divine Mercy Chaplet"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <div className="px-5 py-4 text-sm text-dim">
            The Divine Mercy Chaplet, prayed daily at 3:00 PM. Use full screen for
            the full experience.
          </div>
        </div>
      </div>
    );
  }

  const label = roleLabel(user.role);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionLabel>{found.label.toUpperCase()}</SectionLabel>

      <div className="rounded-2xl border border-line bg-ivory px-5 py-12 text-center shadow-sm sm:py-16">
        <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
          <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
            <Image src="/Images/SEETA PARISH DIVINE MERCY.png" alt="" fill className="object-cover" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-ink">{found.label}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-dim">
          {found.label} for {label} is coming soon. This section will be set up
          here shortly.
        </p>
      </div>
    </div>
  );
}

