"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

type Msg = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  sender?: { id: string; username: string };
};

type Conv = {
  id: string;
  participants: { userId: string; user: { id: string; username: string } }[];
  messages: Msg[];
};

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; username?: string; name?: string } | undefined;
  const router = useRouter();
  const [conv, setConv] = useState<Conv | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function load() {
    if (!user) return;
    apiFetch(`/api/messages/${params.id}`, { userId: user.id })
      .then(setConv)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!user) return;
    load();
    const s = getSocket();
    s.connect();
    s.emit("auth", { userId: user.id, username: user.username || user.name || user.id });
    s.emit("dm:subscribe");
    const onMsg = (payload: { conversationId: string; message: Msg }) => {
      if (payload.conversationId !== params.id) return;
      setConv((c) => {
        if (!c) return c;
        if (c.messages.some((m) => m.id === payload.message.id)) return c;
        return { ...c, messages: [...c.messages, payload.message] };
      });
    };
    s.on("dm:message", onMsg);
    return () => {
      s.off("dm:message", onMsg);
    };
  }, [user?.id, params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!user || !body.trim()) return;
    const text = body.trim();
    setBody("");
    try {
      getSocket().emit("dm:send", { conversationId: params.id, body: text });
      // Optimistic fallback if socket ack is slow: reload shortly
      setTimeout(load, 400);
    } catch {
      setError("Send failed");
    }
  }

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;
  if (!user) {
    router.push("/login");
    return null;
  }

  const other = conv?.participants.find((p) => p.userId !== user.id)?.user;

  return (
    <div className="rise-in max-w-2xl mx-auto flex flex-col" style={{ minHeight: "60vh" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <Link href="/messages" className="ui text-sm link-accent">
            All messages
          </Link>
          <h1 className="text-2xl m-0 mt-1">{other?.username || "Chat"}</h1>
        </div>
        {other && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href={`/watch?u=${encodeURIComponent(other.username)}`}
              className="btn btn-ghost !py-1.5 !px-3 !text-sm"
            >
              Watch games
            </Link>
            <Link href={`/u/${other.username}`} className="btn btn-ghost !py-1.5 !px-3 !text-sm">
              Profile
            </Link>
          </div>
        )}
      </div>

      {error && <p className="text-[var(--danger)] ui text-sm mb-2">{error}</p>}

      <div className="panel flex-1 overflow-y-auto p-4 mb-3" style={{ maxHeight: "55vh" }}>
        {!conv ? (
          <p className="ui muted pulse-soft">Loading…</p>
        ) : conv.messages.length === 0 ? (
          <p className="ui muted text-sm m-0">Say hello.</p>
        ) : (
          <ul className="dm-list">
            {conv.messages.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <li key={m.id} className={`dm-bubble ${mine ? "mine" : "theirs"}`}>
                  <p className="m-0">{m.body}</p>
                  <span className="dm-time">
                    {new Date(m.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className="input flex-1"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          required
        />
        <button type="submit" className="btn btn-accent">
          Send
        </button>
      </form>
    </div>
  );
}
