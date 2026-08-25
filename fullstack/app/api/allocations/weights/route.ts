import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { allocationsRequestSchema, type AllocationInput } from "@/lib/validation";
import { ValidationError, validationErrorFromZod } from "@/lib/errors";
import { getTargetWeights } from "@/lib/getTargetWeights";
import { clientKeyFromRequest, isRateLimited } from "@/lib/rateLimit";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/** Thrown when an Idempotency-Key is reused with a different payload than it was recorded with. */
class IdempotencyConflictError extends Error {}

function validationErrorResponse(error: ValidationError): Response {
  return Response.json(
    { error: "ValidationError", message: error.message, details: error.details },
    { status: 400 },
  );
}

function internalErrorResponse(): Response {
  return Response.json({ error: "InternalError", message: "Something went wrong" }, { status: 500 });
}

function rateLimitedResponse(): Response {
  return Response.json({ error: "TooManyRequests", message: "Rate limit exceeded" }, { status: 429 });
}

/**
 * Hash of the validated (post-trim, post-parse) rows  -  so a retry that differs only in
 * JSON whitespace or key order still counts as "the same request", while any change to
 * the actual allocations does not.
 */
function hashAllocations(data: AllocationInput[]): string {
  const canonical = JSON.stringify(data.map((a) => [a.userId, a.targetId, a.amount]));
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Persists allocations, guarded by an optional client-supplied idempotency key.
 *
 * Without a key: plain insert (unchanged behavior).
 * With a key: the insert and a ProcessedRequest record for that key happen in one
 * transaction. A retry with the same key hits ProcessedRequest's unique constraint and the
 * whole transaction rolls back (so the allocations are NOT re-inserted). The recorded
 * bodyHash then decides what that collision means: same hash → the retry is "already
 * processed", succeed without re-inserting; different hash → the client reused a key for a
 * different payload, which would otherwise silently discard their data  -  surface it as a
 * 409 IdempotencyConflict instead. (Rows recorded before bodyHash existed have null and
 * are treated as key-only matches.)
 */
async function persistAllocations(data: AllocationInput[], idempotencyKey: string | null): Promise<void> {
  if (data.length === 0) return;

  const rows = data.map((a) => ({ userId: a.userId, targetId: a.targetId, amount: a.amount }));

  if (!idempotencyKey) {
    await prisma.allocation.createMany({ data: rows });
    return;
  }

  const bodyHash = hashAllocations(data);

  try {
    await prisma.$transaction([
      prisma.processedRequest.create({ data: { idempotencyKey, bodyHash } }),
      prisma.allocation.createMany({ data: rows }),
    ]);
  } catch (error) {
    const isDuplicateKey =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
    if (!isDuplicateKey) throw error;

    const existing = await prisma.processedRequest.findUnique({ where: { idempotencyKey } });
    if (existing?.bodyHash != null && existing.bodyHash !== bodyHash) {
      throw new IdempotencyConflictError(
        "Idempotency-Key was already used with a different payload; use a new key for new allocations",
      );
    }
  }
}

/** Recomputes weights from every allocation ever persisted  -  always fresh, never cached. */
export async function GET(request: Request): Promise<Response> {
  // Rate-limited like POST: this read does a full-table load + recompute, so an
  // unauthenticated flood of GETs is at least as expensive as a flood of POSTs.
  if (isRateLimited(clientKeyFromRequest(request))) {
    return rateLimitedResponse();
  }

  try {
    return Response.json(await getTargetWeights());
  } catch {
    return internalErrorResponse();
  }
}

/**
 * Persists the submitted allocations, then returns weights for the full accumulated dataset.
 * An `Idempotency-Key` request header makes retries of the same request safe  -  see
 * `persistAllocations` above. The header is optional; omitting it preserves prior behavior.
 */
export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(clientKeyFromRequest(request))) {
    return rateLimitedResponse();
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
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return Response.json({ error: "IdempotencyConflict", message: error.message }, { status: 409 });
    }
    return internalErrorResponse();
  }
}
