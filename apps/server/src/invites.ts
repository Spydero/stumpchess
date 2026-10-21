export function parseInviteUsernames(raw: unknown): string[] {
  let arr: string[] = [];
  if (Array.isArray(raw)) {
    arr = raw.map(String);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) arr = parsed.map(String);
      else arr = trimmed.split(/[\n,]+/);
    } catch {
      arr = trimmed.split(/[\n,]+/);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of arr) {
    const u = entry.trim().slice(0, 20);
    if (!u) continue;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out.slice(0, 128);
}

export function invitesInclude(invites: string[], username: string) {
  const needle = username.toLowerCase();
  return invites.some((u) => u.toLowerCase() === needle);
}
