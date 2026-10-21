import { roleColor, roleLabel } from "@/lib/roles";

export function RoleBadge({ role }: { role: string }) {
  const color = roleColor(role);
  const label =
    role === "OWNER"
      ? "Owner"
      : role === "STA"
        ? "STA"
        : role === "LTA"
          ? "LTA"
          : role === "VIP_30"
            ? "VIP 30d"
            : role === "VIP_PERM"
              ? "VIP"
              : roleLabel(role);
  return (
    <span className="badge" style={{ color }} title={roleLabel(role)}>
      {label}
    </span>
  );
}
