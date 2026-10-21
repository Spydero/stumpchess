"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatClubRating, type RatingPool } from "@chess/shared";
import { apiFetch } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";

type Leader = {
  id: string;
  username: string;
  role: string;
  image?: string | null;
  wins: number;
  losses: number;
  draws: number;
  rating?: number;
  ratingBullet?: number;
  rdBullet?: number;
  gamesBullet?: number;
  ratingBlitz?: number;
  rdBlitz?: number;
  gamesBlitz?: number;
  ratingRapid?: number;
  rdRapid?: number;
  gamesRapid?: number;
};

function poolRating(u: Leader, pool: RatingPool) {
  if (pool === "bullet") {
    return formatClubRating({
      rating: u.ratingBullet ?? 1200,
      rd: u.rdBullet ?? 350,
      games: u.gamesBullet ?? 0,
    });
  }
  if (pool === "rapid") {
    return formatClubRating({
      rating: u.ratingRapid ?? 1200,
      rd: u.rdRapid ?? 350,
      games: u.gamesRapid ?? 0,
    });
  }
  return formatClubRating({
    rating: u.ratingBlitz ?? 1200,
    rd: u.rdBlitz ?? 350,
    games: u.gamesBlitz ?? 0,
  });
}

function sortKey(u: Leader, pool: RatingPool) {
  if (pool === "bullet") return u.ratingBullet ?? 1200;
  if (pool === "rapid") return u.ratingRapid ?? 1200;
  return u.ratingBlitz ?? 1200;
}

const POOLS: { id: RatingPool; label: string }[] = [
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "bullet", label: "Bullet" },
];

export default function LeadersPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [pool, setPool] = useState<RatingPool>("blitz");

  useEffect(() => {
    apiFetch("/api/users/leaders").then(setLeaders).catch(() => setLeaders([]));
  }, []);

  const sorted = useMemo(
    () => [...leaders].sort((a, b) => sortKey(b, pool) - sortKey(a, pool)),
    [leaders, pool]
  );

  return (
    <div className="rise-in">
      <header className="page-hero mb-5">
        <p className="forum-kicker">Club</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Leaders</h1>
        <p className="muted ui text-base max-w-xl m-0">
          Glicko club ratings by time control (chess.com-style pools). ? = provisional.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        {POOLS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn !py-1.5 !px-3 !text-sm ${pool === p.id ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setPool(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        {sorted.map((u, i) => (
          <Link key={u.id} href={`/u/${u.username}`} className="table-row ui text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="muted w-6 shrink-0">{i + 1}</span>
              {u.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.image} alt="" className="w-8 h-8 border border-[var(--line)] shrink-0" />
              )}
              <span className="truncate font-semibold">{u.username}</span>
              {u.role !== "MEMBER" && <RoleBadge role={u.role} />}
            </div>
            <span className="muted shrink-0 tabular-nums">
              {poolRating(u, pool)} · {u.wins}W {u.losses}L {u.draws}D
            </span>
          </Link>
        ))}
        {!sorted.length && <p className="p-4 muted ui text-sm">No ranked players yet.</p>}
      </div>
    </div>
  );
}
