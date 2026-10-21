function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleSlug(role?: string) {
  switch (role) {
    case "VIP_30":
      return "vip30";
    case "VIP_PERM":
      return "vip";
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

export function UserAvatar({
  username,
  image,
  role,
  size = 36,
}: {
  username: string;
  image?: string | null;
  role?: string;
  size?: number;
}) {
  const slug = roleSlug(role);
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className={`user-avatar user-avatar--${slug}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`user-avatar user-avatar--fallback user-avatar--${slug}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      aria-hidden
    >
      {initials(username)}
    </span>
  );
}
