import type { ClassLabel } from "@/lib/classify";
import type { Square } from "chess.js";

export type StoredAnalyzedMove = {
  san: string;
  fenBefore: string;
  fenAfter: string;
  from: Square;
  to: Square;
  classification: ClassLabel;
  bestMove?: string;
  bestSan?: string;
  cpl: number;
  evalAfter: number;
  evalBefore: number;
  color: "w" | "b";
  ply: number;
};

export type StoredAnalysis = {
  version: 1;
  engine: string;
  depth: number;
  moves: StoredAnalyzedMove[];
  savedAt: string;
};

export function serializeAnalysis(
  moves: StoredAnalyzedMove[],
  depth: number
): StoredAnalysis {
  return {
    version: 1,
    engine: "stockfish-19-lite",
    depth,
    moves,
    savedAt: new Date().toISOString(),
  };
}

export function parseStoredAnalysis(raw: string | null | undefined): StoredAnalysis | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as StoredAnalysis;
    if (data?.version !== 1 || !Array.isArray(data.moves) || !data.moves.length) return null;
    return data;
  } catch {
    return null;
  }
}

function pgnKey(pgn: string) {
  let h = 0;
  const s = pgn.trim();
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `stumpchess-analysis:${h}`;
}

/** Local fallback when there is no gameId (pasted PGN). */
export function loadLocalAnalysis(pgn: string): StoredAnalysis | null {
  try {
    return parseStoredAnalysis(localStorage.getItem(pgnKey(pgn)));
  } catch {
    return null;
  }
}

export function saveLocalAnalysis(pgn: string, analysis: StoredAnalysis) {
  try {
    localStorage.setItem(pgnKey(pgn), JSON.stringify(analysis));
  } catch {
    /* quota / private mode */
  }
}

const MISTAKE_LABELS: ClassLabel[] = ["Inaccuracy", "Mistake", "Miss", "Blunder"];

/** Positions worth drilling from a saved review. */
export function filterMistakeMoves(moves: StoredAnalyzedMove[]): StoredAnalyzedMove[] {
  return moves.filter(
    (m) => MISTAKE_LABELS.includes(m.classification) && Boolean(m.bestMove || m.fenBefore)
  );
}
