"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type LiveGame = {
  id: string;
  timeControl: string;
  fen: string;
  startedAt: string | null;
  white: { id: string; username: string } | null;
  black: { id: string; username: string } | null;
};

export default function WatchPage() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [error, setError] = useState("");

  function load() {
    apiFetch("/api/games/live")
      .then(setGames)
      .catch((e) => {
        setGames([]);
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rise-in">
      <header className="page-hero mb-5">
        <p className="forum-kicker">Live</p>
        <h1 className="text-3xl sm:text-4xl mt-1 mb-2">Watch</h1>
        <p className="muted ui text-base max-w-xl m-0">
          Spectate club games in progress. Live engine analysis is off for spectators.
        </p>
      </header>

      {error && <p className="text-[var(--danger)] ui text-sm mb-3">{error}</p>}

      <div className="panel overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <h2 className="text-lg m-0">Games now</h2>
          <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" onClick={load}>
            Refresh
          </button>
        </div>
        {games.length === 0 ? (
          <div className="forum-empty">
            <h3>No live games</h3>
            <p className="muted ui text-sm mb-3">Queue up or challenge someone to get a game going.</p>
            <Link href="/play" className="btn btn-accent">
              Play
            </Link>
          </div>
        ) : (
          games.map((g) => (
            <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
              <span>
                {g.white?.username || "White"} vs {g.black?.username || "Black"}
              </span>
              <span className="muted shrink-0 flex items-center gap-2">
                <span className="live-dot" aria-hidden />
                {g.timeControl}
                <span className="link-accent">Watch</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
