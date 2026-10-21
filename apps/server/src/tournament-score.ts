import { prisma } from "@chess/db";

/** Update Swiss standings when a tournament game finishes. */
export async function applyTournamentGameResult(opts: {
  gameId: string;
  tournamentId: string;
  whiteId: string | null;
  blackId: string | null;
  result: string;
}) {
  const { tournamentId, whiteId, blackId, result } = opts;
  if (!whiteId || !blackId) return;
  if (!["1-0", "0-1", "1/2-1/2"].includes(result)) return;

  const white = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: whiteId } },
  });
  const black = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: blackId } },
  });
  if (!white || !black) return;

  if (result === "1-0") {
    await prisma.tournamentPlayer.update({
      where: { id: white.id },
      data: { score: { increment: 1 }, wins: { increment: 1 } },
    });
    await prisma.tournamentPlayer.update({
      where: { id: black.id },
      data: { losses: { increment: 1 } },
    });
  } else if (result === "0-1") {
    await prisma.tournamentPlayer.update({
      where: { id: black.id },
      data: { score: { increment: 1 }, wins: { increment: 1 } },
    });
    await prisma.tournamentPlayer.update({
      where: { id: white.id },
      data: { losses: { increment: 1 } },
    });
  } else {
    await prisma.tournamentPlayer.update({
      where: { id: white.id },
      data: { score: { increment: 0.5 }, draws: { increment: 1 } },
    });
    await prisma.tournamentPlayer.update({
      where: { id: black.id },
      data: { score: { increment: 0.5 }, draws: { increment: 1 } },
    });
  }
}
