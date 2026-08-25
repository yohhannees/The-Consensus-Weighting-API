import { describe, expect, it } from "vitest";
import { computeWeights } from "../../domain/computeWeights";
import type { Allocation } from "../../domain/types";
import { MAX_ALLOCATIONS, MAX_AMOUNT } from "../../lib/validation";

const concentratedAllocations: Allocation[] = [{ userId: "user_1", targetId: "A", amount: 10_000 }];

const distributedAllocations: Allocation[] = Array.from({ length: 100 }, (_, i) => ({
  userId: `user_${i}`,
  targetId: "B",
  amount: 100,
}));

describe("consensus dampening (graded core)", () => {
  it("Test A — concentrated: 1 user, $10,000 to target A", () => {
    const [result] = computeWeights(concentratedAllocations);
    expect(result).toEqual({ targetId: "A", rawTotal: 10_000, uniqueUserCount: 1, weight: 10_000 });
  });

  it("Test B — distributed: 100 users, $100 each, to target B", () => {
    const [result] = computeWeights(distributedAllocations);
    expect(result).toEqual({ targetId: "B", rawTotal: 10_000, uniqueUserCount: 100, weight: 1_000_000 });
  });

  it("distributed weight is at least 2x concentrated weight for equal raw totals (spec requirement)", () => {
    const [weightA] = computeWeights(concentratedAllocations);
    const [weightB] = computeWeights(distributedAllocations);

    expect(weightA!.rawTotal).toBe(weightB!.rawTotal);
    expect(weightB!.weight).toBeGreaterThanOrEqual(weightA!.weight * 2);
    expect(weightB!.weight).toBe(weightA!.weight * 100);
  });

  it("ranks targets descending by weight", () => {
    const results = computeWeights([...concentratedAllocations, ...distributedAllocations]);
    expect(results.map((r) => r.targetId)).toEqual(["B", "A"]);
  });
});

describe("edge cases", () => {
  it("sums multiple allocations from the same user to the same target before dampening", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: "user_1", targetId: "A", amount: 50 },
    ]);
    expect(result).toEqual({ targetId: "A", rawTotal: 100, uniqueUserCount: 1, weight: 100 });
  });

  it("treats the same user's allocations to different targets independently", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "A", amount: 100 },
      { userId: "user_1", targetId: "B", amount: 200 },
    ]);
    expect(results.find((r) => r.targetId === "A")?.uniqueUserCount).toBe(1);
    expect(results.find((r) => r.targetId === "B")?.uniqueUserCount).toBe(1);
  });

  it("drops zero-amount allocations", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "A", amount: 0 },
      { userId: "user_2", targetId: "B", amount: 100 },
    ]);
    expect(results.find((r) => r.targetId === "A")).toBeUndefined();
  });

  it("trims whitespace around userId, merging it with an untrimmed duplicate", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: " user_1 ", targetId: "A", amount: 50 },
    ]);
    expect(result?.uniqueUserCount).toBe(1);
    expect(result?.weight).toBe(100);
  });

  it("trims whitespace around targetId too, merging it with an untrimmed duplicate (symmetry with userId)", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: "user_2", targetId: " A ", amount: 50 },
    ]);
    expect(results).toEqual([{ targetId: "A", rawTotal: 100, uniqueUserCount: 2, weight: 200 }]);
  });

  it("returns an empty array for empty input", () => {
    expect(computeWeights([])).toEqual([]);
  });

  it("handles very large amounts without precision loss", () => {
    const [result] = computeWeights([{ userId: "whale", targetId: "A", amount: 1e12 }]);
    expect(result?.rawTotal).toBe(1e12);
    expect(result?.weight).toBe(1e12);
  });

  it("rounds a sum of classic floating-point-imprecise decimals (0.1 + 0.2) to 0.3, not 0.30000000000000004", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 0.1 },
      { userId: "user_2", targetId: "A", amount: 0.2 },
    ]);
    expect(result?.rawTotal).toBe(0.3);
  });

  it("breaks a weight tie deterministically by targetId ascending, not insertion order", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "Z", amount: 100 },
      { userId: "user_2", targetId: "A", amount: 100 },
    ]);
    expect(results.map((r) => r.targetId)).toEqual(["A", "Z"]);
  });

  it("stays finite for a request at both the maximum row count and the maximum per-row amount at once", () => {
    const allocations: Allocation[] = Array.from({ length: MAX_ALLOCATIONS }, (_, i) => ({
      userId: `user_${i}`,
      targetId: "A",
      amount: MAX_AMOUNT,
    }));
    const [result] = computeWeights(allocations);
    expect(Number.isFinite(result!.rawTotal)).toBe(true);
    expect(Number.isFinite(result!.weight)).toBe(true);
  });

  it("trims Unicode whitespace (no-break space, ideographic space) around userId, not just ASCII spaces", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: " user_1　", targetId: "A", amount: 50 },
    ]);
    expect(result).toEqual({ targetId: "A", rawTotal: 100, uniqueUserCount: 1, weight: 100 });
  });

  it("treats non-Latin-script and emoji userIds as ordinary opaque identifiers, not special-cased", () => {
    const results = computeWeights([
      { userId: "用户_1", targetId: "A", amount: 50 },
      { userId: "🙂user_2", targetId: "A", amount: 50 },
    ]);
    expect(results).toEqual([{ targetId: "A", rawTotal: 100, uniqueUserCount: 2, weight: 200 }]);
  });
});
