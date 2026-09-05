"use client";

import { useState } from "react";
import { wipeClientSession } from "@/lib/client-wipe";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Server side first — this revokes the Session row and clears
      // both cookies. Authoritative.
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Even if the network call failed, fall through to client wipe
        // and the redirect — the user's intent is "get me out."
      }
      // Client side — clear localStorage, IndexedDB, SW caches,
      // unsubscribe push. Best-effort; wrapped in a 1.5s timeout
      // internally so it can't hang the redirect.
      await wipeClientSession();
    } finally {
      // The redirect MUST happen, even if both the fetch and the wipe
      // threw — the user is trying to leave.
      window.location.assign("/login");
    }
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
