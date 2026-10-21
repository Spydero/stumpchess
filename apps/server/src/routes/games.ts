import { Router } from "express";
import { prisma } from "@chess/db";
import { Chess } from "chess.js";
import { TIME_CONTROLS, type Role } from "@chess/shared";
import { requireUser, type AuthedRequest } from "../middleware";
import { param } from "../params";
import { purgeExpiredGames } from "../purge";
import { applyTournamentGameResult } from "../tournament-score";
import { canUseVipFeatures } from "../site";
import { applyRatedGameResult } from "../elo";

export function createGamesRouter() {
  const router = Router();

  router.get("/recent", async (_req, res) => {
    await purgeExpiredGames();
    const games = await prisma.game.findMany({
      where: { status: "FINISHED" },
      orderBy: { endedAt: "desc" },
      take: 30,
      include: {
        white: { select: { username: true, role: true, image: true } },
        black: { select: { username: true, role: true, image: true } },
      },
    });
    res.json(games);
  });

  /** Current user's games from the last 30 days (auto-purged after that). */
  router.get("/mine", requireUser, async (req: AuthedRequest, res) => {
    await purgeExpiredGames();
    const uid = req.user!.id;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Omit analysisJson here (can be huge); fetch full game by id when reviewing.
    const games = await prisma.game.findMany({
      where: {
        status: "FINISHED",
        OR: [{ whiteId: uid }, { blackId: uid }],
        endedAt: { gte: cutoff },
      },
      orderBy: { endedAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        timeControl: true,
        result: true,
        pgn: true,
        fen: true,
        isBot: true,
        botLevel: true,
        analysisDepth: true,
        analyzedAt: true,
        endedAt: true,
        startedAt: true,
        createdAt: true,
        whiteId: true,
        blackId: true,
        white: { select: { username: true, role: true, image: true } },
        black: { select: { username: true, role: true, image: true } },
      },
    });
    res.json(games);
  });

  /**
   * Human games in progress (for live spectating). Bots excluded.
   * Optional ?username= filters to games where that player is white or black
   * (case-insensitive match, same as DMs / challenge).
   */
  router.get("/live", async (req, res) => {
    const username = String(req.query.username || "").trim();
    let userId: string | undefined;
    if (username) {
      const needle = username.toLowerCase();
      const all = await prisma.user.findMany({
        where: { banned: false },
        select: { id: true, username: true },
      });
      const u = all.find((x) => x.username.toLowerCase() === needle);
      if (!u) return res.json([]);
      userId = u.id;
    }

    const games = await prisma.game.findMany({
      where: {
        status: "ACTIVE",
        isBot: false,
        whiteId: { not: null },
        blackId: { not: null },
        ...(userId ? { OR: [{ whiteId: userId }, { blackId: userId }] } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 40,
      include: {
        white: { select: { id: true, username: true, role: true, image: true } },
        black: { select: { id: true, username: true, role: true, image: true } },
      },
    });
    res.json(games);
  });

  router.get("/:id", async (req, res) => {
    const game = await prisma.game.findUnique({
      where: { id: param(req, "id") },
      include: {
        white: { select: { id: true, username: true, role: true, image: true } },
        black: { select: { id: true, username: true, role: true, image: true } },
      },
    });
    if (!game) return res.status(404).json({ error: "Not found" });
    res.json(game);
  });

  router.post("/bot", requireUser, async (req: AuthedRequest, res) => {
    // Personality: 0–18. Engine Elo: 800–2850. Full engine: 20.
    const raw = Number(req.body?.level ?? 5);
    const level =
      raw >= 800 && raw <= 2850
        ? Math.round(raw)
        : Math.min(20, Math.max(0, Number.isFinite(raw) ? raw : 5));
    const color = req.body?.color === "b" ? "b" : "w";
    const tc = TIME_CONTROLS[1];
    const game = await prisma.game.create({
      data: {
        status: "ACTIVE",
        timeControl: tc.id,
        initialMs: tc.initialMs,
        incrementMs: 0,
        whiteId: color === "w" ? req.user!.id : null,
        blackId: color === "b" ? req.user!.id : null,
        isBot: true,
        botLevel: level,
        startedAt: new Date(),
      },
    });
    res.status(201).json(game);
  });

  /**
   * Persist a finished Practice session (VIP). One-shot create so abandoned boards
   * never leave orphan ACTIVE games.
   */
  router.post("/practice", requireUser, async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const access = await canUseVipFeatures(user.role as Role, user.vipExpiresAt);
    if (!access.allowed) {
      return res.status(403).json({ error: "VIP required", vipFeaturesOpen: false });
    }

    const {
      pgn,
      fen,
      result,
      color,
      level,
      timeControl,
      initialMs,
      incrementMs,
      mode,
    } = req.body as {
      pgn?: string;
      fen?: string;
      result?: string;
      color?: string;
      level?: number | null;
      timeControl?: string;
      initialMs?: number;
      incrementMs?: number;
      mode?: string;
    };

    if (!result || !["1-0", "0-1", "1/2-1/2"].includes(result)) {
      return res.status(400).json({ error: "Invalid result" });
    }
    if (!pgn || typeof pgn !== "string" || pgn.length > 200_000) {
      return res.status(400).json({ error: "Invalid PGN" });
    }

    let loadedFen = fen;
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      if (chess.history().length < 1) {
        return res.status(400).json({ error: "Empty game" });
      }
      loadedFen = chess.fen();
    } catch {
      return res.status(400).json({ error: "Invalid PGN" });
    }

    const playColor = color === "b" ? "b" : "w";
    const isSandbox = mode === "sandbox";
    let botLevel: number | null = null;
    if (!isSandbox && level != null && Number.isFinite(Number(level))) {
      const raw = Number(level);
      botLevel =
        raw >= 800 && raw <= 2850
          ? Math.round(raw)
          : Math.min(20, Math.max(0, raw));
    }

    const tcId = typeof timeControl === "string" && timeControl.trim() ? timeControl.trim().slice(0, 32) : "practice";
    const initMs = Number.isFinite(Number(initialMs)) ? Math.max(0, Math.round(Number(initialMs))) : 0;
    const incMs = Number.isFinite(Number(incrementMs)) ? Math.max(0, Math.round(Number(incrementMs))) : 0;

    const whiteId = isSandbox || playColor === "w" ? req.user!.id : null;
    const blackId = !isSandbox && playColor === "b" ? req.user!.id : null;
    let winnerId: string | null = null;
    if (result === "1-0") winnerId = whiteId;
    if (result === "0-1") winnerId = blackId;

    const now = new Date();
    const game = await prisma.game.create({
      data: {
        status: "FINISHED",
        timeControl: tcId,
        initialMs: initMs,
        incrementMs: incMs,
        whiteId,
        blackId,
        isBot: true,
        botLevel,
        pgn,
        fen: typeof loadedFen === "string" ? loadedFen : undefined,
        result,
        winnerId: winnerId ?? undefined,
        startedAt: now,
        endedAt: now,
      },
    });
    res.status(201).json(game);
  });

  router.post("/challenge", requireUser, async (req: AuthedRequest, res) => {
    const username = String(req.body?.username || "").trim();
    const tcId = String(req.body?.timeControl || "5+0");
    const tc = TIME_CONTROLS.find((t) => t.id === tcId) || TIME_CONTROLS[1];
    if (!username) return res.status(400).json({ error: "Username required" });

    const all = await prisma.user.findMany({
      where: { banned: false },
      select: { id: true, username: true },
    });
    const opponentMeta = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!opponentMeta) return res.status(404).json({ error: "User not found" });
    const opponent = await prisma.user.findUnique({ where: { id: opponentMeta.id } });
    if (!opponent) return res.status(404).json({ error: "User not found" });
    if (opponent.id === req.user!.id) return res.status(400).json({ error: "Cannot challenge yourself" });

    const whiteFirst = Math.random() < 0.5;
    const game = await prisma.game.create({
      data: {
        status: "WAITING",
        timeControl: tc.id,
        initialMs: tc.initialMs,
        incrementMs: tc.incrementMs,
        whiteId: whiteFirst ? req.user!.id : opponent.id,
        blackId: whiteFirst ? opponent.id : req.user!.id,
      },
    });
    res.status(201).json(game);
  });

  router.post("/:id/accept", requireUser, async (req: AuthedRequest, res) => {
    const game = await prisma.game.findUnique({ where: { id: param(req, "id") } });
    if (!game) return res.status(404).json({ error: "Not found" });
    if (game.status !== "WAITING") return res.status(400).json({ error: "Not waiting" });
    if (req.user!.id !== game.whiteId && req.user!.id !== game.blackId) {
      return res.status(403).json({ error: "Not your challenge" });
    }
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
    res.json(updated);
  });

  router.post("/:id/result", requireUser, async (req: AuthedRequest, res) => {
    const game = await prisma.game.findUnique({ where: { id: param(req, "id") } });
    if (!game) return res.status(404).json({ error: "Not found" });
    if (game.status === "FINISHED") return res.json(game);
    if (req.user!.id !== game.whiteId && req.user!.id !== game.blackId && !game.isBot) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { pgn, result, fen } = req.body as { pgn?: string; result?: string; fen?: string };
    if (!result || !["1-0", "0-1", "1/2-1/2"].includes(result)) {
      return res.status(400).json({ error: "Invalid result" });
    }

    try {
      const chess = new Chess();
      if (pgn) chess.loadPgn(pgn);
      else if (fen) chess.load(fen);
    } catch {
      return res.status(400).json({ error: "Invalid PGN/FEN" });
    }

    let winnerId: string | null = null;
    if (result === "1-0") winnerId = game.whiteId;
    if (result === "0-1") winnerId = game.blackId;

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        status: "FINISHED",
        result,
        pgn: pgn ?? game.pgn,
        fen: fen ?? game.fen,
        winnerId: winnerId ?? undefined,
        endedAt: new Date(),
      },
    });

    await applyRatedGameResult({
      whiteId: game.whiteId,
      blackId: game.blackId,
      result,
      timeControl: game.timeControl,
      isBot: game.isBot,
    });

    if (game.tournamentId) {
      await applyTournamentGameResult({
        gameId: game.id,
        tournamentId: game.tournamentId,
        whiteId: game.whiteId,
        blackId: game.blackId,
        result,
      });
    }

    res.json(updated);
  });

  router.post("/analyze/check", requireUser, async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const access = await canUseVipFeatures(user.role as Role, user.vipExpiresAt);
    if (!access.allowed) {
      return res.status(403).json({
        error: "VIP required",
        vip: false,
        vipFeaturesOpen: false,
      });
    }
    res.json({
      vip: access.personalVip,
      vipFeaturesOpen: access.vipFeaturesOpen,
      allowed: true,
    });
  });

  /** Save / replace cached game review (VIP or open-to-all, participant only). */
  router.put("/:id/analysis", requireUser, async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const access = await canUseVipFeatures(user.role as Role, user.vipExpiresAt);
    if (!access.allowed) {
      return res.status(403).json({ error: "VIP required", vipFeaturesOpen: false });
    }

    const game = await prisma.game.findUnique({ where: { id: param(req, "id") } });
    if (!game) return res.status(404).json({ error: "Not found" });
    if (req.user!.id !== game.whiteId && req.user!.id !== game.blackId) {
      return res.status(403).json({ error: "Not your game" });
    }

    const { analysisJson, depth } = req.body as { analysisJson?: string; depth?: number };
    if (!analysisJson || typeof analysisJson !== "string") {
      return res.status(400).json({ error: "analysisJson required" });
    }
    if (analysisJson.length > 2_000_000) {
      return res.status(400).json({ error: "Analysis too large" });
    }
    try {
      JSON.parse(analysisJson);
    } catch {
      return res.status(400).json({ error: "Invalid analysis JSON" });
    }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        analysisJson,
        analysisDepth: typeof depth === "number" ? depth : null,
        analyzedAt: new Date(),
      },
      select: { id: true, analysisDepth: true, analyzedAt: true },
    });
    res.json(updated);
  });

  return router;
}
