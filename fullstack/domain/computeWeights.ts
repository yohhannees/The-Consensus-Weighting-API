import type { Allocation, TargetWeight } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Own, independent implementation of the same spec as backend-only/src/domain/computeWeights.ts
 * (see plan/02-algorithm-and-edge-cases.md) — no shared package between the two apps.
 *
 * Assumes allocations have already passed boundary validation (finite, non-negative
 * amount; non-empty userId/targetId). Zero-amount allocations are dropped here rather
 * than at validation because zero is well-formed input, just not a contribution.
 */
export function computeWeights(allocations: Allocation[]): TargetWeight[] {
  const perTargetUserTotals = new Map<string, Map<string, number>>();

  for (const { userId, targetId, amount } of allocations) {
    if (amount === 0) continue;

    // Both ids are trimmed at the validation boundary already; trimming both
    // again here (not just userId) keeps direct library callers from getting
    // asymmetric merge semantics between the two grouping keys.
    const trimmedUserId = userId.trim();
    const trimmedTargetId = targetId.trim();
    let userTotals = perTargetUserTotals.get(trimmedTargetId);
    if (!userTotals) {
      userTotals = new Map<string, number>();
      perTargetUserTotals.set(trimmedTargetId, userTotals);
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
