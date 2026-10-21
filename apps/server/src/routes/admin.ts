import { Router } from "express";
import { prisma, Role } from "@chess/db";
import { ROLE_RANK, canAssignRoles, type Role as SharedRole } from "@chess/shared";
import { requireUser, requireRank, type AuthedRequest } from "../middleware";

const ASSIGNABLE: SharedRole[] = ["MEMBER", "VIP_30", "VIP_PERM", "STA", "LTA", "MANAGER"];

export function createAdminRouter() {
  const router = Router();

  router.use(requireUser);

  router.get("/users", requireRank("STA"), async (req: AuthedRequest, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        vipExpiresAt: true,
        staExpiresAt: true,
        banned: true,
        createdAt: true,
      },
    });
    // Hide owner email from non-owner
    const scrubbed = users.map((u) => {
      if (u.role === "OWNER" && req.user!.role !== "OWNER") {
        return { ...u, email: "[hidden]", createdAt: null };
      }
      return u;
    });
    res.json(scrubbed);
  });

  router.post("/roles", requireRank("LTA"), async (req: AuthedRequest, res) => {
    const { username, role } = req.body as { username?: string; role?: SharedRole };
    if (!username || !role || !ASSIGNABLE.includes(role)) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (!canAssignRoles(req.user!.role)) return res.status(403).json({ error: "Forbidden" });

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "OWNER") return res.status(403).json({ error: "Cannot modify Owner" });

    const actorRank = ROLE_RANK[req.user!.role];
    const targetRank = ROLE_RANK[target.role as SharedRole];
    const newRank = ROLE_RANK[role];

    // LTA cannot assign Manager or touch equal/higher
    if (req.user!.role === "LTA" && (role === "MANAGER" || newRank >= ROLE_RANK.LTA)) {
      return res.status(403).json({ error: "LTA cannot assign this role" });
    }
    if (targetRank >= actorRank && req.user!.role !== "OWNER") {
      return res.status(403).json({ error: "Cannot modify equal or higher role" });
    }
    if (newRank >= actorRank && req.user!.role !== "OWNER") {
      return res.status(403).json({ error: "Cannot assign equal or higher role" });
    }

    const data: {
      role: Role;
      vipExpiresAt?: Date | null;
      staExpiresAt?: Date | null;
    } = { role: role as Role };

    if (role === "VIP_30") {
      data.vipExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      data.staExpiresAt = null;
    } else if (role === "VIP_PERM") {
      data.vipExpiresAt = null;
      data.staExpiresAt = null;
    } else if (role === "STA") {
      data.staExpiresAt = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
      data.vipExpiresAt = null;
    } else {
      data.vipExpiresAt = null;
      data.staExpiresAt = null;
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data,
    });

    await prisma.roleChangeLog.create({
      data: {
        targetId: target.id,
        actorId: req.user!.id,
        fromRole: target.role,
        toRole: role as Role,
      },
    });

    res.json(updated);
  });

  router.post("/ban", requireRank("MANAGER"), async (req: AuthedRequest, res) => {
    const { username, banned } = req.body as { username?: string; banned?: boolean };
    if (!username) return res.status(400).json({ error: "username required" });
    const target = await prisma.user.findUnique({ where: { username } });
    if (!target || target.role === "OWNER") return res.status(403).json({ error: "Forbidden" });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { banned: Boolean(banned) },
    });
    res.json(updated);
  });

  router.post("/registration", requireRank("MANAGER"), async (req: AuthedRequest, res) => {
    const { open, inviteCode } = req.body as { open?: boolean; inviteCode?: string | null };
    const setting = await prisma.siteSetting.upsert({
      where: { id: "site" },
      update: {
        registrationOpen: open ?? true,
        inviteCode: inviteCode === undefined ? undefined : inviteCode,
      },
      create: {
        id: "site",
        registrationOpen: open ?? true,
        inviteCode: inviteCode ?? null,
      },
    });
    res.json(setting);
  });

  return router;
}
