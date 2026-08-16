"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  { value: "HOLY_HOUR", label: "Holy Hour" },
  { value: "MEETING", label: "Meeting" },
  { value: "PRAYER_MEETING", label: "Prayer Meeting" },
  { value: "RECOLLECTION", label: "Recollection" },
  { value: "BENEDICTION", label: "Benediction" },
  { value: "HOLY_MASS", label: "Holy Mass" },
  { value: "NOVENA", label: "Novena" },
  { value: "OTHER", label: "Other" },
];

const LEAD_MINUTES = [
  { value: 0, label: "At start time" },
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
];

const inputClass =
  "h-11 w-full rounded-xl border border-[#E2D9C4] bg-white px-3 text-sm font-medium text-[#2B2115] shadow-sm outline-none placeholder:text-[#B5A98F] focus:ring-2 focus:ring-[#B8975A]";

export default function EventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("HOLY_HOUR");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [leadMinutes, setLeadMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const valid = title.trim().length > 0 && start.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          startTime: new Date(start).toISOString(),
          endTime: end ? new Date(end).toISOString() : null,
          location: location.trim(),
          alarmEnabled,
          alarmLeadMinutes: leadMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't schedule the event. Try again.");
        return;
      }
      setTitle("");
      setStart("");
      setEnd("");
      setLocation("");
      setType("HOLY_HOUR");
      setAlarmEnabled(true);
      setLeadMinutes(0);
      setSuccess(`"${data.event.title}" is on the calendar${alarmEnabled ? ", alarm set" : ""}.`);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#E2D9C4] bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <label htmlFor="ev-title" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
            Title
          </label>
          <input
            id="ev-title"
            type="text"
            placeholder="e.g. Holy Hour & Chaplet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-3">
          <label htmlFor="ev-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
            Type
          </label>
          <select id="ev-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="ev-start" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
            Starts
          </label>
          <input
            id="ev-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="ev-end" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
            Ends (optional)
          </label>
          <input
            id="ev-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="ev-location" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
            Location (optional)
          </label>
          <input
            id="ev-location"
            type="text"
            placeholder="e.g. Seeta Parish Chapel"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex items-end gap-6 sm:col-span-4">
          <div>
            <label htmlFor="ev-alarm" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
              Alarm
            </label>
            <button
              id="ev-alarm"
              type="button"
              role="switch"
              aria-checked={alarmEnabled}
              aria-label="Alarm for this event"
              onClick={() => setAlarmEnabled((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition ${
                alarmEnabled ? "bg-gradient-to-b from-[#D9B76A] to-[#C9A24E]" : "bg-[#E2D9C4]"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  alarmEnabled ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
          {alarmEnabled && (
            <div className="flex-1">
              <label htmlFor="ev-lead" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B5D4F]">
                Ring
              </label>
              <select id="ev-lead" value={leadMinutes} onChange={(e) => setLeadMinutes(Number(e.target.value))} className={inputClass}>
                {LEAD_MINUTES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="sm:col-span-12">
          <button
            type="submit"
            disabled={!valid || busy}
            className="h-11 rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-6 text-sm font-semibold text-[#3B2F1E] shadow-[0_4px_14px_rgba(180,140,60,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? "Scheduling…" : "Schedule event"}
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          className="mt-4 flex items-start gap-2 rounded-lg border border-[#E2CD9C] bg-[#FBF3DF] px-4 py-3 text-sm text-[#6B5D4F]"
        >
          <svg className="mt-0.5 shrink-0 text-[#B8975A]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          <span>{error ?? success}</span>
        </div>
      )}
    </form>
  );
}
