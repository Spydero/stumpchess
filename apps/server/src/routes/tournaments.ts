import { Router } from "express";
import { prisma } from "@chess/db";
import { TIME_CONTROLS, canHostTournament, type Role, type TimeControlId } from "@chess/shared";
import { requireUser, type AuthedRequest } from "../middleware";
import { param } from "../params";
import { ratingPoolFromTimeControl, type RatingPool } from "@chess/shared";
import { invitesInclude, parseInviteUsernames } from "../invites";

function poolRating(
  u: {
    ratingBullet: number;
    ratingBlitz: number;
    ratingRapid: number;
  },
  pool: RatingPool
) {
  if (pool === "bullet") return u.ratingBullet;
  if (pool === "rapid") return u.ratingRapid;
  return u.ratingBlitz;
}

type PlayerRow = {
  userId: string;
  score: number;
  joinedAt: Date;
};

function pairedBefore(
  a: string,
  b: string,
  history: { whiteId: string | null; blackId: string | null }[]
) {
  return history.some(
    (g) =>
      (g.whiteId === a && g.blackId === b) || (g.whiteId === b && g.blackId === a)
  );
}

/** Simple Swiss: sort by score, pair neighbors, avoid rematches when possible, bye if odd. */
function swissPair(
  players: PlayerRow[],
  history: { whiteId: string | null; blackId: string | null }[]
): { pairs: { whiteId: string; blackId: string }[]; byeUserId?: string } {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  const remaining = sorted.map((p) => p.userId);
  const pairs: { whiteId: string; blackId: string }[] = [];
  let byeUserId: string | undefined;

  if (remaining.length % 2 === 1) {
    byeUserId = remaining.pop();
  }

  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    let idx = remaining.findIndex((b) => !pairedBefore(a, b, history));
    if (idx < 0) idx = 0;
    const b = remaining.splice(idx, 1)[0];
    const aWasWhite = history.filter((g) => g.whiteId === a).length;
    const bWasWhite = history.filter((g) => g.whiteId === b).length;
    if (aWasWhite <= bWasWhite) pairs.push({ whiteId: a, blackId: b });
    else pairs.push({ whiteId: b, blackId: a });
  }

  return { pairs, byeUserId };
}

function parseRatingBound(raw: unknown, fallback: number | null): number | null {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < 100 || rounded > 3200) return fallback;
  return rounded;
}

export function createTournamentsRouter() {
  const router = Router();

  router.get("/", async (_req, res) => {
    const list = await prisma.tournament.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        host: { select: { id: true, username: true, role: true } },
        _count: { select: { players: true, games: true } },
      },
    });
    res.json(
      list.map((t) => ({
        ...t,
        inviteCount: parseInviteUsernames(t.inviteUsernames).length,
        // Never leak whitelist on the public list
        inviteUsernames: undefined,
      }))
    );
  });

  router.get("/:id", async (req, res) => {
    const t = await prisma.tournament.findUnique({
      where: { id: param(req, "id") },
      include: {
        host: { select: { id: true, username: true, role: true } },
        players: {
          orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
          include: {
            user: {
              select: {
                id: true,
                username: true,
                role: true,
                image: true,
                rating: true,
                ratingBullet: true,
                ratingBlitz: true,
                ratingRapid: true,
                gamesBullet: true,
                gamesBlitz: true,
                gamesRapid: true,
                rdBullet: true,
                rdBlitz: true,
                rdRapid: true,
              },
            },
          },
        },
        games: {
          orderBy: [{ tournamentRound: "asc" }, { createdAt: "asc" }],
          include: {
            white: { select: { id: true, username: true } },
            black: { select: { id: true, username: true } },
          },
        },
      },
    });
    if (!t) return res.status(404).json({ error: "Not found" });

    const viewerId = String(req.headers["x-user-id"] || "");
    const isHost = !!viewerId && viewerId === t.hostId;
    const invites = parseInviteUsernames(t.inviteUsernames);

    res.json({
      ...t,
      inviteCount: invites.length,
      invites: isHost ? invites : undefined,
      inviteUsernames: undefined,
    });
  });

  router.post("/", requireUser, async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!canHostTournament(user.role as Role, user.vipExpiresAt)) {
      return res.status(403).json({
        error: "VIP or Tournament Host required to create tournaments",
      });
    }

    const name = String(req.body?.name || "").trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Name required" });
    const description = String(req.body?.description || "").trim().slice(0, 500);
    const tcId = String(req.body?.timeControl || "5+0") as TimeControlId;
    const tc = TIME_CONTROLS.find((t) => t.id === tcId) || TIME_CONTROLS[1];
    const maxRounds = Math.min(9, Math.max(1, Number(req.body?.maxRounds) || 4));
    const maxPlayers = Math.min(64, Math.max(2, Number(req.body?.maxPlayers) || 32));
    const isPrivate = Boolean(req.body?.isPrivate);
    const invites = parseInviteUsernames(req.body?.invites ?? req.body?.inviteUsernames);
    const minRating = parseRatingBound(req.body?.minRating, null);
    const maxRating = parseRatingBound(req.body?.maxRating, null);
    if (minRating != null && maxRating != null && minRating > maxRating) {
      return res.status(400).json({ error: "Min Elo cannot exceed max Elo" });
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        description,
        hostId: user.id,
        timeControl: tc.id,
        initialMs: tc.initialMs,
        incrementMs: tc.incrementMs,
        maxRounds,
        maxPlayers,
        isPrivate,
        inviteUsernames: JSON.stringify(invites),
        minRating,
        maxRating,
        status: "OPEN",
        players: { create: { userId: user.id } },
      },
      include: {
        host: { select: { id: true, username: true } },
        _count: { select: { players: true } },
      },
    });
    res.status(201).json(tournament);
  });

  /** Host can update privacy / invites / Elo gates while OPEN. */
  router.patch("/:id", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.hostId !== req.user!.id) return res.status(403).json({ error: "Host only" });
    if (t.status !== "OPEN") {
      return res.status(400).json({ error: "Can only edit settings before start" });
    }

    const data: {
      isPrivate?: boolean;
      inviteUsernames?: string;
      minRating?: number | null;
      maxRating?: number | null;
      description?: string;
    } = {};

    if (typeof req.body?.isPrivate === "boolean") data.isPrivate = req.body.isPrivate;
    if (req.body?.invites !== undefined || req.body?.inviteUsernames !== undefined) {
      data.inviteUsernames = JSON.stringify(
        parseInviteUsernames(req.body?.invites ?? req.body?.inviteUsernames)
      );
    }
    if ("minRating" in (req.body || {})) data.minRating = parseRatingBound(req.body.minRating, null);
    if ("maxRating" in (req.body || {})) data.maxRating = parseRatingBound(req.body.maxRating, null);
    if (typeof req.body?.description === "string") {
      data.description = req.body.description.trim().slice(0, 500);
    }

    const nextMin = data.minRating !== undefined ? data.minRating : t.minRating;
    const nextMax = data.maxRating !== undefined ? data.maxRating : t.maxRating;
    if (nextMin != null && nextMax != null && nextMin > nextMax) {
      return res.status(400).json({ error: "Min Elo cannot exceed max Elo" });
    }

    const updated = await prisma.tournament.update({ where: { id }, data });
    const invites = parseInviteUsernames(updated.inviteUsernames);
    res.json({
      ...updated,
      invites,
      inviteCount: invites.length,
      inviteUsernames: undefined,
    });
  });

  router.post("/:id/join", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({
      where: { id },
      include: { _count: { select: { players: true } } },
    });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.status !== "OPEN") return res.status(400).json({ error: "Not open for joining" });
    if (t._count.players >= t.maxPlayers) return res.status(400).json({ error: "Tournament full" });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        ratingBullet: true,
        ratingBlitz: true,
        ratingRapid: true,
      },
    });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (t.isPrivate && t.hostId !== user.id) {
      const invites = parseInviteUsernames(t.inviteUsernames);
      if (!invitesInclude(invites, user.username)) {
        return res.status(403).json({ error: "This event is invite-only" });
      }
    }

    const pool = ratingPoolFromTimeControl(t.timeControl);
    const rating = poolRating(user, pool);
    if (t.minRating != null && rating < t.minRating) {
      return res.status(403).json({
        error: `${pool} rating ${rating} is below the minimum (${t.minRating})`,
      });
    }
    if (t.maxRating != null && rating > t.maxRating) {
      return res.status(403).json({
        error: `${pool} rating ${rating} is above the maximum (${t.maxRating})`,
      });
    }

    await prisma.tournamentPlayer.upsert({
      where: { tournamentId_userId: { tournamentId: id, userId: req.user!.id } },
      create: { tournamentId: id, userId: req.user!.id },
      update: {},
    });
    res.json({ ok: true });
  });

  router.post("/:id/leave", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.status !== "OPEN") return res.status(400).json({ error: "Cannot leave after start" });
    if (t.hostId === req.user!.id) {
      return res.status(400).json({ error: "Host cannot leave; cancel instead" });
    }
    await prisma.tournamentPlayer.deleteMany({
      where: { tournamentId: id, userId: req.user!.id },
    });
    res.json({ ok: true });
  });

  router.post("/:id/cancel", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.hostId !== req.user!.id) return res.status(403).json({ error: "Host only" });
    if (t.status === "FINISHED") return res.status(400).json({ error: "Already finished" });
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "CANCELLED", endedAt: new Date() },
    });
    res.json(updated);
  });

  async function startRound(tournamentId: string, round: number) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
    });
    if (players.length < 2) throw new Error("Need at least 2 players");

    const history = await prisma.game.findMany({
      where: { tournamentId },
      select: { whiteId: true, blackId: true },
    });

    const { pairs, byeUserId } = swissPair(
      players.map((p) => ({ userId: p.userId, score: p.score, joinedAt: p.joinedAt })),
      history
    );

    if (byeUserId) {
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId, userId: byeUserId } },
        data: { score: { increment: 1 }, byes: { increment: 1 } },
      });
    }

    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    const games = [];
    for (const pair of pairs) {
      const game = await prisma.game.create({
        data: {
          status: "ACTIVE",
          timeControl: t.timeControl,
          initialMs: t.initialMs,
          incrementMs: t.incrementMs,
          whiteId: pair.whiteId,
          blackId: pair.blackId,
          tournamentId,
          tournamentRound: round,
          startedAt: new Date(),
        },
      });
      games.push(game);
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: "RUNNING",
        currentRound: round,
        startedAt: t.startedAt ?? new Date(),
      },
    });

    return { games, byeUserId };
  }

  router.post("/:id/start", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({
      where: { id },
      include: { _count: { select: { players: true } } },
    });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.hostId !== req.user!.id) return res.status(403).json({ error: "Host only" });
    if (t.status !== "OPEN") return res.status(400).json({ error: "Already started" });
    if (t._count.players < 2) return res.status(400).json({ error: "Need at least 2 players" });

    try {
      const result = await startRound(id, 1);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
    }
  });

  router.post("/:id/next-round", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.hostId !== req.user!.id) return res.status(403).json({ error: "Host only" });
    if (t.status !== "RUNNING") return res.status(400).json({ error: "Not running" });
    if (t.currentRound >= t.maxRounds) {
      return res.status(400).json({ error: "All rounds done; finish the tournament" });
    }

    const open = await prisma.game.count({
      where: { tournamentId: id, tournamentRound: t.currentRound, status: { not: "FINISHED" } },
    });
    if (open > 0) {
      return res.status(400).json({ error: `${open} game(s) still in progress this round` });
    }

    try {
      const result = await startRound(id, t.currentRound + 1);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
    }
  });

  router.post("/:id/finish", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "Not found" });
    if (t.hostId !== req.user!.id) return res.status(403).json({ error: "Host only" });
    if (t.status !== "RUNNING" && t.status !== "OPEN") {
      return res.status(400).json({ error: "Cannot finish" });
    }

    const open = await prisma.game.count({
      where: { tournamentId: id, status: { not: "FINISHED" } },
    });
    if (open > 0) {
      return res.status(400).json({ error: `${open} game(s) still open` });
    }

    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "FINISHED", endedAt: new Date() },
    });
    res.json(updated);
  });

  return router;
}
