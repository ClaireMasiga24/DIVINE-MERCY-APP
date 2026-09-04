import { headers } from "next/headers";

/** A song in the parish library. Two kinds:
 *  - "audio": an MP3 served from `public/music/`. `src` is the URL path.
 *  - "video": a YouTube embed. `youtubeId` is the 11-char video id from
 *    `https://youtu.be/<id>`. The player uses the privacy-enhanced
 *    `youtube-nocookie.com` domain so listeners never leave the app.
 */
export type Song =
  | { id: string; title: string; kind: "audio"; src: string }
  | { id: string; title: string; kind: "video"; youtubeId: string };

/** The first audio song in the manifest is what auto-plays in a Holy Hour
 *  call. Falls back to the original hardcoded path if the manifest is
 *  empty or has no audio entries — keeps the in-call experience working
 *  even on a fresh deploy before any songs are added. */
export async function getAutoPlaySong(): Promise<{ src: string; title: string }> {
  const songs = await listSongs();
  const audio = songs.find((s): s is Extract<Song, { kind: "audio" }> => s.kind === "audio");
  if (audio) return { src: audio.src, title: audio.title };
  return { src: "/music/God Of Mercy.mp3", title: "God Of Mercy" };
}

/**
 * Read the songs manifest from the CDN. On Vercel, the `public/` directory
 * is served by the edge CDN and is NOT readable from inside a server
 * component (`fs.readdir(public/...)` throws `ENOENT` in production), so
 * the song list lives in a static JSON file the CDN serves like any other
 * asset. `cache: "no-store"` makes new deploys visible immediately
 * without a build-time cache.
 *
 * To add a new song, drop the MP3 in `public/music/` and append an entry
 * to `public/music/manifest.json`. No code change.
 */
export async function listSongs(): Promise<Song[]> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const url = `${proto}://${host}/music/manifest.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as Song[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}