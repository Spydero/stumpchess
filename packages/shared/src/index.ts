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
  { id: "3+0", initialMs: 180_000, incrementMs: 0, label: "3+0" },
  { id: "5+0", initialMs: 300_000, incrementMs: 0, label: "5+0" },
  { id: "10+0", initialMs: 600_000, incrementMs: 0, label: "10+0" },
] as const;

export type TimeControlId = (typeof TIME_CONTROLS)[number]["id"];

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
