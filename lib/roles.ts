import { Role } from "@prisma/client";

export function roleSlug(role: Role): string {
  return role.toLowerCase().replace(/_/g, "-");
}

export function roleLabel(role: Role): string {
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sidebar sections per role. Always derived from the viewer's OWN role, never
 * from the URL, so a Chairperson or Patron never sees a Technical Lead section
 * or page. The Technical Lead deliberately has no Discussion section and their
 * account is invisible to every other member (see member-management.tsx).
 */
export const ROLE_SECTIONS: Record<Role, { slug: string; label: string }[]> = {
  MEMBER: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "discussion", label: "Discussion" },
    { slug: "events", label: "Events" },
    { slug: "prayers", label: "Prayer Resources" },
    { slug: "announcements", label: "Announcements" },
    { slug: "notifications", label: "Notifications" },
    { slug: "app", label: "App" },
  ],
  SECRETARY: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "events", label: "Events" },
    { slug: "meetings", label: "Meetings" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
    { slug: "app", label: "App" },
  ],
  TREASURER: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "contributions", label: "Contributions" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
    { slug: "app", label: "App" },
  ],
  MOBILISER: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
    { slug: "app", label: "App" },
  ],
  PRO: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "announcements", label: "Announcements" },
    { slug: "discussion", label: "Discussion" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
    { slug: "app", label: "App" },
  ],
  CHAIRPERSON: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "settings", label: "Settings" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
    { slug: "app", label: "App" },
  ],
  PATRON: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "settings", label: "Settings" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
    { slug: "app", label: "App" },
  ],
  // The Technical Lead gets the full union of every section any other
  // role has — the operator needs the same dashboard as everyone else,
  // plus the leadership bits (Members, Settings). They still can't join
  // meetings (isMeetingParticipant blocks them), so the in-call songs
  // strip won't render for them, but they see every section here.
  TECHNICAL_LEAD: [
    { slug: "songs", label: "Divine Mercy Songs" },
    { slug: "holy-god", label: "Holy God" },
    { slug: "chaplet", label: "Chaplet" },
    { slug: "members", label: "Members" },
    { slug: "announcements", label: "Announcements" },
    { slug: "settings", label: "Settings" },
    { slug: "discussion", label: "Discussion" },
    { slug: "events", label: "Events" },
    { slug: "prayers", label: "Prayer Resources" },
    { slug: "notifications", label: "Notifications" },
    { slug: "app", label: "App" },
  ],
};
