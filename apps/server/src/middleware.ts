import type { Request, Response, NextFunction } from "express";
import { prisma } from "@chess/db";
import { ROLE_RANK, type Role } from "@chess/shared";

export type AuthedRequest = Request & {
  user?: {
    id: string;
    username: string;
    role: Role;
    vipExpiresAt: Date | null;
  };
};

export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = String(req.headers["x-user-id"] || "");
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.banned) return res.status(401).json({ error: "Unauthorized" });
  req.user = {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    vipExpiresAt: user.vipExpiresAt,
  };
  next();
}

export function requireRank(min: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[min]) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
