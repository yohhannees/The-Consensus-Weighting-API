import type { FastifyInstance } from "fastify";
import { scoreAllocations } from "../services/weighting.service.js";

export async function allocationsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/allocations/weights",
    {
      // Validation is done by Zod in the service layer (so 400s always match the
      // API contract's error shape); this schema exists purely to drive Swagger
      // docs, so Fastify's built-in AJV validator is disabled per-route here.
      validatorCompiler: () => () => true,
      schema: {
        summary: "Compute consensus-weighted scores for a batch of allocations",
        description:
          "Groups allocations by targetId (and by userId within each target), then scores " +
          "each target using quadratic-funding-style dampening: (sum of sqrt(per-user total))^2. " +
          "Broad, distributed support outweighs a single large contribution of the same size.",
        tags: ["allocations"],
        body: {
          type: "array",
          items: {
            type: "object",
            required: ["userId", "targetId", "amount"],
            properties: {
              userId: { type: "string", description: "Opaque identifier for the contributing user" },
              targetId: { type: "string", description: "Opaque identifier for the funded target" },
              amount: { type: "number", description: "Non-negative contribution amount" },
            },
          },
        },
        response: {
          200: {
            type: "array",
            description: "Target weights, ranked descending by weight",
            items: {
              type: "object",
              properties: {
                targetId: { type: "string" },
                rawTotal: { type: "number" },
                uniqueUserCount: { type: "integer" },
                weight: { type: "number" },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer" },
                    field: { type: "string" },
                    value: {}, // any JSON type — the offending raw value, for debugging
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const results = scoreAllocations(request.body);
      reply.code(200).send(results);
    },
  );
}
