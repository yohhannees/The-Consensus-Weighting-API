import type { ZodError } from "zod";

export interface ValidationErrorDetail {
  index: number;
  field: string;
  value: unknown;
}

export class ValidationError extends Error {
  details: ValidationErrorDetail[];

  constructor(message: string, details: ValidationErrorDetail[] = []) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

/**
 * The Zod schema validates the whole array in one pass, so a single bad row still
 * needs its own {index, field, value} pulled back out of the raw body  -  Zod's
 * issue.path carries the index and field, but not a copy of the offending value.
 */
export function validationErrorFromZod(error: ZodError, rawBody: unknown): ValidationError {
  if (!Array.isArray(rawBody)) {
    return new ValidationError("Request body must be an array of allocations");
  }

  if (error.issues.length === 0) {
    return new ValidationError("Request validation failed");
  }

  const details: ValidationErrorDetail[] = error.issues.map((issue) => {
    const index = typeof issue.path[0] === "number" ? issue.path[0] : -1;
    const field = typeof issue.path[1] === "string" ? issue.path[1] : "(unknown)";
    const item = index >= 0 ? (rawBody[index] as Record<string, unknown> | undefined) : undefined;
    const value = item && field in item ? item[field] : undefined;
    return { index, field, value };
  });

  return new ValidationError(error.issues[0]!.message, details);
}
