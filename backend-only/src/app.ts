import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerSwagger } from "./plugins/swagger.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { allocationsRoutes } from "./routes/allocations.route.js";
import { loggerOptions } from "./lib/logger.js";

export interface BuildAppOptions {
  /** Requests per minute allowed on the scoring endpoint. Overridable so tests can exhaust it cheaply. */
  rateLimitMax?: number;
}

/** Builds a Fastify instance without binding a port, so tests can `.inject()` in-process. */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions });

  registerErrorHandler(app);

  // global: false  -  the limit protects the (comparatively expensive) scoring
  // endpoint, applied per-route in allocations.route.ts. /health must stay
  // exempt so infrastructure probes can't be starved out (or themselves starve
  // real traffic), and /docs serves several static assets per page load that
  // would otherwise eat the budget.
  await app.register(rateLimit, { global: false });

  await registerSwagger(app);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(allocationsRoutes, { rateLimitMax: options.rateLimitMax ?? 100 });

  return app;
}
