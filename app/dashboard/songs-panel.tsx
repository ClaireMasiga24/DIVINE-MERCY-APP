"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/songs";

/**
 * The Divine Mercy Songs library. Per-user playback: when a member taps a
 * song, only they hear/watch it — the call doesn't get the audio, and
 * other members' libraries don't sync. Each user has their own `<audio>`
 * element (for audio songs) and their own video-modal state.
 *
 * Two song kinds, both stay inside the app:
 *   - audio: an MP3 in `public/music/`. Plays inline via the per-user
 *     `<audio>` element. Tapping again pauses.
 *   - video: a YouTube embed (privacy-enhanced `youtube-nocookie.com`).
 *     Tapping opens a modal with the player full-width. Closing the
 *     modal unmounts the iframe so YouTube stops buffering.
 *
 * Two variants:
 *   - "dashboard" — full card with the song list. Used on the Songs
 *     section page.
 *   - "call"      — compact strip with an expand chevron, used inside
 *     the meeting room. Flex-column child of the room wrapper, not
 *     `position: fixed`.
 */
type Props = {
  songs: Song[];
  variant: "dashboard" | "call";
};

type VideoModal = { youtubeId: string; title: string } | null;

export default function SongsPanel({ songs, variant }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(variant === "dashboard");
  const [videoModal, setVideoModal] = useState<VideoModal>(null);

  // Audio playback (audio songs only).
  const playAudio = useCallback((song: Extract<Song, { kind: "audio" }>) => {
    const a = audioRef.current;
    if (!a) return;
    if (currentId !== song.id) {
      a.src = song.src;
      setCurrentId(song.id);
    }
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [currentId]);

  const pauseAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
  }, []);

  // Top-level tap handler. Audio songs toggle inline playback; video
  // songs open a modal.
  const handleTap = useCallback((song: Song) => {
    if (song.kind === "video") {
      setVideoModal({ youtubeId: song.youtubeId, title: song.title });
      return;
    }
    if (currentId === song.id && isPlaying) {
      pauseAudio();
    } else {
      playAudio(song);
    }
  }, [currentId, isPlaying, playAudio, pauseAudio]);

  const currentSong = songs.find((s) => s.id === currentId) ?? null;
  const currentIsPlaying = isPlaying && currentSong?.kind === "audio";

  // Close the video modal on Escape.
  useEffect(() => {
    if (!videoModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVideoModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoModal]);

  if (songs.length === 0) {
    if (variant === "call") return null;
    return (
      <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-12 text-center text-sm text-dim shadow-sm">
        <h2 className="text-base font-semibold text-ink">No songs yet</h2>
        <p className="mx-auto mt-2 max-w-md">
          Add MP3s to <code className="rounded bg-ivory-lift px-1.5 py-0.5 text-xs">public/music/</code> and
          entries to <code className="rounded bg-ivory-lift px-1.5 py-0.5 text-xs">public/music/manifest.json</code> to
          build the library.
        </p>
      </div>
    );
  }

  const playIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
  const pauseIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
  const videoIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  );
  // For each row, choose the icon based on the current state.
  const rowIcon = (song: Song) => {
    if (song.id === currentId && currentIsPlaying) return pauseIcon;
    if (song.kind === "video") return videoIcon;
    return playIcon;
  };

  // Compact call-variant strip + expandable song sheet.
  if (variant === "call") {
    return (
      <>
        <div className="border-t border-white/10 bg-[#0a0d12] px-4 py-2">
          <audio ref={audioRef} preload="none" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              aria-expanded={expanded}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              Songs
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition ${expanded ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {currentSong && currentSong.kind === "audio" && (
              <div className="flex flex-1 items-center gap-2 overflow-hidden">
                <span className="truncate text-xs font-medium text-white/80">
                  {currentSong.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleTap(currentSong)}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0e1217] transition hover:bg-white/90"
                >
                  {isPlaying ? pauseIcon : playIcon}
                </button>
              </div>
            )}
          </div>
          {expanded && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {songs.map((song) => {
                const isCurrent = song.id === currentId;
                return (
                  <li key={song.id}>
                    <button
                      type="button"
                      onClick={() => handleTap(song)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        isCurrent
                          ? "bg-white/15 text-white"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="shrink-0">{rowIcon(song)}</span>
                      <span className="truncate">{song.title}</span>
                      {song.kind === "video" && (
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-white/40">
                          Video
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <VideoModal modal={videoModal} onClose={() => setVideoModal(null)} />
      </>
    );
  }

  // Dashboard variant: full card with header, now-playing bar, and list.
  return (
    <>
      <div className="rounded-2xl border border-line bg-ivory p-5 shadow-sm sm:p-6">
        <audio ref={audioRef} preload="none" />

        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] shadow-[0_4px_12px_rgba(180,140,60,0.3)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B2F1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Divine Mercy Songs</h1>
            <p className="text-xs text-dim">
              Tap a song to listen or watch. Everything plays inside the app.
            </p>
          </div>
        </div>

        {currentSong && currentSong.kind === "audio" && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3">
            {isPlaying && (
              <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-deep">
                Now playing
              </div>
              <div className="truncate text-sm font-semibold text-ink">{currentSong.title}</div>
            </div>
            <button
              type="button"
              onClick={() => handleTap(currentSong)}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:brightness-105"
            >
              {isPlaying ? pauseIcon : playIcon}
            </button>
          </div>
        )}

        <ul className="mt-4 divide-y divide-line">
          {songs.map((song) => {
            const isCurrent = song.id === currentId;
            return (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => handleTap(song)}
                  className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-80"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isCurrent
                        ? "bg-gold/20 text-gold-deep"
                        : "bg-ivory-lift text-dim"
                    }`}
                  >
                    {rowIcon(song)}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-ink">
                    {song.title}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-dim">
                    {song.kind === "video"
                      ? "Watch"
                      : isCurrent && isPlaying
                        ? "Playing"
                        : isCurrent
                          ? "Paused"
                          : "Tap to play"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <VideoModal modal={videoModal} onClose={() => setVideoModal(null)} />
    </>
  );
}

/** Modal YouTube player. Unmounts the iframe on close so YouTube stops
 *  buffering. Backdrop click + Escape both close. Privacy-enhanced
 *  `youtube-nocookie.com` so we don't drop third-party cookies just from
 *  opening the modal. */
function VideoModal({
  modal,
  onClose,
}: {
  modal: VideoModal;
  onClose: () => void;
}) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={modal.title}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <h2 className="truncate text-sm font-semibold">{modal.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="relative aspect-video w-full">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${modal.youtubeId}?autoplay=1&rel=0`}
            title={modal.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}