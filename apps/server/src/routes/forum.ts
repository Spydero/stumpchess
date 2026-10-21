import { Router } from "express";
import { prisma } from "@chess/db";
import { canModerateForum } from "@chess/shared";
import { requireUser, type AuthedRequest } from "../middleware";
import { param } from "../params";

export function createForumRouter() {
  const router = Router();

  router.get("/categories", async (_req, res) => {
    try {
      const categories = await prisma.forumCategory.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { threads: true } },
        },
      });
      res.json(categories);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load categories" });
    }
  });

  router.get("/categories/:slug/threads", async (req, res) => {
    const category = await prisma.forumCategory.findUnique({ where: { slug: param(req, "slug") } });
    if (!category) return res.status(404).json({ error: "Not found" });
    const threads = await prisma.forumThread.findMany({
      where: { categoryId: category.id },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: {
        author: { select: { id: true, username: true, role: true, image: true } },
        _count: { select: { posts: true } },
      },
      take: 50,
    });
    res.json({ category, threads });
  });

  router.get("/threads/:id", async (req, res) => {
    const thread = await prisma.forumThread.findUnique({
      where: { id: param(req, "id") },
      include: {
        category: true,
        author: { select: { id: true, username: true, role: true, image: true } },
        posts: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, username: true, role: true, image: true } },
          },
        },
      },
    });
    if (!thread) return res.status(404).json({ error: "Not found" });
    res.json(thread);
  });

  router.post("/categories/:slug/threads", requireUser, async (req: AuthedRequest, res) => {
    const { title, body } = req.body as { title?: string; body?: string };
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: "Title and body required" });
    const category = await prisma.forumCategory.findUnique({ where: { slug: param(req, "slug") } });
    if (!category) return res.status(404).json({ error: "Not found" });

    const thread = await prisma.forumThread.create({
      data: {
        title: title.trim().slice(0, 120),
        categoryId: category.id,
        authorId: req.user!.id,
        posts: {
          create: {
            body: body.trim().slice(0, 10000),
            authorId: req.user!.id,
          },
        },
      },
    });
    res.status(201).json(thread);
  });

  router.post("/threads/:id/posts", requireUser, async (req: AuthedRequest, res) => {
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return res.status(400).json({ error: "Body required" });
    const thread = await prisma.forumThread.findUnique({ where: { id: param(req, "id") } });
    if (!thread) return res.status(404).json({ error: "Not found" });
    if (thread.locked) return res.status(403).json({ error: "Thread locked" });

    const post = await prisma.forumPost.create({
      data: {
        body: body.trim().slice(0, 10000),
        threadId: thread.id,
        authorId: req.user!.id,
      },
    });
    await prisma.forumThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    res.status(201).json(post);
  });

  router.delete("/posts/:id", requireUser, async (req: AuthedRequest, res) => {
    const post = await prisma.forumPost.findUnique({ where: { id: param(req, "id") } });
    if (!post) return res.status(404).json({ error: "Not found" });
    const isAuthor = post.authorId === req.user!.id;
    if (!isAuthor && !canModerateForum(req.user!.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await prisma.forumPost.delete({ where: { id: post.id } });
    res.json({ ok: true });
  });

  router.post("/threads/:id/lock", requireUser, async (req: AuthedRequest, res) => {
    if (!canModerateForum(req.user!.role)) return res.status(403).json({ error: "Forbidden" });
    const thread = await prisma.forumThread.update({
      where: { id: param(req, "id") },
      data: { locked: true },
    });
    res.json(thread);
  });

  return router;
}
