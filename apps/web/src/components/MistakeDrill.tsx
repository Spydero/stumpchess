"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import { MoveBadge } from "@/components/MoveBadge";
import {
  ClassificationSquare,
  ClassificationSquareProvider,
  classificationTint,
} from "@/components/ClassificationMarker";
import { CLASS_META } from "@/lib/classify";
import type { StoredAnalyzedMove } from "@/lib/analysis-cache";
import { uciToMove } from "@/lib/stockfish";
import { needsPromotion } from "@/lib/practice-utils";

const BOARD_STYLE = { borderRadius: 4, boxShadow: "var(--shadow)" } as const;
const DARK_SQ = { backgroundColor: "var(--board-dark)" } as const;
const LIGHT_SQ = { backgroundColor: "var(--board-light)" } as const;

type Result = "idle" | "correct" | "wrong";

function normalizeUci(uci: string) {
  return uci.trim().toLowerCase();
}

function playedUciMatchesBest(played: string, best?: string) {
  if (!best) return false;
  const a = normalizeUci(played);
  const b = normalizeUci(best);
  if (a === b) return true;
  // Allow queen-default promo match when engine omitted promo or user picked q
  if (a.length === 5 && b.length === 4 && a.slice(0, 4) === b) return a[4] === "q";
  if (a.length === 4 && b.length === 5 && a === b.slice(0, 4) && b[4] === "q") return true;
  return false;
}

function safeFen(fen: string | undefined) {
  if (!fen) return new Chess().fen();
  try {
    const c = new Chess(fen);
    return c.fen();
  } catch {
    return new Chess().fen();
  }
}

export function MistakeDrill({
  drills,
  onDone,
}: {
  drills: StoredAnalyzedMove[];
  onDone?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [fen, setFen] = useState(() => safeFen(drills[0]?.fenBefore));
  const [result, setResult] = useState<Result>("idle");
  const [showBest, setShowBest] = useState(false);
  const [solved, setSolved] = useState(0);
  const [missed, setMissed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  /** Once true, this drill already counted as solved or missed. */
  const scoredRef = useRef(false);
  const chessRef = useRef(new Chess(safeFen(drills[0]?.fenBefore)));
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [lastTry, setLastTry] = useState<{ from: Square; to: Square } | null>(null);

  const drill = drills[idx];
  const done = idx >= drills.length;

  const bestSquares = useMemo(() => {
    if (!drill?.bestMove) return null;
    const m = uciToMove(drill.bestMove);
    if (!m) return null;
    return { from: m.from as Square, to: m.to as Square };
  }, [drill]);

  const loadDrill = useCallback(
    (i: number) => {
      const d = drills[i];
      if (!d) {
        setIdx(i);
        return;
      }
      const f = safeFen(d.fenBefore);
      chessRef.current = new Chess(f);
      scoredRef.current = false;
      setFen(f);
      setResult("idle");
      setShowBest(false);
      setSelected(null);
      setOptionSquares({});
      setPromo(null);
      setLastTry(null);
      setAttempts(0);
      setIdx(i);
    },
    [drills]
  );

  const clearSelection = useCallback(() => {
    setSelected(null);
    setOptionSquares({});
  }, []);

  const showLegal = useCallback((square: Square) => {
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

  const markMissedOnce = useCallback(() => {
    if (scoredRef.current) return;
    scoredRef.current = true;
    setMissed((n) => n + 1);
  }, []);

  const tryMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (!drill || result === "correct") return false;
      const chess = new Chess(safeFen(drill.fenBefore));
      chessRef.current = chess;

      if (needsPromotion(chess, from, to) && !promotion) {
        setPromo({ from: from as Square, to: to as Square });
        clearSelection();
        return false;
      }

      let move;
      try {
        move = chess.move({ from, to, promotion: promotion || "q" });
      } catch {
        return false;
      }
      if (!move) return false;

      const played = `${move.from}${move.to}${move.promotion || ""}`;
      const ok = playedUciMatchesBest(played, drill.bestMove);
      setLastTry({ from: move.from as Square, to: move.to as Square });
      clearSelection();
      setPromo(null);

      if (ok) {
        setFen(chess.fen());
        setResult("correct");
        setShowBest(true);
        if (!scoredRef.current) {
          scoredRef.current = true;
          setSolved((n) => n + 1);
        }
      } else {
        // Snap back to the puzzle position
        chess.undo();
        chessRef.current = new Chess(safeFen(drill.fenBefore));
        setFen(chessRef.current.fen());
        setResult("wrong");
        setAttempts((n) => n + 1);
      }
      return true;
    },
    [drill, result, clearSelection]
  );

  const arrows = useMemo((): Arrow[] => {
    if (!showBest || !bestSquares) return [];
    return [[bestSquares.from, bestSquares.to, CLASS_META.Best.color]];
  }, [showBest, bestSquares]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...optionSquares };
    if (result === "correct" && bestSquares) {
      styles[bestSquares.from] = { background: classificationTint("Best", 0.32) };
      styles[bestSquares.to] = { background: classificationTint("Best", 0.52) };
    } else if (result === "wrong" && lastTry) {
      styles[lastTry.from] = { background: classificationTint("Mistake", 0.28) };
      styles[lastTry.to] = { background: classificationTint("Mistake", 0.42) };
    }
    return styles;
  }, [optionSquares, result, bestSquares, lastTry]);

  const markerTarget = result === "correct" && bestSquares ? bestSquares.to : null;
  const orientation = drill?.color === "b" ? "black" : "white";

  if (done) {
    return (
      <div className="panel forum-empty rise-in">
        <h3>Drill complete</h3>
        <p className="muted ui text-sm mb-4">
          Solved {solved} · missed {missed} · {drills.length} positions
        </p>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => {
            setSolved(0);
            setMissed(0);
            loadDrill(0);
            onDone?.();
          }}
        >
          Restart
        </button>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="panel forum-empty">
        <h3>No mistakes to practice</h3>
        <p className="muted ui text-sm m-0">Analyze a game first, then come back.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(240px,300px)] rise-in">
      <div>
        <ClassificationSquareProvider target={markerTarget} label={markerTarget ? "Best" : null}>
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            arePiecesDraggable={result !== "correct" && !promo}
            onPieceDrop={(from, to) => tryMove(from, to)}
            onSquareClick={(sq) => {
              if (result === "correct" || promo) return;
              if (selected) {
                if (selected === sq) {
                  clearSelection();
                  return;
                }
                if (tryMove(selected, sq)) return;
              }
              const piece = chessRef.current.get(sq);
              if (!piece || piece.color !== drill.color) {
                clearSelection();
                return;
              }
              setSelected(sq);
              showLegal(sq);
            }}
            customArrows={arrows}
            customSquareStyles={squareStyles}
            customSquare={ClassificationSquare}
            customBoardStyle={BOARD_STYLE}
            customDarkSquareStyle={DARK_SQ}
            customLightSquareStyle={LIGHT_SQ}
            animationDuration={120}
          />
        </ClassificationSquareProvider>

        {promo && (
          <div className="mt-2 panel p-3 flex flex-wrap items-center gap-2 ui text-sm">
            <span className="muted">Promote to</span>
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-ghost !py-1 !px-3"
                onClick={() => tryMove(promo.from, promo.to, p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
            <button type="button" className="btn btn-ghost !py-1 !px-3" onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="panel p-4 space-y-2">
          <p className="forum-kicker m-0">
            Drill {idx + 1} / {drills.length}
          </p>
          <div className="flex items-center gap-2">
            <MoveBadge label={drill.classification} />
            <span className="ui text-sm muted">{drill.cpl} cp loss in the game</span>
          </div>
          <p className="ui text-sm m-0">
            In the game you played <strong>{drill.san}</strong>. Find a better move
            {drill.color === "w" ? " (White)" : " (Black)"}.
          </p>
          {result === "correct" && (
            <p className="ui text-sm m-0" style={{ color: CLASS_META.Best.color }}>
              Correct{drill.bestSan ? `: ${drill.bestSan}` : "."}
            </p>
          )}
          {result === "wrong" && !showBest && (
            <p className="ui text-sm m-0" style={{ color: CLASS_META.Mistake.color }}>
              Not that one. Try again{attempts > 1 ? ` (${attempts} tries)` : ""}.
            </p>
          )}
        </div>

        <div className="panel p-4 flex flex-wrap gap-2">
          {result === "correct" ? (
            <button type="button" className="btn btn-accent" onClick={() => loadDrill(idx + 1)}>
              {idx + 1 >= drills.length ? "Finish" : "Next"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowBest(true);
                  setResult("wrong");
                  markMissedOnce();
                  // Reset board to puzzle fen so the arrow is clear
                  chessRef.current = new Chess(safeFen(drill.fenBefore));
                  setFen(chessRef.current.fen());
                  setLastTry(null);
                  clearSelection();
                }}
              >
                Reveal
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  markMissedOnce();
                  loadDrill(idx + 1);
                }}
              >
                Skip
              </button>
            </>
          )}
          {showBest && drill.bestSan && (
            <p className="ui text-sm m-0 w-full">
              Best: <strong className="text-[var(--accent)]">{drill.bestSan}</strong>
            </p>
          )}
        </div>

        <div className="panel p-4 ui text-xs muted">
          Solved {solved} · missed {missed}
          {attempts > 0 && result !== "correct" ? ` · tries ${attempts}` : ""}
        </div>
      </aside>
    </div>
  );
}
