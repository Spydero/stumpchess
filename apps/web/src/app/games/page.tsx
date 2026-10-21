"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { userHasVip } from "@/lib/roles";

type Game = {
  id: string;
  result: string | null;
  timeControl: string;
  endedAt: string | null;
  isBot: boolean;
  pgn?: string;
  white: { username: string } | null;
  black: { username: string } | null;
};

export default function GamesPage() {
  const { data } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const [tab, setTab] = useState<"mine" | "recent">("mine");
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState("");
  const canAnalyze = user ? userHasVip(user.role || "MEMBER", user.vipExpiresAt) : false;

  useEffect(() => {
    setError("");
    if (tab === "mine") {
      if (!user) {
        setGames([]);
        return;
      }
      apiFetch("/api/games/mine", { userId: user.id })
        .then(setGames)
        .catch((e) => {
          setGames([]);
          setError(e.message);
        });
    } else {
      apiFetch("/api/games/recent").then(setGames).catch(() => setGames([]));
    }
  }, [tab, user]);

  function analyze(g: Game) {
    if (!g.pgn?.trim()) return;
    try {
      sessionStorage.setItem("stumpchess-analyze-pgn", g.pgn);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-3xl m-0">Games</h1>
          <p className="ui text-xs muted m-0 mt-1">Kept for 30 days, then deleted automatically.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn ${tab === "mine" ? "btn-accent" : "btn-ghost"} !py-1.5`}
            onClick={() => setTab("mine")}
          >
            My games
          </button>
          <button
            type="button"
            className={`btn ${tab === "recent" ? "btn-accent" : "btn-ghost"} !py-1.5`}
            onClick={() => setTab("recent")}
          >
            Recent
          </button>
        </div>
      </div>

      {tab === "mine" && !user && (
        <p className="ui muted mb-4">
          <Link href="/login" className="link-accent">
            Login
          </Link>{" "}
          to see your games.
        </p>
      )}
      {error && <p className="ui text-sm text-[var(--danger)] mb-3">{error}</p>}

      <div className="panel">
        {games.map((g) => (
          <div key={g.id} className="table-row ui text-sm">
            <div className="min-w-0">
              <Link href={`/game/${g.id}`} className="font-semibold hover:underline">
                {g.white?.username || "White"} vs {g.black?.username || (g.isBot ? "Bot" : "Black")}
              </Link>
              {g.endedAt && (
                <p className="m-0 mt-1 muted text-xs">{new Date(g.endedAt).toLocaleString()}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="muted">
                {g.timeControl} {g.result || ""}
              </span>
              {canAnalyze && g.pgn?.trim() ? (
                <Link
                  href={`/analysis?gameId=${g.id}`}
                  className="btn btn-accent !py-1 !px-2 !text-xs"
                  onClick={() => analyze(g)}
                >
                  Analyze
                </Link>
              ) : null}
            </div>
          </div>
        ))}
        {!games.length && (
          <p className="p-4 muted ui text-sm">
            {tab === "mine" ? "No games in the last 30 days." : "No finished games yet."}
          </p>
        )}
      </div>
    </div>
  );
}
