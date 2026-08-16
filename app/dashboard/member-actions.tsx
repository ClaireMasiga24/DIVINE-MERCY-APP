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
  role: string;
  status: string;
  isSelf: boolean;
  canAssignTechLead: boolean;
};

export default function MemberActions({ memberId, role, status, isSelf, canAssignTechLead }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the Technical Lead can assign the TECHNICAL_LEAD role.
  const availableRoles = canAssignTechLead ? ROLES : ROLES.filter((r) => r !== "TECHNICAL_LEAD");

  const patch = async (data: { role?: string; status?: string }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Update failed.");
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
          disabled={isSelf || busy}
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
          disabled={isSelf || busy}
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
      </div>
      {error && <span className="text-xs text-gold">{error}</span>}
    </div>
  );
}
