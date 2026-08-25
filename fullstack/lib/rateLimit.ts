const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 100;

const requestTimestampsByKey = new Map<string, number[]>();
let lastSweepAt = 0;

/**
 * Drops keys whose every timestamp has aged out of the window. Without this,
 * the map grows by one entry per distinct client key forever  -  a slow leak,
 * and an unbounded one if clients can mint arbitrary keys (see the
 * x-forwarded-for caveat on clientKeyFromRequest). Runs at most once per
 * window so the sweep itself stays O(keys) amortized, not per-request.
 */
function sweepStaleKeys(now: number): void {
  if (now - lastSweepAt < WINDOW_MS) return;
  lastSweepAt = now;
  for (const [key, timestamps] of requestTimestampsByKey) {
    if (timestamps.every((t) => now - t >= WINDOW_MS)) {
      requestTimestampsByKey.delete(key);
    }
  }
}

/**
 * In-memory sliding-window limiter, same tradeoff as backend-only's
 * @fastify/rate-limit default store: per-process only, not shared across
 * instances. Fine for a single-instance deployment or this demo; a
 * horizontally-scaled deployment needs a shared store (e.g. Redis) instead,
 * since each instance would otherwise track its own independent counter.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  sweepStaleKeys(now);
  const recent = (requestTimestampsByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestTimestampsByKey.set(key, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Derives the limiter key from x-forwarded-for. Two known, accepted caveats
 * for this demo, both requiring deployment-level fixes rather than app code:
 * the header is client-controlled unless a trusted proxy in front of the app
 * overwrites it (so a direct-to-app attacker can rotate keys), and requests
 * that arrive without it share one "unknown" bucket. Behind any standard
 * reverse proxy / platform load balancer (which sets the header), both
 * caveats disappear.
 */
export function clientKeyFromRequest(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
