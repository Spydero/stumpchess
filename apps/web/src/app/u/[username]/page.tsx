"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatClubRating, type RatingState } from "@chess/shared";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { RoleBadge } from "@/components/RoleBadge";

type LiveGame = {
  id: string;
  timeControl: string;
  startedAt: string | null;
  white: { username: string; role: string } | null;
  black: { username: string; role: string } | null;
};

type Profile = {
  username: string;
  role: string;
  image?: string | null;
  hideStats?: boolean;
  displayLabel?: string | null;
  wins?: number;
  losses?: number;
  draws?: number;
  rating?: number;
  ratedGames?: number;
  ratingBullet?: number;
  rdBullet?: number;
  gamesBullet?: number;
  ratingBlitz?: number;
  rdBlitz?: number;
  gamesBlitz?: number;
  ratingRapid?: number;
  rdRapid?: number;
  gamesRapid?: number;
  createdAt?: string;
  liveGames?: LiveGame[];
  games: Array<{
    id: string;
    result: string | null;
    timeControl: string;
    endedAt: string | null;
    white: { username: string; role: string } | null;
    black: { username: string; role: string } | null;
  }>;
};

function pool(rating: number, rd: number, games: number): RatingState {
  return { rating, rd, games };
}

function profileSig(p: Profile) {
  const live = (p.liveGames || []).map((g) => g.id).join(",");
  const done = p.games.map((g) => `${g.id}:${g.result || ""}`).join(",");
  return `${live}|${done}|${p.wins}|${p.losses}|${p.draws}|${p.rating ?? ""}|${p.ratingBullet}|${p.ratingBlitz}|${p.ratingRapid}|${p.gamesBullet}|${p.gamesBlitz}|${p.gamesRapid}`;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data } = useSession();
  const me = data?.user as { id: string; username?: string; name?: string } | undefined;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [messaging, setMessaging] = useState(false);
  const sigRef = useRef("");

  const load = useCallback(async () => {
    try {
      const next: Profile = await apiFetch(`/api/users/${username}`);
      const sig = profileSig(next);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setProfile(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [username]);

  useEffect(() => {
    sigRef.current = "";
    setProfile(null);
    void load();
    const id = setInterval(() => void load(), 12_000);
    return () => clearInterval(id);
  }, [username, load]);

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
    me && (me.username === profile.username || me.name === profile.username);
  const live = profile.liveGames || [];

  return (
    <div className="max-w-2xl">
      <div className="panel p-5 mb-5 flex gap-4 items-center flex-wrap">
        {profile.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.image} alt="" className="w-14 h-14 border border-[var(--line)]" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl m-0">{profile.username}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            {profile.role !== "MEMBER" && <RoleBadge role={profile.role} />}
            {profile.displayLabel && <span className="ui text-sm muted">{profile.displayLabel}</span>}
            {live.length > 0 && (
              <span className="ui text-xs flex items-center gap-1.5">
                <span className="live-dot" aria-hidden />
                Playing
              </span>
            )}
          </div>
          {!profile.hideStats ? (
            <div className="mt-2 ui text-sm muted space-y-1">
              <p className="m-0">
                {profile.wins}W {profile.losses}L {profile.draws}D
                {typeof profile.ratedGames === "number" ? ` · ${profile.ratedGames} rated` : ""}
                {profile.createdAt
                  ? ` · joined ${new Date(profile.createdAt).toLocaleDateString()}`
                  : ""}
              </p>
              <p className="m-0 flex flex-wrap gap-x-3 gap-y-1">
                <span title="Bullet rating">
                  Bullet{" "}
                  <strong className="text-[var(--ink)]">
                    {formatClubRating(
                      pool(profile.ratingBullet ?? 1200, profile.rdBullet ?? 350, profile.gamesBullet ?? 0)
                    )}
                  </strong>
                </span>
                <span title="Blitz rating">
                  Blitz{" "}
                  <strong className="text-[var(--ink)]">
                    {formatClubRating(
                      pool(profile.ratingBlitz ?? 1200, profile.rdBlitz ?? 350, profile.gamesBlitz ?? 0)
                    )}
                  </strong>
                </span>
                <span title="Rapid rating">
                  Rapid{" "}
                  <strong className="text-[var(--ink)]">
                    {formatClubRating(
                      pool(profile.ratingRapid ?? 1200, profile.rdRapid ?? 350, profile.gamesRapid ?? 0)
                    )}
                  </strong>
                </span>
              </p>
              <p className="m-0 text-xs">? means provisional (few games or high uncertainty)</p>
            </div>
          ) : null}
          {error && <p className="text-[var(--danger)] ui text-xs mt-2 mb-0">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href={`/watch?u=${encodeURIComponent(profile.username)}`}
            className="btn btn-ghost !py-1.5 !px-3 !text-sm"
          >
            Watch games
          </Link>
          {!isSelf && (
            <button
              type="button"
              className="btn btn-accent !py-1.5 !px-3 !text-sm"
              onClick={messageUser}
              disabled={messaging}
            >
              {messaging ? "…" : "Message"}
            </button>
          )}
        </div>
      </div>

      {live.length > 0 && (
        <>
          <h2 className="text-xl mb-3 flex items-center gap-2">
            <span className="live-dot" aria-hidden />
            Live
          </h2>
          <div className="panel mb-5">
            {live.map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
                <span>
                  {g.white?.username || "?"} vs {g.black?.username || "?"}
                </span>
                <span className="muted shrink-0 flex items-center gap-2">
                  {g.timeControl}
                  <span className="link-accent">Spectate</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

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
