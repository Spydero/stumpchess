"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

type InboxRow = {
  id: string;
  updatedAt: string;
  unread: boolean;
  other: { id: string; username: string; image?: string | null } | null;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
};

export default function MessagesPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string } | undefined;
  const router = useRouter();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  function load() {
    if (!user) return;
    apiFetch("/api/messages", { userId: user.id })
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(() => {
    if (user) load();
  }, [user?.id]);

  async function startChat(e: FormEvent) {
    e.preventDefault();
    if (!user) return router.push("/login");
    setError("");
    try {
      const conv = await apiFetch("/api/messages/with", {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ username: username.trim() }),
      });
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;
  if (!user) {
    return (
      <div className="panel p-6 max-w-lg rise-in">
        <p className="forum-kicker">Messages</p>
        <h1 className="text-3xl mt-1 mb-3">Sign in required</h1>
        <Link href="/login" className="btn btn-accent">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="rise-in">
      <header className="page-hero mb-5">
        <p className="forum-kicker">Social</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Messages</h1>
        <p className="muted ui text-base max-w-xl m-0">Direct messages with clubmates.</p>
      </header>

      <form onSubmit={startChat} className="panel p-4 mb-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="ui text-xs muted block mb-1">Message username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            required
          />
        </div>
        <button type="submit" className="btn btn-accent">
          Open chat
        </button>
      </form>
      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="forum-empty">
            <h3>No conversations yet</h3>
            <p className="muted ui text-sm mb-0">Start one with a username above.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="table-row ui text-sm">
              <Link href={`/messages/${r.id}`} className="min-w-0 flex-1">
                <span className="font-semibold">
                  {r.other?.username || "Unknown"}
                  {r.unread ? <span className="unread-dot" aria-label="Unread" /> : null}
                </span>
                {r.lastMessage && (
                  <span className="block muted truncate text-xs mt-0.5">{r.lastMessage.body}</span>
                )}
              </Link>
              <span className="muted shrink-0 text-xs flex items-center gap-2">
                {r.other?.username ? (
                  <Link
                    href={`/watch?u=${encodeURIComponent(r.other.username)}`}
                    className="link-accent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Watch
                  </Link>
                ) : null}
                {r.lastMessage
                  ? new Date(r.lastMessage.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
