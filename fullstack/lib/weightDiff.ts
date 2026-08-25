import type { TargetWeight } from "@/domain/types";

export interface WeightDelta {
  targetId: string;
  /** null when the target did not exist before this call. */
  before: number | null;
  after: number;
  change: number;
}

/**
 * What one call actually did to the ranking. The response body alone can't show
 * this  -  it's the full recomputed leaderboard either way  -  so the console keeps
 * the previous body and diffs it, which is the only way a POST's effect (as
 * opposed to its result) is visible.
 */
export function diffWeights(before: TargetWeight[], after: TargetWeight[]): WeightDelta[] {
  const previous = new Map(before.map((w) => [w.targetId, w.weight]));

  return after
    .map((w) => {
      const priorWeight = previous.get(w.targetId) ?? null;
      return {
        targetId: w.targetId,
        before: priorWeight,
        after: w.weight,
        change: w.weight - (priorWeight ?? 0),
      };
    })
    .filter((delta) => delta.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** Reads a weights array out of a response body, or null when the body isn't one. */
export function weightsFromBody(body: unknown): TargetWeight[] | null {
  if (!Array.isArray(body)) return null;
  const looksRight = body.every(
    (item) => item && typeof item === "object" && "targetId" in item && "weight" in item,
  );
  return looksRight ? (body as TargetWeight[]) : null;
}
