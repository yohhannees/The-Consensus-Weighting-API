import { computeWeights } from "../domain/computeWeights.js";
import type { TargetWeight } from "../domain/types.js";
import { allocationsRequestSchema } from "../schemas/allocation.schema.js";
import { validationErrorFromZod } from "../lib/errors.js";

/** Parses + validates the raw request body, then delegates to the pure domain algorithm. */
export function scoreAllocations(rawBody: unknown): TargetWeight[] {
  const parsed = allocationsRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw validationErrorFromZod(parsed.error, rawBody);
  }

  return computeWeights(parsed.data);
}
