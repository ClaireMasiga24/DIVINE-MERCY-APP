"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
 */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];
const POLL_MS = 1200;

type Props = {
  meetingId: string;
  title: string;
  fullName: string;
  homeHref: string;
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

export default function MeetingRoom({ meetingId, title, fullName, homeHref }: Props) {
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

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/meetings/signal/${meetingId}?sessionId=${sessionIdRef.current}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        signals: Signal[];
        presence: { sessionId: string; fullName: string }[];
      };
      if (leftRef.current) return;

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
  }, [meetingId, ensurePeer, handleSignal, syncTiles]);

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
          setError("You're not invited to this meeting.");
          return;
        }
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
        <button
          type="button"
          onClick={() => leave(true)}
          className="shrink-0 rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
        >
          Leave
        </button>
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

            {/* Small mirrored self tile, WhatsApp style */}
            <div className="pointer-events-none fixed bottom-24 right-4 z-10 h-28 w-40 overflow-hidden rounded-xl border border-white/15 bg-[#1a2129] shadow-2xl sm:bottom-28 sm:right-6">
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

      {/* Controls */}
      {phase !== "error" && (
        <div className="flex items-center justify-center gap-5 pb-7 pt-2">
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
    </div>
  );
}
