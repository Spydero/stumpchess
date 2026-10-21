import type { Server, Socket } from "socket.io";
import { prisma } from "@chess/db";
import type { TIME_CONTROLS } from "@chess/shared";

type Tc = (typeof TIME_CONTROLS)[number];

type QueueEntry = {
  userId: string;
  username: string;
  socketId: string;
  timeControl: Tc;
  joinedAt: number;
};

export class Matchmaking {
  private queues = new Map<string, QueueEntry[]>();

  constructor(private io: Server) {}

  async join(socket: Socket, userId: string, username: string, timeControl: Tc) {
    this.leave(userId);
    const list = this.queues.get(timeControl.id) ?? [];
    const opponent = list.shift();
    this.queues.set(timeControl.id, list);

    if (!opponent) {
      list.push({
        userId,
        username,
        socketId: socket.id,
        timeControl,
        joinedAt: Date.now(),
      });
      this.queues.set(timeControl.id, list);
      socket.emit("queue:waiting", { timeControl: timeControl.id });
      return;
    }

    const whiteFirst = Math.random() < 0.5;
    const white = whiteFirst
      ? { id: opponent.userId, username: opponent.username, socketId: opponent.socketId }
      : { id: userId, username, socketId: socket.id };
    const black = whiteFirst
      ? { id: userId, username, socketId: socket.id }
      : { id: opponent.userId, username: opponent.username, socketId: opponent.socketId };

    const game = await prisma.game.create({
      data: {
        status: "ACTIVE",
        timeControl: timeControl.id,
        initialMs: timeControl.initialMs,
        incrementMs: timeControl.incrementMs,
        whiteId: white.id,
        blackId: black.id,
        startedAt: new Date(),
      },
    });

    const payload = {
      gameId: game.id,
      timeControl: timeControl.id,
      initialMs: timeControl.initialMs,
      incrementMs: timeControl.incrementMs,
      white: { id: white.id, username: white.username },
      black: { id: black.id, username: black.username },
      fen: game.fen,
    };

    this.io.to(white.socketId).emit("queue:matched", { ...payload, color: "w" });
    this.io.to(black.socketId).emit("queue:matched", { ...payload, color: "b" });
  }

  leave(userId: string) {
    for (const [key, list] of this.queues) {
      this.queues.set(
        key,
        list.filter((e) => e.userId !== userId)
      );
    }
  }
}
