/**
 * Labels for Stockfish-reported centipawn loss only.
 * Thresholds match common SF review UIs (Lichess/Chess.com-style bands).
 * No opening book, no ply heuristics. Purely engine delta.
 */

export type ClassLabel =
  | "Brilliant"
  | "Great"
  | "Best"
  | "Excellent"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Miss"
  | "Blunder";

export const CLASS_META: Record<
  ClassLabel,
  { color: string; symbol: string; title: string }
> = {
  Brilliant: { color: "#1baca6", symbol: "!!", title: "Brilliant" },
  Great: { color: "#5c8a3c", symbol: "!", title: "Great move" },
  Best: { color: "#96bc4b", symbol: "★", title: "Best" },
  Excellent: { color: "#96bc4b", symbol: "✓", title: "Excellent" },
  Good: { color: "#81b64c", symbol: "✓", title: "Good" },
  Inaccuracy: { color: "#f7c631", symbol: "?!", title: "Inaccuracy" },
  Mistake: { color: "#e6912c", symbol: "?", title: "Mistake" },
  Miss: { color: "#e6912c", symbol: "✕", title: "Miss" },
  Blunder: { color: "#ca3431", symbol: "??", title: "Blunder" },
};

export function classifyMove(opts: {
  /** Centipawn loss vs Stockfish eval (mover's perspective) */
  cpl: number;
  /** Played Stockfish's bestmove */
  isBest: boolean;
  bestGap?: number;
  gained?: number;
  missedWin?: boolean;
  isCaptureOrCheck: boolean;
}): ClassLabel {
  const { cpl, isBest, bestGap = 0, gained = 0, missedWin, isCaptureOrCheck } = opts;

  if (missedWin && cpl >= 100) return "Miss";

  if (isBest || cpl <= 5) {
    if (gained >= 150 && (isCaptureOrCheck || bestGap >= 120)) return "Brilliant";
    if (bestGap >= 200) return "Great";
    return "Best";
  }

  if (cpl <= 20) return "Excellent";
  if (cpl <= 40) return "Good";
  if (cpl <= 80) return "Inaccuracy";
  if (cpl <= 150) return "Mistake";
  return "Blunder";
}
