"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";

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

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useSession();
  const user = data?.user as { id: string } | undefined;
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);

  function load() {
    apiFetch(`/api/forum/threads/${id}`).then(setThread);
  }

  useEffect(load, [id]);

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return router.push("/login");
    const fd = new FormData(e.currentTarget);
    await apiFetch(`/api/forum/threads/${id}/posts`, {
      method: "POST",
      userId: user.id,
      body: JSON.stringify({ body: fd.get("body") }),
    });
    (e.target as HTMLFormElement).reset();
    load();
  }

  if (!thread) return <p className="pulse-soft ui muted">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <Link href={`/forum/${thread.category.slug}`} className="ui text-sm link-accent">
        {thread.category.name}
      </Link>
      <h1 className="text-3xl mt-2 mb-5">{thread.title}</h1>

      <div className="space-y-3 mb-6">
        {thread.posts.map((p) => (
          <article key={p.id} className="panel p-4">
            <header className="flex flex-wrap items-center gap-2 mb-3 ui text-sm">
              {p.author.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.author.image} alt="" className="w-7 h-7 border border-[var(--line)]" />
              )}
              <strong>{p.author.username}</strong>
              {p.author.role !== "MEMBER" && <RoleBadge role={p.author.role} />}
              <span className="muted text-xs ml-auto">
                {new Date(p.createdAt).toLocaleString()}
              </span>
            </header>
            <p className="whitespace-pre-wrap leading-relaxed m-0">{p.body}</p>
          </article>
        ))}
      </div>

      {!thread.locked ? (
        <form onSubmit={reply} className="panel p-4 space-y-3">
          <textarea className="input min-h-24" name="body" placeholder="Reply" required />
          <button type="submit" className="btn btn-accent">
            Reply
          </button>
        </form>
      ) : (
        <p className="muted ui text-sm">Thread locked.</p>
      )}
    </div>
  );
}
