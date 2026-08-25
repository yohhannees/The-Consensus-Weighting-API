import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Consensus Weighting API",
        description:
          "Scores each target from raw allocations using quadratic-funding-style dampening, " +
          "so broad, distributed support outweighs a single large contribution of equal size.",
        version: "1.0.0",
      },
      tags: [{ name: "allocations", description: "Allocation scoring" }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });
}
