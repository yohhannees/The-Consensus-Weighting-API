import type { FastifyInstance } from "fastify";
import { ValidationError } from "../lib/errors.js";

const CLIENT_ERROR_NAMES: Record<number, string> = {
  400: "BadRequest",
  404: "NotFound",
  413: "PayloadTooLarge",
  415: "UnsupportedMediaType",
  429: "TooManyRequests",
};

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

    // Fastify and its plugins attach a statusCode to errors they raise themselves
    // (malformed JSON body → 400, unsupported content-type → 415, rate limit → 429).
    // Those are the client's fault, not ours  -  pass them through in the contract's
    // { error, message } shape instead of masking them as a 500 (which would both
    // misreport client errors as server faults and strip the rate limiter's
    // back-off signal).
    const { statusCode, message } = error as { statusCode?: unknown; message?: unknown };
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({
        error: CLIENT_ERROR_NAMES[statusCode] ?? "BadRequest",
        message: typeof message === "string" ? message : "Bad request",
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
