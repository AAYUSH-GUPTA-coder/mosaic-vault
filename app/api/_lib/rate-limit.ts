/** In-memory token bucket per key (IP). Per-instance only; fine for lightly guarding auth routes. */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  capacity: number;
  /** Tokens refilled per millisecond. */
  refillPerMs: number;
}

export const AUTH_RATE_LIMIT: RateLimitOptions = { capacity: 20, refillPerMs: 20 / 60_000 };

export function consumeToken(key: string, opts: RateLimitOptions, now: number = Date.now()): boolean {
  if (buckets.size > 10_000) buckets.clear();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
  const refilled = Math.min(opts.capacity, b.tokens + (now - b.updatedAt) * opts.refillPerMs);
  const allowed = refilled >= 1;
  buckets.set(key, { tokens: allowed ? refilled - 1 : refilled, updatedAt: now });
  return allowed;
}

export function resetRateLimits(): void {
  buckets.clear();
}
