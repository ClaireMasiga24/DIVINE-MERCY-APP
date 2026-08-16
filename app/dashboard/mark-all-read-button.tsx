"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marks the viewer's notifications as read, then refreshes the page. */
export default function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      router.refresh();
    } catch {
      // Best effort.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={busy}
      className="rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold-deep transition hover:bg-gold/20 disabled:opacity-50"
    >
      {busy ? "Marking…" : "Mark all read"}
    </button>
  );
}
