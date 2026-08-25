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
