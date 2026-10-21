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

export function RoleBadge({ role }: { role: string }) {
  const label = roleLabel(role);
  return (
    <span className={`role-badge role-${roleSlug(role)}`} title={label}>
      {label}
    </span>
  );
}
