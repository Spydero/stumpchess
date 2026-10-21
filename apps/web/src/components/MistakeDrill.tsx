"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
/** replay = show the bad move first; solve = find a better one */
type Phase = "replay" | "solve";

function normalizeUci(uci: string) {
  return uci.trim().toLowerCase();
}

function playedUciMatchesBest(played: string, best?: string) {
  if (!best) return false;
  const a = normalizeUci(played);
  const b = normalizeUci(best);
  if (a === b) return true;
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

function applySan(fen: string, san: string) {
  try {
    const c = new Chess(fen);
    const m = c.move(san);
    if (!m) return null;
    return { fen: c.fen(), from: m.from as Square, to: m.to as Square };
  } catch {
    return null;
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
  const [phase, setPhase] = useState<Phase>("replay");
  const [fen, setFen] = useState(() => safeFen(drills[0]?.fenBefore));
  const [result, setResult] = useState<Result>("idle");
  const [showBest, setShowBest] = useState(false);
  const [solved, setSolved] = useState(0);
  const [missed, setMissed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const scoredRef = useRef(false);
  const chessRef = useRef(new Chess(safeFen(drills[0]?.fenBefore)));
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [lastTry, setLastTry] = useState<{ from: Square; to: Square } | null>(null);
  const [mistakeSq, setMistakeSq] = useState<{ from: Square; to: Square } | null>(null);

  const drill = drills[idx];
  const done = idx >= drills.length;

  const bestSquares = useMemo(() => {
    if (!drill?.bestMove) return null;
    const m = uciToMove(drill.bestMove);
    if (!m) return null;
    return { from: m.from as Square, to: m.to as Square };
  }, [drill]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setOptionSquares({});
  }, []);

  const beginSolve = useCallback(() => {
    if (!drill) return;
    const f = safeFen(drill.fenBefore);
    chessRef.current = new Chess(f);
    setFen(f);
    setPhase("solve");
    setResult("idle");
    setShowBest(false);
    setMistakeSq(null);
    setLastTry(null);
    setPromo(null);
    clearSelection();
  }, [drill, clearSelection]);

  const loadDrill = useCallback(
    (i: number) => {
      const d = drills[i];
      if (!d) {
        setIdx(i);
        return;
      }
      const before = safeFen(d.fenBefore);
      chessRef.current = new Chess(before);
      scoredRef.current = false;
      setIdx(i);
      setPhase("replay");
      setFen(before);
      setResult("idle");
      setShowBest(false);
      setSelected(null);
      setOptionSquares({});
      setPromo(null);
      setLastTry(null);
      setMistakeSq(null);
      setAttempts(0);
    },
    [drills]
  );

  // Replay phase: show position before, then play the wrong move so you see what happened.
  useEffect(() => {
    if (!drill || phase !== "replay") return;
    const before = safeFen(drill.fenBefore);
    chessRef.current = new Chess(before);
    setFen(before);
    setMistakeSq(null);

    const t0 = window.setTimeout(() => {
      const played = applySan(before, drill.san);
      if (played) {
        chessRef.current = new Chess(played.fen);
        setFen(played.fen);
        setMistakeSq({ from: played.from, to: played.to });
      } else if (drill.from && drill.to) {
        // Fallback: jump to fenAfter with stored squares
        setFen(safeFen(drill.fenAfter));
        setMistakeSq({ from: drill.from, to: drill.to });
      }
    }, 450);

    const t1 = window.setTimeout(() => {
      beginSolve();
    }, 2200);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [drill, phase, idx, beginSolve]);

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
      if (!drill || phase !== "solve" || result === "correct") return false;
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
        chess.undo();
        chessRef.current = new Chess(safeFen(drill.fenBefore));
        setFen(chessRef.current.fen());
        setResult("wrong");
        setAttempts((n) => n + 1);
      }
      return true;
    },
    [drill, phase, result, clearSelection]
  );

  const arrows = useMemo((): Arrow[] => {
    if (phase === "replay" && mistakeSq) {
      const color = CLASS_META[drill?.classification || "Mistake"]?.color || CLASS_META.Mistake.color;
      return [[mistakeSq.from, mistakeSq.to, color]];
    }
    if (showBest && bestSquares) {
      return [[bestSquares.from, bestSquares.to, CLASS_META.Best.color]];
    }
    return [];
  }, [phase, mistakeSq, showBest, bestSquares, drill?.classification]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...optionSquares };
    if (phase === "replay" && mistakeSq) {
      const label = drill?.classification || "Mistake";
      styles[mistakeSq.from] = { background: classificationTint(label, 0.3) };
      styles[mistakeSq.to] = { background: classificationTint(label, 0.5) };
    } else if (result === "correct" && bestSquares) {
      styles[bestSquares.from] = { background: classificationTint("Best", 0.32) };
      styles[bestSquares.to] = { background: classificationTint("Best", 0.52) };
    } else if (result === "wrong" && lastTry) {
      styles[lastTry.from] = { background: classificationTint("Mistake", 0.28) };
      styles[lastTry.to] = { background: classificationTint("Mistake", 0.42) };
    }
    return styles;
  }, [optionSquares, phase, mistakeSq, result, bestSquares, lastTry, drill?.classification]);

  const markerTarget =
    phase === "replay" && mistakeSq
      ? mistakeSq.to
      : result === "correct" && bestSquares
        ? bestSquares.to
        : null;
  const markerLabel =
    phase === "replay" && mistakeSq
      ? drill?.classification || "Mistake"
      : result === "correct"
        ? "Best"
        : null;

  const orientation = drill?.color === "b" ? "black" : "white";
  const canInteract = phase === "solve" && result !== "correct" && !promo;

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
        <ClassificationSquareProvider target={markerTarget} label={markerLabel}>
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            arePiecesDraggable={canInteract}
            onPieceDrop={(from, to) => tryMove(from, to)}
            onSquareClick={(sq) => {
              if (!canInteract) return;
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
            animationDuration={180}
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

          {phase === "replay" ? (
            <p className="ui text-sm m-0">
              In the game you played <strong>{drill.san}</strong>
              {drill.color === "w" ? " (White)" : " (Black)"}. Watching the mistake…
            </p>
          ) : (
            <p className="ui text-sm m-0">
              You played <strong>{drill.san}</strong>. Now find a better move
              {drill.color === "w" ? " (White)" : " (Black)"}.
            </p>
          )}

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
          {phase === "replay" ? (
            <button type="button" className="btn btn-accent" onClick={beginSolve}>
              Fix it
            </button>
          ) : result === "correct" ? (
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
              <button type="button" className="btn btn-ghost" onClick={() => loadDrill(idx)}>
                Replay mistake
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
