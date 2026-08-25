const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const preciseFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US");

/** 12,900 -> "12.9K". Used for large headline figures (weight, rawTotal). */
export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

/** 12900.5 -> "12,900.5". Used where every digit matters (tooltips, exact values). */
export function formatPrecise(value: number): string {
  return preciseFormatter.format(value);
}

/** 100 -> "100". Used for small whole counts (contributors). */
export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

/** The core "story" number: how much a target's weight exceeds its raw dollar total. */
export function consensusMultiplier(weight: number, rawTotal: number): number {
  if (rawTotal === 0) return 0;
  return weight / rawTotal;
}

/** 2048 -> "2.0 KB". Used for request/response payload sizes in the console. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 12.4 -> "12 ms", 1240 -> "1.24 s". Latency reads better without false precision. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Signed relative change between two weights, e.g. +18.4% — null when there is no baseline. */
export function percentDelta(next: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((next - previous) / previous) * 100;
}
