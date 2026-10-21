"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess, type Square } from "chess.js";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import {
  ENGINE_ELO_FULL,
  ENGINE_ELO_MAX,
  ENGINE_ELO_MIN,
  PERSONALITY_BOTS,
  PRACTICE_TIME_CONTROLS,
  STOCKFISH_BOT,
  clampEngineElo,
  encodeBotLevel,
  engineThinkMs,
  formatEngineElo,
  isEngineBot,
  isEngineFullStrength,
  personalityThinkMs,
  playableBotById,
  practiceTcById,
  type PlayableBot,
} from "@chess/shared";
import { EvalBar } from "@/components/EvalBar";
import { MoveBadge } from "@/components/MoveBadge";
import { PracticeChessBoard, type PracticeBoardMarker } from "@/components/PracticeChessBoard";
import { apiFetch } from "@/lib/api";
import { CLASS_META, classifyMove, type ClassLabel } from "@/lib/classify";
import { chooseEngineMove, chooseStyledMove } from "@/lib/bot-personality";
import { formatClock, needsPromotion, playMoveSound } from "@/lib/practice-utils";
import {
  bestGapCp,
  createStockfish,
  depthReliable,
  formatEval,
  stmScore,
  toWhiteEval,
  uciToMove,
  type EngineInfo,
} from "@/lib/stockfish";

export type PracticeMode = "bot" | "sandbox" | "coach";

const COACH_DEPTH_MIN = 8;
const COACH_DEPTH_MAX = 22;
const COACH_DEPTH_STORAGE_KEY = "stumpchess-coach-depth";

const COACH_PRESETS = [
  { id: "fast", label: "Fast", depth: 10, hint: "Quick hints" },
  { id: "normal", label: "Normal", depth: 12, hint: "Balanced" },
  { id: "strong", label: "Strong", depth: 15, hint: "Solid labels" },
  { id: "deep", label: "Deep", depth: 18, hint: "Slow / accurate" },
] as const;

function clampCoachDepth(n: number) {
  if (!Number.isFinite(n)) return 15;
  return Math.max(COACH_DEPTH_MIN, Math.min(COACH_DEPTH_MAX, Math.round(n)));
}

function readStoredCoachDepth(): number {
  if (typeof window === "undefined") return 15;
  try {
    const raw = localStorage.getItem(COACH_DEPTH_STORAGE_KEY);
    if (raw == null) return 15;
    return clampCoachDepth(Number(raw));
  } catch {
    return 15;
  }
}

/** Suggested depth for the current Practice TC (shown as Recommended). */
function recommendedCoachDepth(tcInitialMs: number) {
  if (tcInitialMs > 0 && tcInitialMs <= 60_000) return 10; // 1+0
  if (tcInitialMs > 0 && tcInitialMs <= 180_000) return 12; // 3+x
  if (tcInitialMs > 0 && tcInitialMs <= 300_000) return 15; // 5+x
  return 18; // longer / unlimited
}

function coachDepthHint(depth: number) {
  if (depth <= 10) return "Fast feedback";
  if (depth <= 13) return "Good for blitz";
  if (depth <= 16) return "Solid move labels";
  if (depth <= 19) return "Deeper / slower";
  return "Max local strength";
}

type AnnotatedMove = {
  san: string;
  classification?: ClassLabel;
  cpl?: number;
  bestSan?: string;
  from?: Square;
  to?: Square;
  judging?: boolean;
};

type LastFeedback = {
  san: string;
  classification: ClassLabel;
  cpl: number;
  bestSan?: string;
  from: Square;
  to: Square;
  isBest: boolean;
};

type PendingPromo = { from: string; to: string };
type Premove = { from: string; to: string };

function bestSanFromUci(fen: string, uci?: string) {
  if (!uci) return undefined;
  const m = uciToMove(uci);
  if (!m) return undefined;
  try {
    const c = new Chess(fen);
    return c.move({ from: m.from, to: m.to, promotion: m.promotion || "q" })?.san;
  } catch {
    return uci;
  }
}

function buildPgn(chess: Chess, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) {
    chess.header(k, v);
  }
  let pgn = chess.pgn();
  if (!/\d+\./.test(pgn) && chess.history().length) {
    pgn = chess
      .history()
      .reduce((acc, san, i) => {
        if (i % 2 === 0) acc += `${Math.floor(i / 2) + 1}. ${san} `;
        else acc += `${san} `;
        return acc;
      }, "")
      .trim();
  }
  return pgn;
}

export function PracticeBoard({
  initialMode = "sandbox",
  userId,
}: {
  initialMode?: PracticeMode;
  userId: string;
}) {
  const [mode, setMode] = useState<PracticeMode>(initialMode);
  const [botId, setBotId] = useState<string>(PERSONALITY_BOTS[3].id);
  const [botLane, setBotLane] = useState<"personality" | "engine">("personality");
  /** 0 = Max (unlimited). Else 800–2850. */
  const [engineElo, setEngineElo] = useState(2000);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const engineEloRef = useRef(2000);
  const [tcId, setTcId] = useState<string>("5+0");
  const [liveAnalysis, setLiveAnalysis] = useState(true);
  const [coachDepth, setCoachDepth] = useState(() => readStoredCoachDepth());
  const [soundOn, setSoundOn] = useState(true);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [thinking, setThinking] = useState(false);
  const [judging, setJudging] = useState(false);
  const [labelPending, setLabelPending] = useState(false);
  const [coachInfo, setCoachInfo] = useState<EngineInfo | null>(null);
  const [status, setStatus] = useState("");
  const [gameStatus, setGameStatus] = useState<"ACTIVE" | "FINISHED">("ACTIVE");
  const [result, setResult] = useState<string | null>(null);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "skipped">("idle");
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [annotated, setAnnotated] = useState<AnnotatedMove[]>([]);
  const [lastFeedback, setLastFeedback] = useState<LastFeedback | null>(null);
  const [pendingPromo, setPendingPromo] = useState<PendingPromo | null>(null);
  const [premove, setPremove] = useState<Premove | null>(null);
  const [clocks, setClocks] = useState({ w: 300_000, b: 300_000 });

  const chessRef = useRef(new Chess());
  const playEngine = useRef<ReturnType<typeof createStockfish> | null>(null);
  const coachEngine = useRef<ReturnType<typeof createStockfish> | null>(null);
  const botBusy = useRef(false);
  const botGen = useRef(0);
  const coachGen = useRef(0);
  const judgeGen = useRef(0);
  const coachRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runCoachRef = useRef<(() => Promise<void>) | null>(null);
  const coachInfoRef = useRef<EngineInfo | null>(null);
  const liveRef = useRef(liveAnalysis);
  const depthRef = useRef(15);
  const vsBot = mode === "bot" || mode === "coach";
  const coachOn = mode === "coach" || liveAnalysis;
  const skipCoachFenRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const whiteTime = useRef(300_000);
  const blackTime = useRef(300_000);
  const gameStatusRef = useRef<"ACTIVE" | "FINISHED">("ACTIVE");
  const premoveRef = useRef<Premove | null>(null);
  const soundRef = useRef(true);
  const tcRef = useRef(practiceTcById("5+0"));
  const flaggedRef = useRef(false);
  const saveLockRef = useRef(false);
  const modeRef = useRef(mode);
  const playerColorRef = useRef(playerColor);
  const botRef = useRef<PlayableBot>(playableBotById(PERSONALITY_BOTS[3].id));
  const engineEloSaveRef = useRef(engineElo);

  const bot: PlayableBot = playableBotById(botLane === "engine" ? STOCKFISH_BOT.id : botId);
  const engineMode = isEngineBot(bot);
  useEffect(() => {
    engineEloRef.current = engineElo;
    engineEloSaveRef.current = engineElo;
  }, [engineElo]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);
  useEffect(() => {
    botRef.current = bot;
  }, [bot]);
  const tc = practiceTcById(tcId);
  const timed = tc.initialMs > 0;
  const recommendedDepth = recommendedCoachDepth(tc.initialMs);
  const activePreset = COACH_PRESETS.find((s) => s.depth === coachDepth) || null;

  useEffect(() => {
    coachInfoRef.current = coachInfo;
  }, [coachInfo]);
  useEffect(() => {
    liveRef.current = mode === "coach" ? true : liveAnalysis;
  }, [liveAnalysis, mode]);
  useEffect(() => {
    depthRef.current = coachDepth;
    try {
      localStorage.setItem(COACH_DEPTH_STORAGE_KEY, String(coachDepth));
    } catch {
      /* ignore */
    }
  }, [coachDepth]);
  useEffect(() => {
    if (mode === "coach") setLiveAnalysis(true);
  }, [mode]);
  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);
  useEffect(() => {
    premoveRef.current = premove;
  }, [premove]);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    tcRef.current = tc;
  }, [tc]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setOptionSquares({});
  }, []);

  const showLegalMoves = useCallback((square: Square) => {
    const moves = chessRef.current.moves({ square, verbose: true });
    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: "rgba(61, 107, 79, 0.45)" },
    };
    for (const m of moves) {
      styles[m.to] = {
        background: m.captured
          ? "radial-gradient(circle, rgba(0,0,0,.15) 55%, rgba(61,107,79,.55) 56%)"
          : "radial-gradient(circle, rgba(61,107,79,.45) 22%, transparent 23%)",
      };
    }
    setOptionSquares(styles);
  }, []);

  const persistFinishedGame = useCallback(
    async (res: string) => {
      if (saveLockRef.current) return;
      const history = chessRef.current.history();
      if (history.length < 1) {
        setSaveState("skipped");
        return;
      }
      saveLockRef.current = true;
      setSaveState("saving");
      const curBot = botRef.current;
      const curMode = modeRef.current;
      const curColor = playerColorRef.current;
      const curTc = tcRef.current;
      const vs = curMode === "bot" || curMode === "coach";
      const level =
        curMode === "sandbox"
          ? null
          : encodeBotLevel(
              isEngineBot(curBot)
                ? { kind: "engine", elo: engineEloSaveRef.current }
                : { kind: "personality", skill: curBot.skill }
            );
      const pgn = buildPgn(chessRef.current, {
        Event: curMode === "coach" ? "Stumpchess Practice Coach" : "Stumpchess Practice",
        White: vs ? (curColor === "w" ? "You" : curBot.name) : "Practice",
        Black: vs ? (curColor === "b" ? "You" : curBot.name) : "Practice",
        Result: res,
        TimeControl:
          curTc.initialMs > 0
            ? `${curTc.initialMs / 1000}+${curTc.incrementMs / 1000}`
            : "-",
      });
      try {
        const game = await apiFetch("/api/games/practice", {
          method: "POST",
          userId,
          body: JSON.stringify({
            pgn,
            fen: chessRef.current.fen(),
            result: res,
            color: curColor,
            level,
            timeControl: curTc.id,
            initialMs: curTc.initialMs,
            incrementMs: curTc.incrementMs,
            mode: curMode,
          }),
        });
        setSavedGameId(game.id);
        setSaveState("saved");
      } catch {
        saveLockRef.current = false;
        setSaveState("error");
      }
    },
    [userId]
  );

  const finishGame = useCallback(
    (res: string, message: string) => {
      if (gameStatusRef.current === "FINISHED") return;
      gameStatusRef.current = "FINISHED";
      setGameStatus("FINISHED");
      setResult(res);
      setStatus(message);
      setPendingPromo(null);
      setPremove(null);
      premoveRef.current = null;
      if (soundRef.current) playMoveSound("gameend");
      void persistFinishedGame(res);
    },
    [persistFinishedGame]
  );

  const syncFen = useCallback(() => {
    const c = chessRef.current;
    setFen(c.fen());
    if (gameStatusRef.current === "FINISHED") return;
    if (c.isCheckmate()) {
      finishGame(c.turn() === "w" ? "0-1" : "1-0", c.turn() === "w" ? "Checkmate. Black wins" : "Checkmate. White wins");
    } else if (c.isStalemate()) {
      finishGame("1/2-1/2", "Stalemate");
    } else if (c.isThreefoldRepetition()) {
      finishGame("1/2-1/2", "Draw by repetition");
    } else if (c.isInsufficientMaterial()) {
      finishGame("1/2-1/2", "Draw by insufficient material");
    } else if (c.isDraw()) {
      finishGame("1/2-1/2", "Draw");
    } else if (c.isCheck()) {
      setStatus("Check");
    } else {
      setStatus(c.turn() === "w" ? "White to move" : "Black to move");
    }
  }, [finishGame]);

  const ensureCoach = useCallback(async () => {
    const d = depthRef.current;
    if (!coachEngine.current) {
      coachEngine.current = createStockfish({ forceSingle: true });
    }
    await coachEngine.current.configureCoach({
      multipv: 4,
      hash: d >= 15 ? 48 : 32,
    });
    return coachEngine.current;
  }, []);

  const judgeMove = useCallback(
    async (opts: {
      fenBefore: string;
      fenAfter: string;
      playedUci: string;
      san: string;
      color: "w" | "b";
      from: Square;
      to: Square;
      captureOrCheck: boolean;
      beforeHint: EngineInfo | null;
      moveIndex: number;
    }) => {
      if (!liveRef.current) return;
      const gen = ++judgeGen.current;
      coachGen.current++;
      coachEngine.current?.stop();
      busyRef.current = true;
      setJudging(true);
      setLabelPending(false);
      setAnnotated((list) => {
        const next = [...list];
        if (next[opts.moveIndex]) next[opts.moveIndex] = { ...next[opts.moveIndex], judging: true };
        return next;
      });

      const depth = depthRef.current;

      try {
        const engine = await ensureCoach();
        let before = opts.beforeHint;
        if (!before || !depthReliable(before, depth)) {
          before = await engine.analyze(opts.fenBefore, { depth });
        }
        if (gen !== judgeGen.current) return;

        const after = await engine.analyze(opts.fenAfter, { depth });
        if (gen !== judgeGen.current) return;

        skipCoachFenRef.current = opts.fenAfter;
        coachInfoRef.current = after;
        startTransition(() => setCoachInfo(after));

        const reliable = depthReliable(before, depth) && depthReliable(after, depth);
        if (!reliable) {
          setLabelPending(true);
          setAnnotated((list) => {
            const next = [...list];
            if (next[opts.moveIndex]) next[opts.moveIndex] = { ...next[opts.moveIndex], judging: false };
            return next;
          });
          return;
        }

        const whiteBefore = toWhiteEval(opts.color, before?.scoreCp, before?.mate);
        const turnAfter = opts.color === "w" ? "b" : "w";
        const whiteAfter = toWhiteEval(turnAfter, after.scoreCp, after.mate);

        let loss =
          opts.color === "w"
            ? Math.max(0, whiteBefore - whiteAfter)
            : Math.max(0, whiteAfter - whiteBefore);
        if (loss < 8) loss = 0;

        const bestUci = before?.bestMove || before?.pvs[0]?.uci;
        const isBest = (!!bestUci && opts.playedUci === bestUci) || loss <= 5;
        const gained =
          opts.color === "w"
            ? Math.max(0, whiteAfter - whiteBefore)
            : Math.max(0, whiteBefore - whiteAfter);
        const wasWinning =
          (opts.color === "w" && whiteBefore > 400) || (opts.color === "b" && whiteBefore < -400);
        const nowBad =
          (opts.color === "w" && whiteAfter < 50) || (opts.color === "b" && whiteAfter > -50);

        const classification = classifyMove({
          cpl: loss,
          isBest,
          bestGap: bestGapCp(before),
          gained,
          missedWin: wasWinning && nowBad && loss >= 100,
          isCaptureOrCheck: opts.captureOrCheck,
        });
        const bestSan = isBest ? undefined : bestSanFromUci(opts.fenBefore, bestUci);
        const cpl = Math.round(loss);

        if (gen !== judgeGen.current) return;
        setLabelPending(false);
        startTransition(() => {
          setLastFeedback({
            san: opts.san,
            classification,
            cpl,
            bestSan,
            from: opts.from,
            to: opts.to,
            isBest,
          });
          setAnnotated((list) => {
            const next = [...list];
            if (next[opts.moveIndex]) {
              next[opts.moveIndex] = {
                san: opts.san,
                classification,
                cpl,
                bestSan,
                from: opts.from,
                to: opts.to,
                judging: false,
              };
            }
            return next;
          });
        });
      } catch {
        if (gen === judgeGen.current) {
          setAnnotated((list) => {
            const next = [...list];
            if (next[opts.moveIndex]) next[opts.moveIndex] = { ...next[opts.moveIndex], judging: false };
            return next;
          });
        }
      } finally {
        if (gen === judgeGen.current) {
          setJudging(false);
          busyRef.current = false;
          // Coach may have been skipped while judging — refresh current fen
          const fenNow = chessRef.current.fen();
          if (liveRef.current && skipCoachFenRef.current !== fenNow) {
            if (coachRetryTimer.current) clearTimeout(coachRetryTimer.current);
            coachRetryTimer.current = setTimeout(() => {
              coachRetryTimer.current = null;
              void runCoachRef.current?.();
            }, 60);
          }
        }
      }
    },
    [ensureCoach]
  );

  const runCoach = useCallback(async () => {
    if (!liveRef.current) {
      setCoachInfo(null);
      coachInfoRef.current = null;
      return;
    }
    if (busyRef.current) {
      // Retry after judge finishes instead of leaving stale arrows
      if (coachRetryTimer.current) clearTimeout(coachRetryTimer.current);
      coachRetryTimer.current = setTimeout(() => {
        coachRetryTimer.current = null;
        if (!busyRef.current) void runCoachRef.current?.();
      }, 120);
      return;
    }

    const fenNow = chessRef.current.fen();
    if (skipCoachFenRef.current === fenNow) {
      skipCoachFenRef.current = null;
      return;
    }
    if (chessRef.current.isGameOver() || gameStatusRef.current === "FINISHED") {
      setCoachInfo(null);
      return;
    }

    const gen = ++coachGen.current;
    try {
      const engine = await ensureCoach();
      let lastArrowSig = "";
      let lastUiDepth = -1;
      // Only push UI when candidate moves change, or every ~3 depths (cuts arrow flicker)
      const info = await engine.analyze(fenNow, {
        depth: depthRef.current,
        onUpdate: (partial) => {
          if (gen !== coachGen.current) return;
          if (!partial.bestMove && !partial.pvs?.length) return;
          const arrowSig = (partial.pvs || [])
            .slice(0, 4)
            .map((p) => p.uci)
            .join(",");
          const d = partial.depth || 0;
          const target = depthRef.current;
          const arrowsChanged = arrowSig !== lastArrowSig;
          const depthMilestone = d === target || (d > 0 && d % 3 === 0 && d !== lastUiDepth);
          if (!arrowsChanged && !depthMilestone) return;
          lastArrowSig = arrowSig;
          lastUiDepth = d;
          coachInfoRef.current = partial;
          startTransition(() => setCoachInfo(partial));
        },
      });
      if (gen === coachGen.current) {
        coachInfoRef.current = info;
        startTransition(() => setCoachInfo(info));
      }
    } catch {
      /* ignore */
    }
  }, [ensureCoach]);

  useEffect(() => {
    runCoachRef.current = runCoach;
  }, [runCoach]);

  const applyHumanMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = chessRef.current;
      if (gameStatusRef.current !== "ACTIVE" || chess.isGameOver()) return false;
      if (vsBot && chess.turn() !== playerColor) return false;

      if (!promotion && needsPromotion(chess, from, to)) {
        const legal = chess
          .moves({ verbose: true })
          .some((m) => m.from === from && m.to === to && m.promotion);
        if (legal) {
          setPendingPromo({ from, to });
          clearSelection();
          return false;
        }
      }

      try {
        const fenBefore = chess.fen();
        const color = chess.turn();
        const beforeHint = coachInfoRef.current;
        const move = chess.move({ from, to, promotion: promotion || "q" });
        if (!move) return false;

        const curTc = tcRef.current;
        if (curTc.initialMs > 0 && curTc.incrementMs > 0) {
          if (color === "w") whiteTime.current += curTc.incrementMs;
          else blackTime.current += curTc.incrementMs;
          setClocks({ w: whiteTime.current, b: blackTime.current });
        }

        if (soundRef.current) {
          const kind = move.san.includes("+") || move.san.includes("#")
            ? "check"
            : move.captured
              ? "capture"
              : "move";
          playMoveSound(kind);
        }

        const playedUci = `${move.from}${move.to}${move.promotion || ""}`;
        const fenAfter = chess.fen();
        const captureOrCheck = Boolean(
          move.captured || move.san.includes("+") || move.san.includes("#")
        );
        const moveIndex = chess.history().length - 1;
        setAnnotated((list) => [
          ...list,
          {
            san: move.san,
            from: move.from,
            to: move.to,
            judging: liveRef.current,
          },
        ]);
        if (liveRef.current) {
          void judgeMove({
            fenBefore,
            fenAfter,
            playedUci,
            san: move.san,
            color,
            from: move.from,
            to: move.to,
            captureOrCheck,
            beforeHint,
            moveIndex,
          });
        }
        setPendingPromo(null);
        clearSelection();
        syncFen();
        return true;
      } catch {
        return false;
      }
    },
    [vsBot, playerColor, judgeMove, clearSelection, syncFen]
  );

  const tryPremove = useCallback(() => {
    const pm = premoveRef.current;
    if (!pm || gameStatusRef.current !== "ACTIVE") return;
    if (chessRef.current.turn() !== playerColor) return;
    premoveRef.current = null;
    setPremove(null);
    if (needsPromotion(chessRef.current, pm.from, pm.to)) {
      const legal = chessRef.current
        .moves({ verbose: true })
        .some((m) => m.from === pm.from && m.to === pm.to && m.promotion);
      if (legal) {
        setPendingPromo({ from: pm.from, to: pm.to });
        return;
      }
    }
    applyHumanMove(pm.from, pm.to);
  }, [playerColor, applyHumanMove]);

  const runBot = useCallback(async () => {
    if (!vsBot || botBusy.current) return;
    const chess = chessRef.current;
    if (gameStatusRef.current !== "ACTIVE" || chess.isGameOver()) return;
    if (chess.turn() === playerColor) return;

    const myGen = ++botGen.current;
    botBusy.current = true;
    setThinking(true);
    const started = Date.now();
    // Unlimited → treat like 10+0 think budget
    const thinkInitial = tcRef.current.initialMs || 600_000;
    const engElo = engineEloRef.current;
    const { movetime, minDelay } = engineMode
      ? engineThinkMs({ initialMs: thinkInitial, elo: engElo })
      : personalityThinkMs({ skill: bot.skill, initialMs: thinkInitial });

    try {
      if (!playEngine.current) playEngine.current = createStockfish({ forceSingle: true });
      const fenBefore = chess.fen();
      let picked: string | undefined;

      if (engineMode) {
        // Capped Elo: MultiPV 1 + PV1 only (truer to UCI_Elo). Max: MultiPV float.
        const full = isEngineFullStrength(engElo);
        await playEngine.current.configureEngine(engElo, { multipv: full ? 4 : 1 });
        if (myGen !== botGen.current) return;
        const info = await playEngine.current.analyze(fenBefore, { movetime });
        if (myGen !== botGen.current) return;
        const lines = info.pvs.length ? info.pvs : [{ rank: 1, uci: info.bestMove || "" }];
        picked = chooseEngineMove(lines, { freeFloat: full }) || info.bestMove;
      } else {
        const style = "style" in bot ? bot.style : "balanced";
        const useStyle = style !== "balanced";
        await playEngine.current.configure(bot.skill, bot.elo, { multipv: useStyle ? 2 : 1 });
        if (myGen !== botGen.current) return;
        const info = await playEngine.current.analyze(fenBefore, { movetime });
        if (myGen !== botGen.current) return;
        picked = useStyle
          ? chooseStyledMove(
              fenBefore,
              info.pvs.length ? info.pvs : [{ rank: 1, uci: info.bestMove || "" }],
              style
            ) || info.bestMove
          : info.bestMove;
      }

      const elapsed = Date.now() - started;
      if (elapsed < minDelay) await new Promise((r) => setTimeout(r, minDelay - elapsed));

      // Cancelled, finished, or board changed (new game / takeback)
      if (myGen !== botGen.current) return;
      if (gameStatusRef.current !== "ACTIVE") return;
      if (chessRef.current.fen() !== fenBefore) return;

      const m = picked ? uciToMove(picked) : null;
      if (m) {
        const botColor = chessRef.current.turn();
        const move = chessRef.current.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion || "q",
        });
        if (move) {
          const curTc = tcRef.current;
          if (curTc.initialMs > 0 && curTc.incrementMs > 0) {
            if (botColor === "w") whiteTime.current += curTc.incrementMs;
            else blackTime.current += curTc.incrementMs;
            setClocks({ w: whiteTime.current, b: blackTime.current });
          }
          if (soundRef.current) {
            const kind = move.san.includes("+") || move.san.includes("#")
              ? "check"
              : move.captured
                ? "capture"
                : "move";
            playMoveSound(kind);
          }
          setAnnotated((list) => [...list, { san: move.san, from: move.from, to: move.to }]);
          clearSelection();
          syncFen();
          setTimeout(() => {
            if (myGen === botGen.current) tryPremove();
          }, 30);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (myGen === botGen.current) {
        setThinking(false);
        botBusy.current = false;
      }
    }
  }, [vsBot, playerColor, bot, engineMode, clearSelection, syncFen, tryPremove]);

  useEffect(() => {
    syncFen();
    return () => {
      botGen.current++;
      coachGen.current++;
      judgeGen.current++;
      if (coachRetryTimer.current) clearTimeout(coachRetryTimer.current);
      playEngine.current?.dispose();
      coachEngine.current?.dispose();
      playEngine.current = null;
      coachEngine.current = null;
    };
  }, [syncFen]);

  useEffect(() => {
    if (!vsBot && playEngine.current) {
      playEngine.current.dispose();
      playEngine.current = null;
    }
  }, [vsBot]);

  useEffect(() => {
    if (coachOn) return;
    coachGen.current++;
    coachEngine.current?.stop();
    setLastFeedback(null);
    setCoachInfo(null);
    coachInfoRef.current = null;
    setJudging(false);
    setLabelPending(false);
    busyRef.current = false;
    setAnnotated((list) => list.map(({ san, from, to }) => ({ san, from, to })));
  }, [coachOn]);

  useEffect(() => {
    if (!coachOn) return;
    // Drop previous arrows immediately so they don't sit on the new position
    coachGen.current++;
    coachEngine.current?.stop();
    setCoachInfo(null);
    coachInfoRef.current = null;
    const t = setTimeout(() => void runCoach(), 100);
    return () => clearTimeout(t);
  }, [fen, coachOn, coachDepth, runCoach]);

  useEffect(() => {
    if (!vsBot) return;
    if (gameStatus !== "ACTIVE") return;
    if (chessRef.current.isGameOver()) return;
    if (chessRef.current.turn() === playerColor) return;
    const t = setTimeout(() => void runBot(), 150);
    return () => clearTimeout(t);
  }, [fen, vsBot, playerColor, runBot, gameStatus]);

  // Clocks tick only after the first move (setup shouldn't burn time)
  const clockStarted = annotated.length > 0;
  useEffect(() => {
    if (!timed || gameStatus !== "ACTIVE" || !clockStarted) return;
    flaggedRef.current = false;
    let lastW = -1;
    let lastB = -1;
    const id = setInterval(() => {
      if (gameStatusRef.current !== "ACTIVE" || flaggedRef.current) return;
      const turn = chessRef.current.turn();
      if (turn === "w") whiteTime.current = Math.max(0, whiteTime.current - 100);
      else blackTime.current = Math.max(0, blackTime.current - 100);
      // Only re-render when the displayed second changes (~1Hz, not 10Hz)
      const wSec = Math.ceil(whiteTime.current / 1000);
      const bSec = Math.ceil(blackTime.current / 1000);
      if (wSec !== lastW || bSec !== lastB) {
        lastW = wSec;
        lastB = bSec;
        setClocks({ w: whiteTime.current, b: blackTime.current });
      }
      if (whiteTime.current <= 0) {
        flaggedRef.current = true;
        setClocks({ w: 0, b: blackTime.current });
        finishGame("0-1", "White flagged. Black wins");
      } else if (blackTime.current <= 0) {
        flaggedRef.current = true;
        setClocks({ w: whiteTime.current, b: 0 });
        finishGame("1-0", "Black flagged. White wins");
      }
    }, 100);
    return () => clearInterval(id);
  }, [timed, gameStatus, clockStarted, finishGame]);

  function resetClocks(nextTc = tc) {
    whiteTime.current = nextTc.initialMs || 0;
    blackTime.current = nextTc.initialMs || 0;
    setClocks({ w: whiteTime.current, b: blackTime.current });
    flaggedRef.current = false;
  }

  function resetBoard(nextColor: "w" | "b" = playerColor, nextTcId = tcId) {
    coachGen.current++;
    judgeGen.current++;
    botGen.current++;
    botBusy.current = false;
    busyRef.current = false;
    setThinking(false);
    setJudging(false);
    if (coachRetryTimer.current) {
      clearTimeout(coachRetryTimer.current);
      coachRetryTimer.current = null;
    }
    playEngine.current?.stop();
    coachEngine.current?.stop();
    chessRef.current = new Chess();
    clearSelection();
    setCoachInfo(null);
    coachInfoRef.current = null;
    skipCoachFenRef.current = null;
    setAnnotated([]);
    setLastFeedback(null);
    setPendingPromo(null);
    setPremove(null);
    premoveRef.current = null;
    gameStatusRef.current = "ACTIVE";
    setGameStatus("ACTIVE");
    setResult(null);
    saveLockRef.current = false;
    setSavedGameId(null);
    setSaveState("idle");
    const nextTc = practiceTcById(nextTcId);
    tcRef.current = nextTc;
    resetClocks(nextTc);
    setOrientation(nextColor === "b" ? "black" : "white");
    syncFen();
  }

  function takeback() {
    if (!annotated.length || gameStatus !== "ACTIVE") return;
    judgeGen.current++;
    coachGen.current++;
    botGen.current++;
    botBusy.current = false;
    setThinking(false);
    playEngine.current?.stop();
    coachEngine.current?.stop();
    busyRef.current = false;
    setJudging(false);
    setLabelPending(false);
    setPendingPromo(null);
    setPremove(null);
    premoveRef.current = null;
    setCoachInfo(null);
    coachInfoRef.current = null;
    if (vsBot) {
      chessRef.current.undo();
      if (chessRef.current.turn() !== playerColor) chessRef.current.undo();
      setAnnotated((list) => list.slice(0, chessRef.current.history().length));
    } else {
      chessRef.current.undo();
      setAnnotated((list) => list.slice(0, -1));
    }
    setLastFeedback(null);
    skipCoachFenRef.current = null;
    clearSelection();
    syncFen();
  }

  function resign() {
    if (gameStatus !== "ACTIVE") return;
    if (vsBot) {
      finishGame(playerColor === "w" ? "0-1" : "1-0", "You resigned");
    } else {
      const loser = chessRef.current.turn();
      finishGame(loser === "w" ? "0-1" : "1-0", `${loser === "w" ? "White" : "Black"} resigned`);
    }
  }

  function agreeDraw() {
    if (gameStatus !== "ACTIVE") return;
    finishGame("1/2-1/2", "Draw by agreement");
  }

  function exportPgn() {
    const pgn = buildPgn(chessRef.current, {
      Event: "Stumpchess Practice",
      White: vsBot ? (playerColor === "w" ? "You" : bot.name) : "White",
      Black: vsBot ? (playerColor === "b" ? "You" : bot.name) : "Black",
      Result: result || "*",
      TimeControl: timed ? `${tc.initialMs / 1000}+${tc.incrementMs / 1000}` : "-",
    });
    try {
      void navigator.clipboard.writeText(pgn);
      setStatus("PGN copied");
    } catch {
      setStatus("Could not copy PGN");
    }
  }

  function openReview() {
    if (!chessRef.current.history().length) return;
    const pgn = buildPgn(chessRef.current, {
      Event: "Stumpchess Practice",
      White: vsBot ? (playerColor === "w" ? "You" : bot.name) : "White",
      Black: vsBot ? (playerColor === "b" ? "You" : bot.name) : "Black",
      Result: result || "*",
    });
    try {
      sessionStorage.setItem("stumpchess-analyze-pgn", pgn);
    } catch {
      /* ignore */
    }
  }

  function retrySave() {
    if (!result || saveState === "saving" || saveState === "saved") return;
    saveLockRef.current = false;
    void persistFinishedGame(result);
  }

  const setPremoveSafe = useCallback((from: string, to: string) => {
    // Soft-validate: piece belongs to player
    const piece = chessRef.current.get(from as Square);
    if (!piece || piece.color !== playerColor) return;
    const next = { from, to };
    premoveRef.current = next;
    setPremove(next);
    clearSelection();
  }, [playerColor, clearSelection]);

  const onPieceDrop = useCallback(
    (from: string, to: string) => {
      if (gameStatusRef.current !== "ACTIVE") return false;
      if (pendingPromo) return false;
      if (vsBot && chessRef.current.turn() !== playerColor) {
        setPremoveSafe(from, to);
        return false;
      }
      return applyHumanMove(from, to);
    },
    [vsBot, playerColor, pendingPromo, applyHumanMove, setPremoveSafe]
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      const chess = chessRef.current;
      if (gameStatusRef.current !== "ACTIVE" || pendingPromo) return;

      // Cancel premove
      if (premove && selected === null) {
        setPremove(null);
        premoveRef.current = null;
      }

      const ourTurn = !vsBot || chess.turn() === playerColor;

      if (!ourTurn && vsBot) {
        // Premove selection
        if (selected) {
          if (selected === square) {
            clearSelection();
            return;
          }
          setPremoveSafe(selected, square);
          return;
        }
        const piece = chess.get(square);
        if (piece && piece.color === playerColor) {
          setSelected(square);
          setOptionSquares({ [square]: { background: "rgba(255, 170, 0, 0.4)" } });
        }
        return;
      }

      if (selected) {
        if (selected === square) {
          clearSelection();
          return;
        }
        if (applyHumanMove(selected, square)) return;
      }
      const piece = chess.get(square);
      if (!piece) {
        clearSelection();
        return;
      }
      if (vsBot && piece.color !== playerColor) return;
      if (mode === "sandbox" && piece.color !== chess.turn()) return;
      setSelected(square);
      showLegalMoves(square);
    },
    [
      vsBot,
      mode,
      playerColor,
      selected,
      premove,
      pendingPromo,
      applyHumanMove,
      clearSelection,
      showLegalMoves,
      setPremoveSafe,
    ]
  );

  /** Up to 4 arrows for near-best MultiPV lines (colors by rank). */
  const coachArrows = useMemo((): Arrow[] => {
    if (!coachOn || !coachInfo) return [];
    const lines = (coachInfo.pvs?.length
      ? coachInfo.pvs
      : coachInfo.bestMove
        ? [{ rank: 1, uci: coachInfo.bestMove, scoreCp: coachInfo.scoreCp, mate: coachInfo.mate }]
        : []
    ).filter((p) => p.uci);
    if (!lines.length) return [];

    const bestScore = stmScore(lines[0].scoreCp, lines[0].mate);
    const MAX_GAP = 25;
    const colors = [
      "rgb(111, 168, 135)",
      "rgb(120, 168, 196)",
      "rgb(196, 168, 104)",
      "rgb(168, 140, 188)",
    ];

    const out: Arrow[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.min(4, lines.length); i++) {
      const line = lines[i];
      const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
      if (i > 0 && gap > MAX_GAP) continue;
      const m = uciToMove(line.uci);
      if (!m) continue;
      const key = `${m.from}${m.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([m.from as Square, m.to as Square, colors[i] || colors[colors.length - 1]]);
    }
    return out;
  }, [coachOn, coachInfo]);

  const boardMarker = useMemo((): PracticeBoardMarker => {
    if (!coachOn || !lastFeedback) return null;
    return {
      from: lastFeedback.from,
      to: lastFeedback.to,
      classification: lastFeedback.classification,
    };
  }, [coachOn, lastFeedback]);

  // Sandbox: drag on your turn. vsBot: always drag own pieces (supports premove).
  const piecesDraggable =
    gameStatus === "ACTIVE" &&
    !pendingPromo &&
    (mode === "sandbox" ? !thinking : true);

  const whiteCp = coachInfo
    ? toWhiteEval(chessRef.current.turn(), coachInfo.scoreCp, coachInfo.mate)
    : 0;

  const bestSans = useMemo(() => {
    if (!coachArrows.length || !coachInfo) return [] as string[];
    const lines = coachInfo.pvs?.length
      ? coachInfo.pvs
      : coachInfo.bestMove
        ? [{ uci: coachInfo.bestMove }]
        : [];
    const sans: string[] = [];
    for (const line of lines.slice(0, coachArrows.length)) {
      try {
        const c = new Chess(fen);
        const m = uciToMove(line.uci);
        if (!m) continue;
        const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
        if (mv?.san) sans.push(mv.san);
      } catch {
        /* skip */
      }
    }
    return sans;
  }, [coachArrows.length, coachInfo, fen]);

  const topClock = orientation === "white" ? clocks.b : clocks.w;
  const bottomClock = orientation === "white" ? clocks.w : clocks.b;
  const topLabel = orientation === "white" ? (vsBot ? (playerColor === "b" ? "You" : bot.name) : "Black") : vsBot ? (playerColor === "w" ? "You" : bot.name) : "White";
  const bottomLabel = orientation === "white" ? (vsBot ? (playerColor === "w" ? "You" : bot.name) : "White") : vsBot ? (playerColor === "b" ? "You" : bot.name) : "Black";
  const turn = fen.split(" ")[1] as "w" | "b";
  const topActive =
    timed &&
    clockStarted &&
    gameStatus === "ACTIVE" &&
    (orientation === "white" ? turn === "b" : turn === "w");
  const bottomActive =
    timed &&
    clockStarted &&
    gameStatus === "ACTIVE" &&
    (orientation === "white" ? turn === "w" : turn === "b");

  const promoPieces =
    pendingPromo &&
    (() => {
      const piece = chessRef.current.get(pendingPromo.from as Square);
      const color = piece?.color || playerColor;
      const glyphs = color === "w" ? (["♕", "♖", "♗", "♘"] as const) : (["♛", "♜", "♝", "♞"] as const);
      const codes = ["q", "r", "b", "n"] as const;
      return codes.map((code, i) => ({ code, glyph: glyphs[i] }));
    })();

  const promoOverlay = pendingPromo && promoPieces ? (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(20,24,22,0.55)] rounded">
      <div className="panel p-3 flex gap-2 shadow-lg">
        <p className="ui text-xs muted m-0 self-center mr-1">Promote</p>
        {promoPieces.map((p) => (
          <button
            key={p.code}
            type="button"
            className="btn btn-ghost !text-2xl !px-3 !py-2"
            onClick={() => applyHumanMove(pendingPromo.from, pendingPromo.to, p.code)}
            aria-label={`Promote to ${p.code}`}
          >
            {p.glyph}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost !text-xs"
          onClick={() => setPendingPromo(null)}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] rise-in">
      <div>
        {timed && (
          <div
            className={`mb-2 flex justify-between items-center px-3 py-2 rounded ui tabular-nums ${
              topActive
                ? "font-semibold bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                : "muted"
            }`}
          >
            <span className="text-sm">{topLabel}</span>
            <span className="text-xl">{formatClock(topClock)}</span>
          </div>
        )}

        <div className="flex gap-2 items-stretch">
          {coachOn && <EvalBar whiteCp={whiteCp} />}
          <div className="flex-1 min-w-0">
            <PracticeChessBoard
              fen={fen}
              orientation={orientation}
              draggable={piecesDraggable}
              optionSquares={optionSquares}
              marker={boardMarker}
              arrows={coachArrows}
              premove={premove}
              overlay={promoOverlay}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
            />
          </div>
        </div>

        {timed && (
          <div
            className={`mt-2 flex justify-between items-center px-3 py-2 rounded ui tabular-nums ${
              bottomActive
                ? "font-semibold bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                : "muted"
            }`}
          >
            <span className="text-sm">{bottomLabel}</span>
            <span className="text-xl">{formatClock(bottomClock)}</span>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <p className="ui text-sm muted m-0">
            {thinking
              ? `${bot.name} is thinking…`
              : judging
                ? "Judging…"
                : labelPending
                  ? "Analyzing…"
                  : status}
            {premove && gameStatus === "ACTIVE" && (
              <span className="text-[var(--ink)]"> · Premove set</span>
            )}
            {coachOn && bestSans.length > 0 && !thinking && gameStatus === "ACTIVE" && (
              <span className="text-[var(--ink)]">
                {" "}
                · {bestSans.length > 1 ? "Candidates" : "Best"}:{" "}
                <strong className="text-[var(--accent)]">{bestSans.join(", ")}</strong>
                {coachInfo?.depth ? ` (d${coachInfo.depth})` : ""}
                {coachInfo ? ` · ${formatEval(whiteCp)}` : ""}
              </span>
            )}
          </p>

          {gameStatus === "FINISHED" && (
            <div className="panel p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="ui text-sm m-0 font-semibold flex-1">
                  Game over · {result}
                </p>
                <button type="button" className="btn btn-ghost !text-xs" onClick={exportPgn}>
                  Copy PGN
                </button>
                <Link
                  href={savedGameId ? `/analysis?gameId=${savedGameId}` : "/analysis"}
                  className="btn btn-accent !text-xs"
                  onClick={openReview}
                >
                  Open review
                </Link>
                <button type="button" className="btn btn-ghost !text-xs" onClick={() => resetBoard()}>
                  New game
                </button>
              </div>
              <p className="ui text-xs muted m-0">
                {saveState === "saving" && "Saving to your games…"}
                {saveState === "saved" && savedGameId && (
                  <>
                    Saved.{" "}
                    <Link href="/games" className="link-accent">
                      My games
                    </Link>
                    {" · "}
                    <Link href={`/practice/mistakes?gameId=${savedGameId}`} className="link-accent">
                      Mistakes
                    </Link>
                  </>
                )}
                {saveState === "error" && (
                  <>
                    Could not save.{" "}
                    <button type="button" className="link-accent ui text-xs" onClick={retrySave}>
                      Retry
                    </button>
                  </>
                )}
                {saveState === "skipped" && "Not saved (no moves)."}
              </p>
            </div>
          )}

          {coachOn && lastFeedback && (
            <div
              className="panel p-3 flex flex-wrap items-center gap-2"
              style={{
                borderColor: `color-mix(in srgb, ${CLASS_META[lastFeedback.classification].color} 45%, var(--line))`,
              }}
            >
              <MoveBadge label={lastFeedback.classification} large />
              <div className="ui text-sm min-w-0">
                <p className="m-0 font-semibold">
                  {lastFeedback.san}
                  <span className="muted font-normal">
                    {" "}
                    · {lastFeedback.cpl === 0 ? "no loss" : `${lastFeedback.cpl} cp loss`}
                  </span>
                </p>
                {!lastFeedback.isBest && lastFeedback.bestSan ? (
                  <p className="m-0 mt-0.5 muted text-xs">
                    Best: <strong style={{ color: "var(--accent)" }}>{lastFeedback.bestSan}</strong>
                  </p>
                ) : (
                  <p className="m-0 mt-0.5 muted text-xs">Best move.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="panel p-4 space-y-3">
          <p className="forum-kicker m-0">Mode</p>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              className={`btn !px-1 !text-xs ${mode === "sandbox" ? "btn-accent" : "btn-ghost"}`}
              onClick={() => {
                setMode("sandbox");
                resetBoard();
              }}
            >
              Both sides
            </button>
            <button
              type="button"
              className={`btn !px-1 !text-xs ${mode === "bot" ? "btn-accent" : "btn-ghost"}`}
              onClick={() => {
                setMode("bot");
                resetBoard();
              }}
            >
              vs Bot
            </button>
            <button
              type="button"
              className={`btn !px-1 !text-xs ${mode === "coach" ? "btn-accent" : "btn-ghost"}`}
              onClick={() => {
                setMode("coach");
                setLiveAnalysis(true);
                resetBoard();
              }}
            >
              Coach
            </button>
          </div>
          <p className="ui text-xs muted m-0">
            {mode === "coach"
              ? "Vs bot with live eval, best arrow, and move labels."
              : mode === "bot"
                ? "Vs a named bot. Coach optional."
                : "Move for both sides. Coach optional."}
          </p>
          <Link href="/practice/mistakes" className="ui text-xs link-accent">
            Mistake drills
          </Link>
        </div>

        <div className="panel p-4 space-y-3">
          <p className="forum-kicker m-0">Time control</p>
          <div className="grid grid-cols-4 gap-1">
            {PRACTICE_TIME_CONTROLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn !px-1 !py-1.5 !text-xs ${tcId === t.id ? "btn-accent" : "btn-ghost"}`}
                onClick={() => {
                  setTcId(t.id);
                  resetBoard(playerColor, t.id);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="ui text-xs muted m-0">
            {timed ? `Clocks on · ${tc.label}` : "No clocks"}
          </p>
        </div>

        {vsBot && (
          <div className="panel p-4 space-y-3">
            <p className="forum-kicker m-0">Opponent</p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                className={`btn !text-xs ${botLane === "personality" ? "btn-accent" : "btn-ghost"}`}
                onClick={() => {
                  setBotLane("personality");
                  resetBoard();
                }}
              >
                Personality
              </button>
              <button
                type="button"
                className={`btn !text-xs ${botLane === "engine" ? "btn-accent" : "btn-ghost"}`}
                onClick={() => {
                  setBotLane("engine");
                  resetBoard();
                }}
              >
                Stockfish
              </button>
            </div>

            {engineMode ? (
              <>
                <p className="ui text-sm m-0 font-semibold">
                  {STOCKFISH_BOT.name} · {formatEngineElo(engineElo)}
                  {isEngineFullStrength(engineElo) ? "" : " Elo"}
                </p>
                <label className="ui text-xs muted block">
                  Strength {isEngineFullStrength(engineElo) ? "(unlimited)" : `(~${formatEngineElo(engineElo)} Elo)`}
                </label>
                <input
                  type="range"
                  min={ENGINE_ELO_MIN}
                  max={ENGINE_ELO_MAX + 50}
                  step={50}
                  value={isEngineFullStrength(engineElo) ? ENGINE_ELO_MAX + 50 : engineElo}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setEngineElo(v > ENGINE_ELO_MAX ? ENGINE_ELO_FULL : clampEngineElo(v));
                  }}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="flex justify-between ui text-[10px] muted">
                  <span>{ENGINE_ELO_MIN}</span>
                  <span>Max</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[1200, 1600, 2000, 2400, ENGINE_ELO_FULL].map((e) => (
                    <button
                      key={e === ENGINE_ELO_FULL ? "max" : e}
                      type="button"
                      className={`btn !px-2 !py-1 !text-xs ${
                        (e === ENGINE_ELO_FULL && isEngineFullStrength(engineElo)) || engineElo === e
                          ? "btn-accent"
                          : "btn-ghost"
                      }`}
                      onClick={() => {
                        setEngineElo(e);
                        resetBoard();
                      }}
                    >
                      {e === ENGINE_ELO_FULL ? "Max" : e}
                    </button>
                  ))}
                </div>
                <p className="ui text-xs muted m-0">{STOCKFISH_BOT.tagline}</p>
              </>
            ) : (
              <>
                <label className="ui text-xs muted block">
                  {bot.name} · ~{bot.elo} Elo
                  {"style" in bot ? ` · ${bot.style}` : ""}
                </label>
                <input
                  type="range"
                  min={0}
                  max={PERSONALITY_BOTS.length - 1}
                  value={Math.max(0, PERSONALITY_BOTS.findIndex((b) => b.id === botId))}
                  onChange={(e) => {
                    const next = PERSONALITY_BOTS[Number(e.target.value)];
                    if (next) {
                      setBotId(next.id);
                      resetBoard();
                    }
                  }}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="flex justify-between ui text-[10px] muted">
                  <span>Weak</span>
                  <span>Strong</span>
                </div>
                <select
                  className="input"
                  value={botId}
                  onChange={(e) => {
                    setBotId(e.target.value);
                    resetBoard();
                  }}
                >
                  {PERSONALITY_BOTS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.elo} · {b.style}
                    </option>
                  ))}
                </select>
                <p className="ui text-xs muted m-0">{bot.tagline}</p>
              </>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className={`btn flex-1 ${playerColor === "w" ? "btn-accent" : "btn-ghost"}`}
                onClick={() => {
                  setPlayerColor("w");
                  resetBoard("w");
                }}
              >
                White
              </button>
              <button
                type="button"
                className={`btn flex-1 ${playerColor === "b" ? "btn-accent" : "btn-ghost"}`}
                onClick={() => {
                  setPlayerColor("b");
                  resetBoard("b");
                }}
              >
                Black
              </button>
            </div>
          </div>
        )}

        <div className="panel p-4 space-y-3">
          {mode !== "coach" ? (
            <label className="flex items-center justify-between gap-3 ui text-sm cursor-pointer">
              <span>
                <strong className="block">Live analysis</strong>
                <span className="muted text-xs">Eval, arrow, labels</span>
              </span>
              <input
                type="checkbox"
                checked={liveAnalysis}
                onChange={(e) => setLiveAnalysis(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
            </label>
          ) : (
            <p className="ui text-xs muted m-0">Live analysis stays on in Coach.</p>
          )}

          <label className="flex items-center justify-between gap-3 ui text-sm cursor-pointer">
            <span>
              <strong className="block">Sounds</strong>
              <span className="muted text-xs">Move sounds</span>
            </span>
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </label>

          {coachOn && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label className="ui text-xs muted m-0" htmlFor="coach-depth">
                  Coach strength
                </label>
                <span className="ui text-xs tabular-nums">
                  Depth {coachDepth}
                  <span className="muted"> · {coachDepthHint(coachDepth)}</span>
                </span>
              </div>
              <input
                id="coach-depth"
                type="range"
                min={COACH_DEPTH_MIN}
                max={COACH_DEPTH_MAX}
                step={1}
                value={coachDepth}
                onChange={(e) => setCoachDepth(clampCoachDepth(Number(e.target.value)))}
                className="w-full accent-[var(--accent)]"
                aria-valuemin={COACH_DEPTH_MIN}
                aria-valuemax={COACH_DEPTH_MAX}
                aria-valuenow={coachDepth}
                aria-label="Coach analysis depth"
              />
              <div className="flex justify-between ui text-[10px] muted tabular-nums">
                <span>{COACH_DEPTH_MIN}</span>
                <span>{COACH_DEPTH_MAX}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {COACH_PRESETS.map((s) => {
                  const isRec = s.depth === recommendedDepth;
                  const selected = coachDepth === s.depth;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn !px-1 !py-1.5 !text-xs relative ${
                        selected ? "btn-accent" : "btn-ghost"
                      }`}
                      onClick={() => setCoachDepth(s.depth)}
                      title={
                        isRec
                          ? `${s.hint} · Recommended for ${tc.label}`
                          : `${s.hint} · depth ${s.depth}`
                      }
                    >
                      {s.label}
                      {isRec && (
                        <span
                          className={`block text-[9px] leading-tight ${
                            selected ? "opacity-90" : "text-[var(--accent)]"
                          }`}
                        >
                          Rec
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="ui text-xs muted m-0">
                {activePreset
                  ? `${activePreset.label} (d${activePreset.depth})`
                  : `Custom (d${coachDepth})`}
                {" · "}
                Recommended for {tc.label}: depth {recommendedDepth}
                {coachDepth !== recommendedDepth && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="link-accent ui text-xs"
                      onClick={() => setCoachDepth(recommendedDepth)}
                    >
                      Use recommended
                    </button>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={takeback}
              disabled={!annotated.length || gameStatus !== "ACTIVE"}
            >
              Takeback
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
            >
              Flip
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => resetBoard()}>
              New game
            </button>
          </div>
          {gameStatus === "ACTIVE" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={resign} disabled={thinking}>
                Resign
              </button>
              <button type="button" className="btn btn-ghost" onClick={agreeDraw} disabled={thinking}>
                Draw
              </button>
              {annotated.length > 0 && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={exportPgn}>
                    Copy PGN
                  </button>
                  <Link href="/analysis" className="btn btn-ghost" onClick={openReview}>
                    Review
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="panel p-4">
          <p className="forum-kicker m-0 mb-2">Moves</p>
          <div className="ui text-sm m-0 leading-relaxed min-h-[3rem] flex flex-wrap gap-x-1 gap-y-1.5 items-center">
            {annotated.length ? (
              annotated.map((mv, i) => (
                <span key={`${mv.san}-${i}`} className="inline-flex items-center gap-0.5">
                  {i % 2 === 0 ? <span className="muted">{Math.floor(i / 2) + 1}. </span> : null}
                  <span
                    className={i === annotated.length - 1 ? "font-semibold" : undefined}
                    style={
                      mv.classification
                        ? { color: CLASS_META[mv.classification].color }
                        : undefined
                    }
                    title={
                      mv.classification
                        ? `${CLASS_META[mv.classification].title}${mv.cpl != null ? ` · ${mv.cpl} cp` : ""}`
                        : undefined
                    }
                  >
                    {mv.san}
                  </span>
                  {mv.judging ? (
                    <span className="muted text-xs">…</span>
                  ) : mv.classification ? (
                    <MoveBadge label={mv.classification} compact />
                  ) : null}{" "}
                </span>
              ))
            ) : (
              <span className="muted">No moves yet.</span>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
