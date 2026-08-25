import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { allocationsRequestSchema, type AllocationInput } from "@/lib/validation";
import { ValidationError, validationErrorFromZod } from "@/lib/errors";
import { getTargetWeights } from "@/lib/getTargetWeights";
import { clientKeyFromRequest, isRateLimited } from "@/lib/rateLimit";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function validationErrorResponse(error: ValidationError): Response {
  return Response.json(
    { error: "ValidationError", message: error.message, details: error.details },
    { status: 400 },
  );
}

function internalErrorResponse(): Response {
  return Response.json({ error: "InternalError", message: "Something went wrong" }, { status: 500 });
}

/**
 * Persists allocations, guarded by an optional client-supplied idempotency key.
 *
 * Without a key: plain insert (unchanged behavior).
 * With a key: the insert and a ProcessedRequest record for that key happen in one
 * transaction. A retry with the same key hits ProcessedRequest's unique constraint, the
 * whole transaction rolls back (so the allocations are NOT re-inserted), and that specific
 * error is treated as "already processed" rather than a failure — a network retry after an
 * uncertain response can't double-count the same batch.
 */
async function persistAllocations(data: AllocationInput[], idempotencyKey: string | null): Promise<void> {
  if (data.length === 0) return;

  const rows = data.map((a) => ({ userId: a.userId, targetId: a.targetId, amount: a.amount }));

  if (!idempotencyKey) {
    await prisma.allocation.createMany({ data: rows });
    return;
  }

  try {
    await prisma.$transaction([
      prisma.processedRequest.create({ data: { idempotencyKey } }),
      prisma.allocation.createMany({ data: rows }),
    ]);
  } catch (error) {
    const isDuplicateKey =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
    if (!isDuplicateKey) throw error;
  }
}

/** Recomputes weights from every allocation ever persisted — always fresh, never cached. */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await getTargetWeights());
  } catch {
    return internalErrorResponse();
  }
}

/**
 * Persists the submitted allocations, then returns weights for the full accumulated dataset.
 * An `Idempotency-Key` request header makes retries of the same request safe — see
 * `persistAllocations` above. The header is optional; omitting it preserves prior behavior.
 */
export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(clientKeyFromRequest(request))) {
    return Response.json({ error: "TooManyRequests", message: "Rate limit exceeded" }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return validationErrorResponse(new ValidationError("Request body must be valid JSON"));
  }

  const parsed = allocationsRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(validationErrorFromZod(parsed.error, rawBody));
  }

  try {
    await persistAllocations(parsed.data, request.headers.get("idempotency-key"));
    return Response.json(await getTargetWeights());
  } catch {
    return internalErrorResponse();
  }
}
