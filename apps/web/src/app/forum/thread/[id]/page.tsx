"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { formatRelativeTime } from "@/lib/time";

type Post = {
  id: string;
  body: string;
  createdAt: string;
  author: { username: string; role: string; image?: string | null };
};

type Thread = {
  id: string;
  title: string;
  locked: boolean;
  category: { slug: string; name: string };
  posts: Post[];
};

function postAccent(role: string) {
  switch (role) {
    case "OWNER":
      return "var(--role-owner)";
    case "MANAGER":
      return "var(--role-manager)";
    case "LTA":
      return "var(--role-lta)";
    case "STA":
      return "var(--role-sta)";
    case "VIP_PERM":
      return "var(--role-vip)";
    case "VIP_30":
      return "var(--role-vip30)";
    default:
      return "var(--accent)";
  }
}

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useSession();
  const user = data?.user as { id: string; username?: string; name?: string; role?: string } | undefined;
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch(`/api/forum/threads/${id}`).then(setThread).catch(() => setThread(null));
  }

  useEffect(load, [id]);

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return router.push("/login");
    setSending(true);
    setError("");
    try {
      await apiFetch(`/api/forum/threads/${id}/posts`, {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({ body: replyBody }),
      });
      setReplyBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reply");
    } finally {
      setSending(false);
    }
  }

  const chars = replyBody.trim().length;

  const sortedPosts = useMemo(() => thread?.posts || [], [thread]);

  if (!thread) {
    return <p className="pulse-soft ui muted">Loading thread…</p>;
  }

  return (
    <div className="max-w-3xl rise-in">
      <nav className="ui text-sm flex flex-wrap items-center gap-1.5 muted mb-3">
        <Link href="/forum" className="link-accent">
          Forum
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/forum/${thread.category.slug}`} className="link-accent">
          {thread.category.name}
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {thread.locked && <span className="forum-chip forum-chip--lock">Locked</span>}
          <span className="forum-chip">{sortedPosts.length} posts</span>
        </div>
        <h1 className="text-3xl m-0">{thread.title}</h1>
      </header>

      <div className="space-y-3 mb-6">
        {sortedPosts.map((p, i) => (
          <article
            key={p.id}
            className={`panel forum-post rise-in ${i === 0 ? "" : `rise-in-delay-${Math.min(3, (i % 3) + 1)}`}`}
            style={{ ["--post-accent" as string]: postAccent(p.author.role) }}
          >
            <UserAvatar
              username={p.author.username}
              image={p.author.image}
              role={p.author.role}
              size={42}
            />
            <div className="min-w-0">
              <header className="flex flex-wrap items-center gap-2 mb-2 ui text-sm">
                <Link
                  href={`/u/${p.author.username}`}
                  className="font-semibold hover:text-[var(--accent)] transition-colors"
                >
                  {p.author.username}
                </Link>
                {p.author.role !== "MEMBER" && <RoleBadge role={p.author.role} />}
                {i === 0 && <span className="forum-chip">OP</span>}
                <time
                  className="muted text-xs ml-auto"
                  dateTime={p.createdAt}
                  title={new Date(p.createdAt).toLocaleString()}
                >
                  {formatRelativeTime(p.createdAt)}
                </time>
              </header>
              <p className="forum-post-body">{p.body}</p>
            </div>
          </article>
        ))}
      </div>

      {!thread.locked ? (
        <form onSubmit={reply} className="panel p-4 space-y-3">
          <div className="flex items-center gap-2 ui text-sm">
            {user ? (
              <>
                <UserAvatar
                  username={user.username || user.name || "you"}
                  role={user.role}
                  size={28}
                />
                <span className="muted">Replying as</span>
                <strong>{user.username || user.name}</strong>
              </>
            ) : (
              <span className="muted">Sign in to join the discussion</span>
            )}
          </div>
          <textarea
            className="input min-h-28"
            name="body"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={user ? "Write a reply…" : "Log in to reply"}
            required
            disabled={!user || sending}
            onFocus={() => {
              if (!user) router.push("/login");
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ui text-xs muted">{chars ? `${chars} characters` : "Write a reply"}</span>
            <div className="flex gap-2">
              {!user ? (
                <Link href="/login" className="btn btn-accent">
                  Log in to reply
                </Link>
              ) : (
                <button type="submit" className="btn btn-accent" disabled={sending || !chars}>
                  {sending ? "Sending…" : "Reply"}
                </button>
              )}
            </div>
          </div>
          {error && <p className="text-[var(--danger)] ui text-sm m-0">{error}</p>}
        </form>
      ) : (
        <div className="panel forum-empty">
          <h3>Thread locked</h3>
          <p className="muted ui text-sm m-0">New replies are closed for this discussion.</p>
        </div>
      )}
    </div>
  );
}
