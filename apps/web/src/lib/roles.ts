import { hasVipAccess, ROLE_COLOR, ROLE_LABEL, type Role } from "@chess/shared";

export function roleLabel(role: string) {
  return ROLE_LABEL[role as Role] ?? role;
}

export function roleColor(role: string) {
  return ROLE_COLOR[role as Role] ?? "#6b7280";
}

export function userHasVip(role: string, vipExpiresAt?: string | Date | null) {
  return hasVipAccess(role as Role, vipExpiresAt);
}
