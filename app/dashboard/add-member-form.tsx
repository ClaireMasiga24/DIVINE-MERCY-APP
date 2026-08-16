"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  "MEMBER",
  "SECRETARY",
  "TREASURER",
  "MOBILISER",
  "PRO",
  "CHAIRPERSON",
  "PATRON",
  "TECHNICAL_LEAD",
];

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink shadow-sm outline-none placeholder:text-dim/60 focus:ring-2 focus:ring-gold";

const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-dim";

export default function AddMemberForm({ canAssignTechLead }: { canAssignTechLead: boolean }) {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Only the Technical Lead can assign the TECHNICAL_LEAD role — for everyone
  // else that option doesn't exist.
  const availableRoles = canAssignTechLead ? ROLES : ROLES.filter((r) => r !== "TECHNICAL_LEAD");

  const valid = digits.length === 9 && fullName.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/members/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: `+256${digits}`, fullName: fullName.trim(), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't add the member. Try again.");
        return;
      }
      setDigits("");
      setFullName("");
      setRole("MEMBER");
      setSuccess(`${data.user.fullName} was added as ${data.user.role.replace("_", " ")}.`);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-ivory p-5 shadow-sm sm:p-6">
      <div className="grid items-end gap-3 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <label htmlFor="new-phone" className={labelClass}>
            Phone
          </label>
          <div className="flex overflow-hidden rounded-xl border border-line bg-white shadow-sm focus-within:ring-2 focus-within:ring-gold">
            <span className="flex items-center border-r border-line bg-ivory-lift px-3 text-sm font-semibold text-dim">
              +256
            </span>
            <input
              id="new-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="7XX XXX XXX"
              maxLength={9}
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
              className="h-11 w-full bg-transparent px-3 text-sm font-medium text-ink outline-none placeholder:text-dim/60"
            />
          </div>
        </div>

        <div className="sm:col-span-5">
          <label htmlFor="new-name" className={labelClass}>
            Full name
          </label>
          <input
            id="new-name"
            type="text"
            autoComplete="off"
            placeholder="e.g. Aisha Nakato"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="new-role" className={labelClass}>
            Role
          </label>
          <select
            id="new-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={!valid || busy}
            className="h-11 w-full rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-sm font-semibold text-[#3B2F1E] shadow-[0_4px_14px_rgba(180,140,60,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? "Adding…" : "Add member"}
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          className="mt-4 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-dim"
        >
          <svg className="mt-0.5 shrink-0 text-gold" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          <span>{error ?? success}</span>
        </div>
      )}
    </form>
  );
}
