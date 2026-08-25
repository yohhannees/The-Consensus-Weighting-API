import type { Allocation, TargetWeight } from "./types.js";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Assumes allocations have already passed boundary validation (finite,
 * non-negative amount; non-empty userId/targetId) — see schemas/allocation.schema.ts.
 * Zero-amount allocations are dropped here rather than at validation because
 * zero is well-formed input, just not a contribution (see plan edge case #3).
 */
export function computeWeights(allocations: Allocation[]): TargetWeight[] {
  const perTargetUserTotals = new Map<string, Map<string, number>>();

  for (const { userId, targetId, amount } of allocations) {
    if (amount === 0) continue;

    const trimmedUserId = userId.trim();
    let userTotals = perTargetUserTotals.get(targetId);
    if (!userTotals) {
      userTotals = new Map<string, number>();
      perTargetUserTotals.set(targetId, userTotals);
    }
    userTotals.set(trimmedUserId, (userTotals.get(trimmedUserId) ?? 0) + amount);
  }

  const results: TargetWeight[] = [];

  for (const [targetId, userTotals] of perTargetUserTotals) {
    let rawTotal = 0;
    let sumOfSqrts = 0;

    for (const userTotal of userTotals.values()) {
      rawTotal += userTotal;
      sumOfSqrts += Math.sqrt(userTotal);
    }

    results.push({
      targetId,
      rawTotal: round2(rawTotal),
      uniqueUserCount: userTotals.size,
      weight: round2(sumOfSqrts * sumOfSqrts),
    });
  }

  // Secondary key (targetId ascending) makes the ordering deterministic when two
  // targets tie on weight, instead of leaving it to sort stability over insertion order.
  results.sort((a, b) => b.weight - a.weight || a.targetId.localeCompare(b.targetId));
  return results;
}
