# `backend-only/` — TypeScript + Fastify

Goal: not a minimal single-file demo — a backend that reads like it's meant to run in
production, so the depth of the implementation is itself part of what's being demonstrated.

## Stack

- **Fastify** (routing, lifecycle) — chosen over Express for native TypeScript-first schema
  validation and materially better throughput, which matters for a "make it really better"
  bar.
- **TypeScript**, strict mode.
- **Zod** for request schema validation, shared between runtime validation and inferred
  static types (no hand-duplicated interfaces).
- **@fastify/swagger** + **@fastify/swagger-ui** — self-hosted OpenAPI docs at `/docs`,
  generated from the same Zod schemas.
- **Pino** (Fastify's default logger) — structured request logging.
- **Vitest** for unit + integration tests.
- **ESLint + Prettier**, enforced via a pre-commit hook (`husky` + `lint-staged`) or CI gate.
- **Dockerfile** (multi-stage, distroless/slim final image) + `docker-compose.yml` for local
  run.
- **GitHub Actions** CI: install → lint → typecheck → test → build, on every push.

## Layered structure

```
backend-only/
  src/
    app.ts                 # Fastify instance factory (no .listen() — testable in isolation)
    server.ts               # entrypoint: creates app, calls .listen()
    routes/
      allocations.route.ts  # POST /allocations/weights — thin: parse → call service → respond
    schemas/
      allocation.schema.ts  # Zod request/response schemas + OpenAPI metadata
    domain/
      computeWeights.ts      # the algorithm itself — self-contained, no external deps
    services/
      weighting.service.ts  # calls domain/computeWeights, orchestrates
    plugins/
      error-handler.ts      # centralizes the 400/500 shapes from 03-api-contract.md
      swagger.ts
    lib/
      logger.ts
  test/
    unit/
      computeWeights.test.ts
      weighting.service.test.ts
    integration/
      allocations.route.test.ts   # uses app.inject() — no real HTTP socket needed
    fixtures/
      concentrated-vs-distributed.ts   # the Test A / Test B data, reused across tests
  Dockerfile
  docker-compose.yml
  package.json
  tsconfig.json
  README.md
```

## Why this shape (and not a single `index.ts`)

- **routes vs services vs domain split**: routes only know about HTTP (status codes,
  request/response shape); services orchestrate; `domain/computeWeights.ts` is the pure
  algorithm with zero framework dependencies. This means the weighting logic is testable
  without spinning up Fastify at all (see `computeWeights.test.ts`), and — deliberately —
  this file is self-contained: no import from outside `backend-only/`. This implementation
  and `fullstack/` are fully independent projects; each owns its own copy of this logic
  rather than sharing a package.
- **`app.ts` / `server.ts` split**: `app.ts` builds and returns a Fastify instance without
  binding a port — `test/integration` imports `app.ts` directly and uses `.inject()`, so
  integration tests run in-process with zero network overhead and no port-collision flakiness
  in CI.
- **Centralized error handler plugin**: guarantees every validation failure across every
  route (today just one, but this is the "extended, better backend" bar) produces the exact
  same error shape from [03-api-contract.md](03-api-contract.md), rather than each route
  hand-rolling its own `reply.code(400).send(...)`.

## Extended features (beyond the bare minimum ask)

These are what make this "really better" rather than just compliant:

1. **OpenAPI/Swagger UI at `/docs`** — self-documenting, generated from the same schema used
   for validation (no drift between docs and behavior).
2. **Structured request logging** (Pino) with request IDs — every request traceable.
3. **`/health` endpoint** — for container orchestration readiness/liveness checks.
4. **Rate limiting** (`@fastify/rate-limit`) on the endpoint — a batch-scoring API is a
   plausible abuse target; documented as a deliberate hardening choice, not scope creep.
5. **Idempotent, side-effect-free design** — no persistence in this folder by design (that's
   what `fullstack/` is for); this keeps `backend-only/` a pure, horizontally-scalable
   compute service, which is itself an architectural statement worth making explicit in the
   README.

## Local run (documented fully in `backend-only/README.md` once scaffolded)

```
npm install
npm run dev        # ts-node-dev / tsx watch mode
npm test            # vitest
npm run build && npm start
docker compose up   # containerized run
```
