import { z } from "zod";

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
    .nonnegative("amount must be a non-negative number"),
});

export const allocationsRequestSchema = z.array(allocationSchema);

export const targetWeightSchema = z.object({
  targetId: z.string(),
  rawTotal: z.number(),
  uniqueUserCount: z.number().int(),
  weight: z.number(),
});

export const weightsResponseSchema = z.array(targetWeightSchema);

export type AllocationInput = z.infer<typeof allocationSchema>;
