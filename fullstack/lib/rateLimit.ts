const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 100;

const requestTimestampsByKey = new Map<string, number[]>();

/**
 * In-memory sliding-window limiter, same tradeoff as backend-only's
 * @fastify/rate-limit default store: per-process only, not shared across
 * instances. Fine for a single-instance deployment or this demo; a
 * horizontally-scaled deployment needs a shared store (e.g. Redis) instead,
 * since each instance would otherwise track its own independent counter.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestTimestampsByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestTimestampsByKey.set(key, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

export function clientKeyFromRequest(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
