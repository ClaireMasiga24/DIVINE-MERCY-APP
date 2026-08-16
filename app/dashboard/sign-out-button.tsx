"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear the cookie server-side anyway via the redirect flow below.
    }
    window.location.assign("/login");
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-dim transition hover:border-gold hover:text-ink disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
