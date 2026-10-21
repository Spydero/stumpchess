/**
 * stumpchess club rating (chess.com-inspired Glicko).
 *
 * - Separate pools: bullet / blitz / rapid (from TIME_CONTROLS.kind)
 * - Rating + RD (uncertainty). New accounts start 1200 / RD 350
 * - Provisional until enough games or RD settles
 * - Both sides update from pre-game ratings (no sequential bias)
 */

export type RatingPool = "bullet" | "blitz" | "rapid";

export type RatingState = {
  rating: number;
  rd: number;
  games: number;
};

export const RATING_INITIAL = 1200;
export const RD_INITIAL = 350;
export const RD_MIN = 45;
export const RD_MAX = 350;
export const RATING_FLOOR = 100;
export const RATING_CEILING = 3200;
/** Games before leaving provisional (also need RD below threshold). */
export const PROVISIONAL_GAMES = 20;
export const PROVISIONAL_RD = 110;

const Q = Math.log(10) / 400;

export function freshRatingState(): RatingState {
  return { rating: RATING_INITIAL, rd: RD_INITIAL, games: 0 };
}

export function clampRating(r: number) {
  return Math.max(RATING_FLOOR, Math.min(RATING_CEILING, Math.round(r)));
}

export function clampRd(rd: number) {
  return Math.max(RD_MIN, Math.min(RD_MAX, rd));
}

export function isProvisional(state: RatingState) {
  return state.games < PROVISIONAL_GAMES || state.rd >= PROVISIONAL_RD;
}

export function formatClubRating(state: RatingState) {
  const r = clampRating(state.rating);
  return isProvisional(state) ? `${r}?` : `${r}`;
}

/**
 * Map a time-control id to a rating pool (chess.com-style):
 * bullet under 3 min, blitz 3 to under 10, rapid 10+.
 */
export function ratingPoolFromTimeControl(timeControl: string): RatingPool {
  const id = timeControl.toLowerCase().trim();
  if (id === "bullet" || id === "blitz" || id === "rapid") return id;
  const minutes = Number(id.split("+")[0]);
  if (Number.isFinite(minutes)) {
    if (minutes < 3) return "bullet";
    if (minutes < 10) return "blitz";
    return "rapid";
  }
  return "blitz";
}

function g(rd: number) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expectedScore(r: number, rOpp: number, rdOpp: number) {
  return 1 / (1 + 10 ** ((-g(rdOpp) * (r - rOpp)) / 400));
}

/**
 * Mild RD inflation between games (inactivity / uncertainty).
 * Chess sites expand RD over time; we apply a small bump each rated game start.
 */
export function inflateRd(rd: number, idleFactor = 1) {
  const c = 18; // per "period" growth; one period ≈ one game gap here
  return clampRd(Math.sqrt(rd * rd + c * c * idleFactor));
}

/** Update one player against one opponent (Glicko-1, single game). */
export function glickoUpdate(player: RatingState, opponent: RatingState, score: number): RatingState {
  const rd = inflateRd(player.rd);
  const rOpp = opponent.rating;
  const rdOpp = opponent.rd;
  const gOpp = g(rdOpp);
  const e = expectedScore(player.rating, rOpp, rdOpp);
  const d2 = 1 / (Q * Q * gOpp * gOpp * e * (1 - e));
  const denom = 1 / (rd * rd) + 1 / d2;
  const nextRd = clampRd(Math.sqrt(1 / denom));
  const nextR = clampRating(player.rating + (Q / denom) * gOpp * (score - e));
  return {
    rating: nextR,
    rd: nextRd,
    games: player.games + 1,
  };
}

/** Simultaneous pair update from pre-game states. scoreA: 1 / 0.5 / 0 */
export function applyGlickoPair(a: RatingState, b: RatingState, scoreA: number) {
  const score = scoreA === 1 || scoreA === 0 || scoreA === 0.5 ? scoreA : 0.5;
  return {
    a: glickoUpdate(a, b, score),
    b: glickoUpdate(b, a, 1 - score),
    expectedA: expectedScore(a.rating, b.rating, b.rd),
  };
}

export function scoreFromResult(result: string, side: "white" | "black"): number {
  if (result === "1/2-1/2") return 0.5;
  if (result === "1-0") return side === "white" ? 1 : 0;
  if (result === "0-1") return side === "white" ? 0 : 1;
  return 0.5;
}

/** Overall ladder rating: most-played established pool, else blitz. */
export function overallFromPools(pools: Record<RatingPool, RatingState>): RatingState {
  const order: RatingPool[] = ["blitz", "rapid", "bullet"];
  let best: RatingPool = "blitz";
  let bestGames = -1;
  for (const p of order) {
    if (pools[p].games > bestGames) {
      bestGames = pools[p].games;
      best = p;
    }
  }
  // Prefer a non-provisional pool when available
  for (const p of order) {
    if (pools[p].games > 0 && !isProvisional(pools[p])) return pools[p];
  }
  if (bestGames <= 0) return pools.blitz;
  return pools[best];
}
