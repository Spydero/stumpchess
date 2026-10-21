import { Chess } from "chess.js";
import book from "@/data/openings-book.json";

export type OpeningInfo = {
  eco: string;
  name: string;
};

export type BookChild = {
  uci: string;
  san: string;
  /** Book lines that continue through this move */
  count: number;
  eco?: string;
  name?: string;
};

type BookNode = {
  n: number;
  eco?: string;
  name?: string;
  c?: Record<string, BookNode>;
};

type BookRoot = {
  v: number;
  source: string;
  license: string;
  lines: number;
  root: BookNode;
};

const BOOK = book as BookRoot;

export function bookMeta() {
  return {
    source: BOOK.source,
    license: BOOK.license,
    lines: BOOK.lines,
  };
}

function nodeAt(uciPath: string[]): BookNode | null {
  let node: BookNode = BOOK.root;
  for (const u of uciPath) {
    const next = node.c?.[u];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Deepest named opening along the path (walks up if leaf has no name). */
export function openingAt(uciPath: string[]): OpeningInfo | null {
  let node: BookNode = BOOK.root;
  let best: OpeningInfo | null = null;
  if (node.eco && node.name) best = { eco: node.eco, name: node.name };

  for (const u of uciPath) {
    const next = node.c?.[u];
    if (!next) break;
    node = next;
    if (node.eco && node.name) best = { eco: node.eco, name: node.name };
  }
  return best;
}

export function lookup(uciPath: string[]): BookNode | null {
  return nodeAt(uciPath);
}

/** True when this exact UCI path exists in the book. */
export function isInBook(uciPath: string[]): boolean {
  if (!uciPath.length) return true; // starting position is "in book"
  return nodeAt(uciPath) != null;
}

/** True when the last move of the path is a known book continuation. */
export function isBookMove(uciPath: string[]): boolean {
  return uciPath.length > 0 && nodeAt(uciPath) != null;
}

/** Next book moves from position after uciPath, sorted by coverage. */
export function children(uciPath: string[], fen: string): BookChild[] {
  const node = nodeAt(uciPath);
  if (!node?.c) return [];

  const out: BookChild[] = [];
  for (const [uci, child] of Object.entries(node.c)) {
    const san = uciToSan(fen, uci);
    if (!san) continue;
    out.push({
      uci,
      san,
      count: child.n,
      eco: child.eco,
      name: child.name,
    });
  }
  out.sort((a, b) => b.count - a.count || a.san.localeCompare(b.san));
  return out;
}

export function uciToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

export function sanToUci(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san, { strict: false });
    if (!move) return null;
    return move.from + move.to + (move.promotion || "");
  } catch {
    return null;
  }
}

/** Popular first moves for quick-start chips. */
export const OPENING_ROOTS: { label: string; san: string; uci: string }[] = [
  { label: "1.e4", san: "e4", uci: "e2e4" },
  { label: "1.d4", san: "d4", uci: "d2d4" },
  { label: "1.c4", san: "c4", uci: "c2c4" },
  { label: "1.Nf3", san: "Nf3", uci: "g1f3" },
  { label: "1.g3", san: "g3", uci: "g2g3" },
  { label: "1.b3", san: "b3", uci: "b2b3" },
];

export function buildPgnFromSans(sans: string[], headers?: Record<string, string>) {
  const chess = new Chess();
  for (const san of sans) {
    try {
      chess.move(san, { strict: false });
    } catch {
      break;
    }
  }
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      chess.header(k, v);
    }
  } else {
    chess.header("Event", "stumpchess openings");
    chess.header("Site", "stumpchess");
  }
  return chess.pgn();
}
