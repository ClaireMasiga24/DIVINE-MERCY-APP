import {
  getNextHolyHourUtc,
  HOLY_HOUR_TIMES,
  HOLY_HOUR_SCHEDULE,
  getKampalaWeekdayKey,
  KAMPALA_TZ,
} from "@/lib/alarms";

const formatTimeLabel = (t: string) => {
  const [hh, mm] = t.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour}:${String(mm).padStart(2, "0")} ${suffix}`;
};

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Build the UTC candidate for a given Kampala-local time on `now`'s day,
 * matching the math in `lib/alarms.ts` (getDailyHolyHourTargetUtc /
 * getNextHolyHourUtc). Used here to compute "is there a call still left
 * today?".
 */
function kampalaCandidateForToday(time: string, now: Date): Date {
  const [hh, mm] = time.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KAMPALA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value;
  const year = Number(p("year"));
  const month = Number(p("month"));
  const day = Number(p("day"));
  const offsetMs = (() => {
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: KAMPALA_TZ,
      timeZoneName: "longOffset",
    }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value ?? "+00:00";
    const m = /([+-])(\d{2}):(\d{2})/.exec(offset);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3])) * 60 * 1000;
  })();
  return new Date(Date.UTC(year, month - 1, day, hh, mm, 0) - offsetMs);
}

/**
 * The daily Holy Hour group call — inbuilt and always on. The system itself
 * calls the parish together at the fixed Holy Hour times (03:00 and 15:00,
 * Africa/Kampala) for most of the week. Saturday is 3 AM only; Sunday has
 * no call. Every member gets a ring and can hop into the video/audio room
 * with one tap.
 */
export default function HolyHourCard() {
  const now = new Date();
  const todaysTimes = HOLY_HOUR_SCHEDULE[getKampalaWeekdayKey(now)];
  const remainingToday = todaysTimes.filter((t) =>
    kampalaCandidateForToday(t, now).getTime() > now.getTime()
  );
  const noCallToday = remainingToday.length === 0;
  const nextLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(getNextHolyHourUtc(now));

  return (
    <div className="rounded-2xl border border-line bg-ivory p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] shadow-[0_4px_14px_rgba(180,140,60,0.35)]">
          <BellIcon className="h-6 w-6 text-[#3B2F1E]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">Holy Hour group call</div>
          <p className="mt-0.5 text-xs text-dim">
            The system rings every member automatically at 3:00 AM and 3:00 PM
            (Kampala time) on weekdays — no scheduling needed. Tap Join to
            enter the call; latecomers can hop in any time during the hour.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {HOLY_HOUR_TIMES.map((t) => (
          <span
            key={t}
            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-semibold text-gold"
          >
            {formatTimeLabel(t)}
          </span>
        ))}
        <span className="text-xs text-dim">Mon–Fri · Africa/Kampala</span>
        <span className="text-[11px] text-dim">· Sat: 3 AM only · Sun: no call</span>
      </div>

      {noCallToday ? (
        <p className="mt-4 rounded-lg border border-line bg-ivory-lift px-4 py-2.5 text-sm text-dim">
          No call scheduled for the rest of today.{" "}
          <span className="font-semibold text-gold">
            Next Holy Hour: {nextLabel}
          </span>
        </p>
      ) : (
        <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm text-dim">
          Next Holy Hour: <span className="font-semibold text-gold">{nextLabel}</span>
        </p>
      )}
    </div>
  );
}
