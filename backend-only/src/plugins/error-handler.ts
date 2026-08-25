import type { FastifyInstance } from "fastify";
import { ValidationError } from "../lib/errors.js";

/** Centralizes the 400/500 response shapes from plan/03-api-contract.md across every route. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      reply.code(400).send({
        error: "ValidationError",
        message: error.message,
        details: error.details,
      });
      return;
    }

    app.log.error(error);
    reply.code(500).send({
      error: "InternalError",
      message: "Something went wrong",
    });
  });
}
