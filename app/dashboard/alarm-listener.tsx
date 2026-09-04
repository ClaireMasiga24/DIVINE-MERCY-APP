"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * While the app is open, polls for due alarms. A Holy Hour group call renders
 * as a full-screen incoming-call overlay (ringtone + vibration, Accept /
 * Decline); other alarms keep the chime + top banner. The server-side sweep
 * covers the app-closed case with call-style push notifications; this covers
 * members already looking at the app.
 *
 * Ringing lasts CALL_RING_MS (matching the server's push payload) and then
 * flips to a compact "Missed call" banner that deep-links into the room.
 */
type Alarm = {
  deliveryId: string;
  notificationId: string;
  title: string;
  body: string;
  link: string | null;
  type?: "EVENT" | "PRAYER" | "MEETING" | string;
};

const SHOWN_KEY = "dm:lastAlarmShown";
const POLL_MS = 20_000;
/** How long the phone rings before it counts as a missed call. */
const RING_MS = 45_000;

function readShownIds(): string[] {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function isCallAlarm(a: Alarm): boolean {
  return a.type === "MEETING" && typeof a.link === "string" && a.link.includes("/dashboard/meeting-room/");
}

export default function AlarmListener() {
  const router = useRouter();
  const [alarm, setAlarm] = useState<Alarm | null>(null); // plain EVENT/PRAYER banner
  const [call, setCall] = useState<Alarm | null>(null); // incoming call overlay
  const [missed, setMissed] = useState<Alarm | null>(null); // missed-call banner
  const audioRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getContext = useCallback((): AudioContext | null => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      if (!audioRef.current) audioRef.current = new Ctx();
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);

  // Browsers only let audio start after a user gesture — warm the context up
  // on the first interaction so the ringtone/chime can sound when it fires.
  useEffect(() => {
    const resume = () => audioRef.current?.resume().catch(() => {});
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);

  /** One double-beep of the ringtone (classic two-tone ring). */
  const ringOnce = useCallback(() => {
    try {
      const ctx = getContext();
      if (!ctx || ctx.state === "suspended") return;
      const notes = [880, 1108.73]; // A5 → C#6 pair, twice per burst
      const start = ctx.currentTime;
      for (let round = 0; round < 2; round++) {
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = start + round * 0.6 + i * 0.18;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.4);
        });
      }
      if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]);
    } catch {
      // Audio/vibration is best-effort; the overlay still shows.
    }
  }, [getContext]);

  const startRinging = useCallback(() => {
    ringOnce();
    ringTimerRef.current = setInterval(ringOnce, 1800);
  }, [ringOnce]);

  const stopRinging = useCallback(() => {
    if (ringTimerRef.current) {
      clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    try {
      ("vibrate" in navigator) && navigator.vibrate?.(0);
    } catch {
      // Ignore.
    }
  }, []);

  const acceptCall = useCallback(
    (link: string) => {
      stopRinging();
      setCall(null);
      router.push(link);
    },
    [router, stopRinging]
  );

  const declineCall = useCallback(() => {
    stopRinging();
    if (call) setMissed(call);
    setCall(null);
  }, [call, stopRinging]);

  // Poll for due alarms (same dedupe rules as before).
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/alarms/check", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { alarms?: Alarm[] };
        if (cancelled || !data.alarms || data.alarms.length === 0) return;

        const shown = readShownIds();
        const unseen = data.alarms.find((a) => !shown.includes(a.notificationId));
        if (!unseen) return;
        shown.push(unseen.notificationId);
        try {
          localStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-20)));
        } catch {
          // Storage full or blocked — best effort.
        }
        if (isCallAlarm(unseen)) {
          setMissed(null);
          setCall(unseen);
        } else {
          setAlarm(unseen);
        }
      } catch {
        // Offline or transient — the next poll retries.
      }
    };

    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Ring while the incoming-call overlay is up; flip to "missed" after RING_MS.
  useEffect(() => {
    if (!call) return;
    startRinging();
    const t = setTimeout(() => {
      stopRinging();
      setMissed(call);
      setCall(null);
    }, RING_MS);
    return () => {
      clearTimeout(t);
      stopRinging();
    };
  }, [call, startRinging, stopRinging]);

  // Auto-dismiss the plain/missed banners after a minute.
  useEffect(() => {
    if (!alarm && !missed) return;
    const t = setTimeout(() => {
      setAlarm(null);
      setMissed(null);
    }, 60_000);
    return () => clearTimeout(t);
  }, [alarm, missed]);

  useEffect(() => () => stopRinging(), [stopRinging]);

  const banner = alarm ?? missed;
  const isMissedBanner = !alarm && Boolean(missed);

  return (
    <>
      {/* Incoming call — full-screen ringer */}
      {call && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#12100d]/97 px-6 text-center text-white backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#D9B76A]">
            Incoming call
          </p>
          <div className="relative mt-8">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#D9B76A]/20" />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] shadow-[0_10px_40px_rgba(217,183,106,0.4)]">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3B2F1E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 8-6 4 6 4V8Z" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            </div>
          </div>
          <h1 className="mt-7 text-2xl font-semibold">{call.title}</h1>
          <p className="mt-1 max-w-xs text-sm text-white/70">{call.body}</p>

          <div className="mt-12 flex items-center gap-14">
            <button
              type="button"
              onClick={declineCall}
              aria-label="Decline call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-[135deg]">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => call.link && acceptCall(call.link)}
              aria-label="Join call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] transition hover:brightness-105"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#06301b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-widest text-white/40">Join · Decline</p>
        </div>
      )}

      {/* Plain alarm / missed-call banner */}
      {banner && (
        <div className="fixed left-1/2 top-16 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-gold/40 bg-ivory p-4 shadow-[0_8px_24px_rgba(51,38,43,0.16)]">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isMissedBanner ? "bg-red-100" : "bg-gradient-to-b from-[#D9B76A] to-[#C9A24E]"}`}>
                {isMissedBanner ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    <path d="M3 3l18 18" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B2F1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold tracking-[0.2em] text-gold">
                  {isMissedBanner ? "MISSED CALL" : banner.type === "PRAYER" ? "PRAYER ALARM" : "NOTICE"}
                </div>
                <h2 className="mt-0.5 text-base font-semibold text-ink">{banner.title}</h2>
                <p className="mt-0.5 text-sm text-dim">{banner.body}</p>
              </div>
              {!isMissedBanner && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setAlarm(null)}
                  className="shrink-0 rounded-full p-1.5 text-dim transition hover:bg-ivory-lift hover:text-ink"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-3 border-t border-line pt-3 text-xs text-dim">
              {isMissedBanner && banner.link ? (
                <a href={banner.link} className="font-semibold text-gold hover:underline">
                  Tap here to join the Holy Hour call
                </a>
              ) : (
                "It is time for prayer. Let us pause and pray together."
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
