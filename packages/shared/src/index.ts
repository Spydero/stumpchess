export type Role =
  | "MEMBER"
  | "VIP_30"
  | "VIP_PERM"
  | "STA"
  | "LTA"
  | "MANAGER"
  | "OWNER";

export const ROLE_RANK: Record<Role, number> = {
  MEMBER: 0,
  VIP_30: 1,
  VIP_PERM: 2,
  STA: 3,
  LTA: 4,
  MANAGER: 5,
  OWNER: 6,
};

export const ROLE_LABEL: Record<Role, string> = {
  MEMBER: "Member",
  VIP_30: "VIP (30 days)",
  VIP_PERM: "VIP (Permanent)",
  STA: "Short Term Admin",
  LTA: "Long Term Admin",
  MANAGER: "Manager",
  OWNER: "Owner",
};

export const ROLE_COLOR: Record<Role, string> = {
  MEMBER: "#6b7280",
  VIP_30: "#ca8a04",
  VIP_PERM: "#a16207",
  STA: "#dc2626",
  LTA: "#2563eb",
  MANAGER: "#7c3aed",
  OWNER: "#111827",
};

export const OWNER_USERNAME = "jOjo";

export const TIME_CONTROLS = [
  { id: "3+0", initialMs: 180_000, incrementMs: 0, label: "3+0", kind: "bullet" as const },
  { id: "5+0", initialMs: 300_000, incrementMs: 0, label: "5+0", kind: "blitz" as const },
  { id: "10+0", initialMs: 600_000, incrementMs: 0, label: "10+0", kind: "rapid" as const },
] as const;

export type TimeControlId = (typeof TIME_CONTROLS)[number]["id"];

/** Stockfish Skill Level → approximate Elo (community-calibrated). */
export const BOT_PRESETS = [
  { skill: 0, elo: 800, label: "Beginner" },
  { skill: 2, elo: 1100, label: "Casual" },
  { skill: 4, elo: 1400, label: "Club" },
  { skill: 6, elo: 1600, label: "Intermediate" },
  { skill: 8, elo: 1800, label: "Advanced" },
  { skill: 10, elo: 2000, label: "Expert" },
  { skill: 12, elo: 2200, label: "Master" },
  { skill: 15, elo: 2500, label: "GM" },
  { skill: 18, elo: 2800, label: "Super-GM" },
  { skill: 20, elo: 3000, label: "Max" },
] as const;

export type BotPreset = (typeof BOT_PRESETS)[number];

export function botPresetBySkill(skill: number): BotPreset {
  const exact = BOT_PRESETS.find((b) => b.skill === skill);
  if (exact) return exact;
  let best: BotPreset = BOT_PRESETS[0];
  for (const b of BOT_PRESETS) {
    if (Math.abs(b.skill - skill) < Math.abs(best.skill - skill)) best = b;
  }
  return best;
}

export function botEloFromSkill(skill: number): number {
  return botPresetBySkill(skill).elo;
}

/** Think time budget (ms) so the bot doesn't reply instantly. */
export function botThinkMs(opts: {
  skill: number;
  initialMs: number;
}): { movetime: number; minDelay: number } {
  const elo = botEloFromSkill(opts.skill);
  const minutes = opts.initialMs / 60_000;
  // Bullet stays snappy; longer controls think more. Stronger bots think longer.
  let base =
    minutes <= 3 ? 450 : minutes <= 5 ? 1100 : minutes <= 10 ? 1800 : 2400;
  const strengthBonus = Math.round(((elo - 800) / 2200) * (minutes <= 3 ? 500 : 1600));
  const movetime = Math.min(8000, Math.max(300, base + strengthBonus));
  // Always wait at least this long so UI feels natural even if engine is fast
  const minDelay = Math.min(movetime, minutes <= 3 ? 400 : minutes <= 5 ? 900 : 1400);
  return { movetime, minDelay };
}

export function hasVipAccess(role: Role, vipExpiresAt: Date | string | null | undefined): boolean {
  if (role === "VIP_PERM" || ROLE_RANK[role] >= ROLE_RANK.LTA) return true;
  if (role === "VIP_30" && vipExpiresAt) {
    return new Date(vipExpiresAt).getTime() > Date.now();
  }
  return false;
}

export function canAssignRoles(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.LTA;
}

export function canModerateForum(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.STA;
}

export function canManageSite(actor: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.MANAGER;
}

export function isStaff(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.STA;
}

export type MovePayload = {
  gameId: string;
  from: string;
  to: string;
  promotion?: string;
  san: string;
  fen: string;
  movedAt: number;
  whiteTimeMs: number;
  blackTimeMs: number;
};

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
