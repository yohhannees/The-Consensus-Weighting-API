import { describe, expect, it } from "vitest";
import { computeWeights } from "../../src/domain/computeWeights.js";
import { concentratedAllocations, distributedAllocations } from "../fixtures/concentrated-vs-distributed.js";

describe("consensus dampening (graded core)", () => {
  it("Test A — concentrated: 1 user, $10,000 to target A", () => {
    const [result] = computeWeights(concentratedAllocations);
    expect(result).toEqual({
      targetId: "A",
      rawTotal: 10_000,
      uniqueUserCount: 1,
      weight: 10_000, // sqrt(10000)^2
    });
  });

  it("Test B — distributed: 100 users, $100 each, to target B", () => {
    const [result] = computeWeights(distributedAllocations);
    expect(result).toEqual({
      targetId: "B",
      rawTotal: 10_000,
      uniqueUserCount: 100,
      weight: 1_000_000, // (100 * sqrt(100))^2
    });
  });

  it("distributed weight is at least 2x concentrated weight for equal raw totals (spec requirement)", () => {
    const [weightA] = computeWeights(concentratedAllocations);
    const [weightB] = computeWeights(distributedAllocations);

    expect(weightA!.rawTotal).toBe(weightB!.rawTotal); // same $10,000, so the gap is purely from distribution
    expect(weightB!.weight).toBeGreaterThanOrEqual(weightA!.weight * 2);
    // The formula clears the spec's 2x bar by a wide margin — pin the exact ratio
    // so a future formula change that weakens dampening fails loudly, not silently.
    expect(weightB!.weight).toBe(weightA!.weight * 100);
  });

  it("ranks targets descending by weight", () => {
    const results = computeWeights([...concentratedAllocations, ...distributedAllocations]);
    expect(results.map((r) => r.targetId)).toEqual(["B", "A"]);
  });
});

describe("edge cases", () => {
  it("sums multiple allocations from the same user to the same target before dampening (#1)", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: "user_1", targetId: "A", amount: 50 },
    ]);
    expect(result).toEqual({
      targetId: "A",
      rawTotal: 100,
      uniqueUserCount: 1,
      weight: 100, // sqrt(100)^2, NOT (sqrt(50)+sqrt(50))^2 = 200
    });
  });

  it("treats the same user's allocations to different targets independently (#2)", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "A", amount: 100 },
      { userId: "user_1", targetId: "B", amount: 200 },
    ]);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.targetId === "A")?.uniqueUserCount).toBe(1);
    expect(results.find((r) => r.targetId === "B")?.uniqueUserCount).toBe(1);
  });

  it("drops zero-amount allocations — no rawTotal, no uniqueUserCount contribution (#3)", () => {
    const results = computeWeights([
      { userId: "user_1", targetId: "A", amount: 0 },
      { userId: "user_2", targetId: "B", amount: 100 },
    ]);
    expect(results.find((r) => r.targetId === "A")).toBeUndefined();
    expect(results.find((r) => r.targetId === "B")?.uniqueUserCount).toBe(1);
  });

  it("a target funded only by zero-amount allocations does not appear in the output (#11)", () => {
    const results = computeWeights([{ userId: "user_1", targetId: "A", amount: 0 }]);
    expect(results).toEqual([]);
  });

  it("trims whitespace around userId, merging it with an untrimmed duplicate (#8)", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 50 },
      { userId: " user_1 ", targetId: "A", amount: 50 },
    ]);
    expect(result).toEqual({
      targetId: "A",
      rawTotal: 100,
      uniqueUserCount: 1,
      weight: 100,
    });
  });

  it("returns an empty array for empty input (#7)", () => {
    expect(computeWeights([])).toEqual([]);
  });

  it("handles very large amounts without precision loss (#9)", () => {
    const [result] = computeWeights([{ userId: "whale", targetId: "A", amount: 1e12 }]);
    expect(result?.rawTotal).toBe(1e12);
    expect(result?.weight).toBe(1e12); // sqrt(1e12)^2 == 1e12
  });

  it("rounds weight and rawTotal to 2 decimal places (#10)", () => {
    const [result] = computeWeights([
      { userId: "user_1", targetId: "A", amount: 1 },
      { userId: "user_2", targetId: "A", amount: 2 },
    ]);
    expect(Number.isInteger(result!.weight * 100)).toBe(true);
    expect(Number.isInteger(result!.rawTotal * 100)).toBe(true);
  });
});
