export type ClassLabel =
  | "Brilliant"
  | "Great"
  | "Best"
  | "Excellent"
  | "Good"
  | "Book"
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
  Best: { color: "#96bc4b", symbol: "★", title: "Best move" },
  Excellent: { color: "#96bc4b", symbol: "", title: "Excellent" },
  Good: { color: "#96bc4b", symbol: "", title: "Good" },
  Book: { color: "#a88865", symbol: "", title: "Book" },
  Inaccuracy: { color: "#f7c631", symbol: "?!", title: "Inaccuracy" },
  Mistake: { color: "#e6912c", symbol: "?", title: "Mistake" },
  Miss: { color: "#e6912c", symbol: "?", title: "Miss" },
  Blunder: { color: "#ca3431", symbol: "??", title: "Blunder" },
};

export function classifyMove(opts: {
  cpl: number;
  isBest: boolean;
  /** How much better best was vs 2nd best (side to move, before move), cp */
  bestGap?: number;
  /** Eval swing in player's favor after playing best-ish move */
  gained?: number;
  /** Played move loses a winning mate / huge chance */
  missedWin?: boolean;
  ply: number;
  isCaptureOrCheck: boolean;
}): ClassLabel {
  const { cpl, isBest, bestGap = 0, gained = 0, missedWin, ply, isCaptureOrCheck } = opts;

  if (missedWin && cpl >= 80) return "Miss";

  // Opening book-ish: early quiet accuracy
  if (ply <= 12 && cpl <= 20 && !isCaptureOrCheck) return isBest ? "Best" : "Book";

  // Brilliant: best (or near) that gains a lot / only-move tactics feel
  if ((isBest || cpl <= 15) && gained >= 120 && (isCaptureOrCheck || bestGap >= 80)) {
    return "Brilliant";
  }
  if (isBest && bestGap >= 150 && cpl <= 10) return "Great";
  if (isBest) return "Best";
  if (cpl <= 10) return "Excellent";
  if (cpl <= 25) return "Good";
  if (cpl <= 60) return "Inaccuracy";
  if (cpl <= 120) return "Mistake";
  return "Blunder";
}
