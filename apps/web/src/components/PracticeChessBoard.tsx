"use client";

import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import type { Square } from "chess.js";
import {
  ClassificationSquare,
  ClassificationSquareProvider,
  classificationTint,
} from "@/components/ClassificationMarker";
import type { ClassLabel } from "@/lib/classify";

const BOARD_STYLE = { borderRadius: 4, boxShadow: "var(--shadow)" } as const;
const DARK_SQ = { backgroundColor: "var(--board-dark)" } as const;
const LIGHT_SQ = { backgroundColor: "var(--board-light)" } as const;

export type PracticeBoardMarker = {
  from: Square;
  to: Square;
  classification: ClassLabel;
} | null;

type Premove = { from: string; to: string } | null;

type Props = {
  fen: string;
  orientation: "white" | "black";
  draggable: boolean;
  optionSquares: Record<string, CSSProperties>;
  marker: PracticeBoardMarker;
  bestArrow: Arrow | null;
  premove?: Premove;
  overlay?: ReactNode;
  onPieceDrop: (from: string, to: string) => boolean;
  onSquareClick: (square: Square) => void;
};

/**
 * Isolated chessboard. Only re-renders when board-relevant props change.
 * Uses a STABLE customSquare component (never recreated) so 64 squares aren't remounted.
 */
export const PracticeChessBoard = memo(function PracticeChessBoard({
  fen,
  orientation,
  draggable,
  optionSquares,
  marker,
  bestArrow,
  premove = null,
  overlay = null,
  onPieceDrop,
  onSquareClick,
}: Props) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = { ...optionSquares };
    if (marker) {
      styles[marker.from] = {
        ...(styles[marker.from] || {}),
        background: classificationTint(marker.classification, 0.32),
      };
      styles[marker.to] = {
        ...(styles[marker.to] || {}),
        background: classificationTint(marker.classification, 0.52),
      };
    }
    if (premove) {
      styles[premove.from] = {
        ...(styles[premove.from] || {}),
        background: "rgba(255, 170, 0, 0.35)",
      };
      styles[premove.to] = {
        ...(styles[premove.to] || {}),
        background: "rgba(255, 170, 0, 0.5)",
      };
    }
    return styles;
  }, [optionSquares, marker, premove]);

  const arrows = useMemo((): Arrow[] => (bestArrow ? [bestArrow] : []), [bestArrow]);

  return (
    <div className="relative">
      <ClassificationSquareProvider target={marker?.to} label={marker?.classification}>
        <Chessboard
          position={fen}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          boardOrientation={orientation}
          animationDuration={120}
          arePiecesDraggable={draggable}
          customSquareStyles={squareStyles}
          customSquare={ClassificationSquare}
          customArrows={arrows}
          customBoardStyle={BOARD_STYLE}
          customDarkSquareStyle={DARK_SQ}
          customLightSquareStyle={LIGHT_SQ}
        />
      </ClassificationSquareProvider>
      {overlay}
    </div>
  );
});
