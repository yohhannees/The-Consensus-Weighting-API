import { z } from "zod";

// Bounds the per-allocation amount and the request length so a sum of many
// large finite amounts can't approach IEEE-754 precision loss / Infinity when
// aggregated, and so a request can't force unbounded server-side memory use
// or an unbounded batch insert. MAX_AMOUNT mirrors backend-only's bound.
export const MAX_AMOUNT = 1e12;
export const MAX_ALLOCATIONS = 10_000;

export const allocationSchema = z.object({
  userId: z.string({ error: "userId is required and must be a string" }).trim().min(1, "userId must not be empty"),
  targetId: z
    .string({ error: "targetId is required and must be a string" })
    .trim()
    .min(1, "targetId must not be empty"),
  amount: z
    .number({ error: "amount is required and must be a number" })
    .finite("amount must be a finite number")
    .nonnegative("amount must be a non-negative number")
    .max(MAX_AMOUNT, `amount must not exceed ${MAX_AMOUNT}`),
});

export const allocationsRequestSchema = z
  .array(allocationSchema)
  .max(MAX_ALLOCATIONS, `request must not contain more than ${MAX_ALLOCATIONS} allocations`);

export type AllocationInput = z.infer<typeof allocationSchema>;
