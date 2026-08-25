import type { Allocation } from "../../src/domain/types.js";

/** Test A: 1 user allocates $10,000 to target A. */
export const concentratedAllocations: Allocation[] = [
  { userId: "user_1", targetId: "A", amount: 10_000 },
];

/** Test B: 100 unique users allocate $100 each to target B (same $10,000 raw total). */
export const distributedAllocations: Allocation[] = Array.from({ length: 100 }, (_, i) => ({
  userId: `user_${i}`,
  targetId: "B",
  amount: 100,
}));
