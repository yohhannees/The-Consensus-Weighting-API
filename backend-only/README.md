# Consensus Weighting API — Backend Only

A standalone TypeScript + Fastify backend implementing the Consensus Weighting API: a single
endpoint that scores allocations per target using a dampening formula so that broad,
distributed support outweighs a single large contribution of the same size.

Full design rationale (why this formula, the edge-case catalog, the API contract) lives in
[../plan/](../plan/) — start with
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md) if you want
the math derivation.

## Run it

```bash
npm install
npm run dev          # tsx watch mode, http://localhost:3000
```

Swagger UI (interactive API docs): http://localhost:3000/docs

Production build:

```bash
npm run build
npm start
```

Or containerized:

```bash
docker compose up --build
```

> **Fixed:** the Dockerfile previously only copied `tsconfig.json` into the build stage, but
> `npm run build` compiles against `tsconfig.build.json` — so the containerized build failed
> with `error TS5058: The specified path does not exist: 'tsconfig.build.json'`. Fixed by
> copying both config files (`COPY tsconfig.json tsconfig.build.json ./`); verified by
> rebuilding the image and curling the running container's endpoint.

## Test it

```bash
npm test              # vitest — unit (algorithm) + integration (HTTP) suites
npm run typecheck
npm run lint
```

`test/unit/computeWeights.test.ts` contains the graded assertions:
- **Test A** — 1 user, $10,000 → target A.
- **Test B** — 100 users, $100 each → target B.
- Assertion that Target B's weight is at least 2× Target A's (it's actually 100×).

`test/integration/allocations.route.test.ts` runs the same scenario through the real HTTP
route (via Fastify's `.inject()`) plus the edge cases from
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md#4-edge-case-catalog).

## Try it manually

```bash
curl -X POST http://localhost:3000/allocations/weights \
  -H "Content-Type: application/json" \
  -d '[
    {"userId":"user_1","targetId":"A","amount":10000},
    {"userId":"user_2","targetId":"B","amount":100},
    {"userId":"user_3","targetId":"B","amount":100}
  ]'
```

Expected response:

```json
[
  { "targetId": "A", "rawTotal": 10000, "uniqueUserCount": 1, "weight": 10000 },
  { "targetId": "B", "rawTotal": 200, "uniqueUserCount": 2, "weight": 400 }
]
```

`amount` accepts arbitrary non-negative finite numbers (not restricted to two decimal
places) and is capped per-allocation at `MAX_AMOUNT` (`1e12`, see
[`src/schemas/allocation.schema.ts`](src/schemas/allocation.schema.ts)); requests are
capped at `MAX_ALLOCATIONS` (`10,000`) rows. Both bounds exist so a request can't force an
aggregate sum toward IEEE-754 precision loss / `Infinity`, or force unbounded server-side
memory use — see [../docs/AI_STATIC_CODE_AND_LOGIC_CHECK.md](../docs/AI_STATIC_CODE_AND_LOGIC_CHECK.md#numeric-overflow-risk).

## The algorithm, briefly

```
weight(target) = ( Σ over unique contributing users of sqrt(userTotal) )²
```

Allocations from the same user to the same target are summed before the square root is
taken — this is what makes the dampening resistant to a single user gaming their own score by
splitting one contribution into many. Full derivation, the worked proof for the required
test cases, and the complete edge-case catalog (zero/negative amounts, malformed input,
whitespace in IDs, the formula's known Sybil-attack weakness, etc.) are in
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md).

## Architecture

```
src/
  app.ts / server.ts    Fastify instance factory (testable, no bound port) / entrypoint
  routes/                HTTP layer — parsing, status codes, OpenAPI schema
  services/               orchestrates: validates via Zod, calls the domain algorithm
  domain/                 computeWeights.ts — the pure algorithm, framework-free
  schemas/                Zod request/response schemas
  plugins/                Swagger UI, centralized error handler
  lib/                     logger config, custom error types
```

Extended beyond the bare minimum ask: Swagger/OpenAPI docs at `/docs`, structured request
logging (Pino), a `/health` endpoint, rate limiting on the scoring endpoint, a multi-stage
Dockerfile, and a GitHub Actions CI workflow (`../.github/workflows/backend-only.yml`).

This implementation is deliberately **independent** of `../fullstack/` — no shared package or
workspace. Both implement the same formula from the same spec in `../plan/`, but as two
separate codebases.

## AI Process Log

**Tools used:** Claude Code (Claude Sonnet 5, Anthropic), used for the entire build — design,
implementation, and testing.

**Process:** The build started with a planning phase before any code: I asked the AI to work
out the weighting math independently and write it down before touching a framework. The
prompt for the math was open-ended — "an algorithm that prioritizes broad consensus over
concentrated capital... a single user with a massive allocation cannot easily overpower a
large group of users making smaller allocations" — not "use quadratic funding." The AI
proposed and compared several candidate formulas (raw sum, per-allocation sqrt, per-user sqrt
summed, log dampening, and quadratic funding) before settling on quadratic funding
(`(Σ sqrt(userTotal))²`) as the one with the clearest principled justification, and proved the
required ratio algebraically (not just for the two example numbers) before writing a line of
implementation code. That design work is in `../plan/02-algorithm-and-edge-cases.md`.

For grouping logic, the instruction was simply "a user might submit multiple allocations to
the same target" (the spec's own note) — the AI's first pass already grouped by
`(userId, targetId)` before applying the square root, and called out *why* that ordering
matters: doing `sqrt` per-allocation instead of per-user-total would let one user farm extra
weight by splitting their own contribution into many small allocations, since
`sqrt(a) + sqrt(b) > sqrt(a+b)`. That's a real exploit in the naive version of this formula,
and catching it before implementation (rather than after a test failure) was the main value
of doing the math/design pass separately from coding.

**Mistakes the AI made and had to correct**, all caught by actually running the build/tests
rather than by inspection:
1. **Build output layout bug**: the initial `tsconfig.json` used `rootDir: "."` with both
   `src` and `test` included, so `tsc` emitted `dist/src/server.js` instead of
   `dist/server.js` — `npm start` failed with `MODULE_NOT_FOUND`. Fixed by splitting into a
   `tsconfig.build.json` (compiles only `src/`) used by `npm run build`, keeping the base
   `tsconfig.json` (src+test) for `npm run typecheck`.
2. **Response schema silently dropping data**: the Fastify route's `response.400` JSON schema
   declared `details` items with only `index` and `field` properties, omitting `value`.
   Fastify's AJV-based response serializer strips any property not listed in the schema —
   so the API was silently returning validation errors *without* the offending value, even
   though the error-handling code was building it correctly. This didn't fail until the
   integration test asserted on the full response body and got back an object missing
   `value`. Fixed by adding `value: {}` (an intentionally untyped JSON schema entry, since the
   offending value can be any type) to the response schema.
3. **A no-op test assertion**: an early draft of the `/docs` integration test wrote
   `expect(response.statusCode).toBe(302 || 200)` — `||` between two number literals
   evaluates to `302` unconditionally in JavaScript, so the assertion was accidentally always
   checking for exactly `302` regardless of the intent to accept either. Caught on review
   before it could mask a real regression; rewritten as
   `expect([200, 302]).toContain(response.statusCode)`.
4. **Outdated, vulnerable dependency versions**: the first-pass `package.json` pinned
   `@fastify/swagger-ui@^5.1.0` and `vitest@^2.1.4`, both of which `npm audit` flagged —
   swagger-ui's `@fastify/static` dependency had a known path-traversal/auth-bypass advisory,
   and vitest's bundled `esbuild` had a dev-server request-forwarding advisory. Bumped to
   `@fastify/swagger-ui@^6.1.1` and `vitest@^4.1.11`, re-ran the full suite to confirm nothing
   broke, and audit reported zero vulnerabilities afterward.

None of these were errors in the *weighting math itself* — the formula and grouping logic
passed its unit tests on the first run. The mistakes were all in the HTTP/build plumbing
around it, which is consistent with doing the algorithm design and proof as a separate,
earlier step rather than mixed in with framework code.
