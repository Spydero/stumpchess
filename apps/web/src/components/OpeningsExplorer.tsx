"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import { BookMoveBadge } from "@/components/BookMoveBadge";
import { BookSquare, BookSquareProvider } from "@/components/BookSquareMarker";
import { EvalBar } from "@/components/EvalBar";
import {
  OPENING_ROOTS,
  bookMeta,
  buildPgnFromSans,
  children as bookChildren,
  isBookMove,
  isInBook,
  openingAt,
  type BookChild,
} from "@/lib/openings";
import { needsPromotion } from "@/lib/practice-utils";
import {
  createStockfish,
  formatEval,
  stmScore,
  toWhiteEval,
  uciToMove,
  type EngineInfo,
} from "@/lib/stockfish";

const BOARD_STYLE = { borderRadius: 4, boxShadow: "var(--shadow)" } as const;
const DARK_SQ = { backgroundColor: "var(--board-dark)" } as const;
const LIGHT_SQ = { backgroundColor: "var(--board-light)" } as const;

const LAST_FROM = "rgba(61, 107, 79, 0.28)";
const LAST_TO = "rgba(61, 107, 79, 0.42)";
const SELECT = "rgba(61, 107, 79, 0.55)";
const DEST = "rgba(26, 22, 18, 0.16)";

type HistMove = { san: string; uci: string; fenAfter: string; book: boolean };

type Props = {
  /** Kept for API compat; live analysis is free on this page (client Stockfish). */
  isVip: boolean;
};

function fenAtPly(history: HistMove[], ply: number): string {
  if (ply <= 0) return new Chess().fen();
  return history[ply - 1]?.fenAfter ?? new Chess().fen();
}

export function OpeningsExplorer({ isVip }: Props) {
  const meta = bookMeta();
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(() => chessRef.current.fen());
  const [history, setHistory] = useState<HistMove[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({});
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [analysisOn, setAnalysisOn] = useState(false);
  const [coachInfo, setCoachInfo] = useState<EngineInfo | null>(null);
  const [engineStatus, setEngineStatus] = useState<"idle" | "loading" | "thinking" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const coachEngine = useRef<ReturnType<typeof createStockfish> | null>(null);
  const coachGen = useRef(0);
  const analysisOnRef = useRef(analysisOn);
  const runCoachRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    analysisOnRef.current = analysisOn;
  }, [analysisOn]);

  const uciPath = useMemo(() => history.slice(0, ply).map((m) => m.uci), [history, ply]);
  const sans = useMemo(() => history.slice(0, ply).map((m) => m.san), [history, ply]);
  const opening = useMemo(() => openingAt(uciPath), [uciPath]);
  const nextMoves = useMemo(() => bookChildren(uciPath, fen), [uciPath, fen]);
  const maxCount = nextMoves[0]?.count ?? 1;
  const inBook = useMemo(() => isInBook(uciPath), [uciPath]);
  const lastWasBook = ply > 0 && !!history[ply - 1]?.book;
  const bookTarget = useMemo((): Square | null => {
    if (!lastWasBook || ply <= 0) return null;
    const m = uciToMove(history[ply - 1].uci);
    return m ? (m.to as Square) : null;
  }, [lastWasBook, history, ply]);

  const syncToPly = useCallback((nextHist: HistMove[], nextPly: number) => {
    const f = fenAtPly(nextHist, nextPly);
    chessRef.current = new Chess(f);
    setHistory(nextHist);
    setPly(nextPly);
    setFen(f);
    setSelected(null);
    setOptionSquares({});
    setPromo(null);
  }, []);

  const appendMove = useCallback(
    (san: string, uci: string, fenAfter: string) => {
      const nextPath = [...history.slice(0, ply).map((m) => m.uci), uci];
      const entry: HistMove = {
        san,
        uci,
        fenAfter,
        book: isBookMove(nextPath),
      };
      const nextHist = [...history.slice(0, ply), entry];
      syncToPly(nextHist, nextHist.length);
    },
    [history, ply, syncToPly]
  );

  const playUci = useCallback(
    (uci: string) => {
      const base = fenAtPly(history, ply);
      const chess = new Chess(base);
      const m = uciToMove(uci);
      if (!m) return false;
      let move;
      try {
        move = chess.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
      } catch {
        return false;
      }
      if (!move) return false;
      appendMove(move.san, move.from + move.to + (move.promotion || ""), chess.fen());
      return true;
    },
    [history, ply, appendMove]
  );

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const base = fenAtPly(history, ply);
      const chess = new Chess(base);
      if (needsPromotion(chess, from, to) && !promotion) {
        setPromo({ from, to });
        setSelected(null);
        setOptionSquares({});
        return false;
      }
      let move;
      try {
        move = chess.move({ from, to, promotion: promotion || "q" });
      } catch {
        return false;
      }
      if (!move) return false;
      appendMove(move.san, move.from + move.to + (move.promotion || ""), chess.fen());
      return true;
    },
    [history, ply, appendMove]
  );

  const onPieceDrop = useCallback(
    (from: string, to: string) => tryMove(from as Square, to as Square),
    [tryMove]
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (promo) return;
      const chess = chessRef.current;
      if (selected) {
        if (selected === square) {
          setSelected(null);
          setOptionSquares({});
          return;
        }
        if (tryMove(selected, square)) return;
      }
      const piece = chess.get(square);
      if (!piece || piece.color !== chess.turn()) {
        setSelected(null);
        setOptionSquares({});
        return;
      }
      setSelected(square);
      const dests = chess.moves({ square, verbose: true });
      const styles: Record<string, CSSProperties> = {
        [square]: { background: SELECT },
      };
      for (const d of dests) {
        styles[d.to] = {
          background: `radial-gradient(circle, ${DEST} 22%, transparent 24%)`,
        };
      }
      setOptionSquares(styles);
    },
    [promo, selected, tryMove]
  );

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = { ...optionSquares };
    if (ply > 0) {
      const last = history[ply - 1];
      const m = uciToMove(last.uci);
      if (m) {
        styles[m.from] = { ...(styles[m.from] || {}), background: LAST_FROM };
        styles[m.to] = { ...(styles[m.to] || {}), background: LAST_TO };
      }
    }
    return styles;
  }, [optionSquares, history, ply]);

  const ensureCoach = useCallback(async () => {
    if (!coachEngine.current) {
      coachEngine.current = createStockfish({ forceSingle: true });
    }
    await coachEngine.current.configureCoach({ multipv: 3, hash: 32 });
    return coachEngine.current;
  }, []);

  const runCoach = useCallback(async () => {
    if (!analysisOnRef.current) {
      setCoachInfo(null);
      setEngineStatus("idle");
      return;
    }

    const fenNow = chessRef.current.fen();
    const gen = ++coachGen.current;
    setEngineStatus((s) => (s === "error" ? "loading" : s === "idle" ? "loading" : "thinking"));

    try {
      const engine = await ensureCoach();
      if (gen !== coachGen.current || !analysisOnRef.current) return;
      setEngineStatus("thinking");

      let lastArrowSig = "";
      let lastUiDepth = -1;
      const info = await engine.analyze(fenNow, {
        depth: 16,
        onUpdate: (partial) => {
          if (gen !== coachGen.current || !analysisOnRef.current) return;
          if (!partial.bestMove && !partial.pvs?.length) return;
          const arrowSig = (partial.pvs || [])
            .slice(0, 3)
            .map((p) => p.uci)
            .join(",");
          const d = partial.depth || 0;
          const arrowsChanged = arrowSig !== lastArrowSig;
          const depthMilestone = d === 16 || (d > 0 && d % 3 === 0 && d !== lastUiDepth);
          if (!arrowsChanged && !depthMilestone) return;
          lastArrowSig = arrowSig;
          lastUiDepth = d;
          startTransition(() => setCoachInfo(partial));
        },
      });

      if (gen !== coachGen.current || !analysisOnRef.current) return;
      startTransition(() => setCoachInfo(info));
      setEngineStatus(info.bestMove || info.pvs?.length ? "idle" : "thinking");
    } catch (err) {
      console.error("Openings analysis failed", err);
      if (gen === coachGen.current) setEngineStatus("error");
    }
  }, [ensureCoach]);

  useEffect(() => {
    runCoachRef.current = runCoach;
  }, [runCoach]);

  // Debounced coach (Practice pattern). Do not stop() on cleanup — that races search epochs.
  useEffect(() => {
    if (!analysisOn) {
      coachGen.current++;
      coachEngine.current?.stop();
      setCoachInfo(null);
      setEngineStatus("idle");
      return;
    }
    const t = setTimeout(() => void runCoachRef.current?.(), 80);
    return () => clearTimeout(t);
  }, [analysisOn, fen]);

  useEffect(() => {
    return () => {
      coachGen.current++;
      coachEngine.current?.dispose();
      coachEngine.current = null;
    };
  }, []);

  const coachArrows = useMemo((): Arrow[] => {
    if (!analysisOn || !coachInfo) return [];
    const lines = (
      coachInfo.pvs?.length
        ? coachInfo.pvs
        : coachInfo.bestMove
          ? [{ rank: 1, uci: coachInfo.bestMove, scoreCp: coachInfo.scoreCp, mate: coachInfo.mate }]
          : []
    ).filter((p) => p.uci);
    if (!lines.length) return [];
    const bestScore = stmScore(lines[0].scoreCp, lines[0].mate);
    const colors = ["rgb(111, 168, 135)", "rgb(120, 168, 196)", "rgb(196, 168, 104)"];
    const out: Arrow[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];
      const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
      if (i > 0 && gap > 25) continue;
      const m = uciToMove(line.uci);
      if (!m) continue;
      const key = `${m.from}${m.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([m.from as Square, m.to as Square, colors[i]]);
    }
    return out;
  }, [analysisOn, coachInfo]);

  const whiteCp = coachInfo
    ? toWhiteEval(chessRef.current.turn(), coachInfo.scoreCp, coachInfo.mate)
    : 0;

  const movePairs = useMemo(() => {
    const pairs: { n: number; w?: HistMove; b?: HistMove; wIdx: number; bIdx: number }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        n: Math.floor(i / 2) + 1,
        w: history[i],
        b: history[i + 1],
        wIdx: i + 1,
        bIdx: i + 2,
      });
    }
    return pairs;
  }, [history]);

  function copyPgn() {
    const pgn = buildPgnFromSans(sans);
    void navigator.clipboard.writeText(pgn).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function openAnalysis() {
    const pgn = buildPgnFromSans(sans);
    try {
      sessionStorage.setItem("stumpchess-analyze-pgn", pgn);
    } catch {
      /* ignore */
    }
    window.location.href = "/analysis";
  }

  function jumpRoot(uci: string) {
    const chess = new Chess();
    const m = uciToMove(uci);
    if (!m) return;
    const move = chess.move({ from: m.from, to: m.to });
    if (!move) return;
    const fullUci = move.from + move.to;
    syncToPly(
      [
        {
          san: move.san,
          uci: fullUci,
          fenAfter: chess.fen(),
          book: isBookMove([fullUci]),
        },
      ],
      1
    );
  }

  return (
    <div className="openings-layout rise-in">
      <div className="openings-board-col">
        <div className="flex gap-2 sm:gap-3 items-stretch">
          {analysisOn && <EvalBar whiteCp={coachInfo ? whiteCp : 0} />}
          <div className="flex-1 min-w-0 max-w-[min(100%,560px)] relative">
            <BookSquareProvider target={bookTarget}>
              <Chessboard
                position={fen}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardOrientation={orientation}
                animationDuration={120}
                arePiecesDraggable={!promo}
                customSquareStyles={squareStyles}
                customSquare={BookSquare}
                customArrows={coachArrows}
                customBoardStyle={BOARD_STYLE}
                customDarkSquareStyle={DARK_SQ}
                customLightSquareStyle={LIGHT_SQ}
              />
            </BookSquareProvider>
            {lastWasBook && (
              <div className="openings-book-float">
                <BookMoveBadge large />
              </div>
            )}
          </div>
        </div>
        {lastWasBook && history[ply - 1] && (
          <div className="openings-book-callout ui text-sm mt-2">
            <BookMoveBadge large />
            <span>
              <strong>{history[ply - 1].san}</strong> is a book move
              {opening ? ` · ${opening.eco} ${opening.name}` : ""}
            </span>
          </div>
        )}

        {promo && (
          <div className="mt-3 panel p-3 flex flex-wrap items-center gap-2 ui text-sm">
            <span className="muted">Promote to</span>
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-ghost !py-1 !px-3"
                onClick={() => {
                  tryMove(promo.from, promo.to, p);
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
            <button type="button" className="btn btn-ghost !py-1 !px-3" onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 ui">
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-sm"
            onClick={() => syncToPly([], 0)}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-sm"
            disabled={ply <= 0}
            onClick={() => syncToPly(history, ply - 1)}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-sm"
            disabled={ply >= history.length}
            onClick={() => syncToPly(history, ply + 1)}
          >
            Forward
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-sm"
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
          >
            Flip
          </button>
          <button type="button" className="btn btn-ghost !py-1.5 !px-3 !text-sm" onClick={copyPgn}>
            {copied ? "Copied" : "Copy PGN"}
          </button>
          {isVip && (
            <button type="button" className="btn btn-ghost !py-1.5 !px-3 !text-sm" onClick={openAnalysis}>
              Deep analysis
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {OPENING_ROOTS.map((r) => (
            <button key={r.uci} type="button" className="chip-btn" onClick={() => jumpRoot(r.uci)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <aside className="openings-side panel">
        <div className="openings-side-head">
          <div className="min-w-0">
            <p className="forum-kicker mb-1">Opening</p>
            <div className="flex flex-wrap items-center gap-2">
              {opening ? (
                <p className="ui text-xs font-bold tracking-wide text-[var(--accent)] m-0">
                  {opening.eco}
                </p>
              ) : null}
              {lastWasBook ? <BookMoveBadge large /> : inBook ? <BookMoveBadge /> : (
                <span className="badge" style={{ color: "var(--muted)" }}>
                  Off book
                </span>
              )}
            </div>
            {opening ? (
              <h2 className="text-xl m-0 mt-0.5 leading-snug">{opening.name}</h2>
            ) : (
              <h2 className="text-xl m-0 mt-0.5">{inBook ? "Starting position" : "Off book"}</h2>
            )}
            {analysisOn && (
              <p className="ui text-sm muted mt-1 mb-0">
                {engineStatus === "loading" && <span className="pulse-soft">Loading engine…</span>}
                {engineStatus === "thinking" && !coachInfo && (
                  <span className="pulse-soft">Analyzing…</span>
                )}
                {engineStatus === "error" && (
                  <span className="text-[var(--danger)]">Engine failed. Toggle Analysis off/on.</span>
                )}
                {coachInfo && (
                  <>
                    Engine {formatEval(whiteCp)}
                    {coachInfo.depth ? ` · d${coachInfo.depth}` : ""}
                    {engineStatus === "thinking" ? " · …" : ""}
                  </>
                )}
              </p>
            )}
          </div>
          <label className="analysis-toggle ui text-sm">
            <input
              type="checkbox"
              checked={analysisOn}
              onChange={(e) => setAnalysisOn(e.target.checked)}
            />
            <span>Analysis</span>
          </label>
        </div>

        {lastWasBook && history[ply - 1] && (
          <div className="openings-book-banner ui text-sm">
            <BookMoveBadge />
            <span>
              <strong>{history[ply - 1].san}</strong> is a book move
              {opening ? ` · ${opening.eco}` : ""}
            </span>
          </div>
        )}

        <div className="openings-moves">
          {movePairs.length === 0 ? (
            <p className="ui text-sm muted px-4 py-3 m-0">Play a move or pick a first move above.</p>
          ) : (
            <ol className="openings-movelist ui text-sm">
              {movePairs.map((pair) => (
                <li key={pair.n}>
                  <span className="openings-num">{pair.n}.</span>
                  {pair.w && (
                    <button
                      type="button"
                      className={`openings-san ${ply === pair.wIdx ? "active" : ""}`}
                      onClick={() => syncToPly(history, pair.wIdx)}
                    >
                      {pair.w.san}
                      {pair.w.book && <BookMoveBadge compact />}
                    </button>
                  )}
                  {pair.b && (
                    <button
                      type="button"
                      className={`openings-san ${ply === pair.bIdx ? "active" : ""}`}
                      onClick={() => syncToPly(history, pair.bIdx)}
                    >
                      {pair.b.san}
                      {pair.b.book && <BookMoveBadge compact />}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="openings-next">
          <div className="px-4 py-2 border-b border-[var(--line)] flex items-center justify-between">
            <h3 className="text-sm m-0 ui font-semibold tracking-wide uppercase text-[var(--muted)]">
              Next moves
            </h3>
            <span className="ui text-[11px] muted">{meta.lines.toLocaleString()} book lines</span>
          </div>
          {nextMoves.length === 0 ? (
            <p className="ui text-sm muted px-4 py-4 m-0">
              Off book. Keep exploring freehand, or go back into known lines.
            </p>
          ) : (
            <ul className="openings-book-list">
              {nextMoves.map((row) => (
                <BookRow
                  key={row.uci}
                  row={row}
                  maxCount={maxCount}
                  onPick={() => playUci(row.uci)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function BookRow({
  row,
  maxCount,
  onPick,
}: {
  row: BookChild;
  maxCount: number;
  onPick: () => void;
}) {
  const pct = Math.max(6, Math.round((row.count / maxCount) * 100));
  return (
    <li>
      <button type="button" className="openings-book-row" onClick={onPick}>
        <span className="openings-book-san">
          {row.san}
          <BookMoveBadge compact />
        </span>
        <span className="openings-book-bar-wrap" aria-hidden>
          <span className="openings-book-bar" style={{ width: `${pct}%` }} />
        </span>
        <span className="openings-book-count tabular-nums">{row.count}</span>
        {row.name && (
          <span className="openings-book-name muted" title={row.name}>
            {row.eco ? `${row.eco} ` : ""}
            {row.name}
          </span>
        )}
      </button>
    </li>
  );
}
