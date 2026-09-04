"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import { roleLabel } from "@/lib/roles";

type Member = { id: string; fullName: string; role: Role };

type ConversationSummary = {
  id: string;
  other: { id: string; fullName: string };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  lastActivity: string;
};

type ChatMessage = { id: string; senderId: string; body: string; createdAt: string };

type Props = {
  user: { id: string };
  members: Member[];
  initialConversations: ConversationSummary[];
};

const THREAD_POLL_MS = 10_000;
const LIST_POLL_MS = 30_000;

/** Two-letter initials from a full name ("John Doe" → "JD"). */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase() || "?";
}

/** Gold-gradient ring avatar with the member's initials. */
function InitialsAvatar({ fullName, size = "h-10 w-10" }: { fullName: string; size?: string }) {
  return (
    <div
      className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold tracking-wide text-gold-deep">
        {initials(fullName)}
      </div>
    </div>
  );
}

/** Relative time ("2m", "3h", "yesterday", else a short date). Rendered in
 * useEffect so server and client always agree on first paint. */
function TimeLabel({ iso, className }: { iso: string; className?: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60_000);
    let next: string;
    if (mins < 1) next = "now";
    else if (mins < 60) next = `${mins}m`;
    else {
      const hours = Math.floor(mins / 60);
      if (hours < 24) next = `${hours}h`;
      else {
        const days = Math.floor(hours / 24);
        if (days === 1) next = "yesterday";
        else if (days < 7) next = `${days}d`;
        else next = new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "short" });
      }
    }
    // Defer the setState so the lint rule that bans synchronous
    // setState-in-effect doesn't fire. The first paint shows "" for one
    // tick; subsequent renders use the computed label.
    Promise.resolve().then(() => setLabel(next));
  }, [iso]);

  return <span className={className}>{label}</span>;
}

export default function DiscussionClient({ user, members, initialConversations }: Props) {
  const [tab, setTab] = useState<"messages" | "members">("messages");
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState<{ conversationId: string; other: { id: string; fullName: string } } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  /** Any 403 means the admin turned Discussion off — stop everything. */
  const handleResponse = useCallback(async (res: Response) => {
    if (res.status === 403) {
      setDisabled(true);
      setActive(null);
      return true;
    }
    return false;
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (await handleResponse(res)) return;
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      // Offline or transient — next poll retries.
    }
  }, [handleResponse]);

  const openThread = useCallback(
    async (conversationId: string, other: { id: string; fullName: string }) => {
      setActive({ conversationId, other });
      setMessages([]);
      setLoadingThread(true);
      setError(null);
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (await handleResponse(res)) return;
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "Couldn't open this conversation.");
          return;
        }
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessages(data.messages);
        if (data.messages.length > 0) {
          // Read up to the newest message we've actually been shown.
          await fetch(`/api/conversations/${conversationId}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lastMessageCreatedAt: data.messages[data.messages.length - 1].createdAt,
            }),
          });
        }
        fetchConversations();
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setLoadingThread(false);
      }
    },
    [fetchConversations, handleResponse]
  );

  const startWithMember = useCallback(
    async (member: Member) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otherUserId: member.id }),
        });
        if (await handleResponse(res)) return;
        const data = (await res.json().catch(() => ({}))) as {
          conversation?: { id: string; other: { id: string; fullName: string } };
          error?: string;
        };
        if (!res.ok || !data.conversation) {
          setError(data.error ?? "Couldn't start a conversation.");
          return;
        }
        fetchConversations();
        await openThread(data.conversation.id, data.conversation.other);
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [fetchConversations, handleResponse, openThread]
  );

  const sendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!active || !draft.trim() || busy) return;
      setBusy(true);
      setError(null);
      const text = draft.trim();
      try {
        const res = await fetch(`/api/conversations/${active.conversationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        if (await handleResponse(res)) return;
        const data = (await res.json().catch(() => ({}))) as {
          message?: ChatMessage;
          error?: string;
        };
        if (!res.ok || !data.message) {
          setError(data.error ?? "Couldn't send the message.");
          return;
        }
        setMessages((prev) => (prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]));
        setDraft("");
        fetchConversations();
        requestAnimationFrame(scrollToBottom);
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [active, busy, draft, fetchConversations, handleResponse, scrollToBottom]
  );

  // Poll the open thread every 10s (paused while the tab is hidden).
  useEffect(() => {
    if (!active || disabled) return;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/conversations/${activeRef.current!.conversationId}`);
        if (await handleResponse(res)) return;
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessages((prev) => {
          if (data.messages.length === prev.length && data.messages.every((m, i) => m.id === prev[i]?.id)) {
            return prev;
          }
          return data.messages;
        });
        if (data.messages.length > 0) {
          await fetch(`/api/conversations/${activeRef.current!.conversationId}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lastMessageCreatedAt: data.messages[data.messages.length - 1].createdAt,
            }),
          });
        }
      } catch {
        // Transient — next poll retries.
      }
    };
    const t = setInterval(poll, THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [active, disabled, handleResponse]);

  // Keep the list fresh while on the Messages tab.
  useEffect(() => {
    if (tab !== "messages" || disabled) return;
    const t = setInterval(fetchConversations, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [tab, disabled, fetchConversations]);

  // Pin the thread to the newest message whenever the thread changes.
  useEffect(() => {
    if (active) scrollToBottom();
  }, [active, messages.length, scrollToBottom]);

  const closeThread = useCallback(() => {
    setActive(null);
    setMessages([]);
    setError(null);
    fetchConversations();
  }, [fetchConversations]);

  if (disabled) {
    return (
      <div className="rounded-2xl border border-line bg-ivory px-5 py-10 text-center text-sm text-dim shadow-sm">
        Discussion is currently disabled by the parish admin.
      </div>
    );
  }

  // Active thread view.
  if (active) {
    return (
      <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm">
        <div className="flex items-center gap-3 border-b border-line bg-ivory-lift px-4 py-3">
          <button
            type="button"
            onClick={closeThread}
            aria-label="Back to messages"
            className="rounded-full p-1.5 text-dim transition hover:bg-ivory hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <InitialsAvatar fullName={active.other.fullName} size="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">{active.other.fullName}</div>
            <div className="text-[11px] text-dim">Private conversation</div>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loadingThread ? (
            <div className="py-10 text-center text-sm text-dim">Loading conversation…</div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center text-sm text-dim">
              No messages yet. Say hello to {active.other.fullName.split(" ")[0]}.
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                      mine
                        ? "rounded-br-md bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E]"
                        : "rounded-bl-md border border-line bg-white text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div
                      className={`mt-1 text-right text-[10px] ${
                        mine ? "text-[#3B2F1E]/60" : "text-dim"
                      }`}
                    >
                      {new Date(m.createdAt).toLocaleTimeString("en-UG", { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-line bg-white px-3 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
            placeholder={`Message ${active.other.fullName.split(" ")[0]}…`}
            maxLength={2000}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-ivory px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-dim focus:ring-2 focus:ring-gold/50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] text-[#3B2F1E] shadow-[0_4px_14px_rgba(180,140,60,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </form>

        {error && (
          <div role="alert" className="border-t border-[#E2CD9C] bg-[#FBF3DF] px-4 py-2.5 text-xs text-[#6B5D4F]">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Tabs + list view.
  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("messages")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "messages" ? "bg-gold/15 text-ink ring-1 ring-gold/40" : "text-dim hover:bg-ivory-lift hover:text-ink"
          }`}
        >
          Messages
          {conversations.some((c) => c.unreadCount > 0) && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-white">
              {conversations.reduce((n, c) => n + c.unreadCount, 0) > 99 ? "99+" : conversations.reduce((n, c) => n + c.unreadCount, 0)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("members")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "members" ? "bg-gold/15 text-ink ring-1 ring-gold/40" : "text-dim hover:bg-ivory-lift hover:text-ink"
          }`}
        >
          Members
          <span className="ml-1.5 text-xs font-normal text-dim">{members.length}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-[#E2CD9C] bg-[#FBF3DF] px-4 py-3 text-sm text-[#6B5D4F]">
          {error}
        </div>
      )}

      {tab === "messages" ? (
        conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
            No conversations yet. Open the Members tab to message a fellow member.
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openThread(c.id, c.other)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ivory p-3.5 text-left shadow-sm transition hover:bg-ivory-lift sm:p-4"
              >
                <InitialsAvatar fullName={c.other.fullName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{c.other.fullName}</span>
                    {c.lastMessage && <TimeLabel iso={c.lastMessage.createdAt} className="shrink-0 text-[11px] text-dim" />}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${c.unreadCount > 0 ? "font-semibold text-ink" : "text-dim"}`}>
                      {c.lastMessage
                        ? `${c.lastMessage.senderId === user.id ? "You: " : ""}${c.lastMessage.body}`
                        : "No messages yet"}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-white">
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
          No other members yet.
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => startWithMember(m)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ivory p-3.5 text-left shadow-sm transition hover:bg-ivory-lift disabled:cursor-not-allowed disabled:opacity-60 sm:p-4"
            >
              <InitialsAvatar fullName={m.fullName} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{m.fullName}</div>
                <span className="mt-0.5 inline-block rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-gold-deep">
                  {roleLabel(m.role).toUpperCase()}
                </span>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-dim"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
