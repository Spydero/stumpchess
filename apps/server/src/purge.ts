import { prisma } from "@chess/db";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let lastPurge = 0;

/** Delete finished/abandoned games older than 30 days. Rate-limited. */
export async function purgeExpiredGames() {
  const now = Date.now();
  if (now - lastPurge < 60_000) return { deleted: 0, skipped: true };
  lastPurge = now;

  const cutoff = new Date(now - RETENTION_MS);
  const result = await prisma.game.deleteMany({
    where: {
      OR: [
        { endedAt: { lt: cutoff } },
        {
          endedAt: null,
          createdAt: { lt: cutoff },
          status: { in: ["FINISHED", "ABORTED", "WAITING"] },
        },
      ],
    },
  });
  if (result.count > 0) {
    console.log(`Purged ${result.count} games older than 30 days`);
  }
  return { deleted: result.count, skipped: false };
}
