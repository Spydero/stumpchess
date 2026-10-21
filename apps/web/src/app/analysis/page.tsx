"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import {
  createStockfish,
  formatEval,
  toWhiteEval,
  uciToMove,
  type EngineInfo,
} from "@/lib/stockfish";
import { classifyMove, type ClassLabel } from "@/lib/classify";
import { userHasVip } from "@/lib/roles";
import { EvalBar } from "@/components/EvalBar";
import { MoveBadge } from "@/components/MoveBadge";

type AnalyzedMove = {
  san: string;
  fenBefore: string;
  fenAfter: string;
  classification: ClassLabel;
  bestMove?: string;
  bestSan?: string;
  cpl: number;
  evalAfter: number;
  evalBefore: number;
  color: "w" | "b";
  ply: number;
};

const DEPTH_OPTIONS = [24, 26, 28, 30] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function bestSanFromUci(fen: string, uci?: string): string | undefined {
  if (!uci) return undefined;
  const m = uciToMove(uci);
  if (!m) return undefined;
  try {
    const c = new Chess(fen);
    const move = c.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
    return move?.san;
  } catch {
    return uci;
  }
}

export default function AnalysisPage() {
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pgn, setPgn] = useState("");
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  /** -1 = start position */
  const [idx, setIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [liveDepth, setLiveDepth] = useState(0);
  const [depth, setDepth] = useState<(typeof DEPTH_OPTIONS)[number]>(26);
  const [playing, setPlaying] = useState(false);
  const [autoReview, setAutoReview] = useState(false);
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const cancelRef = useRef(false);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    if (userHasVip(user.role || "MEMBER", user.vipExpiresAt)) {
      setAllowed(true);
      return;
    }
    apiFetch("/api/games/analyze/check", { method: "POST", userId: user.id })
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
  }, [user]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("stumpchess-analyze-pgn");
      if (stored) {
        setPgn(stored);
        sessionStorage.removeItem("stumpchess-analyze-pgn");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => {
    cancelRef.current = true;
    engineRef.current?.dispose();
    if (playTimer.current) clearTimeout(playTimer.current);
  }, []);

  const runAutoReview = useCallback(async (total: number) => {
    setAutoReview(true);
    setPlaying(true);
    setIdx(-1);
    await sleep(500);
    for (let i = 0; i < total; i++) {
      if (cancelRef.current) break;
      setIdx(i);
      await sleep(700);
    }
    await sleep(600);
    setIdx(-1);
    setPlaying(false);
    setAutoReview(false);
    setProgress("Review ready. Use the arrows to step through the game.");
  }, []);

  async function runAnalysis() {
    cancelRef.current = false;
    setBusy(true);
    setMoves([]);
    setIdx(-1);
    setLiveDepth(0);
    setProgress("Starting Stockfish at full strength…");
    try {
      if (!engineRef.current) engineRef.current = createStockfish();
      await engineRef.current.configureAnalysis();

      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      if (!history.length) throw new Error("No moves found in PGN");
      chess.reset();

      const analyzed: AnalyzedMove[] = [];

      for (let i = 0; i < history.length; i++) {
        if (cancelRef.current) break;
        setProgress(`Deep analysis ${i + 1}/${history.length} · depth ${depth}`);
        const fenBefore = chess.fen();
        const turn = chess.turn();

        const infoBefore: EngineInfo = await engineRef.current.analyze(fenBefore, {
          depth,
          onUpdate: (info) => {
            if (info.depth) setLiveDepth(info.depth);
          },
        });

        const whiteEvalBefore = toWhiteEval(turn, infoBefore.scoreCp, infoBefore.mate);
        const whiteSecondBefore = toWhiteEval(
          turn,
          infoBefore.secondScoreCp,
          infoBefore.secondMate
        );
        const bestGap = Math.max(0, whiteEvalBefore - whiteSecondBefore);
        // gap from mover's perspective (higher = only-move)
        const moverBest =
          turn === "w"
            ? toWhiteEval("w", infoBefore.scoreCp, infoBefore.mate)
            : -toWhiteEval("w", infoBefore.scoreCp, infoBefore.mate);
        const moverSecond =
          turn === "w"
            ? toWhiteEval("w", infoBefore.secondScoreCp, infoBefore.secondMate)
            : -toWhiteEval("w", infoBefore.secondScoreCp, infoBefore.secondMate);
        const gapForMover = Math.max(0, moverBest - moverSecond);

        const mv = history[i];
        const playedUci = `${mv.from}${mv.to}${mv.promotion || ""}`;
        const bestUci = infoBefore.bestMove;
        const isBest = !!bestUci && playedUci === bestUci;

        chess.move(mv);
        const fenAfter = chess.fen();

        const infoAfter = await engineRef.current.analyze(fenAfter, {
          depth: Math.max(18, depth - 2),
          onUpdate: (info) => {
            if (info.depth) setLiveDepth(info.depth);
          },
        });
        const whiteEvalAfter = toWhiteEval(chess.turn(), infoAfter.scoreCp, infoAfter.mate);

        const loss =
          mv.color === "w"
            ? Math.max(0, whiteEvalBefore - whiteEvalAfter)
            : Math.max(0, whiteEvalAfter - whiteEvalBefore);

        const gained =
          mv.color === "w"
            ? Math.max(0, whiteEvalAfter - whiteEvalBefore)
            : Math.max(0, whiteEvalBefore - whiteEvalAfter);

        const wasWinning =
          (mv.color === "w" && whiteEvalBefore > 300) ||
          (mv.color === "b" && whiteEvalBefore < -300);
        const nowBad =
          (mv.color === "w" && whiteEvalAfter < 50) ||
          (mv.color === "b" && whiteEvalAfter > -50);
        const missedWin = wasWinning && nowBad && loss >= 80;

        const classification = classifyMove({
          cpl: loss,
          isBest,
          bestGap: gapForMover || bestGap,
          gained,
          missedWin,
          ply: i + 1,
          isCaptureOrCheck: Boolean(mv.captured || mv.san.includes("+") || mv.san.includes("#")),
        });

        analyzed.push({
          san: mv.san,
          fenBefore,
          fenAfter,
          classification,
          bestMove: bestUci,
          bestSan: bestSanFromUci(fenBefore, bestUci),
          cpl: Math.round(loss),
          evalAfter: whiteEvalAfter,
          evalBefore: whiteEvalBefore,
          color: mv.color,
          ply: i + 1,
        });

        // Live board during analysis
        setMoves([...analyzed]);
        setIdx(i);
      }

      setMoves(analyzed);
      setBusy(false);
      setProgress("Playing review…");
      await runAutoReview(analyzed.length);
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "Failed to analyze PGN");
      setBusy(false);
    }
  }

  function stopAnalysis() {
    cancelRef.current = true;
    setBusy(false);
    setProgress("Stopped.");
  }

  function go(delta: number) {
    if (playing || busy) return;
    setIdx((i) => Math.max(-1, Math.min(moves.length - 1, i + delta)));
  }

  function togglePlay() {
    if (!moves.length || busy || autoReview) return;
    if (playing) {
      setPlaying(false);
      if (playTimer.current) clearTimeout(playTimer.current);
      return;
    }
    setPlaying(true);
    const step = (from: number) => {
      if (from >= moves.length - 1) {
        setPlaying(false);
        return;
      }
      const next = from + 1;
      setIdx(next);
      playTimer.current = setTimeout(() => step(next), 650);
    };
    const startAt = idx < 0 ? -1 : idx;
    if (startAt >= moves.length - 1) {
      setIdx(-1);
      playTimer.current = setTimeout(() => step(-1), 400);
    } else {
      step(startAt);
    }
  }

  const position = useMemo(() => {
    if (!moves.length || idx < 0) return "start";
    return moves[idx]?.fenAfter || "start";
  }, [moves, idx]);

  const current = idx >= 0 ? moves[idx] : null;
  const evalCp = current?.evalAfter ?? (moves[0]?.evalBefore ?? 0);

  const arrows = useMemo((): Arrow[] => {
    if (!current?.bestMove) return [];
    const m = uciToMove(current.bestMove);
    if (!m) return [];
    const color =
      current.classification === "Best" ||
      current.classification === "Brilliant" ||
      current.classification === "Great"
        ? "#96bc4b"
        : "#eb9c3d";
    return [[m.from as Square, m.to as Square, color]];
  }, [current]);

  const lastMoveSquares = useMemo(() => {
    if (!current) return {};
    try {
      const c = new Chess(current.fenBefore);
      const history = c.history({ verbose: true });
      // reconstruct last move from fenBefore + san
      const mv = c.move(current.san);
      if (!mv) return {};
      void history;
      return {
        [mv.from]: { background: "rgba(155, 199, 0, 0.35)" },
        [mv.to]: { background: "rgba(155, 199, 0, 0.55)" },
      };
    } catch {
      return {};
    }
  }, [current]);

  if (isPending) return <p className="pulse-soft ui muted">Loading…</p>;
  if (!user) {
    return (
      <div className="panel p-5">
        <p className="ui">
          <Link href="/login" className="link-accent">
            Login
          </Link>{" "}
          to use analysis.
        </p>
      </div>
    );
  }
  if (allowed === false) {
    return (
      <div className="panel p-6 max-w-lg">
        <h1 className="text-3xl mb-3">Game Review</h1>
        <p className="muted ui">
          Deep Stockfish analysis is a VIP feature. Ask an admin to enable VIP on your account.
        </p>
      </div>
    );
  }
  if (allowed === null) return <p className="pulse-soft ui muted">Loading…</p>;

  const movePairs: Array<{ n: number; w?: AnalyzedMove; b?: AnalyzedMove; wi?: number; bi?: number }> =
    [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.color === "w") {
      movePairs.push({ n: Math.floor(i / 2) + 1, w: m, wi: i });
    } else {
      const last = movePairs[movePairs.length - 1];
      if (last && !last.b) {
        last.b = m;
        last.bi = i;
      } else {
        movePairs.push({ n: Math.ceil((i + 1) / 2), b: m, bi: i });
      }
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <h1 className="text-3xl m-0">Game Review</h1>
          <p className="ui text-xs muted m-0">Stockfish · depth {depth}</p>
        </div>

        <div className="flex gap-3 items-stretch max-w-[min(100%,560px)]">
          <EvalBar whiteCp={evalCp} />
          <div className="flex-1 min-w-0">
            <Chessboard
              position={position}
              arePiecesDraggable={false}
              customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
              customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
              customArrows={arrows}
              customSquareStyles={lastMoveSquares}
            />
          </div>
        </div>

        <div className="mt-4 panel p-3 sm:p-4 max-w-[min(100%,560px)]">
          {current ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <MoveBadge label={current.classification} large />
                <span className="ui text-lg font-semibold">
                  {Math.ceil(current.ply / 2)}
                  {current.color === "w" ? "." : "..."} {current.san}
                </span>
                <span className="ui text-sm muted tabular-nums">
                  {formatEval(current.evalAfter)}
                </span>
              </div>
              {current.classification !== "Best" &&
                current.classification !== "Brilliant" &&
                current.classification !== "Great" &&
                current.bestSan && (
                  <p className="ui text-sm m-0">
                    <span className="muted">Best was </span>
                    <strong style={{ color: "#96bc4b" }}>{current.bestSan}</strong>
                    <span className="muted"> ({current.cpl} cp loss)</span>
                  </p>
                )}
              {(current.classification === "Best" ||
                current.classification === "Brilliant" ||
                current.classification === "Great") && (
                <p className="ui text-sm muted m-0">Engine agrees with this move.</p>
              )}
            </div>
          ) : (
            <p className="ui text-sm muted m-0">
              {moves.length ? "Starting position" : "Paste a PGN and run deep analysis."}
            </p>
          )}

          {moves.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-ghost" onClick={() => setIdx(-1)} disabled={busy || playing}>
                Start
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go(-1)} disabled={busy || playing}>
                Back
              </button>
              <button type="button" className="btn btn-accent" onClick={togglePlay} disabled={busy || autoReview}>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go(1)} disabled={busy || playing}>
                Forward
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIdx(moves.length - 1)}
                disabled={busy || playing}
              >
                End
              </button>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-3">
        <div className="panel p-4 space-y-3">
          <textarea
            className="input min-h-36 ui text-xs"
            placeholder="Paste PGN"
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            disabled={busy}
          />
          <label className="ui text-sm muted block">Analysis depth</label>
          <select
            className="input"
            value={depth}
            disabled={busy}
            onChange={(e) => setDepth(Number(e.target.value) as (typeof DEPTH_OPTIONS)[number])}
          >
            {DEPTH_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Depth {d} {d >= 28 ? "(slow, strongest)" : d >= 26 ? "(recommended)" : ""}
              </option>
            ))}
          </select>
          {!busy ? (
            <button
              type="button"
              className="btn btn-accent w-full"
              disabled={!pgn.trim()}
              onClick={runAnalysis}
            >
              Run deep analysis
            </button>
          ) : (
            <button type="button" className="btn btn-ghost w-full" onClick={stopAnalysis}>
              Stop
            </button>
          )}
          {(busy || progress) && (
            <div className="ui text-xs muted space-y-1">
              <p className="m-0">{progress}</p>
              {busy && liveDepth > 0 && (
                <p className="m-0">Engine depth: {liveDepth}/{depth}</p>
              )}
              {busy && (
                <div className="h-1.5 rounded-full bg-[var(--line)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{
                      width: `${moves.length ? Math.min(100, (moves.length / Math.max(1, pgn.split(/\d+\./).length)) * 100) : 8}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {moves.length > 0 && (
          <div className="panel max-h-[420px] overflow-auto">
            <div className="px-3 py-2 border-b border-[var(--line)] ui text-xs muted sticky top-0 bg-[var(--panel)]">
              Moves
            </div>
            {movePairs.map((row) => (
              <div key={row.n} className="grid grid-cols-[2rem_1fr_1fr] ui text-sm border-b border-[var(--line)]">
                <div className="px-2 py-2 muted">{row.n}.</div>
                <button
                  type="button"
                  className={`text-left px-2 py-2 hover:bg-[var(--panel-hover)] ${
                    row.wi === idx ? "bg-[var(--panel-hover)]" : ""
                  }`}
                  onClick={() => row.wi !== undefined && setIdx(row.wi)}
                  disabled={row.wi === undefined || busy || playing}
                >
                  {row.w ? (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {row.w.san}
                      <MoveBadge label={row.w.classification} />
                    </span>
                  ) : (
                    "…"
                  )}
                </button>
                <button
                  type="button"
                  className={`text-left px-2 py-2 hover:bg-[var(--panel-hover)] ${
                    row.bi === idx ? "bg-[var(--panel-hover)]" : ""
                  }`}
                  onClick={() => row.bi !== undefined && setIdx(row.bi)}
                  disabled={row.bi === undefined || busy || playing}
                >
                  {row.b ? (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {row.b.san}
                      <MoveBadge label={row.b.classification} />
                    </span>
                  ) : (
                    ""
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="panel p-3 ui text-xs muted space-y-1">
          <p className="m-0 font-semibold text-[var(--ink)]">Classifications</p>
          <p className="m-0">Brilliant !! · Great ! · Best · Excellent · Good · Book</p>
          <p className="m-0">Inaccuracy ?! · Mistake ? · Miss · Blunder ??</p>
        </div>
      </aside>
    </div>
  );
}
