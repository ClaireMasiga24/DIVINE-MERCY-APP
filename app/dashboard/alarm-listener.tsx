"use client";

import { useEffect, useRef, useState } from "react";

/**
 * While the app is open, polls for due alarms and rings an in-app chime +
 * banner. The server-side sweep (web push) covers the app-closed case; this
 * covers the case where the member is already looking at the app.
 *
 * Serves both the Holy Hour alarm and meeting reminders: the poll endpoint
 * returns the last few minutes' deliveries (types EVENT, PRAYER, MEETING),
 * and the banner copy adapts to the notification type.
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

export default function AlarmListener() {
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const playChime = () => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
        return;
      }
      // A soft bell arpeggio: A5, C#6, E6.
      const notes = [880, 1108.73, 1318.51];
      const start = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = start + i * 0.22;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.2);
      });
      if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200, 100, 400]);
    } catch {
      // Audio is best-effort; the banner still shows.
    }
  };

  // Browsers only let audio start after a user gesture — warm the context up
  // on the first interaction so the chime can ring when the alarm fires.
  useEffect(() => {
    const resume = () => audioRef.current?.resume().catch(() => {});
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/alarms/check", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { alarms?: Alarm[] };
        if (cancelled || !data.alarms || data.alarms.length === 0) return;

        // Show the first alarm we haven't rung yet — one banner at a time, but
        // a meeting reminder isn't dropped just because a Holy Hour alarm was
        // shown minutes earlier (each notification id is remembered).
        const shown = readShownIds();
        const unseen = data.alarms.find((a) => !shown.includes(a.notificationId));
        if (!unseen) return;
        shown.push(unseen.notificationId);
        try {
          localStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-20)));
        } catch {
          // Storage full or blocked — best effort.
        }
        setAlarm(unseen);
        playChime();
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

  // Auto-dismiss the banner after a minute.
  useEffect(() => {
    if (!alarm) return;
    const t = setTimeout(() => setAlarm(null), 60_000);
    return () => clearTimeout(t);
  }, [alarm]);

  if (!alarm) return null;

  const isMeeting = alarm.type === "MEETING";
  const eyebrow = isMeeting ? "MEETING REMINDER" : "PRAYER ALARM";
  const footer = isMeeting
    ? "A meeting is scheduled. Please join on time."
    : "It is time for prayer. Let us pause and pray together.";

  return (
    <div className="fixed left-1/2 top-16 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2">
      <div className="rounded-2xl border border-gold/40 bg-ivory p-4 shadow-[0_8px_24px_rgba(51,38,43,0.16)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B2F1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-[0.2em] text-gold">{eyebrow}</div>
            <h2 className="mt-0.5 text-base font-semibold text-ink">{alarm.title}</h2>
            <p className="mt-0.5 text-sm text-dim">{alarm.body}</p>
          </div>
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
        </div>
        <div className="mt-3 border-t border-line pt-3 text-xs text-dim">{footer}</div>
      </div>
    </div>
  );
}
