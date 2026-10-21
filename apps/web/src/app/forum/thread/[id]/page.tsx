"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { canModerateForum, type Role } from "@chess/shared";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { formatRelativeTime } from "@/lib/time";

type Post = {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
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

function wasEdited(p: Post) {
  const created = new Date(p.createdAt).getTime();
  const updated = new Date(p.updatedAt).getTime();
  return updated - created > 2000;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isStaff = !!user?.role && canModerateForum(user.role as Role);

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

  function startEdit(p: Post) {
    setEditingId(p.id);
    setEditBody(p.body);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
  }

  async function saveEdit(postId: string) {
    if (!user || !editBody.trim()) return;
    setSavingEdit(true);
    setError("");
    try {
      await apiFetch(`/api/forum/posts/${postId}`, {
        method: "PATCH",
        userId: user.id,
        body: JSON.stringify({ body: editBody }),
      });
      cancelEdit();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save edit");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePost(postId: string) {
    if (!user || !isStaff) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeletingId(postId);
    setError("");
    try {
      const res = await apiFetch(`/api/forum/posts/${postId}`, {
        method: "DELETE",
        userId: user.id,
      });
      if (res?.threadDeleted) {
        router.push(thread ? `/forum/${thread.category.slug}` : "/forum");
        return;
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeletingId(null);
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

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="space-y-3 mb-6">
        {sortedPosts.map((p, i) => {
          const isAuthor = !!user && p.authorId === user.id;
          const canEdit = (isAuthor || isStaff) && (!thread.locked || isStaff);
          const editing = editingId === p.id;

          return (
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
                    {wasEdited(p) ? " · edited" : ""}
                  </time>
                </header>

                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      className="input min-h-28"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={savingEdit}
                      maxLength={10000}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-accent !py-1.5 !px-3 !text-sm"
                        disabled={savingEdit || !editBody.trim()}
                        onClick={() => void saveEdit(p.id)}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost !py-1.5 !px-3 !text-sm"
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="forum-post-body">{p.body}</p>
                    {(canEdit || isStaff) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {canEdit && (
                          <button
                            type="button"
                            className="btn btn-ghost !py-1 !px-2 !text-xs"
                            onClick={() => startEdit(p)}
                          >
                            Edit
                          </button>
                        )}
                        {isStaff && (
                          <button
                            type="button"
                            className="btn btn-ghost !py-1 !px-2 !text-xs text-[var(--danger)]"
                            disabled={deletingId === p.id}
                            onClick={() => void deletePost(p.id)}
                          >
                            {deletingId === p.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
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
