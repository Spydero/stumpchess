import { prisma } from "@chess/db";
import {
  applyGlickoPair,
  overallFromPools,
  ratingPoolFromTimeControl,
  scoreFromResult,
  type RatingPool,
  type RatingState,
} from "@chess/shared";

type UserRatingRow = {
  id: string;
  rating: number;
  ratedGames: number;
  ratingBullet: number;
  rdBullet: number;
  gamesBullet: number;
  ratingBlitz: number;
  rdBlitz: number;
  gamesBlitz: number;
  ratingRapid: number;
  rdRapid: number;
  gamesRapid: number;
};

function poolState(u: UserRatingRow, pool: RatingPool): RatingState {
  if (pool === "bullet") return { rating: u.ratingBullet, rd: u.rdBullet, games: u.gamesBullet };
  if (pool === "rapid") return { rating: u.ratingRapid, rd: u.rdRapid, games: u.gamesRapid };
  return { rating: u.ratingBlitz, rd: u.rdBlitz, games: u.gamesBlitz };
}

function poolsFromUser(u: UserRatingRow): Record<RatingPool, RatingState> {
  return {
    bullet: poolState(u, "bullet"),
    blitz: poolState(u, "blitz"),
    rapid: poolState(u, "rapid"),
  };
}

function dataForPoolUpdate(pool: RatingPool, next: RatingState, overall: RatingState, ratedGames: number) {
  const base = { rating: overall.rating, ratedGames };
  if (pool === "bullet") {
    return {
      ...base,
      ratingBullet: next.rating,
      rdBullet: Math.round(next.rd),
      gamesBullet: next.games,
    };
  }
  if (pool === "rapid") {
    return {
      ...base,
      ratingRapid: next.rating,
      rdRapid: Math.round(next.rd),
      gamesRapid: next.games,
    };
  }
  return {
    ...base,
    ratingBlitz: next.rating,
    rdBlitz: Math.round(next.rd),
    gamesBlitz: next.games,
  };
}

const selectRating = {
  id: true,
  rating: true,
  ratedGames: true,
  ratingBullet: true,
  rdBullet: true,
  gamesBullet: true,
  ratingBlitz: true,
  rdBlitz: true,
  gamesBlitz: true,
  ratingRapid: true,
  rdRapid: true,
  gamesRapid: true,
} as const;

/**
 * Update W/L/D + per-pool Glicko for a finished human vs human game.
 * Bot / incomplete games are ignored.
 */
export async function applyRatedGameResult(opts: {
  whiteId: string | null;
  blackId: string | null;
  result: string;
  timeControl?: string;
  isBot?: boolean;
}) {
  const { whiteId, blackId, result, isBot } = opts;
  if (isBot || !whiteId || !blackId) return;
  if (!["1-0", "0-1", "1/2-1/2"].includes(result)) return;

  const pool = ratingPoolFromTimeControl(opts.timeControl || "5+0");

  const [white, black] = await Promise.all([
    prisma.user.findUnique({ where: { id: whiteId }, select: selectRating }),
    prisma.user.findUnique({ where: { id: blackId }, select: selectRating }),
  ]);
  if (!white || !black) return;

  const beforeA = poolState(white, pool);
  const beforeB = poolState(black, pool);
  const scoreA = scoreFromResult(result, "white");
  const { a: nextA, b: nextB } = applyGlickoPair(beforeA, beforeB, scoreA);

  const poolsA = poolsFromUser(white);
  poolsA[pool] = nextA;
  const poolsB = poolsFromUser(black);
  poolsB[pool] = nextB;
  const overallA = overallFromPools(poolsA);
  const overallB = overallFromPools(poolsB);

  const wlA =
    result === "1-0"
      ? { wins: { increment: 1 as const } }
      : result === "0-1"
        ? { losses: { increment: 1 as const } }
        : { draws: { increment: 1 as const } };
  const wlB =
    result === "0-1"
      ? { wins: { increment: 1 as const } }
      : result === "1-0"
        ? { losses: { increment: 1 as const } }
        : { draws: { increment: 1 as const } };

  await Promise.all([
    prisma.user.update({
      where: { id: whiteId },
      data: {
        ...dataForPoolUpdate(pool, nextA, overallA, white.ratedGames + 1),
        ...wlA,
      },
    }),
    prisma.user.update({
      where: { id: blackId },
      data: {
        ...dataForPoolUpdate(pool, nextB, overallB, black.ratedGames + 1),
        ...wlB,
      },
    }),
  ]);
}

export { parseInviteUsernames, invitesInclude } from "./invites";
