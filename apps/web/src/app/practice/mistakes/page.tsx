"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  PERSONALITY_BOTS,
  decodeBotLevel,
  formatEngineElo,
} from "@chess/shared";
import { MistakeDrill } from "@/components/MistakeDrill";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { userHasVip } from "@/lib/roles";
import {
  filterMistakeMoves,
  hashPgn,
  labelFromPgn,
  listLocalAnalyses,
  loadLocalAnalysis,
  loadLocalAnalysisByHash,
  parseStoredAnalysis,
  saveLocalAnalysis,
  takeStashedMistakesPgn,
  type LocalAnalysisEntry,
  type StoredAnalyzedMove,
} from "@/lib/analysis-cache";

type GameRow = {
  id: string;
  pgn?: string;
  analysisJson?: string | null;
  analysisDepth?: number | null;
  analyzedAt?: string | null;
  botLevel?: number | null;
  white: { username: string } | null;
  black: { username: string } | null;
  result: string | null;
  isBot: boolean;
  endedAt?: string | null;
};

type Source =
  | { kind: "game"; id: string }
  | { kind: "local"; hash: string }
  | { kind: "paste"; pgn: string };

function botSideLabel(level: number | null | undefined) {
  if (level == null) return "Practice";
  const d = decodeBotLevel(level);
  if (d.kind === "engine") return `Stockfish ${formatEngineElo(d.elo)}`;
  const named = PERSONALITY_BOTS.find((b) => b.skill === d.skill);
  return named?.name || "Bot";
}

function gameHasServerReview(g: GameRow) {
  return Boolean(g.analyzedAt || g.analysisDepth || g.analysisJson);
}

function gameLabel(g: GameRow) {
  const white = g.white?.username || (g.isBot && !g.white ? botSideLabel(g.botLevel) : "White");
  const black = g.black?.username || (g.isBot && !g.black ? botSideLabel(g.botLevel) : "Black");
  const bits = [`${white} vs ${black}`];
  if (g.result) bits.push(g.result);
  if (g.analysisDepth) bits.push(`d${g.analysisDepth}`);
  else if (!gameHasServerReview(g)) bits.push("needs review");
  return bits.join(" · ");
}

function sourceKey(s: Source | null) {
  if (!s) return "";
  if (s.kind === "game") return `game:${s.id}`;
  if (s.kind === "local") return `local:${s.hash}`;
  return `paste:${hashPgn(s.pgn)}`;
}

function parseSourceKey(raw: string): Source | null {
  if (!raw) return null;
  if (raw.startsWith("game:")) return { kind: "game", id: raw.slice(5) };
  if (raw.startsWith("local:")) return { kind: "local", hash: raw.slice(6) };
  return null;
}

function MistakesInner() {
  const search = useSearchParams();
  const gameIdParam = search.get("gameId");
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [localEntries, setLocalEntries] = useState<LocalAnalysisEntry[]>([]);
  const [source, setSource] = useState<Source | null>(
    gameIdParam ? { kind: "game", id: gameIdParam } : null
  );
  const [paste, setPaste] = useState("");
  const [drills, setDrills] = useState<StoredAnalyzedMove[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingAnalyzeId, setPendingAnalyzeId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    setAllowed(userHasVip(user.role || "MEMBER", user.vipExpiresAt));
  }, [user]);

  useEffect(() => {
    if (!user || !allowed) return;

    const stashed = takeStashedMistakesPgn();
    if (stashed) {
      const local = loadLocalAnalysis(stashed);
      if (local) {
        saveLocalAnalysis(stashed, local);
        setSource({ kind: "local", hash: hashPgn(stashed) });
        setPaste(stashed);
      } else {
        setPaste(stashed);
        setSource({ kind: "paste", pgn: stashed });
      }
    }

    apiFetch("/api/games/mine", { userId: user.id })
      .then((list: GameRow[]) => {
        // Every finished game you played (last 30 days) — not only reviewed ones
        const playable = list.filter((g) => (g.pgn || "").trim().length > 0 || g.result);
        setGames(playable);

        const gameHashes = new Set(
          playable.map((g) => (g.pgn?.trim() ? hashPgn(g.pgn) : "")).filter(Boolean)
        );
        // Temporary pasted PGNs only — hide locals that already match a played game
        setLocalEntries(listLocalAnalyses().filter((e) => !gameHashes.has(e.hash)));

        if (gameIdParam && playable.some((g) => g.id === gameIdParam)) {
          setSource({ kind: "game", id: gameIdParam });
        } else if (!stashed && !gameIdParam && playable.length === 1) {
          setSource({ kind: "game", id: playable[0].id });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load games"));
  }, [user, allowed, gameIdParam]);

  useEffect(() => {
    if (!source) {
      setDrills(null);
      setStatus("");
      setPendingAnalyzeId(null);
      return;
    }

    let cancelled = false;
    setError("");
    setStatus("");
    setPendingAnalyzeId(null);

    async function load() {
      if (!source) return;

      if (source.kind === "game") {
        if (!user) return;
        try {
          const g: GameRow = await apiFetch(`/api/games/${source.id}`);
          if (cancelled) return;

          let parsed = parseStoredAnalysis(g.analysisJson);
          if (!parsed && g.pgn?.trim()) {
            const local = loadLocalAnalysis(g.pgn);
            if (local) parsed = local;
          }

          if (!parsed) {
            setDrills([]);
            setPendingAnalyzeId(g.id);
            setError("This game has no Stockfish review yet. Analyze it, then drills unlock.");
            setStatus("");
            return;
          }

          const next = filterMistakeMoves(parsed.moves);
          setDrills(next);
          setStatus(
            next.length
              ? `${next.length} positions from this game (d${parsed.depth}).`
              : "No drillable mistakes in this review."
          );
        } catch (e) {
          if (cancelled) return;
          setDrills([]);
          setError(e instanceof Error ? e.message : "Could not load game");
        }
        return;
      }

      if (source.kind === "local") {
        const packed = loadLocalAnalysisByHash(source.hash);
        if (!packed) {
          setDrills([]);
          setError("Local review missing. Re-analyze that PGN on the Review page.");
          return;
        }
        const next = filterMistakeMoves(packed.analysis.moves);
        setDrills(next);
        setStatus(
          next.length
            ? `${next.length} positions from temporary PGN review (d${packed.analysis.depth}).`
            : "No drillable mistakes in this local review."
        );
        return;
      }

      const local = loadLocalAnalysis(source.pgn);
      if (!local) {
        setDrills([]);
        setError("No saved review for this PGN. Open Review, paste it, run Stockfish, then come back.");
        return;
      }
      saveLocalAnalysis(source.pgn, local);
      const next = filterMistakeMoves(local.moves);
      setDrills(next);
      const gameHashes = new Set(
        games.map((g) => (g.pgn?.trim() ? hashPgn(g.pgn) : "")).filter(Boolean)
      );
      setLocalEntries(listLocalAnalyses().filter((e) => !gameHashes.has(e.hash)));
      setSource({ kind: "local", hash: hashPgn(source.pgn) });
      setStatus(
        next.length
          ? `${next.length} positions from pasted PGN (d${local.depth}).`
          : "No drillable mistakes in this review."
      );
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [source, user, games]);

  const selectValue = useMemo(() => sourceKey(source), [source]);

  function applyPaste() {
    const pgn = paste.trim();
    if (!pgn) {
      setError("Paste a PGN first.");
      return;
    }
    const local = loadLocalAnalysis(pgn);
    if (!local) {
      setSource({ kind: "paste", pgn });
      setError("No saved review for this PGN yet. Analyze it on Review first.");
      setDrills([]);
      return;
    }
    saveLocalAnalysis(pgn, local);
    setError("");
    setSource({ kind: "local", hash: hashPgn(pgn) });
    const gameHashes = new Set(
      games.map((g) => (g.pgn?.trim() ? hashPgn(g.pgn) : "")).filter(Boolean)
    );
    setLocalEntries(listLocalAnalyses().filter((e) => !gameHashes.has(e.hash)));
  }

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
        <p className="muted ui text-sm mb-4">Mistake drills need VIP.</p>
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
            Every finished game you played shows here. Pasted PGNs are temporary in this browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/analysis" className="btn btn-accent">
            Review / paste PGN
          </Link>
          <Link href="/practice" className="btn btn-ghost">
            Practice board
          </Link>
        </div>
      </header>

      <div className="panel p-4 mb-5 space-y-4">
        <div className="space-y-2">
          <label className="ui text-sm muted block">Your games</label>
          <select
            className="input"
            value={selectValue}
            onChange={(e) => setSource(parseSourceKey(e.target.value))}
          >
            <option value="">Select a game…</option>
            {games.length > 0 && (
              <optgroup label="Played (saved)">
                {games.map((g) => (
                  <option key={g.id} value={`game:${g.id}`}>
                    {gameLabel(g)}
                  </option>
                ))}
              </optgroup>
            )}
            {localEntries.length > 0 && (
              <optgroup label="Temporary PGN (this browser)">
                {localEntries.map((e) => (
                  <option key={e.hash} value={`local:${e.hash}`}>
                    {e.label}
                    {e.depth ? ` · d${e.depth}` : ""}
                    {e.mistakeCount ? ` · ${e.mistakeCount} drills` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!games.length && (
            <p className="ui text-sm muted m-0">
              No finished games yet. Play on{" "}
              <Link href="/practice" className="link-accent">
                Practice
              </Link>{" "}
              or{" "}
              <Link href="/play" className="link-accent">
                Play
              </Link>
              , then come back.
            </p>
          )}
          {games.length > 0 && (
            <p className="ui text-xs muted m-0">
              {games.length} game{games.length === 1 ? "" : "s"} from the last 30 days. Ones marked
              needs review must be analyzed before drills unlock.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="ui text-sm muted block">Temporary: paste a reviewed PGN</label>
          <textarea
            className="input min-h-[96px] font-mono text-xs"
            placeholder="Optional. Paste a PGN you already analyzed on Review…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost !text-xs" onClick={applyPaste}>
              Load drills from PGN
            </button>
            {paste.trim() && !loadLocalAnalysis(paste) && (
              <Link
                href="/analysis"
                className="btn btn-accent !text-xs"
                onClick={() => {
                  try {
                    sessionStorage.setItem("stumpchess-analyze-pgn", paste.trim());
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Analyze this PGN first
              </Link>
            )}
          </div>
          {paste.trim() && loadLocalAnalysis(paste) && (
            <p className="ui text-xs muted m-0">{labelFromPgn(paste)} has a local review.</p>
          )}
        </div>

        {error && (
          <div className="space-y-2">
            <p className="ui text-sm text-[var(--danger)] m-0">{error}</p>
            {pendingAnalyzeId && (
              <Link href={`/analysis?gameId=${pendingAnalyzeId}`} className="btn btn-accent !text-xs">
                Analyze this game
              </Link>
            )}
          </div>
        )}
        {status && !error && <p className="ui text-xs muted m-0">{status}</p>}
      </div>

      {drills && drills.length > 0 && (
        <MistakeDrill key={sourceKey(source) || "x"} drills={drills} />
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
