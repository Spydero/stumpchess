"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import {
  analyzeFenBatch,
  bestGapCp,
  createStockfish,
  formatEval,
  toWhiteEval,
  uciToMove,
} from "@/lib/stockfish";
import { CLASS_META, classifyMove, type ClassLabel } from "@/lib/classify";
import { useVipFeatures } from "@/lib/vip-features";
import { EvalBar } from "@/components/EvalBar";
import { MoveBadge } from "@/components/MoveBadge";
import {
  ClassificationSquare,
  ClassificationSquareProvider,
  classificationTint,
} from "@/components/ClassificationMarker";
import {
  loadLocalAnalysis,
  parseStoredAnalysis,
  saveLocalAnalysis,
  serializeAnalysis,
  stashMistakesPgn,
  type StoredAnalyzedMove,
} from "@/lib/analysis-cache";

type AnalyzedMove = StoredAnalyzedMove;

const DEPTH_OPTIONS = [16, 18, 20, 22, 24, 26, 28] as const;

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

/** Load moves from PGN text; tolerant of missing headers / trailing junk. */
function parsePgnMoves(raw: string) {
  const text = raw.trim();
  if (!text) return { error: "Paste a PGN (or open Analyze from a finished game)." };

  const chess = new Chess();
  try {
    chess.loadPgn(text, { strict: false } as Parameters<Chess["loadPgn"]>[1]);
  } catch {
    // ignore; try fallback below
  }
  let history = chess.history({ verbose: true });
  if (history.length) return { history };

  // Fallback: strip tags and load move text only
  const movesOnly = text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/[!?+#]/g, "")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .trim();

  if (!movesOnly) return { error: "No moves found in that PGN." };

  const replay = new Chess();
  const tokens = movesOnly.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    try {
      const mv = replay.move(tok);
      if (!mv) return { error: `Could not parse move: ${tok}` };
    } catch {
      return { error: `Could not parse move: ${tok}` };
    }
  }
  history = replay.history({ verbose: true });
  if (!history.length) return { error: "No moves found in that PGN." };
  return { history };
}

function AnalysisPageInner() {
  const searchParams = useSearchParams();
  const { data, isPending } = useSession();
  const user = data?.user as { id: string; role?: string; vipExpiresAt?: string | null } | undefined;
  const vip = useVipFeatures(user);
  const [pgn, setPgn] = useState("");
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  /** -1 = start position */
  const [idx, setIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [liveDepth, setLiveDepth] = useState(0);
  const [depth, setDepth] = useState<(typeof DEPTH_OPTIONS)[number]>(20);
  const [playing, setPlaying] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const cancelRef = useRef(false);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const movesRef = useRef<AnalyzedMove[]>([]);
  const idxRef = useRef(-1);
  const busyRef = useRef(false);
  const boardFocusRef = useRef<HTMLDivElement | null>(null);
  const loadedCacheRef = useRef(false);
  /** Live board follow during Stockfish (pause stops the board, not the engine). */
  const followLiveRef = useRef(false);
  const followTargetRef = useRef(-1);
  const followLoopRef = useRef(false);
  const LIVE_STEP_MS = 750;

  useEffect(() => {
    movesRef.current = moves;
  }, [moves]);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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

  // Load PGN + cached analysis from a saved game (?gameId=...)
  useEffect(() => {
    const id = searchParams.get("gameId");
    if (!id || !user) return;
    setGameId(id);
    loadedCacheRef.current = false;
    apiFetch(`/api/games/${id}`)
      .then(
        (g: {
          pgn?: string;
          analysisJson?: string | null;
          analysisDepth?: number | null;
        }) => {
          if (g.pgn?.trim()) setPgn(g.pgn);
          else {
            setProgress("That game has no saved moves to analyze.");
            return;
          }
          const cached = parseStoredAnalysis(g.analysisJson);
          if (cached) {
            setMoves(cached.moves);
            movesRef.current = cached.moves;
            setIdx(-1);
            idxRef.current = -1;
            if (DEPTH_OPTIONS.includes(cached.depth as (typeof DEPTH_OPTIONS)[number])) {
              setDepth(cached.depth as (typeof DEPTH_OPTIONS)[number]);
            }
            setFromCache(true);
            loadedCacheRef.current = true;
            setProgress(
              `Loaded saved review (depth ${cached.depth}).`
            );
            boardFocusRef.current?.focus({ preventScroll: true });
          }
        }
      )
      .catch(() => setProgress("Could not load that game."));
  }, [searchParams, user]);

  useEffect(() => () => {
    cancelRef.current = true;
    playingRef.current = false;
    engineRef.current?.dispose();
    if (playTimer.current) clearTimeout(playTimer.current);
  }, []);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    followLiveRef.current = false;
    setPlaying(false);
    if (playTimer.current) {
      clearTimeout(playTimer.current);
      playTimer.current = null;
    }
  }, []);

  const runLiveFollowLoop = useCallback(async () => {
    if (followLoopRef.current) return;
    followLoopRef.current = true;
    try {
      while (followLiveRef.current && busyRef.current) {
        const target = followTargetRef.current;
        const cur = idxRef.current;
        if (cur >= target) break;
        const next = cur + 1;
        setIdx(next);
        idxRef.current = next;
        await sleep(LIVE_STEP_MS);
      }
    } finally {
      followLoopRef.current = false;
      // Catch up if more moves landed while we were sleeping
      if (
        followLiveRef.current &&
        busyRef.current &&
        idxRef.current < followTargetRef.current
      ) {
        void runLiveFollowLoop();
      }
    }
  }, [LIVE_STEP_MS]);

  const queueLiveFollow = useCallback(
    (moveIndex: number) => {
      followTargetRef.current = Math.max(followTargetRef.current, moveIndex);
      if (followLiveRef.current) void runLiveFollowLoop();
    },
    [runLiveFollowLoop]
  );

  async function persistAnalysis(analyzed: AnalyzedMove[], usedDepth: number) {
    const payload = serializeAnalysis(analyzed, usedDepth);
    if (gameId && user) {
      try {
        await apiFetch(`/api/games/${gameId}/analysis`, {
          method: "PUT",
          userId: user.id,
          body: JSON.stringify({ analysisJson: JSON.stringify(payload), depth: usedDepth }),
        });
        setFromCache(true);
      } catch {
        saveLocalAnalysis(pgn, payload);
      }
    } else {
      saveLocalAnalysis(pgn, payload);
      setFromCache(true);
    }
  }

  async function runAnalysis(force = false) {
    // Reuse saved review unless user explicitly re-analyzes
    if (!force && moves.length > 0 && fromCache) {
      setProgress("Already have a saved review. Click Re-analyze to run Stockfish again.");
      return;
    }
    if (!force && !moves.length && pgn.trim()) {
      const local = loadLocalAnalysis(pgn);
      if (local && !gameId) {
        setMoves(local.moves);
        movesRef.current = local.moves;
        setFromCache(true);
        if (DEPTH_OPTIONS.includes(local.depth as (typeof DEPTH_OPTIONS)[number])) {
          setDepth(local.depth as (typeof DEPTH_OPTIONS)[number]);
        }
        setProgress(
          `Loaded saved review (depth ${local.depth}).`
        );
        return;
      }
    }

    const parsed = parsePgnMoves(pgn);
    if ("error" in parsed && parsed.error) {
      setProgress(parsed.error);
      return;
    }
    const history = parsed.history!;

    cancelRef.current = false;
    stopPlayback();
    setBusy(true);
    busyRef.current = true;
    setFromCache(false);
    setMoves([]);
    movesRef.current = [];
    setIdx(-1);
    idxRef.current = -1;
    followTargetRef.current = -1;
    followLiveRef.current = true;
    playingRef.current = true;
    setPlaying(true);
    setLiveDepth(0);
    setProgress("Stockfish 19 Lite WASM · starting…");
    try {
      const chess = new Chess();
      const fens: string[] = [chess.fen()];
      const moveMeta: Array<{
        san: string;
        from: Square;
        to: Square;
        color: "w" | "b";
        fenBefore: string;
        fenAfter: string;
        playedUci: string;
        captureOrCheck: boolean;
      }> = [];

      for (const mv of history) {
        const fenBefore = chess.fen();
        const playedUci = `${mv.from}${mv.to}${mv.promotion || ""}`;
        chess.move(mv);
        const fenAfter = chess.fen();
        fens.push(fenAfter);
        moveMeta.push({
          san: mv.san,
          from: mv.from as Square,
          to: mv.to as Square,
          color: mv.color,
          fenBefore,
          fenAfter,
          playedUci,
          captureOrCheck: Boolean(mv.captured || mv.san.includes("+") || mv.san.includes("#")),
        });
      }

      const analyzed: AnalyzedMove[] = [];
      const t0 = performance.now();
      setProgress(`Stockfish 19 Lite WASM · ${fens.length} positions · 4 workers · d${depth}`);

      await analyzeFenBatch(fens, {
        depth,
        concurrency: 4,
        shouldCancel: () => cancelRef.current,
        onProgress: (done, total, lastDepth) => {
          if (lastDepth) setLiveDepth(lastDepth);
          const sec = ((performance.now() - t0) / 1000).toFixed(1);
          const effective = done > 0 ? (Number(sec) / done).toFixed(1) : "-";
          setProgress(
            `Stockfish 19 Lite WASM · ${done}/${total} · d${lastDepth || depth} · ${sec}s wall · ~${effective}s/pos`
          );
        },
        onPairReady: (i, before, after) => {
          const meta = moveMeta[i];
          if (!meta) return;
          const whiteEvalBefore = toWhiteEval(meta.color, before.scoreCp, before.mate);
          const turnAfter = meta.color === "w" ? "b" : "w";
          const whiteEvalAfter = toWhiteEval(turnAfter, after.scoreCp, after.mate);

          let loss =
            meta.color === "w"
              ? Math.max(0, whiteEvalBefore - whiteEvalAfter)
              : Math.max(0, whiteEvalAfter - whiteEvalBefore);
          if (loss < 8) loss = 0;

          const bestUci = before.bestMove || before.pvs[0]?.uci;
          const isBest = (!!bestUci && meta.playedUci === bestUci) || loss <= 5;
          const gained =
            meta.color === "w"
              ? Math.max(0, whiteEvalAfter - whiteEvalBefore)
              : Math.max(0, whiteEvalBefore - whiteEvalAfter);
          const wasWinning =
            (meta.color === "w" && whiteEvalBefore > 400) ||
            (meta.color === "b" && whiteEvalBefore < -400);
          const nowBad =
            (meta.color === "w" && whiteEvalAfter < 50) ||
            (meta.color === "b" && whiteEvalAfter > -50);

          analyzed.push({
            san: meta.san,
            fenBefore: meta.fenBefore,
            fenAfter: meta.fenAfter,
            from: meta.from,
            to: meta.to,
            classification: classifyMove({
              cpl: loss,
              isBest,
              bestGap: bestGapCp(before),
              gained,
              missedWin: wasWinning && nowBad && loss >= 100,
              isCaptureOrCheck: meta.captureOrCheck,
            }),
            bestMove: bestUci,
            bestSan: bestSanFromUci(meta.fenBefore, bestUci),
            cpl: Math.round(loss),
            evalAfter: whiteEvalAfter,
            evalBefore: whiteEvalBefore,
            color: meta.color,
            ply: i + 1,
          });

          // Move list updates immediately; board advances one ply at a time
          setMoves([...analyzed]);
          movesRef.current = [...analyzed];
          queueLiveFollow(analyzed.length - 1);
        },
      });

      if (!analyzed.length) {
        setBusy(false);
        busyRef.current = false;
        stopPlayback();
        setProgress(cancelRef.current ? "Stopped." : "No moves analyzed.");
        return;
      }

      setBusy(false);
      busyRef.current = false;
      followLiveRef.current = false;
      playingRef.current = false;
      setPlaying(false);

      if (!cancelRef.current && analyzed.length) {
        await persistAnalysis(analyzed, depth);
        setProgress(
          "Saved. Use Play or ← → to step through. Re-analyze to run Stockfish again."
        );
        boardFocusRef.current?.focus({ preventScroll: true });
      } else {
        if (analyzed.length) await persistAnalysis(analyzed, depth);
        setProgress(
          analyzed.length
            ? "Stopped. Partial review saved."
            : "Stopped."
        );
        boardFocusRef.current?.focus({ preventScroll: true });
      }
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "Failed to analyze PGN");
      setBusy(false);
      busyRef.current = false;
      stopPlayback();
    }
  }

  function stopAnalysis() {
    cancelRef.current = true;
    setBusy(false);
    busyRef.current = false;
    stopPlayback();
    setProgress("Stopped. Use Forward to step through any moves already analyzed.");
  }

  const go = useCallback((delta: number) => {
    followLiveRef.current = false;
    playingRef.current = false;
    setPlaying(false);
    if (playTimer.current) {
      clearTimeout(playTimer.current);
      playTimer.current = null;
    }
    const list = movesRef.current;
    if (!list.length) return;
    setIdx((i) => {
      const next = Math.max(-1, Math.min(list.length - 1, i + delta));
      idxRef.current = next;
      return next;
    });
  }, []);

  const togglePlay = useCallback(() => {
    const list = movesRef.current;
    if (!list.length) return;

    // During analysis: Play/Pause only controls live board follow
    if (busyRef.current) {
      if (followLiveRef.current) {
        followLiveRef.current = false;
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      followLiveRef.current = true;
      playingRef.current = true;
      setPlaying(true);
      void runLiveFollowLoop();
      return;
    }

    if (playingRef.current) {
      stopPlayback();
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    const step = () => {
      if (!playingRef.current) return;
      const cur = idxRef.current;
      if (cur >= list.length - 1) {
        stopPlayback();
        return;
      }
      const next = cur + 1;
      idxRef.current = next;
      setIdx(next);
      playTimer.current = setTimeout(step, LIVE_STEP_MS);
    };
    if (idxRef.current >= list.length - 1) {
      idxRef.current = -1;
      setIdx(-1);
      playTimer.current = setTimeout(step, 350);
    } else {
      playTimer.current = setTimeout(step, 50);
    }
  }, [LIVE_STEP_MS, runLiveFollowLoop, stopPlayback]);

  // ← / → step through the review; Space pauses live follow during analysis
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if (!movesRef.current.length) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        followLiveRef.current = false;
        playingRef.current = false;
        setPlaying(false);
        setIdx(-1);
        idxRef.current = -1;
      } else if (e.key === "End") {
        e.preventDefault();
        followLiveRef.current = false;
        playingRef.current = false;
        setPlaying(false);
        const last = movesRef.current.length - 1;
        setIdx(last);
        idxRef.current = last;
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, togglePlay]);

  const position = useMemo(() => {
    if (!moves.length || idx < 0) return "start";
    return moves[idx]?.fenAfter || "start";
  }, [moves, idx]);

  const current = idx >= 0 ? moves[idx] : null;
  const evalCp = current?.evalAfter ?? (moves[0]?.evalBefore ?? 0);

  const arrows = useMemo((): Arrow[] => {
    if (!current?.bestMove) return [];
    // Don't draw arrow when the played move was already best/great/brilliant
    if (
      current.classification === "Best" ||
      current.classification === "Brilliant" ||
      current.classification === "Great" ||
      current.classification === "Excellent"
    ) {
      return [];
    }
    const m = uciToMove(current.bestMove);
    if (!m) return [];
    return [[m.from as Square, m.to as Square, CLASS_META.Best.color]];
  }, [current]);

  const lastMoveSquares = useMemo(() => {
    if (!current) return {};
    const tintSoft = classificationTint(current.classification, 0.32);
    const tintStrong = classificationTint(current.classification, 0.52);
    return {
      [current.from]: { background: tintSoft },
      [current.to]: { background: tintStrong },
    };
  }, [current]);

  if (isPending || vip.loading) return <p className="pulse-soft ui muted">Loading…</p>;
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
  if (!vip.allowed) {
    return (
      <div className="panel p-6 max-w-lg">
        <h1 className="text-3xl mb-3">Game Review</h1>
        <p className="muted ui">
          Analysis is VIP-only right now. Ask an LTA+ to open features for everyone.
        </p>
      </div>
    );
  }

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
          <p className="ui text-xs muted m-0">Stockfish 19 Lite WASM · depth {depth} · local</p>
        </div>

        <div className="flex gap-3 items-stretch max-w-[min(100%,560px)]">
          <EvalBar whiteCp={evalCp} />
          <div
            ref={boardFocusRef}
            tabIndex={0}
            className="flex-1 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm"
            onClick={() => boardFocusRef.current?.focus()}
            aria-label="Analysis board. Use left and right arrow keys to step through moves."
          >
            <ClassificationSquareProvider
              target={current?.to}
              label={current?.classification}
            >
              <Chessboard
                position={position}
                arePiecesDraggable={false}
                customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
                customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
                customArrows={arrows}
                customSquareStyles={lastMoveSquares}
                customSquare={ClassificationSquare}
              />
            </ClassificationSquareProvider>
          </div>
        </div>

        <div className="mt-4 panel p-3 sm:p-4 max-w-[min(100%,560px)]">
          {current ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="ui text-lg font-semibold">
                  {Math.ceil(current.ply / 2)}
                  {current.color === "w" ? "." : "..."} {current.san}
                </span>
                <span
                  className="ui text-sm font-semibold"
                  style={{ color: CLASS_META[current.classification].color }}
                >
                  {CLASS_META[current.classification].title}
                </span>
                <span className="ui text-sm muted tabular-nums">
                  {formatEval(current.evalAfter)}
                </span>
              </div>
              {current.classification !== "Best" &&
                current.classification !== "Brilliant" &&
                current.classification !== "Great" &&
                current.classification !== "Excellent" &&
                current.bestSan && (
                  <p className="ui text-sm m-0">
                    <span className="muted">Best: </span>
                    <strong style={{ color: CLASS_META.Best.color }}>{current.bestSan}</strong>
                    <span className="muted"> ({current.cpl} cp loss)</span>
                  </p>
                )}
              {(current.classification === "Best" ||
                current.classification === "Brilliant" ||
                current.classification === "Great" ||
                current.classification === "Excellent") && (
                <p className="ui text-sm muted m-0">Best move.</p>
              )}
            </div>
          ) : (
            <p className="ui text-sm muted m-0">
              {moves.length
                ? "Starting position · ← → to step through"
                : "Paste a PGN and run deep analysis."}
            </p>
          )}

          {moves.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  followLiveRef.current = false;
                  playingRef.current = false;
                  setPlaying(false);
                  setIdx(-1);
                  idxRef.current = -1;
                }}
              >
                Start
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go(-1)}>
                Back
              </button>
              <button type="button" className="btn btn-accent" onClick={togglePlay}>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go(1)}>
                Forward
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  followLiveRef.current = false;
                  playingRef.current = false;
                  setPlaying(false);
                  const last = movesRef.current.length - 1;
                  setIdx(last);
                  idxRef.current = last;
                }}
              >
                End
              </button>
              <span className="ui text-xs muted self-center ml-1">
                ← → · Space {busy ? "pause live" : "play"}
              </span>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-3">
        <div className="panel p-4 space-y-3">
          <textarea
            className="input min-h-36 ui text-xs"
            placeholder={"Paste PGN, e.g.\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"}
            value={pgn}
            onChange={(e) => {
              setPgn(e.target.value);
              if (moves.length) {
                setMoves([]);
                movesRef.current = [];
                setFromCache(false);
                setIdx(-1);
              }
            }}
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
                Depth {d}
                {d <= 18 ? " (fast)" : d <= 22 ? " (recommended)" : " (slower)"}
              </option>
            ))}
          </select>
          {!busy ? (
            <div className="space-y-2">
              {moves.length > 0 ? (
                <>
                  <p className="ui text-xs muted m-0">
                    {fromCache
                      ? "Saved review ready."
                      : "Review ready."}
                  </p>
                  {moves.length > 0 && (
                    <Link
                      href={
                        gameId
                          ? `/practice/mistakes?gameId=${gameId}`
                          : "/practice/mistakes"
                      }
                      className="btn btn-accent w-full"
                      onClick={() => {
                        if (!gameId && pgn.trim()) stashMistakesPgn(pgn);
                      }}
                    >
                      Practice mistakes
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost w-full"
                    disabled={!pgn.trim()}
                    onClick={() => runAnalysis(true)}
                  >
                    Re-analyze with Stockfish
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-accent w-full"
                  disabled={!pgn.trim()}
                  onClick={() => runAnalysis(false)}
                >
                  Run deep analysis
                </button>
              )}
            </div>
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
                  onClick={() => {
                    if (row.wi === undefined) return;
                    followLiveRef.current = false;
                    playingRef.current = false;
                    setPlaying(false);
                    setIdx(row.wi);
                    idxRef.current = row.wi;
                  }}
                  disabled={row.wi === undefined}
                >
                  {row.w ? (
                    <span>
                      {row.w.san}
                      <span
                        className="ml-0.5 font-semibold"
                        style={{ color: CLASS_META[row.w.classification].color }}
                        title={CLASS_META[row.w.classification].title}
                      >
                        {CLASS_META[row.w.classification].symbol}
                      </span>
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
                  onClick={() => {
                    if (row.bi === undefined) return;
                    followLiveRef.current = false;
                    playingRef.current = false;
                    setPlaying(false);
                    setIdx(row.bi);
                    idxRef.current = row.bi;
                  }}
                  disabled={row.bi === undefined}
                >
                  {row.b ? (
                    <span>
                      {row.b.san}
                      <span
                        className="ml-0.5 font-semibold"
                        style={{ color: CLASS_META[row.b.classification].color }}
                        title={CLASS_META[row.b.classification].title}
                      >
                        {CLASS_META[row.b.classification].symbol}
                      </span>
                    </span>
                  ) : (
                    ""
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="panel p-3 ui text-xs space-y-2">
          <p className="m-0 font-semibold text-[var(--ink)]">Classifications</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                "Brilliant",
                "Great",
                "Best",
                "Excellent",
                "Good",
                "Inaccuracy",
                "Mistake",
                "Miss",
                "Blunder",
              ] as ClassLabel[]
            ).map((label) => (
              <MoveBadge key={label} label={label} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<p className="ui muted">Loading analysis…</p>}>
      <AnalysisPageInner />
    </Suspense>
  );
}
