import "dotenv/config";
import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { prisma } from "@chess/db";
import { TIME_CONTROLS, hasVipAccess, type Role, type TimeControlId } from "@chess/shared";
import { Chess } from "chess.js";
import { createForumRouter } from "./routes/forum";
import { createUsersRouter } from "./routes/users";
import { createGamesRouter } from "./routes/games";
import { createAdminRouter } from "./routes/admin";
import { Matchmaking } from "./matchmaking";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
// Allow browser pages with COEP to call this API (multi-thread Stockfish needs COEP)
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/forum", createForumRouter());
app.use("/api/users", createUsersRouter());
app.use("/api/games", createGamesRouter());
app.use("/api/admin", createAdminRouter());

app.get("/api/me/vip", async (req, res) => {
  const userId = String(req.headers["x-user-id"] || "");
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({
    vip: hasVipAccess(user.role as Role, user.vipExpiresAt),
    role: user.role,
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});

const matchmaking = new Matchmaking(io);

type SocketMeta = {
  userId: string;
  username: string;
  gameId?: string;
};

const sockets = new Map<string, SocketMeta>();

io.on("connection", (socket) => {
  socket.on("auth", (payload: { userId: string; username: string }) => {
    if (!payload?.userId || !payload?.username) return;
    sockets.set(socket.id, { userId: payload.userId, username: payload.username });
  });

  socket.on("queue:join", async (payload: { timeControl: TimeControlId }) => {
    const meta = sockets.get(socket.id);
    if (!meta) return socket.emit("error", { message: "Not authenticated" });
    const tc = TIME_CONTROLS.find((t) => t.id === payload.timeControl);
    if (!tc) return socket.emit("error", { message: "Invalid time control" });
    await matchmaking.join(socket, meta.userId, meta.username, tc);
  });

  socket.on("queue:leave", () => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    matchmaking.leave(meta.userId);
  });

  socket.on("game:join", (payload: { gameId: string }) => {
    const meta = sockets.get(socket.id);
    if (!meta || !payload?.gameId) return;
    meta.gameId = payload.gameId;
    socket.join(`game:${payload.gameId}`);
  });

  // WebRTC signaling
  socket.on("webrtc:signal", (payload: { gameId: string; toUserId: string; data: unknown }) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    for (const [id, m] of sockets) {
      if (m.userId === payload.toUserId) {
        io.to(id).emit("webrtc:signal", {
          fromUserId: meta.userId,
          gameId: payload.gameId,
          data: payload.data,
        });
      }
    }
  });

  // Relay fallback for moves
  socket.on(
    "game:move",
    async (payload: {
      gameId: string;
      from: string;
      to: string;
      promotion?: string;
      fen: string;
      san: string;
      whiteTimeMs: number;
      blackTimeMs: number;
      movedAt: number;
    }) => {
      const meta = sockets.get(socket.id);
      if (!meta) return;
      const game = await prisma.game.findUnique({ where: { id: payload.gameId } });
      if (!game || game.status !== "ACTIVE") return;
      if (meta.userId !== game.whiteId && meta.userId !== game.blackId) return;

      const chess = new Chess(game.fen);
      try {
        const move = chess.move({
          from: payload.from,
          to: payload.to,
          promotion: payload.promotion,
        });
        if (!move) return;
      } catch {
        return;
      }

      const pgn = game.pgn ? `${game.pgn} ${payload.san}` : payload.san;
      const ended = chess.isGameOver();
      let result: string | null = null;
      let winnerId: string | null = null;
      let status: "ACTIVE" | "FINISHED" = "ACTIVE";

      if (ended) {
        status = "FINISHED";
        if (chess.isCheckmate()) {
          const whiteWon = chess.turn() === "b";
          result = whiteWon ? "1-0" : "0-1";
          winnerId = whiteWon ? game.whiteId : game.blackId;
        } else {
          result = "1/2-1/2";
        }
      }

      await prisma.game.update({
        where: { id: game.id },
        data: {
          fen: chess.fen(),
          pgn: pgn.trim(),
          status,
          result: result ?? undefined,
          winnerId: winnerId ?? undefined,
          endedAt: ended ? new Date() : undefined,
        },
      });

      if (ended && winnerId) {
        await prisma.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
        const loserId = winnerId === game.whiteId ? game.blackId : game.whiteId;
        if (loserId) {
          await prisma.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } });
        }
      } else if (ended && result === "1/2-1/2") {
        if (game.whiteId) await prisma.user.update({ where: { id: game.whiteId }, data: { draws: { increment: 1 } } });
        if (game.blackId) await prisma.user.update({ where: { id: game.blackId }, data: { draws: { increment: 1 } } });
      }

      socket.to(`game:${payload.gameId}`).emit("game:move", payload);
      if (ended) {
        io.to(`game:${payload.gameId}`).emit("game:ended", { result, winnerId, fen: chess.fen() });
      }
    }
  );

  socket.on("game:resign", async (payload: { gameId: string }) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const game = await prisma.game.findUnique({ where: { id: payload.gameId } });
    if (!game || game.status !== "ACTIVE") return;
    if (meta.userId !== game.whiteId && meta.userId !== game.blackId) return;

    const whiteResigned = meta.userId === game.whiteId;
    const result = whiteResigned ? "0-1" : "1-0";
    const winnerId = whiteResigned ? game.blackId : game.whiteId;

    await prisma.game.update({
      where: { id: game.id },
      data: { status: "FINISHED", result, winnerId: winnerId ?? undefined, endedAt: new Date() },
    });
    if (winnerId) {
      await prisma.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
      await prisma.user.update({ where: { id: meta.userId }, data: { losses: { increment: 1 } } });
    }
    io.to(`game:${payload.gameId}`).emit("game:ended", { result, winnerId, reason: "resign" });
  });

  socket.on("disconnect", () => {
    const meta = sockets.get(socket.id);
    if (meta) matchmaking.leave(meta.userId);
    sockets.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Chess server listening on http://localhost:${PORT}`);
});
