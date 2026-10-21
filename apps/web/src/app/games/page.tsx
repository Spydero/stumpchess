"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Game = {
  id: string;
  result: string | null;
  timeControl: string;
  endedAt: string | null;
  isBot: boolean;
  white: { username: string } | null;
  black: { username: string } | null;
};

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    apiFetch("/api/games/recent").then(setGames).catch(() => setGames([]));
  }, []);

  return (
    <div>
      <h1 className="text-3xl mb-4">Games</h1>
      <div className="panel">
        {games.map((g) => (
          <Link key={g.id} href={`/game/${g.id}`} className="table-row ui text-sm">
            <div>
              <p className="m-0">
                {g.white?.username || "White"} vs {g.black?.username || (g.isBot ? "Bot" : "Black")}
              </p>
              {g.endedAt && (
                <p className="m-0 mt-1 muted text-xs">
                  {new Date(g.endedAt).toLocaleString()}
                </p>
              )}
            </div>
            <span className="muted shrink-0">
              {g.timeControl} {g.result || ""}
            </span>
          </Link>
        ))}
        {!games.length && <p className="p-4 muted ui text-sm">No finished games yet.</p>}
      </div>
    </div>
  );
}
