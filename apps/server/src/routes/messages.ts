import { Router } from "express";
import { prisma } from "@chess/db";
import { requireUser, type AuthedRequest } from "../middleware";
import { param } from "../params";

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

export function createMessagesRouter() {
  const router = Router();

  /** Inbox: conversations for current user, newest activity first. */
  router.get("/", requireUser, async (req: AuthedRequest, res) => {
    const uid = req.user!.id;
    const parts = await prisma.conversationParticipant.findMany({
      where: { userId: uid },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true, image: true, role: true } } },
            },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    const rows = parts
      .map((p) => {
        const other = p.conversation.participants.find((x) => x.userId !== uid)?.user;
        const last = p.conversation.messages[0] || null;
        const unread =
          last && last.senderId !== uid
            ? !p.lastReadAt || last.createdAt > p.lastReadAt
            : false;
        return {
          id: p.conversation.id,
          updatedAt: p.conversation.updatedAt,
          other,
          lastMessage: last
            ? { id: last.id, body: last.body, senderId: last.senderId, createdAt: last.createdAt }
            : null,
          unread,
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json(rows);
  });

  /** Open or create a 1:1 conversation with username. */
  router.post("/with", requireUser, async (req: AuthedRequest, res) => {
    const username = String(req.body?.username || "").trim();
    if (!username) return res.status(400).json({ error: "Username required" });

    const all = await prisma.user.findMany({
      where: { banned: false },
      select: { id: true, username: true },
    });
    const other = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!other) return res.status(404).json({ error: "User not found" });
    if (other.id === req.user!.id) return res.status(400).json({ error: "Cannot message yourself" });

    const key = pairKey(req.user!.id, other.id);
    let conv = await prisma.conversation.findUnique({
      where: { pairKey: key },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, image: true, role: true } } },
        },
      },
    });

    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          pairKey: key,
          participants: {
            create: [{ userId: req.user!.id }, { userId: other.id }],
          },
        },
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, image: true, role: true } } },
          },
        },
      });
    }

    res.json(conv);
  });

  router.get("/:id", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const part = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
    });
    if (!part) return res.status(404).json({ error: "Not found" });

    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, image: true, role: true } } },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          include: { sender: { select: { id: true, username: true } } },
        },
      },
    });
    if (!conv) return res.status(404).json({ error: "Not found" });

    await prisma.conversationParticipant.update({
      where: { id: part.id },
      data: { lastReadAt: new Date() },
    });

    res.json(conv);
  });

  router.post("/:id", requireUser, async (req: AuthedRequest, res) => {
    const id = param(req, "id");
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: "Message required" });
    if (body.length > 2000) return res.status(400).json({ error: "Message too long" });

    const part = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
    });
    if (!part) return res.status(404).json({ error: "Not found" });

    const msg = await prisma.directMessage.create({
      data: {
        conversationId: id,
        senderId: req.user!.id,
        body,
      },
      include: { sender: { select: { id: true, username: true } } },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    await prisma.conversationParticipant.update({
      where: { id: part.id },
      data: { lastReadAt: new Date() },
    });

    // Attach peer ids for socket fan-out (set by index if available)
    const peers = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });

    res.status(201).json({
      message: msg,
      peerIds: peers.map((p) => p.userId),
    });
  });

  return router;
}
