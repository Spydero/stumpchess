"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { formatRelativeTime } from "@/lib/time";

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  locked: boolean;
  pinned: boolean;
  author: { username: string; role: string };
  _count: { posts: number };
};

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useSession();
  const user = data?.user as { id: string } | undefined;
  const router = useRouter();
  const [category, setCategory] = useState<{ name: string; description: string } | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  function load() {
    apiFetch(`/api/forum/categories/${slug}/threads`)
      .then((d) => {
        setCategory(d.category);
        setThreads(d.threads);
      })
      .catch(() => setThreads([]));
  }

  useEffect(load, [slug]);

  async function createThread(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return router.push("/login");
    const fd = new FormData(e.currentTarget);
    setPosting(true);
    setError("");
    try {
      const thread = await apiFetch(`/api/forum/categories/${slug}/threads`, {
        method: "POST",
        userId: user.id,
        body: JSON.stringify({
          title: fd.get("title"),
          body: fd.get("body"),
        }),
      });
      router.push(`/forum/thread/${thread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setPosting(false);
    }
  }

  const sorted = (threads || [])
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));

  return (
    <div className="rise-in">
      <Link href="/forum" className="ui text-sm link-accent">
        ← Forum
      </Link>

      <header className="forum-hero mt-2">
        <div>
          <p className="forum-kicker">Category</p>
          <h1>{category?.name || slug}</h1>
          {category?.description && (
            <p className="muted ui text-sm mt-2 mb-0 max-w-xl">{category.description}</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => {
            if (!user) {
              router.push("/login");
              return;
            }
            setShowNew((v) => !v);
          }}
        >
          {showNew ? "Cancel" : "New thread"}
        </button>
      </header>

      {showNew && (
        <form onSubmit={createThread} className="panel p-4 mb-5 space-y-3 rise-in">
          <div>
            <label className="ui text-xs muted block mb-1">Title</label>
            <input className="input" name="title" placeholder="What’s on your mind?" required autoFocus />
          </div>
          <div>
            <label className="ui text-xs muted block mb-1">Opening post</label>
            <textarea
              className="input min-h-32"
              name="body"
              placeholder="Share your idea, game, or question…"
              required
            />
          </div>
          {error && <p className="text-[var(--danger)] ui text-sm m-0">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-accent" disabled={posting}>
              {posting ? "Posting…" : "Post thread"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
              Close
            </button>
          </div>
        </form>
      )}

      {threads === null ? (
        <p className="pulse-soft ui muted">Loading threads…</p>
      ) : sorted.length ? (
        <div className="panel overflow-hidden">
          {sorted.map((t) => (
            <Link key={t.id} href={`/forum/thread/${t.id}`} className="forum-thread">
              <div>
                <p className="forum-thread-title">
                  {t.pinned && <span className="forum-chip forum-chip--pin">Pinned</span>}
                  {t.locked && <span className="forum-chip forum-chip--lock">Locked</span>}
                  <span>{t.title}</span>
                </p>
                <p className="forum-thread-meta">
                  <UserAvatar username={t.author.username} role={t.author.role} size={22} />
                  <span>{t.author.username}</span>
                  {t.author.role !== "MEMBER" && <RoleBadge role={t.author.role} />}
                  <span>·</span>
                  <span title={new Date(t.updatedAt).toLocaleString()}>
                    {formatRelativeTime(t.updatedAt)}
                  </span>
                </p>
              </div>
              <div className="forum-replies">
                <strong>{t._count.posts}</strong>
                <span>{t._count.posts === 1 ? "post" : "posts"}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel forum-empty">
          <h3>No threads yet</h3>
          <p className="muted ui text-sm mb-4">Be the first to start a conversation here.</p>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              if (!user) router.push("/login");
              else setShowNew(true);
            }}
          >
            Start a thread
          </button>
        </div>
      )}
    </div>
  );
}
