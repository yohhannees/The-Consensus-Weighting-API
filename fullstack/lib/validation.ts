import { z } from "zod";

export const allocationSchema = z.object({
  userId: z.string({ error: "userId is required and must be a string" }).trim().min(1, "userId must not be empty"),
  targetId: z
    .string({ error: "targetId is required and must be a string" })
    .trim()
    .min(1, "targetId must not be empty"),
  amount: z
    .number({ error: "amount is required and must be a number" })
    .finite("amount must be a finite number")
    .nonnegative("amount must be a non-negative number"),
});

export const allocationsRequestSchema = z.array(allocationSchema);

export type AllocationInput = z.infer<typeof allocationSchema>;
