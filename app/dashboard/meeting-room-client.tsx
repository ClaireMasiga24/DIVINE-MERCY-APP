"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Song } from "@/lib/songs";
import SongsPanel from "./songs-panel";

/**
 * In-app video call room, WhatsApp-group-call style.
 *
 * Free and easy by design: no media server, no WebSocket — WebRTC peers
 * connect directly (mesh) and exchange offers/answers/ICE through a
 * database-backed signaling queue polled every ~1.2s. Presence comes from
 * MeetingSession rows returned by the same poll.
 *
 * Glare rule: for each peer pair, the session with the lexicographically
 * smaller sessionId is the offerer; both sides compute the same winner.
 * ICE candidates are buffered until setRemoteDescription, then flushed.
 *
 * Leader controls (auto Holy Hour rooms only): Patron and Chairperson can
 * stop / start the music for everyone in the call. Patron, Chairperson,
 * and Technical Lead can end the call early. Role and `isAuto` come back
 * from the join response, so the button strip is data-driven.
 *
 * Auto-end: in the last 15 minutes of the call every connected client
 * shows a countdown chip; at T+0 the client fires `/auto-end` (a
 * server-side write that any participant is allowed to make) and
 * redirects home. The server-side write is what guarantees peers and
 * late joiners see the closed state.
 */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];
const POLL_MS = 1200;
const COUNTDOWN_WINDOW_MS = 15 * 60 * 1000;

type Props = {
  meetingId: string;
  title: string;
  fullName: string;
  homeHref: string;
  songs: Song[];
  /** The first audio song in the manifest, used as the in-call auto-play
   *  song. Patron/Chairperson can still Stop / Start it via the leader
   *  buttons. Reorder `public/music/manifest.json` to change which song
   *  the call plays by default. */
  autoPlaySong: { src: string; title: string };
};

type Peer = {
  pc: RTCPeerConnection;
  fullName: string;
  stream: MediaStream | null;
  bufferedIce: RTCIceCandidateInit[];
  connected: boolean;
};

type Signal = {
  fromSessionId: string;
  type: string;
  payload: unknown;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatElapsed(totalSeconds: number): string {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** A soft two-note "someone joined" chime. */
function playJoinTone() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25];
    const start = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  } catch {
    // Best effort.
  }
}

function VideoTile({
  stream,
  muted,
  mirror,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

export default function MeetingRoom({ meetingId, title, fullName, homeHref, songs, autoPlaySong }: Props) {
  const router = useRouter();

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedAtRef = useRef(0);
  const joinedRef = useRef(false);
  const leftRef = useRef(false);

  const [phase, setPhase] = useState<"starting" | "in-call" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [selfStream, setSelfStream] = useState<MediaStream | null>(null);
  const [tiles, setTiles] = useState<
    { sid: string; fullName: string; connected: boolean; stream: MediaStream | null }[]
  >([]);

  // Leader / countdown / music state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoEndedRef = useRef(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [meetingIsAuto, setMeetingIsAuto] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [endsAtMs, setEndsAtMs] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Mirror the peer map into renderable state (the PC objects stay in a ref).
  const syncTiles = useCallback(() => {
    setTiles(
      [...peersRef.current.entries()].map(([sid, peer]) => ({
        sid,
        fullName: peer.fullName,
        connected: peer.connected,
        stream: peer.stream,
      }))
    );
  }, []);

  const sendSignal = useCallback(
    (toSessionId: string, type: "offer" | "answer" | "ice", payload: unknown) => {
      fetch("/api/meetings/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          sessionId: sessionIdRef.current,
          toSessionId,
          type,
          payload,
        }),
      }).catch(() => {});
    },
    [meetingId]
  );

  const ensurePeer = useCallback(
    async (sid: string, name: string) => {
      if (peersRef.current.has(sid)) return;
      const stream = streamRef.current;
      if (!stream) return;

      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(sid, "ice", e.candidate.toJSON());
      };
      pc.ontrack = (e) => {
        const peer = peersRef.current.get(sid);
        if (peer && e.streams[0]) {
          peer.stream = e.streams[0];
          syncTiles();
        }
      };
      pc.onconnectionstatechange = () => {
        const peer = peersRef.current.get(sid);
        if (peer) {
          peer.connected = pc.connectionState === "connected";
          syncTiles();
        }
      };
      peersRef.current.set(sid, {
        pc,
        fullName: name,
        stream: null,
        bufferedIce: [],
        connected: false,
      });
      syncTiles();

      // Glare rule: the smaller sessionId offers, the larger answers.
      if (sessionIdRef.current < sid) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(sid, "offer", { sdp: offer.sdp });
      }
    },
    [sendSignal, syncTiles]
  );

  const handleSignal = useCallback(
    async (sig: Signal) => {
      if (sig.fromSessionId === sessionIdRef.current) return;
      const peer = peersRef.current.get(sig.fromSessionId);
      if (!peer) return;

      const pc = peer.pc;
      if (sig.type === "offer") {
        // The sender is the smaller sessionId by construction — a stray offer
        // from the larger side is ignored (our own offer resolves the pair).
        if (sessionIdRef.current < sig.fromSessionId) return;
        if (pc.remoteDescription || pc.signalingState !== "stable") return;
        const offerSdp = (sig.payload as { sdp?: string }).sdp;
        if (!offerSdp) return;
        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        for (const c of peer.bufferedIce.splice(0)) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            // Drop a candidate that no longer applies.
          }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(sig.fromSessionId, "answer", { sdp: answer.sdp });
      } else if (sig.type === "answer") {
        if (pc.remoteDescription) return;
        const answerSdp = (sig.payload as { sdp?: string }).sdp;
        if (!answerSdp) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        for (const c of peer.bufferedIce.splice(0)) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            // Ignore.
          }
        }
      } else if (sig.type === "ice") {
        const candidate = sig.payload as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(candidate);
          } catch {
            // Ignore.
          }
        } else {
          peer.bufferedIce.push(candidate);
        }
      }
    },
    [sendSignal]
  );
  const leave = useCallback(
    (navigateHome: boolean) => {
      if (leftRef.current) return;
      leftRef.current = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      for (const [, peer] of peersRef.current) {
        try {
          peer.pc.close();
        } catch {
          // Ignore.
        }
      }
      peersRef.current.clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Stop the music when the local user leaves — it should never bleed
      // out to the rest of the room after we've gone.
      const a = audioRef.current;
      if (a) {
        a.pause();
        try { a.currentTime = 0; } catch { /* not seekable yet */ }
      }
      try {
        fetch("/api/meetings/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            sessionId: sessionIdRef.current,
            action: "leave",
          }),
        }).catch(() => {});
      } catch {
        // Ignore.
      }
      if (navigateHome) router.push(homeHref);
    },
    [meetingId, homeHref, router]
  );


  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/meetings/signal/${meetingId}?sessionId=${sessionIdRef.current}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        signals: Signal[];
        presence: { sessionId: string; fullName: string }[];
        musicPlaying: boolean;
        endedAt: string | null;
        endsAt: string | null;
      };
      if (leftRef.current) return;

      // Server-side close beats local state. If the row says the call has
      // ended, kick home on the next tick. The leader's End Call and the
      // auto-end endpoint both set this; clients that arrived late get the
      // message via the poll.
      if (data.endedAt && !autoEndedRef.current) {
        autoEndedRef.current = true;
        leave(true);
        return;
      }

      // Music flag drives the audio element. Per the spec, music plays for
      // everyone as soon as anyone is on the call — including solo joiners.
      setMusicPlaying(data.musicPlaying);

      // Presence first (names for new peers), then signals.
      const present = new Map<string, string>();
      for (const p of data.presence) present.set(p.sessionId, p.fullName);

      const justJoined =
        joinedAtRef.current > 0 && Date.now() - joinedAtRef.current > 3000;
      for (const [sid, name] of present) {
        if (sid !== sessionIdRef.current && !peersRef.current.has(sid)) {
          await ensurePeer(sid, name);
          if (justJoined) playJoinTone();
        }
      }
      for (const [sid] of peersRef.current) {
        if (!present.has(sid)) {
          const peer = peersRef.current.get(sid);
          try {
            peer?.pc.close();
          } catch {
            // Already closed.
          }
          peersRef.current.delete(sid);
        }
      }
      syncTiles();

      for (const sig of data.signals) {
        await handleSignal(sig);
      }
    } catch {
      // Transient — next poll retries.
    }
  }, [meetingId, ensurePeer, handleSignal, syncTiles, leave]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setPhase("error");
          setError("Camera access needs a secure (HTTPS) connection.");
          return;
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            setPhase("error");
            setError("Camera and microphone are unavailable, or permission was denied.");
            return;
          }
        }
        streamRef.current = stream;
        setSelfStream(stream);
        setVideoOn(stream.getVideoTracks().length > 0);
        setAudioOn(stream.getAudioTracks().length > 0);

        const res = await fetch("/api/meetings/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            sessionId: sessionIdRef.current,
            action: "join",
          }),
        });
        if (!res.ok) {
          stream.getTracks().forEach((t) => t.stop());
          setPhase("error");
          setError(res.status === 410 ? "This Holy Hour call has already ended." : "You're not invited to this meeting.");
          return;
        }
        const joinData = (await res.json()) as {
          role: string;
          isAuto: boolean;
          musicPlaying: boolean;
          endsAt: string | null;
          endedAt: string | null;
        };
        if (joinData.endedAt) {
          stream.getTracks().forEach((t) => t.stop());
          setPhase("error");
          setError("This Holy Hour call has already ended.");
          return;
        }
        setUserRole(joinData.role);
        setMeetingIsAuto(joinData.isAuto);
        setMusicPlaying(joinData.musicPlaying);
        if (joinData.endsAt) setEndsAtMs(new Date(joinData.endsAt).getTime());
        if (cancelled) return;

        joinedRef.current = true;
        joinedAtRef.current = Date.now();
        setPhase("in-call");
        pollTimerRef.current = setInterval(poll, POLL_MS);
      } catch {
        if (!cancelled) {
          setPhase("error");
          setError("Couldn't start the call. Try again.");
        }
      }
    })();

    // A closing tab drops its presence (sendBeacon is POST-only).
    const onPageHide = () => {
      if (!joinedRef.current || leftRef.current) return;
      try {
        navigator.sendBeacon(
          "/api/meetings/session",
          new Blob(
            [
              JSON.stringify({
                meetingId,
                sessionId: sessionIdRef.current,
                action: "leave",
              }),
            ],
            { type: "application/json" }
          )
        );
      } catch {
        // Ignore.
      }
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      leave(false);
    };
  }, [meetingId, poll, leave]);

  // Elapsed timer once in the call.
  useEffect(() => {
    if (phase !== "in-call") return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [phase]);

  // Music playback. The audio element lives in the JSX; this effect drives
  // it. Per spec, music plays for everyone as soon as the local user is in
  // the call (including solo joiners). It pauses + rewinds whenever
  // `musicPlaying` flips to false (Patron/Chairperson pressed Stop).
  // `getUserMedia` earlier in the lifecycle already satisfies the browser
  // user-gesture requirement for audio playback.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (phase !== "in-call") {
      a.pause();
      try { a.currentTime = 0; } catch { /* not seekable yet */ }
      return;
    }
    if (musicPlaying) {
      if (a.paused) a.play().catch(() => {});
    } else {
      a.pause();
      try { a.currentTime = 0; } catch { /* not seekable yet */ }
    }
  }, [musicPlaying, phase]);

  // Countdown + auto-end. In the last 15 minutes of the call, every
  // connected participant sees a countdown chip. At T+0 the client fires
  // the auto-end endpoint (server-side fact, allowed for any participant)
  // and redirects home. The redirect is fire-and-forget; if the POST fails
  // (network blip, etc) the next poll still picks up `endedAt` once any
  // other client succeeds.
  useEffect(() => {
    if (phase !== "in-call" || endsAtMs === null) {
      return;
    }
    const tick = () => {
      const remaining = endsAtMs - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0 && !autoEndedRef.current) {
        autoEndedRef.current = true;
        fetch(`/api/meetings/${meetingId}/auto-end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {});
        leave(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, endsAtMs, leave, meetingId]);

  // Leader handlers. Stop Music / Start Music flip on the server. End Call
  // is the leader's early close — the next poll picks up `endedAt` and
  // redirects. Optimistic updates roll back if the server rejects.
  const canControlMusic = meetingIsAuto && (userRole === "PATRON" || userRole === "CHAIRPERSON");
  const canEndCall = meetingIsAuto && (userRole === "PATRON" || userRole === "CHAIRPERSON" || userRole === "TECHNICAL_LEAD");

  const toggleMusic = useCallback(async () => {
    const next = !musicPlaying;
    setMusicPlaying(next); // optimistic
    try {
      const res = await fetch(`/api/meetings/${meetingId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: next ? "stop_music" : "start_music" }),
      });
      if (!res.ok) setMusicPlaying(!next); // roll back on failure
      else {
        const data = (await res.json()) as { musicPlaying: boolean };
        setMusicPlaying(data.musicPlaying);
      }
    } catch {
      setMusicPlaying(!next);
    }
  }, [musicPlaying, meetingId]);

  const endCall = useCallback(async () => {
    if (!confirm("End this Holy Hour call for everyone?")) return;
    autoEndedRef.current = true;
    try {
      await fetch(`/api/meetings/${meetingId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_call" }),
      });
    } catch {
      // ignore — the poll will pick up endedAt
    }
    leave(true);
  }, [meetingId, leave]);

  const toggleAudio = () => {
    const tracks = streamRef.current?.getAudioTracks();
    if (!tracks || tracks.length === 0) return;
    const next = !audioOn;
    tracks.forEach((t) => (t.enabled = next));
    setAudioOn(next);
  };

  const toggleVideo = () => {
    const tracks = streamRef.current?.getVideoTracks();
    if (!tracks || tracks.length === 0) return;
    const next = !videoOn;
    tracks.forEach((t) => (t.enabled = next));
    setVideoOn(next);
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-[#0e1217] text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="text-xs text-white/50">
            {phase === "in-call" ? `${formatElapsed(elapsed)} · ${tiles.length + 1} in call` : "Connecting…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* 15-minute countdown. Visible to every connected participant in
              the last 15 minutes of the call — auto-ends at zero. */}
          {phase === "in-call" &&
            remainingMs !== null &&
            remainingMs > 0 &&
            remainingMs <= COUNTDOWN_WINDOW_MS && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Ends in {formatElapsed(Math.ceil(remainingMs / 1000))}
              </span>
            )}
          <button
            type="button"
            onClick={() => leave(true)}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Tiles */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {phase === "error" ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 16v-4M12 8h.01" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <p className="max-w-xs text-sm text-white/80">{error}</p>
            <button
              type="button"
              onClick={() => leave(true)}
              className="mt-5 rounded-full bg-[#25D366] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-105"
            >
              Back to dashboard
            </button>
          </div>
        ) : tiles.length === 0 ? (
          /* Alone in the call — full-area self tile */
          <div className="relative mx-auto aspect-video max-w-3xl overflow-hidden rounded-2xl bg-[#1a2129]">
            <VideoTile
              stream={selfStream}
              muted
              mirror
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
              <span className="text-sm font-medium">{fullName}</span>
              <span className="text-xs text-white/60">(you)</span>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`grid gap-3 ${
                tiles.length === 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {tiles.map((tile) => (
                <div
                  key={tile.sid}
                  className="relative aspect-video overflow-hidden rounded-2xl bg-[#1a2129]"
                >
                  {tile.stream ? (
                    <VideoTile
                      stream={tile.stream}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white/80">
                        {initials(tile.fullName)}
                      </div>
                      <span className="text-xs text-white/50">
                        {tile.connected ? "Connected" : "Connecting…"}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                    <span className="truncate text-xs font-medium">{tile.fullName}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Small mirrored self tile, WhatsApp style. Offset bumped to
                clear both the call controls and the songs strip above. */}
            <div className="pointer-events-none fixed bottom-32 right-4 z-10 h-28 w-40 overflow-hidden rounded-xl border border-white/15 bg-[#1a2129] shadow-2xl sm:bottom-36 sm:right-6">
              <VideoTile
                stream={selfStream}
                muted
                mirror
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                <span className="text-[10px] font-medium text-white/90">You</span>
                {!audioOn && (
                  <svg
                    className="ml-1 inline h-3 w-3 text-red-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <path d="M12 19v3" />
                  </svg>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Songs library — per-user playback. Lives above the call controls
          as a normal flex-column child, not `fixed`, so it doesn't fight
          the existing layout. The audio is independent of the call's
          auto-play song; both can play simultaneously. */}
      {phase !== "error" && songs.length > 0 && <SongsPanel songs={songs} variant="call" />}

      {/* Controls */}
      {phase !== "error" && (
        <div className="flex items-center justify-center gap-5 pb-7 pt-2">
          {/* Stop Music / Start Music — Patron & Chairperson only, auto rooms only */}
          {canControlMusic && (
            <button
              type="button"
              onClick={toggleMusic}
              aria-label={musicPlaying ? "Stop music for everyone" : "Start music for everyone"}
              title={musicPlaying ? "Stop music for everyone" : "Start music for everyone"}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                musicPlaying
                  ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-400/30"
                  : "bg-white/15 hover:bg-white/25"
              }`}
            >
              {musicPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              )}
            </button>
          )}

          {/* End Call — Patron, Chairperson, Technical Lead, auto rooms only */}
          {canEndCall && (
            <button
              type="button"
              onClick={endCall}
              aria-label="End call for everyone"
              title="End call for everyone"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/80 ring-1 ring-red-400/40 transition hover:bg-red-500"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={toggleAudio}
            aria-label={audioOn ? "Mute microphone" : "Unmute microphone"}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              audioOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v3" />
              {!audioOn && <path d="M3 3l18 18" />}
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleVideo}
            aria-label={videoOn ? "Turn camera off" : "Turn camera on"}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              videoOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
              {!videoOn && <path d="M3 3l18 18" />}
            </svg>
          </button>

          <button
            type="button"
            onClick={() => leave(true)}
            aria-label="Leave call"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
        </div>
      )}

      {/* Background music element. Hidden, autoplay-gated by the music effect
          above. `getUserMedia` earlier in the lifecycle satisfies the
          browser's user-gesture requirement for audio playback. */}
      <audio
        ref={audioRef}
        src={autoPlaySong.src}
        loop
        preload="auto"
      />
    </div>
  );
}
