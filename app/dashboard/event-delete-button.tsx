"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EventDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Delete "${title}"? Its alarm is removed too.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't delete the event.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-full border border-[#E2D9C4] bg-white px-3 py-1 text-xs font-semibold text-[#6B5D4F] transition hover:border-[#D9C8A8] hover:bg-[#FBF7EC] disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="ml-2 text-xs text-[#8A6D2F]">{error}</span>}
    </span>
  );
}
