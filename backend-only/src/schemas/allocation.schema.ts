import { z } from "zod";

// Bounds the per-allocation amount and the request length so a sum of many
// large finite amounts can't approach IEEE-754 precision loss / Infinity when
// aggregated, and so a request can't force unbounded server-side memory use.
// MAX_AMOUNT matches the "very large amount" precision test's boundary (1e12).
export const MAX_AMOUNT = 1e12;
export const MAX_ALLOCATIONS = 10_000;

export const allocationSchema = z.object({
  userId: z
    .string({ required_error: "userId is required" })
    .trim()
    .min(1, "userId must not be empty"),
  targetId: z
    .string({ required_error: "targetId is required" })
    .trim()
    .min(1, "targetId must not be empty"),
  amount: z
    .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
    .finite("amount must be a finite number")
    .nonnegative("amount must be a non-negative number")
    .max(MAX_AMOUNT, `amount must not exceed ${MAX_AMOUNT}`),
});

export const allocationsRequestSchema = z
  .array(allocationSchema)
  .max(MAX_ALLOCATIONS, `request must not contain more than ${MAX_ALLOCATIONS} allocations`);

export const targetWeightSchema = z.object({
  targetId: z.string(),
  rawTotal: z.number(),
  uniqueUserCount: z.number().int(),
  weight: z.number(),
});

export const weightsResponseSchema = z.array(targetWeightSchema);

export type AllocationInput = z.infer<typeof allocationSchema>;
