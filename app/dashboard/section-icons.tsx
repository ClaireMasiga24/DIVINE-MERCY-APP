import type { ReactNode } from "react";

/**
 * Shared section icons + metadata for the drawer navigation and the
 * gradient-card stack on the overview page. Pure presentational — safe to
 * import from both server and client components.
 */

export type SectionIconName =
  | "overview"
  | "discussion"
  | "events"
  | "prayers"
  | "announcements"
  | "members"
  | "meetings"
  | "contributions"
  | "settings"
  | "notifications"
  | "songs"
  | "holy-god"
  | "chaplet";

const PATHS: Record<SectionIconName, ReactNode> = {
  overview: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  discussion: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  events: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  prayers: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  announcements: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  members: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  meetings: (
    <>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
  contributions: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8.5c-1-1-4-1-4 1.5s3 2 3 3.5-3 2.5-4 1.5" />
      <path d="M12 7v10" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  notifications: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
  songs: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  "holy-god": (
    <>
      <path d="M12 2v6" />
      <path d="M12 16v6" />
      <path d="M2 12h6" />
      <path d="M16 12h6" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chaplet: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="17.5" cy="9" r="1.2" fill="currentColor" />
      <circle cx="18" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" />
      <circle cx="6" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="6.5" cy="9" r="1.2" fill="currentColor" />
      <path d="M12 6v12" />
    </>
  ),
};

export function SectionIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[slug as SectionIconName] ?? PATHS.overview}
    </svg>
  );
}

/** One-line subtitles for the gradient cards on the overview page. */
export const SECTION_SUBTITLE: Record<string, string> = {
  discussion: "Message and connect with fellow members",
  events: "Holy Hour alarm and parish events",
  prayers: "Novena, chaplet and rosary",
  announcements: "Latest news from the parish",
  members: "Manage parish members",
  meetings: "Scheduled parish meetings",
  contributions: "Parish contributions",
  settings: "App preferences",
  notifications: "Your alerts and reminders",
  songs: "Browse and play Divine Mercy songs",
  "holy-god": "Prayers and reflections",
  chaplet: "Watch the Divine Mercy Chaplet",
};

/** Accent gradients for the stacked cards — one per card type, cycled. */
export const CARD_GRADIENTS = [
  "from-[#f6c0cf] to-[#ecc98c]", // rose → gold
  "from-[#a5dff0] to-[#8fb6e8]", // sky → blue
  "from-[#f6c98f] to-[#f0d27a]", // orange → amber
  "from-[#c9b8ec] to-[#f0a9c8]", // violet → rose
] as const;
