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
    { slug: "discussion", label: "Discussion" },
    { slug: "events", label: "Events" },
    { slug: "prayers", label: "Prayer Resources" },
    { slug: "announcements", label: "Announcements" },
    { slug: "notifications", label: "Notifications" },
  ],
  SECRETARY: [
    { slug: "events", label: "Events" },
    { slug: "meetings", label: "Meetings" },
    { slug: "members", label: "Members" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
  ],
  TREASURER: [
    { slug: "contributions", label: "Contributions" },
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
  ],
  MOBILISER: [
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
  ],
  PRO: [
    { slug: "announcements", label: "Announcements" },
    { slug: "discussion", label: "Discussion" },
    { slug: "events", label: "Events" },
    { slug: "notifications", label: "Notifications" },
  ],
  CHAIRPERSON: [
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "settings", label: "Settings" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
  ],
  PATRON: [
    { slug: "members", label: "Members" },
    { slug: "events", label: "Events" },
    { slug: "settings", label: "Settings" },
    { slug: "notifications", label: "Notifications" },
    { slug: "discussion", label: "Discussion" },
  ],
  // The Technical Lead has no Events or Notifications section: the Holy Hour
  // alarm is inbuilt for every other role (excluding the Technical Lead), and
  // the Technical Lead gets no meeting notifications at all.
  TECHNICAL_LEAD: [
    { slug: "members", label: "Members" },
    { slug: "announcements", label: "Announcements" },
    { slug: "settings", label: "Settings" },
  ],
};
