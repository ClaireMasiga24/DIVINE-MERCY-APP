import HolyHourCard from "./holy-hour-card";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

/**
 * The Events section: the inbuilt daily Holy Hour alarm. It is always on and
 * needs no configuration — it rings for every active member (except the
 * Technical Lead) at 03:00 and 15:00 Kampala time.
 */
export default function EventManagement() {
  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>DAILY HOLY HOUR ALARM</SectionLabel>
        <HolyHourCard />
      </section>
    </div>
  );
}
