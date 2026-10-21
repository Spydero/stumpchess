import { Router } from "express";
import { prisma } from "@chess/db";
import { OWNER_USERNAME } from "@chess/shared";
import { param } from "../params";

export function createUsersRouter() {
  const router = Router();

  router.get("/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 1) return res.json([]);
    const users = await prisma.user.findMany({
      where: {
        username: { contains: q },
        banned: false,
      },
      take: 20,
      select: {
        id: true,
        username: true,
        role: true,
        image: true,
      },
      orderBy: { username: "asc" },
    });
    res.json(users);
  });

  router.get("/:username", async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { username: param(req, "username") },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        image: true,
        wins: true,
        losses: true,
        draws: true,
        createdAt: true,
        vipExpiresAt: true,
      },
    });
    if (!user || (await prisma.user.findUnique({ where: { id: user.id } }))?.banned) {
      return res.status(404).json({ error: "Not found" });
    }

    const isOwner = user.username === OWNER_USERNAME || user.role === "OWNER";
    const games = await prisma.game.findMany({
      where: {
        status: "FINISHED",
        OR: [{ whiteId: user.id }, { blackId: user.id }],
      },
      orderBy: { endedAt: "desc" },
      take: 20,
      select: {
        id: true,
        result: true,
        timeControl: true,
        endedAt: true,
        isBot: true,
        white: { select: { username: true, role: true } },
        black: { select: { username: true, role: true } },
      },
    });

    if (isOwner) {
      return res.json({
        id: user.id,
        username: user.username,
        role: "OWNER",
        image: user.image,
        displayLabel: "Owner",
        hideStats: true,
        games,
      });
    }

    res.json({
      ...user,
      hideStats: false,
      displayLabel: null,
      games,
    });
  });

  return router;
}
