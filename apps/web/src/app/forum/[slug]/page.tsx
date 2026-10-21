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
    <div>
      <Link href="/forum" className="ui text-sm link-accent">
        Forum
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-5">
        <div>
          <h1 className="text-3xl m-0">{category?.name || slug}</h1>
          {category?.description && (
            <p className="muted ui text-sm mt-1 mb-0">{category.description}</p>
          )}
        </div>
        <button type="button" className="btn btn-accent" onClick={() => setShowNew((v) => !v)}>
          New thread
        </button>
      </div>

      {showNew && (
        <form onSubmit={createThread} className="panel p-4 mb-5 space-y-3">
          <input className="input" name="title" placeholder="Title" required />
          <textarea className="input min-h-28" name="body" placeholder="Message" required />
          {error && <p className="text-[var(--danger)] ui text-sm">{error}</p>}
          <button type="submit" className="btn btn-accent">
            Post
          </button>
        </form>
      )}

      <div className="panel">
        {threads.map((t) => (
          <Link key={t.id} href={`/forum/thread/${t.id}`} className="table-row">
            <div>
              <p className="m-0 text-lg">
                {t.pinned ? "[pinned] " : ""}
                {t.title}
                {t.locked ? " [locked]" : ""}
              </p>
              <p className="m-0 mt-1 ui text-sm muted flex items-center gap-2">
                <span>{t.author.username}</span>
                {t.author.role !== "MEMBER" && <RoleBadge role={t.author.role} />}
              </p>
            </div>
            <span className="ui text-xs muted shrink-0">{t._count.posts}</span>
          </Link>
        ))}
        {!threads.length && <p className="p-4 muted ui text-sm">No threads yet.</p>}
      </div>
    </div>
  );
}
