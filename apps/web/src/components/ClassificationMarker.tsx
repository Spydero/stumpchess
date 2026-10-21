"use client";

import { forwardRef, useMemo, type CSSProperties } from "react";
import type { CustomSquareProps, Square } from "react-chessboard/dist/chessboard/types";
import { CLASS_META, type ClassLabel } from "@/lib/classify";

/** Glyph shown in the on-board circle (Chess.com-style). */
export const BOARD_GLYPH: Record<ClassLabel, string> = {
  Brilliant: "!!",
  Great: "!",
  Best: "★",
  Excellent: "✓",
  Good: "✓",
  Book: "≡",
  Inaccuracy: "?!",
  Mistake: "?",
  Miss: "✕",
  Blunder: "??",
};

export function classificationTint(label: ClassLabel, alpha = 0.45): string {
  const { color } = CLASS_META[label];
  // color is #rrggbb
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Builds a customSquare renderer that draws a classification badge
 * on the move's destination square.
 */
export function makeClassificationSquare(
  target: Square | null | undefined,
  label: ClassLabel | null | undefined
) {
  const Comp = forwardRef<HTMLDivElement, CustomSquareProps>(function ClassificationSquare(
    { children, square, style },
    ref
  ) {
    const show = Boolean(target && label && square === target);
    const meta = label ? CLASS_META[label] : null;
    const glyph = label ? BOARD_GLYPH[label] : "";

    return (
      <div ref={ref} style={{ ...style, position: "relative" }}>
        {children}
        {show && meta ? (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center rounded-full font-bold text-white shadow-md"
            style={
              {
                top: "2%",
                right: "2%",
                width: "38%",
                height: "38%",
                minWidth: 14,
                minHeight: 14,
                background: meta.color,
                fontSize: glyph.length > 1 ? "0.55em" : "0.7em",
                lineHeight: 1,
                border: "2px solid rgba(255,255,255,0.92)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
              } as CSSProperties
            }
            title={meta.title}
            aria-label={meta.title}
          >
            {glyph}
          </div>
        ) : null}
      </div>
    );
  });
  Comp.displayName = "ClassificationSquare";
  return Comp;
}

/** Memo-friendly hook wrapper used by the analysis board. */
export function useClassificationSquare(
  target: Square | null | undefined,
  label: ClassLabel | null | undefined
) {
  return useMemo(() => makeClassificationSquare(target, label), [target, label]);
}
