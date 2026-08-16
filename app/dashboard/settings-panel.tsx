"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initial: { discussionEnabled: boolean; commentsEnabled: boolean };
};

const TOGGLES = [
  {
    key: "discussionEnabled" as const,
    label: "Discussion board",
    desc: "Members can message each other in the Discussion section.",
  },
  {
    key: "commentsEnabled" as const,
    label: "Comments",
    desc: "Members can comment on posts and announcements.",
  },
];

export default function SettingsPanel({ initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: "discussionEnabled" | "commentsEnabled", next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setValues((v) => ({ ...v, [key]: next }));
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setValues((v) => ({ ...v, [key]: !next }));
        setError(j.error ?? "Couldn't save the setting.");
        return;
      }
      router.refresh();
    } catch {
      setValues((v) => ({ ...v, [key]: !next }));
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E2D9C4] bg-white p-5 shadow-sm sm:p-6">
      <div className="space-y-5">
        {TOGGLES.map(({ key, label, desc }) => {
          const on = values[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[#2B2115]">{label}</div>
                <div className="text-xs text-[#8A7C63]">{desc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={label}
                disabled={busy}
                onClick={() => toggle(key, !on)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                  on ? "bg-gradient-to-b from-[#D9B76A] to-[#C9A24E]" : "bg-[#E2D9C4]"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    on ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-4 text-xs text-[#8A6D2F]">{error}</p>}
      <p className="mt-5 border-t border-[#F0E8D6] pt-3 text-xs text-[#B5A98F]">
        Changes apply immediately. The Discussion toggle controls the Discussion
        section (member directory and private chats).
      </p>
    </div>
  );
}
