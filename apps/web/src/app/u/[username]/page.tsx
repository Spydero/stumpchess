"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";

type Profile = {
  username: string;
  role: string;
  image?: string | null;
  hideStats?: boolean;
  displayLabel?: string | null;
  wins?: number;
  losses?: number;
  draws?: number;
  createdAt?: string;
  games: Array<{
    id: string;
    result: string | null;
    timeControl: string;
    endedAt: string | null;
    white: { username: string; role: string } | null;
    black: { username: string; role: string } | null;
  }>;
};

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data } = useSession();
  const me = data?.user as { id: string; username?: string; name?: string } | undefined;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    apiFetch(`/api/users/${username}`)
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [username]);

  async function messageUser() {
    if (!me) return router.push("/login");
    if (!profile) return;
    setMessaging(true);
    try {
      const conv = await apiFetch("/api/messages/with", {
        method: "POST",
        userId: me.id,
        body: JSON.stringify({ username: profile.username }),
      });
      router.push(`/messages/${conv.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open chat");
      setMessaging(false);
    }
  }

  if (error && !profile) return <p className="text-[var(--danger)] ui">{error}</p>;
  if (!profile) return <p className="pulse-soft ui muted">Loading…</p>;

  const isSelf =
    me &&
    (me.username === profile.username || me.name === profile.username);

  return (
    <div className="max-w-2xl">
      <div className="panel p-5 mb-5 flex gap-4 items-center">
        {profile.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.image} alt="" className="w-14 h-14 border border-[var(--line)]" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl m-0">{profile.username}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            {profile.role !== "MEMBER" && <RoleBadge role={profile.role} />}
            {profile.displayLabel && <span className="ui text-sm muted">{profile.displayLabel}</span>}
          </div>
          {!profile.hideStats ? (
            <p className="mt-2 ui text-sm muted m-0">
              {profile.wins}W {profile.losses}L {profile.draws}D
              {profile.createdAt
                ? ` · joined ${new Date(profile.createdAt).toLocaleDateString()}`
                : ""}
            </p>
          ) : null}
          {error && <p className="text-[var(--danger)] ui text-xs mt-2 mb-0">{error}</p>}
        </div>
        {!isSelf && (
          <button
            type="button"
            className="btn btn-accent !py-1.5 !px-3 !text-sm shrink-0"
            onClick={messageUser}
            disabled={messaging}
          >
            {messaging ? "…" : "Message"}
          </button>
        )}
      </div>

      <h2 className="text-xl mb-3">Games</h2>
      <div className="panel">
        {profile.games.map((g) => (
          <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
            <span>
              {g.white?.username || "?"} vs {g.black?.username || "?"}
              {profile.hideStats ? " · Owner" : ""}
            </span>
            <span className="muted shrink-0">
              {g.timeControl} {g.result}
            </span>
          </Link>
        ))}
        {!profile.games.length && <p className="p-4 muted ui text-sm">No finished games.</p>}
      </div>
    </div>
  );
}
