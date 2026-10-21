import { roleLabel } from "@/lib/roles";

function roleSlug(role: string) {
  switch (role) {
    case "VIP_30":
      return "vip30";
    case "VIP_PERM":
      return "vip";
    case "TOURNAMENT_HOST":
      return "thost";
    case "STA":
      return "sta";
    case "LTA":
      return "lta";
    case "MANAGER":
      return "manager";
    case "OWNER":
      return "owner";
    default:
      return "member";
  }
}

function shortLabel(role: string) {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "STA":
      return "STA";
    case "LTA":
      return "LTA";
    case "MANAGER":
      return "Manager";
    case "VIP_30":
      return "VIP 30d";
    case "VIP_PERM":
      return "VIP";
    case "TOURNAMENT_HOST":
      return "Host";
    default:
      return roleLabel(role);
  }
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`role-badge role-${roleSlug(role)}`} title={roleLabel(role)}>
      {shortLabel(role)}
    </span>
  );
}
