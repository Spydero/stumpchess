"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type RecentGame = {
  id: string;
  result: string | null;
  timeControl: string;
  white: { username: string } | null;
  black: { username: string } | null;
};

export default function HomePage() {
  const [games, setGames] = useState<RecentGame[]>([]);

  useEffect(() => {
    apiFetch("/api/games/recent")
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start rise-in">
      <section>
        <p className="forum-kicker">Club chess</p>
        <h1 className="text-4xl sm:text-5xl mb-3">
          stump<span className="text-[var(--accent)]">chess</span>
        </h1>
        <p className="muted ui text-base sm:text-lg max-w-md mb-6">
          Play online, challenge friends, talk on the forum, and review your games.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/play" className="btn btn-accent">
            Play
          </Link>
          <Link href="/play#bot" className="btn btn-ghost">
            vs Computer
          </Link>
          <Link href="/practice" className="btn btn-ghost">
            Practice
          </Link>
          <Link href="/forum" className="btn btn-ghost">
            Forum
          </Link>
        </div>

        <div className="mt-8 panel overflow-hidden panel-interactive">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-lg m-0">Recent games</h2>
            <Link href="/games" className="ui text-sm link-accent">
              All
            </Link>
          </div>
          {games.length ? (
            games.slice(0, 8).map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
                <span>
                  {g.white?.username || "White"} vs {g.black?.username || "Black"}
                </span>
                <span className="muted shrink-0">
                  {g.timeControl} {g.result || ""}
                </span>
              </Link>
            ))
          ) : (
            <div className="forum-empty">
              <h3>No games yet</h3>
              <p className="muted ui text-sm mb-3">Be the first to play a match.</p>
              <Link href="/play" className="btn btn-accent">
                Find a game
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="panel p-3 sm:p-4 panel-interactive rise-in rise-in-delay-2">
        <div
          className="aspect-square w-full rounded-sm border border-[var(--line)] overflow-hidden grid"
          style={{ gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)" }}
          aria-hidden
        >
          {Array.from({ length: 64 }, (_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const dark = (row + col) % 2 === 1;
            return (
              <div
                key={i}
                style={{ background: dark ? "var(--board-dark)" : "var(--board-light)" }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/leaders" className="btn btn-ghost flex-1 !text-sm">
            Leaders
          </Link>
          <Link href="/analysis" className="btn btn-ghost flex-1 !text-sm">
            Analysis
          </Link>
        </div>
      </section>
    </div>
  );
}
