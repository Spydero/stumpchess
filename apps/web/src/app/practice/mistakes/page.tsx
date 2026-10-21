"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { MistakeDrill } from "@/components/MistakeDrill";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { userHasVip } from "@/lib/roles";
import {
  filterMistakeMoves,
  parseStoredAnalysis,
  type StoredAnalyzedMove,
} from "@/lib/analysis-cache";

type GameRow = {
  id: string;
  pgn?: string;
  analysisJson?: string | null;
  analysisDepth?: number | null;
  analyzedAt?: string | null;
  white: { username: string } | null;
  black: { username: string } | null;
  result: string | null;
  isBot: boolean;
};

function MistakesInner() {
  const search = useSearchParams();
  const gameIdParam = search.get("gameId");
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(gameIdParam);
  const [drills, setDrills] = useState<StoredAnalyzedMove[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    setAllowed(userHasVip(user.role || "MEMBER", user.vipExpiresAt));
  }, [user]);

  useEffect(() => {
    if (!user || !allowed) return;
    apiFetch("/api/games/mine", { userId: user.id })
      .then((list: GameRow[]) => {
        const reviewed = list.filter((g) => g.analysisJson || g.analyzedAt);
        setGames(reviewed);
        if (gameIdParam && reviewed.some((g) => g.id === gameIdParam)) {
          setSelectedId(gameIdParam);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load games"));
  }, [user, allowed, gameIdParam]);

  useEffect(() => {
    if (!selectedId || !user) {
      setDrills(null);
      return;
    }
    setError("");
    apiFetch(`/api/games/${selectedId}`)
      .then((g: GameRow) => {
        const parsed = parseStoredAnalysis(g.analysisJson);
        if (!parsed) {
          setDrills([]);
          setError("No saved analysis on this game. Open Review and run Stockfish first.");
          return;
        }
        setDrills(filterMistakeMoves(parsed.moves));
      })
      .catch((e) => {
        setDrills([]);
        setError(e instanceof Error ? e.message : "Could not load game");
      });
  }, [selectedId, user]);

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) || null,
    [games, selectedId]
  );

  if (isPending || allowed === null) {
    return <p className="pulse-soft ui muted">Loading…</p>;
  }

  if (!user) {
    return (
      <div className="panel p-6 max-w-lg">
        <h1 className="text-3xl mb-3">Practice mistakes</h1>
        <Link href="/login" className="btn btn-accent">
          Log in
        </Link>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="panel p-6 max-w-lg">
        <p className="forum-kicker">VIP</p>
        <h1 className="text-3xl mt-1 mb-3">Practice mistakes</h1>
        <p className="muted ui text-sm mb-4">
          Mistake drills need VIP.
        </p>
        <Link href="/practice" className="btn btn-ghost">
          Back to Practice
        </Link>
      </div>
    );
  }

  return (
    <div className="rise-in">
      <header className="forum-hero">
        <div>
          <p className="forum-kicker">VIP · Mistake drills</p>
          <h1>Practice your mistakes</h1>
          <p className="muted ui text-sm mt-2 mb-0 max-w-xl">
            Replay positions from your reviews where you lost eval.
          </p>
        </div>
        <Link href="/practice" className="btn btn-ghost">
          Practice board
        </Link>
      </header>

      <div className="panel p-4 mb-5 space-y-3">
        <label className="ui text-sm muted block">Reviewed game</label>
        <select
          className="input"
          value={selectedId || ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          <option value="">Select a game…</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.white?.username || "White") +
                " vs " +
                (g.black?.username || (g.isBot ? "Bot" : "Black")) +
                (g.result ? ` · ${g.result}` : "") +
                (g.analysisDepth ? ` · d${g.analysisDepth}` : "")}
            </option>
          ))}
        </select>
        {!games.length && (
          <p className="ui text-sm muted m-0">
            No reviewed games yet.{" "}
            <Link href="/games" className="link-accent">
              Analyze a game
            </Link>{" "}
            first.
          </p>
        )}
        {error && <p className="ui text-sm text-[var(--danger)] m-0">{error}</p>}
        {selectedGame && drills && (
          <p className="ui text-xs muted m-0">
            {drills.length
              ? `${drills.length} positions to drill (Inaccuracy / Mistake / Miss / Blunder).`
              : "No mistakes in this review."}
          </p>
        )}
      </div>

      {drills && drills.length > 0 && (
        <MistakeDrill key={selectedId || "x"} drills={drills} />
      )}
    </div>
  );
}

export default function MistakesPage() {
  return (
    <Suspense fallback={<p className="pulse-soft ui muted">Loading…</p>}>
      <MistakesInner />
    </Suspense>
  );
}
