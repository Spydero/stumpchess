"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";

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
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch(`/api/forum/categories/${slug}/threads`).then((d) => {
      setCategory(d.category);
      setThreads(d.threads);
    });
  }

  useEffect(load, [slug]);

  async function createThread(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return router.push("/login");
    const fd = new FormData(e.currentTarget);
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
    }
  }

  return (
    <div className="rise">
      <Link href="/forum" className="text-sm font-[family-name:var(--font-mono)] text-[var(--muted)]">
        ← Forum
      </Link>
      <div className="flex items-end justify-between gap-4 mt-2 mb-6">
        <div>
          <h1 className="text-3xl">{category?.name || slug}</h1>
          <p className="text-[var(--muted)] text-sm">{category?.description}</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew((v) => !v)}>
          New thread
        </button>
      </div>

      {showNew && (
        <form onSubmit={createThread} className="panel p-4 mb-6 space-y-3">
          <input className="input" name="title" placeholder="Title" required />
          <textarea className="input min-h-28" name="body" placeholder="First post…" required />
          {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
          <button className="btn btn-accent">Post</button>
        </form>
      )}

      <div className="panel divide-y divide-[var(--line)]">
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/forum/thread/${t.id}`}
            className="flex items-center justify-between gap-3 p-4 hover:bg-[rgba(47,111,78,0.06)]"
          >
            <div>
              <p className="text-lg">
                {t.pinned ? "📌 " : ""}
                {t.title}
                {t.locked ? " 🔒" : ""}
              </p>
              <p className="text-sm text-[var(--muted)] flex items-center gap-2 mt-1">
                <span>{t.author.username}</span>
                <RoleBadge role={t.author.role} />
              </p>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
              {t._count.posts} posts
            </span>
          </Link>
        ))}
        {!threads.length && <p className="p-4 text-[var(--muted)]">No threads yet.</p>}
      </div>
    </div>
  );
}
