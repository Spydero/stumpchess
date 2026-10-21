"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/users/${username}`)
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [username]);

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!profile) return <p className="pulse-soft">Loading…</p>;

  return (
    <div className="rise max-w-2xl">
      <div className="panel p-6 mb-6 flex gap-4 items-center">
        {profile.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.image} alt="" className="w-16 h-16 border border-[var(--line)]" />
        )}
        <div>
          <h1 className="text-3xl">{profile.username}</h1>
          <div className="flex items-center gap-2 mt-1">
            <RoleBadge role={profile.role} />
            {profile.displayLabel && (
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--muted)]">
                ({profile.displayLabel})
              </span>
            )}
          </div>
          {!profile.hideStats ? (
            <p className="mt-3 font-[family-name:var(--font-mono)] text-sm text-[var(--muted)]">
              {profile.wins}W / {profile.losses}L / {profile.draws}D
              {profile.createdAt ? ` · joined ${new Date(profile.createdAt).toLocaleDateString()}` : ""}
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Account details hidden.</p>
          )}
        </div>
      </div>

      <h2 className="text-xl mb-3">Games</h2>
      <div className="panel divide-y divide-[var(--line)]">
        {profile.games.map((g) => (
          <Link key={g.id} href={`/game/${g.id}`} className="block p-3 hover:bg-[rgba(47,111,78,0.06)]">
            <span className="font-[family-name:var(--font-mono)] text-sm">
              {g.white?.username || "?"} vs {g.black?.username || "?"} · {g.timeControl} · {g.result}
            </span>
            {profile.hideStats && (
              <span className="block text-xs text-[var(--muted)] mt-1">(Owner)</span>
            )}
          </Link>
        ))}
        {!profile.games.length && <p className="p-3 text-[var(--muted)]">No finished games.</p>}
      </div>
    </div>
  );
}
