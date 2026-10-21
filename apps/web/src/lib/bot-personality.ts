import { Chess } from "chess.js";
import type { BotStyle } from "@chess/shared";
import type { PvLine } from "@/lib/stockfish";
import { stmScore } from "@/lib/stockfish";

function fileOf(sq: string) {
  return sq.charCodeAt(0) - 97;
}
function rankOf(sq: string) {
  return Number(sq[1]) - 1;
}

function kingDist(from: string, kingSq: string) {
  return Math.max(Math.abs(fileOf(from) - fileOf(kingSq)), Math.abs(rankOf(from) - rankOf(kingSq)));
}

function enemyKingSquare(fen: string): string | null {
  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.type === "k" && p.color !== chess.turn()) return p.square;
    }
  }
  return null;
}

/**
 * Stockfish lane: free-float among MultiPV near-equals.
 * Keeps strength (tiny cp band) but avoids always locking the same PV1.
 */
export function chooseEngineMove(pvs: PvLine[], maxGapCp = 12): string | undefined {
  const candidates = pvs.filter((p) => p.uci).slice(0, 4);
  if (!candidates.length) return undefined;
  const best = candidates[0];
  const bestScore = stmScore(best.scoreCp, best.mate);
  const near = candidates.filter((line) => {
    const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
    return gap <= maxGapCp;
  });
  if (near.length <= 1) return best.uci;

  // Soft preference for PV1; still float when lines are engine-equal.
  const weights = near.map((line, idx) => {
    const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
    return Math.max(0.15, 1.35 - idx * 0.35 - gap / maxGapCp);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < near.length; i++) {
    r -= weights[i];
    if (r <= 0) return near[i].uci;
  }
  return best.uci;
}

/**
 * Personality = light random among near-best lines only.
 * Strength stays with UCI_Elo; we never give away more than a small cp gap.
 */
export function chooseStyledMove(
  fen: string,
  pvs: PvLine[],
  style: BotStyle
): string | undefined {
  const candidates = pvs.filter((p) => p.uci).slice(0, 3);
  if (!candidates.length) return undefined;

  const best = candidates[0].uci;
  if (candidates.length === 1 || style === "balanced") return best;

  const bestScore = stmScore(candidates[0].scoreCp, candidates[0].mate);
  // Tight band so Elo stays honest. Tricky gets a bit more room for spice.
  const maxGap = style === "tricky" ? 40 : 25;

  const near = candidates.filter((line) => {
    const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
    return gap <= maxGap;
  });
  if (near.length <= 1) return best;

  // Most of the time still play best (~70%); sometimes flavor-pick among near-equals.
  if (Math.random() < 0.7) return best;

  const kSq = enemyKingSquare(fen) || "e8";
  const weights = near.map((line, idx) => {
    const gap = Math.abs(bestScore - stmScore(line.scoreCp, line.mate));
    let w = Math.max(0.2, 1 - gap / maxGap);

    try {
      const probe = new Chess(fen);
      const mv = probe.move({
        from: line.uci.slice(0, 2),
        to: line.uci.slice(2, 4),
        promotion: line.uci[4] || "q",
      });
      if (!mv) return 0;

      if (style === "aggressive") {
        if (mv.captured) w += 0.8;
        if (mv.san.includes("+") || mv.san.includes("#")) w += 1.0;
        if (kingDist(mv.to, kSq) < kingDist(mv.from, kSq)) w += 0.4;
      } else if (style === "solid") {
        w += Math.max(0, 1.0 - idx * 0.45);
        if (mv.captured && gap > 10) w -= 0.25;
      } else if (style === "tricky") {
        // Prefer non-best when it's still close
        if (idx >= 1) w += 0.9;
        if (mv.san.includes("+") || mv.captured) w += 0.3;
      }
    } catch {
      return 0;
    }
    return Math.max(0, w);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return best;

  let r = Math.random() * total;
  for (let i = 0; i < near.length; i++) {
    r -= weights[i];
    if (r <= 0) return near[i].uci;
  }
  return best;
}
