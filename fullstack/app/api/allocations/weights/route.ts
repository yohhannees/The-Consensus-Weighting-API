import { prisma } from "@/lib/prisma";
import { allocationsRequestSchema } from "@/lib/validation";
import { ValidationError, validationErrorFromZod } from "@/lib/errors";
import { getTargetWeights } from "@/lib/getTargetWeights";
import { clientKeyFromRequest, isRateLimited } from "@/lib/rateLimit";

function validationErrorResponse(error: ValidationError): Response {
  return Response.json(
    { error: "ValidationError", message: error.message, details: error.details },
    { status: 400 },
  );
}

/** Recomputes weights from every allocation ever persisted — always fresh, never cached. */
export async function GET(): Promise<Response> {
  return Response.json(await getTargetWeights());
}

/** Persists the submitted allocations, then returns weights for the full accumulated dataset. */
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

  if (parsed.data.length > 0) {
    await prisma.allocation.createMany({
      data: parsed.data.map((a) => ({ userId: a.userId, targetId: a.targetId, amount: a.amount })),
    });
  }

  return Response.json(await getTargetWeights());
}
