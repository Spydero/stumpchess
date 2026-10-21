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

export type LocalAnalysisEntry = {
  hash: string;
  pgn: string;
  depth: number;
  savedAt: string;
  mistakeCount: number;
  label: string;
};

const INDEX_KEY = "stumpchess-analysis-index";
const MISTAKES_PGN_KEY = "stumpchess-mistakes-pgn";

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

export function hashPgn(pgn: string) {
  let h = 0;
  const s = pgn.trim();
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

function pgnKey(pgn: string) {
  return `stumpchess-analysis:${hashPgn(pgn)}`;
}

function headerValue(pgn: string, name: string) {
  const re = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`, "i");
  return re.exec(pgn)?.[1]?.trim() || "";
}

export function labelFromPgn(pgn: string) {
  const white = headerValue(pgn, "White") || "White";
  const black = headerValue(pgn, "Black") || "Black";
  const result = headerValue(pgn, "Result");
  const event = headerValue(pgn, "Event");
  const base = `${white} vs ${black}`;
  const bits = [base];
  if (result && result !== "*") bits.push(result);
  if (event) bits.push(event);
  return bits.join(" · ");
}

function readIndex(): LocalAnalysisEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as LocalAnalysisEntry[];
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e.hash === "string" && typeof e.pgn === "string");
  } catch {
    return [];
  }
}

function writeIndex(list: LocalAnalysisEntry[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list.slice(0, 80)));
  } catch {
    /* quota */
  }
}

/** Local fallback when there is no gameId (pasted PGN). */
export function loadLocalAnalysis(pgn: string): StoredAnalysis | null {
  try {
    return parseStoredAnalysis(localStorage.getItem(pgnKey(pgn)));
  } catch {
    return null;
  }
}

export function loadLocalAnalysisByHash(hash: string): {
  analysis: StoredAnalysis;
  pgn: string;
} | null {
  const entry = readIndex().find((e) => e.hash === hash);
  if (!entry) return null;
  const analysis = loadLocalAnalysis(entry.pgn);
  if (!analysis) return null;
  return { analysis, pgn: entry.pgn };
}

export function saveLocalAnalysis(pgn: string, analysis: StoredAnalysis) {
  const trimmed = pgn.trim();
  if (!trimmed) return;
  const hash = hashPgn(trimmed);
  try {
    localStorage.setItem(`stumpchess-analysis:${hash}`, JSON.stringify(analysis));
  } catch {
    return;
  }
  const entry: LocalAnalysisEntry = {
    hash,
    pgn: trimmed,
    depth: analysis.depth,
    savedAt: analysis.savedAt,
    mistakeCount: filterMistakeMoves(analysis.moves).length,
    label: labelFromPgn(trimmed),
  };
  const prev = readIndex().filter((e) => e.hash !== hash);
  writeIndex([entry, ...prev]);
}

/** Indexed local reviews (pasted PGN / unsaved gameId reviews). */
export function listLocalAnalyses(): LocalAnalysisEntry[] {
  return readIndex().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Hand-off from /analysis → mistake drills for a pasted PGN. */
export function stashMistakesPgn(pgn: string) {
  try {
    sessionStorage.setItem(MISTAKES_PGN_KEY, pgn.trim());
  } catch {
    /* ignore */
  }
}

export function takeStashedMistakesPgn(): string | null {
  try {
    const pgn = sessionStorage.getItem(MISTAKES_PGN_KEY);
    if (pgn) sessionStorage.removeItem(MISTAKES_PGN_KEY);
    return pgn?.trim() || null;
  } catch {
    return null;
  }
}

const MISTAKE_LABELS: ClassLabel[] = ["Inaccuracy", "Mistake", "Miss", "Blunder"];

function playedUci(m: StoredAnalyzedMove) {
  return `${m.from}${m.to}`.toLowerCase();
}

/** Positions worth drilling from a saved review. */
export function filterMistakeMoves(moves: StoredAnalyzedMove[]): StoredAnalyzedMove[] {
  return moves.filter((m) => {
    if (!MISTAKE_LABELS.includes(m.classification)) return false;
    if (!m.fenBefore || !m.bestMove) return false;
    // Skip if engine best is the same move (noise / classification edge cases)
    const best = m.bestMove.toLowerCase();
    const played = playedUci(m);
    if (best === played || best.slice(0, 4) === played) return false;
    return true;
  });
}
