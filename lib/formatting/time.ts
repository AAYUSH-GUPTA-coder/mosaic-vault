/** Relative time without floats on money: plain integer seconds in, plain words out. */
export function relativeTime(unixSeconds: number | bigint | null | undefined, now = Date.now()): string {
  if (unixSeconds === null || unixSeconds === undefined) return "--";
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const diff = Math.max(0, Math.floor(now / 1000) - ts);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

export function isStale(unixSeconds: number | bigint | null | undefined, maxAgeSeconds: number, now = Date.now()): boolean {
  if (unixSeconds === null || unixSeconds === undefined) return true;
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Math.floor(now / 1000) - ts > maxAgeSeconds;
}

export function formatDateTime(unixSeconds: number | bigint | null | undefined): string {
  if (unixSeconds === null || unixSeconds === undefined) return "--";
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  return new Date(ts * 1000).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
