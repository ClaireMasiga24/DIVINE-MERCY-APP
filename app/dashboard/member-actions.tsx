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

type Props = {
  memberId: string;
  fullName: string;
  phoneNumber: string;
  /** Birthday as YYYY-MM-DD, or null/empty for "not set". */
  birthday: string | null;
  role: string;
  status: string;
  isSelf: boolean;
  canAssignTechLead: boolean;
};

function birthdayToInput(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  // date-fns isn't in the deps — keep it as a tiny inline formatter.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function MemberActions({
  memberId,
  fullName,
  phoneNumber,
  birthday,
  role,
  status,
  isSelf,
  canAssignTechLead,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Only the Technical Lead can assign the TECHNICAL_LEAD role.
  const availableRoles = canAssignTechLead ? ROLES : ROLES.filter((r) => r !== "TECHNICAL_LEAD");

  const patch = async (data: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Update failed.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || isSelf) return;
    if (!confirm("Delete this member? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Delete failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center justify-end gap-2">
        <select
          value={role}
          disabled={isSelf || busy || editing}
          title={isSelf ? "You can't change your own role here" : "Change role"}
          onChange={(e) => patch({ role: e.target.value })}
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-medium text-ink outline-none transition focus:ring-2 focus:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {availableRoles.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isSelf || busy || editing}
          title={isSelf ? "You can't deactivate your own account" : undefined}
          onClick={() => patch({ status: status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" })}
          className={
            status === "ACTIVE"
              ? "rounded-full border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
              : "rounded-full border border-[#B8975A] bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          }
        >
          {status === "ACTIVE" ? "Deactivate" : "Activate"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setEditing((v) => !v);
          }}
          aria-label={`Edit ${fullName}'s details`}
          aria-expanded={editing}
          title="Edit name, phone, and birthday"
          className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {editing ? "Close" : "Edit"}
        </button>
        <button
          type="button"
          disabled={isSelf || busy}
          title={isSelf ? "You can't delete your own account" : "Delete this member"}
          onClick={remove}
          aria-label="Delete member"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-dim transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>

      {editing && (
        <EditForm
          initial={{ fullName, phoneNumber, birthday: birthdayToInput(birthday) }}
          busy={busy}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSave={async (data) => {
            const ok = await patch(data);
            if (ok) setEditing(false);
          }}
        />
      )}
      {error && <span className="text-xs text-gold">{error}</span>}
    </div>
  );
}

const editInputClass =
  "h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink outline-none placeholder:text-dim/60 focus:ring-2 focus:ring-gold";
const editLabelClass =
  "mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim";

function EditForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: { fullName: string; phoneNumber: string; birthday: string };
  busy: boolean;
  onCancel: () => void;
  onSave: (data: { fullName: string; phoneNumber: string; birthday: string | null }) => Promise<void> | void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phoneNumber);
  const [birthday, setBirthday] = useState(initial.birthday);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      fullName: fullName.trim(),
      phoneNumber: phone.trim(),
      birthday: birthday.trim() === "" ? null : birthday,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-2 w-72 rounded-xl border border-line bg-ivory p-3 text-left shadow-sm"
    >
      <div>
        <label htmlFor={`edit-name-${initial.phoneNumber}`} className={editLabelClass}>
          Full name
        </label>
        <input
          id={`edit-name-${initial.phoneNumber}`}
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={editInputClass}
          maxLength={120}
          required
        />
      </div>
      <div className="mt-2">
        <label htmlFor={`edit-phone-${initial.phoneNumber}`} className={editLabelClass}>
          Phone
        </label>
        <input
          id={`edit-phone-${initial.phoneNumber}`}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={editInputClass}
          required
        />
      </div>
      <div className="mt-2">
        <label htmlFor={`edit-bday-${initial.phoneNumber}`} className={editLabelClass}>
          Birthday
        </label>
        <input
          id={`edit-bday-${initial.phoneNumber}`}
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className={editInputClass}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-dim transition hover:border-line hover:text-ink disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full border border-[#B8975A] bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] px-3 py-1.5 text-xs font-semibold text-[#3B2F1E] shadow-[0_2px_8px_rgba(180,140,60,0.3)] transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
