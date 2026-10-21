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

const BOARD_STYLE = { borderRadius: 4, boxShadow: "var(--shadow)" } as const;
const DARK_SQ = { backgroundColor: "var(--board-dark)" } as const;
const LIGHT_SQ = { backgroundColor: "var(--board-light)" } as const;

type Result = "idle" | "correct" | "wrong";

export function MistakeDrill({
  drills,
  onDone,
}: {
  drills: StoredAnalyzedMove[];
  onDone?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [fen, setFen] = useState(() => drills[0]?.fenBefore || new Chess().fen());
  const [result, setResult] = useState<Result>("idle");
  const [showBest, setShowBest] = useState(false);
  const [solved, setSolved] = useState(0);
  const [failed, setFailed] = useState(0);
  const chessRef = useRef(new Chess(drills[0]?.fenBefore));
  const [selected, setSelected] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});

  const drill = drills[idx];
  const done = idx >= drills.length;

  const loadDrill = useCallback(
    (i: number) => {
      const d = drills[i];
      if (!d) return;
      chessRef.current = new Chess(d.fenBefore);
      setFen(d.fenBefore);
      setResult("idle");
      setShowBest(false);
      setSelected(null);
      setOptionSquares({});
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

  const tryMove = useCallback(
    (from: string, to: string) => {
      if (!drill || result === "correct") return false;
      const chess = chessRef.current;
      try {
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        const played = `${move.from}${move.to}${move.promotion || ""}`;
        const best = drill.bestMove || "";
        const ok = played === best || (best.length >= 4 && played.slice(0, 4) === best.slice(0, 4));
        setFen(chess.fen());
        clearSelection();
        if (ok) {
          setResult("correct");
          setSolved((n) => n + 1);
        } else {
          setResult("wrong");
          setFailed((n) => n + 1);
          // undo so they can retry
          chess.undo();
          setFen(chess.fen());
        }
        return true;
      } catch {
        return false;
      }
    },
    [drill, result, clearSelection]
  );

  const arrows = useMemo((): Arrow[] => {
    if (!showBest || !drill?.bestMove) return [];
    const m = uciToMove(drill.bestMove);
    if (!m) return [];
    return [[m.from as Square, m.to as Square, CLASS_META.Best.color]];
  }, [showBest, drill]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...optionSquares };
    if (result === "correct" && drill) {
      styles[drill.from] = { background: classificationTint(drill.classification, 0.28) };
      styles[drill.to] = { background: classificationTint("Best", 0.45) };
    }
    return styles;
  }, [optionSquares, result, drill]);

  const orientation = drill?.color === "b" ? "black" : "white";

  if (done) {
    return (
      <div className="panel forum-empty rise-in">
        <h3>Drill complete</h3>
        <p className="muted ui text-sm mb-4">
          Solved {solved} · missed {failed} · {drills.length} positions
        </p>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => {
            setSolved(0);
            setFailed(0);
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
    <div className="grid gap-5 lg:grid-cols-[1fr_300px] rise-in">
      <div>
        <ClassificationSquareProvider
          target={result === "correct" ? drill.to : null}
          label={result === "correct" ? "Best" : null}
        >
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            arePiecesDraggable={result !== "correct"}
            onPieceDrop={(from, to) => tryMove(from, to)}
            onSquareClick={(sq) => {
              if (result === "correct") return;
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
            You played <strong>{drill.san}</strong>. Find a better move
            {drill.color === "w" ? " (White)" : " (Black)"}.
          </p>
          {result === "correct" && (
            <p className="ui text-sm m-0" style={{ color: CLASS_META.Best.color }}>
              Correct{drill.bestSan ? `: ${drill.bestSan}` : "."}
            </p>
          )}
          {result === "wrong" && (
            <p className="ui text-sm m-0" style={{ color: CLASS_META.Mistake.color }}>
              Wrong. Try again or reveal.
            </p>
          )}
        </div>

        <div className="panel p-4 flex flex-wrap gap-2">
          {result === "correct" ? (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => loadDrill(idx + 1)}
            >
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
                }}
              >
                Show best
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => loadDrill(idx + 1)}
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
          Solved {solved} · missed {failed}
        </div>
      </aside>
    </div>
  );
}
