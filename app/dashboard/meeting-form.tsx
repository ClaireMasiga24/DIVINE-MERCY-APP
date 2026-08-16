"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const REMINDER_OPTIONS = [
  { value: 0, label: "At start time" },
  { value: 15, label: "15 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

const inputClass =
  "h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium text-ink shadow-sm outline-none placeholder:text-ink/50 focus:ring-2 focus:ring-white";

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/80";

export type InviteeOption = { id: string; fullName: string; phoneNumber: string };

export default function MeetingForm({ members }: { members: InviteeOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(15);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const minDateTime = new Date().toISOString().slice(0, 16);
  const valid = title.trim().length > 0 && startTime.length > 0;

  const toggleInvitee = (id: string) =>
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const q = search.trim().toLowerCase();
  const filtered = members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(q) ||
      m.phoneNumber.toLowerCase().includes(q)
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          startTime,
          location: location.trim(),
          reminderMinutesBefore,
          participantIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't schedule the meeting. Try again.");
        return;
      }
      setTitle("");
      setDescription("");
      setStartTime("");
      setLocation("");
      setReminderMinutesBefore(15);
      setParticipantIds([]);
      setSearch("");
      setSuccess(
        participantIds.length > 0
          ? "Meeting scheduled. Invited members will be notified."
          : "Meeting scheduled. You'll be reminded when it starts."
      );
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-4 rounded-3xl bg-gradient-to-br from-[#f6c0cf] to-[#ecc98c] p-5 shadow-[0_10px_30px_rgba(51,38,43,0.16)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/35 text-ink">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M12 14v6M9 17h6" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">Set Meeting</h2>
          <p className="text-sm text-ink/70">Schedule a parish video meeting and invite members.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="meeting-title" className={labelClass}>
            Title
          </label>
          <input
            id="meeting-title"
            type="text"
            autoComplete="off"
            placeholder="e.g. Parish council meeting"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="meeting-start" className={labelClass}>
            Date &amp; time
          </label>
          <input
            id="meeting-start"
            type="datetime-local"
            min={minDateTime}
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="meeting-location" className={labelClass}>
            Location (optional)
          </label>
          <input
            id="meeting-location"
            type="text"
            autoComplete="off"
            placeholder="Parish hall, Zoom link…"
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="meeting-description" className={labelClass}>
            Description (optional)
          </label>
          <textarea
            id="meeting-description"
            rows={2}
            maxLength={500}
            placeholder="What is this meeting about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} h-auto py-2.5`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="meeting-reminder" className={labelClass}>
            Remind members
          </label>
          <select
            id="meeting-reminder"
            value={reminderMinutesBefore}
            onChange={(e) => setReminderMinutesBefore(Number(e.target.value))}
            className={inputClass}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <span className={labelClass}>Invite members</span>
          <div className="overflow-hidden rounded-xl border border-white/60 bg-white/70 shadow-sm">
            <input
              id="meeting-invite-search"
              type="text"
              autoComplete="off"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full border-b border-white/60 bg-transparent px-3 text-sm font-medium text-ink outline-none placeholder:text-ink/50"
            />
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-ink/60">
                No members match — or everyone is already added.
              </p>
            ) : (
              <ul className="max-h-44 overflow-y-auto py-1">
                {filtered.map((m) => {
                  const checked = participantIds.includes(m.id);
                  return (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-white/50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInvitee(m.id)}
                          className="h-4 w-4 shrink-0 accent-[#c9a24e]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {m.fullName}
                          </span>
                          <span className="block text-xs text-ink/60">{m.phoneNumber}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink/70">
            {participantIds.length === 0
              ? "No one selected — you'll get the reminder yourself."
              : `${participantIds.length} member${participantIds.length === 1 ? "" : "s"} invited. You'll be added automatically.`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={!valid || busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink shadow-[0_4px_12px_rgba(51,38,43,0.16)] transition hover:shadow-[0_6px_16px_rgba(51,38,43,0.24)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? "Scheduling…" : "Schedule"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          className="mt-4 flex items-start gap-2 rounded-lg bg-white/60 px-4 py-3 text-sm text-ink"
        >
          <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          <span>{error ?? success}</span>
        </div>
      )}
    </form>
  );
}
