export function formatRelativeTime(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(ms / minute), "minute");
  if (abs < day) return rtf.format(Math.round(ms / hour), "hour");
  if (abs < week) return rtf.format(Math.round(ms / day), "day");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
