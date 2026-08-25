import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerSwagger } from "./plugins/swagger.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { allocationsRoutes } from "./routes/allocations.route.js";
import { loggerOptions } from "./lib/logger.js";

/** Builds a Fastify instance without binding a port, so tests can `.inject()` in-process. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions });

  registerErrorHandler(app);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await registerSwagger(app);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(allocationsRoutes);

  return app;
}
