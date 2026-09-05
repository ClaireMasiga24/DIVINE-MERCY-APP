import type { MetadataRoute } from "next";

// Web app manifest — served at /manifest.webmanifest and linked from the
// root <head>. Drives the "Add to Home Screen" / install prompt on Android,
// iOS, ChromeOS, Edge, and desktop browsers that support PWA install.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` is required by Chromium 109+ for stable install identity.
    // Without it, the installability heuristic downgrades the PWA and
    // `beforeinstallprompt` is much less likely to fire on phones.
    id: "/?source=pwa",
    name: "Divine Mercy Seeta",
    short_name: "Divine Mercy",
    description:
      "Divine Mercy Seeta Parish — prayer alarms, holy hour, meetings, and community for the parish family.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef5fc",
    theme_color: "#c9a24e",
    categories: ["lifestyle", "social"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Prayer Alarms",
        short_name: "Alarms",
        url: "/dashboard?section=alarms",
        description: "Manage your Holy Hour alarm subscriptions.",
      },
      {
        name: "Holy Hour",
        short_name: "Holy Hour",
        url: "/dashboard?section=holy-hour",
        description: "Today's Holy Hour and chapel schedule.",
      },
    ],
    prefer_related_applications: false,
  };
}
