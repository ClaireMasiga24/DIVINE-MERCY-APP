import { getNextHolyHourUtc, HOLY_HOUR_TIMES } from "@/lib/alarms";

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
 * The daily Holy Hour alarm — inbuilt and always on. It rings every day at the
 * fixed Holy Hour times (03:00 and 15:00, Africa/Kampala) for all active
 * members, with a push notification and an in-app chime while the app is open.
 */
export default function HolyHourCard() {
  const nextLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(getNextHolyHourUtc());

  return (
    <div className="rounded-2xl border border-line bg-ivory p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] shadow-[0_4px_14px_rgba(180,140,60,0.35)]">
          <BellIcon className="h-6 w-6 text-[#3B2F1E]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">Holy Hour alarm</div>
          <p className="mt-0.5 text-xs text-dim">
            Rings every day at 3:00 AM and 3:00 PM (Kampala time) for all members —
            push notification, and an in-app chime while the app is open.
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
        <span className="text-xs text-dim">every day · Africa/Kampala</span>
      </div>

      <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm text-dim">
        Next Holy Hour: <span className="font-semibold text-gold">{nextLabel}</span>
      </p>
    </div>
  );
}
