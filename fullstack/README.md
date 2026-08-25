# Consensus Weighting API  -  Fullstack

Next.js (App Router) + Prisma + PostgreSQL. Same weighting formula as
[`../backend-only/`](../backend-only/) (the official take-home submission  -  see its README),
implemented independently (no shared code  -  see
[../plan/README.md](../plan/README.md#the-two-folder-decision)), plus a persisted dataset and
a dashboard that makes the dampening effect visible at a glance.

> **Not behaviorally identical to `backend-only/`'s API contract.** `POST
> /api/allocations/weights` here *persists* the submitted allocations and returns weights
> computed over the entire accumulated database  -  so two identical requests do not return the
> same result, unlike the stateless challenge contract. This is an optional, persisted demo
> variant, not a drop-in replacement for the official submission. See
> [../docs/AI_STATIC_CODE_AND_LOGIC_CHECK.md](../docs/AI_STATIC_CODE_AND_LOGIC_CHECK.md#full-stack-api-semantics-differ-from-the-challenge)
> for the full reasoning.

Because `POST` persists, a client retrying an in-flight or uncertain request (timeout, dropped
connection) risks double-counting the same allocations. An optional `Idempotency-Key` request
header protects against this: the first request with a given key persists normally; any retry
with the same key **and the same payload** is detected (a unique constraint on a
`ProcessedRequest` row, checked in the same transaction as the insert) and skipped rather than
re-applied, while the response still returns current weights. The recorded key is bound to a
hash of the payload it was first used with  -  reusing a key with a *different* payload is a
client bug that would otherwise silently discard data, so it returns `409 IdempotencyConflict`
instead. Omitting the header preserves the original, unprotected behavior.

```bash
curl -X POST http://localhost:3000/api/allocations/weights \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <any-client-generated-unique-string>" \
  -d '[{"userId":"user_1","targetId":"A","amount":100}]'
```

Full design rationale lives in [../plan/](../plan/)  -
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md) has the math,
[../plan/05-architecture-fullstack.md](../plan/05-architecture-fullstack.md) has this
implementation's architecture.

## Run it

Requires Docker (for Postgres) and Node 20+.

```bash
npm install                 # also runs `prisma generate` via postinstall
docker compose up -d postgres
npm run db:migrate          # first run only  -  applies prisma/migrations
npm run db:seed             # seeds the Test A vs Test B demo scenario
npm run dev
```

Open http://localhost:3000. The dashboard is seeded with the exact scenario from the spec:
1 user × $10,000 → Target A, 100 users × $100 → Target B  -  same $10,000 raised, ~100× the
weight for Target B.

Production build:

```bash
npm run build
npm start
```

Or the whole stack (Postgres + app) containerized:

```bash
docker compose up --build
```

This works from a completely fresh volume: a one-shot `migrate` service applies
`prisma/migrations` before the app starts (previously that was a manual step, and a fresh
volume booted the app against a database with no tables). The build context excludes
`.env` via [`.dockerignore`](.dockerignore)  -  database credentials reach the container
only through compose's `environment` block at run time, never baked into an image layer.

## Test it

```bash
npm test                    # vitest  -  unit (algorithm) + API route tests, against real Postgres
npm run typecheck
npm run lint
npm run test:e2e            # playwright  -  drives the actual dashboard in a browser
```

> **Seeding is destructive and guarded.** `npm run db:seed` (and the e2e suite, which
> reseeds automatically) replaces the *entire* `Allocation` table with the demo scenario, so
> the seed script refuses to run against any non-localhost database host. Point
> `DATABASE_URL` at the local Docker Postgres (as in `.env.example`) for seeding and e2e;
> set `SEED_FORCE=1` only if you really mean to reset a remote database.

`test/unit/computeWeights.test.ts` has the graded assertions (Test A, Test B, the ≥2×  -
actually 100×  -  ratio). `test/api/allocations.route.test.ts` runs the same scenario through
the real Next.js route handlers against a real database (using a disposable `vitest_api_`
target/user prefix so it never touches the demo seed data). `test/e2e/dashboard.spec.ts`
resets the database to the exact demo scenario, loads the real page in a browser, and asserts
Target B's weight *bar*  -  not just the number next to it  -  renders visibly larger than
Target A's. `test/unit/console.test.ts` covers the console's own pure logic  -  the JSON
tokenizer, the before/after ranking diff  -  and validates the scenario catalog: unique ids,
every scenario writing only to `lab_`-prefixed targets, and every *mechanism* scenario's
assertion checked against the real `computeWeights` output rather than only against a live
server.

## The algorithm, briefly

```
weight(target) = ( Σ over unique contributing users of sqrt(userTotal) )²
```

Same formula, same edge-case handling, same reasoning as `backend-only/`  -  see
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md). This app's
own copy lives in [`domain/computeWeights.ts`](domain/computeWeights.ts).

## Architecture

```
app/
  page.tsx                       Server Component  -  reads Prisma, hands the data to <Dashboard/>
  api/allocations/weights/route.ts   the REST endpoint: GET (read) + POST (persist + read)
  api/health/route.ts               liveness + DB-reachability check (mirrors backend-only's /health)
domain/
  computeWeights.ts               the pure algorithm  -  own copy, no dependency on backend-only/
components/
  Dashboard.tsx                    Client Component owning console state: weights, call history, impact diffs
  RankingsPanel.tsx                 table/chart switch, target filter, lab_ data toggle
  Leaderboard.tsx                   ranked targets, paired weight/raw-capital bars, boost + change columns
  WeightChart.tsx                   log-log scatter of raw capital vs weight, with the weight = dollars diagonal
  StatTile.tsx                      KPI tiles, animated between values
  ui/Primitives.tsx                 panel, badge, status pill, segmented control, copy button
  console/RequestPanel.tsx          row editor + raw-JSON editor, live payload preview, Idempotency-Key control
  console/ResponsePanel.tsx         status/latency/size, and body / headers / impact / cURL tabs
  console/JsonPane.tsx              tokenized JSON viewer (windowed, so a 700 KB body can't lock the tab)
  console/TransferWire.tsx          the animated link between the two panels while a call is open
  console/ScenarioLab.tsx           scenario grid, suite runner controls, per-step results
  console/RequestLog.tsx            every call this session: status, latency, replay
  console/HealthBadge.tsx           polls /api/health (which probes the database, not just the process)
  console/useRequestDraft.ts        request-editor state; form and raw JSON round-trip into each other
  console/useScenarioRunner.ts      sequential scenario execution and assertion bookkeeping
lib/
  prisma.ts                         Prisma Client, wired with the pg driver adapter (Prisma 7)
  getTargetWeights.ts                shared DB-read + compute, used by both the page and the route
  validation.ts / errors.ts          Zod schema + the API contract's error shape
  rateLimit.ts                       in-memory per-process limiter (100 req/min) on the POST route
  apiClient.ts                       one call -> status, both header sets, both bodies, bytes, latency, curl
  scenarios.ts                       the scenario catalog: payloads plus what each one asserts
  json.ts / weightDiff.ts            JSON tokenizer + before/after ranking diff
prisma/
  schema.prisma, seed.ts             Allocation + ProcessedRequest models; seed script loads the demo scenario
```

`amount` is capped per-allocation at `MAX_AMOUNT` (`1e12`), limited to **at most 2 decimal
places** (storage is `Decimal(18,2)`, so anything finer would be silently rounded on insert
and the persisted `rawTotal` would no longer match what the caller sent  -  rejected at the
boundary instead), and requests are capped at `MAX_ALLOCATIONS` (`10,000`) rows  -  see
[`lib/validation.ts`](lib/validation.ts)  -  so a request can't push the aggregate sum toward
floating-point precision loss or force an unbounded batch insert.

Both `GET` and `POST` are rate-limited to 100 requests/minute per client IP via
[`lib/rateLimit.ts`](lib/rateLimit.ts) (`GET` too, because it does a full-table read +
recompute  -  at least as expensive as a write). The limiter's state is in-memory and
per-process  -  the same tradeoff as `backend-only/`'s default `@fastify/rate-limit` store  -  so
it resets on restart and isn't shared across horizontally-scaled instances; a production
multi-instance deployment would need a shared store (e.g. Redis) instead. The client key
comes from `x-forwarded-for`, which is trustworthy only behind a proxy/load balancer that
overwrites it  -  see the caveats documented in the module.

Both `GET` and `POST` wrap their database calls and return a structured
`{ "error": "InternalError", "message": "Something went wrong" }` (`500`) on failure  -  matching
[../plan/03-api-contract.md](../plan/03-api-contract.md)'s error shape  -  instead of letting an
unhandled Prisma error surface as an unstructured framework error page.

Weights are **derived, computed on every read** from persisted allocations  -  never cached or
stored  -  so the dashboard can never show a stale number after a new submission. See
[../plan/05-architecture-fullstack.md](../plan/05-architecture-fullstack.md) for the tradeoff
reasoning.

## The console

The dashboard is not a form with a table under it - it is a working client for this API, built
so the mechanism and the contract are both things you can watch happen.

**Request and response, side by side.** The left panel builds the batch (row editor, or a raw
JSON editor for bodies the form cannot express - including deliberately malformed ones) and
renders the exact payload as syntax-highlighted JSON while you type, with a live byte and row
count. The right panel shows what came back: status, wall-clock latency, response size, and
four views of the call - the body, both header sets, the generated `curl` command, and
**Impact**, which diffs the ranking before the call against the one it returned. That last view
exists because the response body alone cannot show what a `POST` *did*: it is the full
recomputed leaderboard either way, so the only way to see the effect is to keep the previous
one and compare. Between the panels, a wire animates while the call is open, with a live
millisecond counter - "in flight" is a state you watch, not one you infer from a spinner.

**The scenario lab: 22 scenarios you can run against the running API.** Each one fires real
requests and asserts on real answers - status code, error discriminator, and the numbers
themselves - grouped as *mechanism* (the crowd beating the whale, a sybil split gaining
nothing, whitespace ids merging, zero amounts creating no weight, cents surviving
`Decimal(18,2)`), *validation* (nine bodies the API must refuse, each with the specific error
it should give), *protocol* (an idempotent retry, a key reused with a different payload, the
unkeyed retry that really does double-count, a read proving it changes nothing), and *load*
(1,000 contributors in one batch, the batch cap, a deliberate rate-limit burst). "Run all"
executes the suite sequentially - sequential because the API is rate limited and several
scenarios assert on ordering - with a progress bar and a pass/fail tally.

Every scenario generates its target ids per run under a `lab_` prefix, so an assertion holds
regardless of what is already in the database, and the ranking panel can filter that data back
out with one checkbox. Two scenarios are marked *heavy* and stay out of "run all": the
maximum-size body, and the burst that intentionally trips the limiter for the following minute.

`test/unit/console.test.ts` keeps the lab honest in CI: it runs every *mechanism* scenario's
payload through the real `computeWeights` and feeds the result to that scenario's own
assertion, so a change to the algorithm fails the test suite rather than only showing up as a
red card in the browser. It also checks that no scenario can write to a target id outside the
`lab_` prefix.

## UI notes

The visualization is the deliverable's argument, not decoration. The leaderboard's weight
column is a real magnitude bar (linear - Target A's bar being nearly invisible next to Target
B's *is* the point), paired with a thinner bar for raw capital on its own scale, so the
contrast between "same dollars" and "very different weight" is one glance. Every row carries a
boost badge (`weight / rawTotal`), which reads as a plain multiplier: 100.0x for a fully
distributed target, exactly 1.0x for anything with a single contributor, by construction of the
formula. A change column and a one-shot row flash mark whatever the last call moved.

The chart view plots raw capital against weight on log-log axes with the line `weight =
dollars` drawn in - the line a single-contributor target sits on exactly, because (sqrt(total))^2
is the total. Distance above that line *is* the consensus multiplier, and bubble area is the
contributor count that produced it, which makes the chart a picture of the rule rather than a
restatement of the table. Weight can never fall below raw total, so the region under the line
is provably empty; that is where the label goes.

Colors, spacing, and the bar/meter treatment follow a validated categorical/sequential palette
rather than an ad hoc choice, including a second hue reserved for "raw dollars" so it can never
be confused with weight, and a per-token JSON syntax palette contrast-checked against its own
surface. Light and dark use the same tokens redefined per surface, not an automatic filter, and
every animation on the page is disabled under `prefers-reduced-motion`.

## AI Process Log

**Tools used:** Claude Code (Claude Sonnet 5, Anthropic).

**Process:** This implementation reused the algorithm design from the planning phase (see
`backend-only/README.md`'s process log for how the formula itself was derived) but was built
as a genuinely separate implementation, not a port  -  the instruction going in was explicit:
no shared package between `backend-only/` and `fullstack/`, so the AI wrote
`domain/computeWeights.ts` again from the same spec in `plan/`, independently.

For the UI specifically, the instruction was to avoid a generic, template-feeling result. The
AI's approach was to treat the visualization as the deliverable's actual argument, not
decoration: it picked a chart form (a linear magnitude bar embedded in a ranked table, plus a
derived "consensus multiplier" stat) based on what would make the 100× gap self-evident, chose
a validated categorical/sequential color system with real light/dark contrast checking rather
than picking colors by eye, and then verified the result by actually rendering it  -  launching
the dev server, loading the page in a real headless browser, and screenshotting both color
schemes  -  rather than describing what the UI should look like.

**Mistakes the AI made and had to correct**, all found by actually running the app rather than
by reading the code:

1. **Prisma 7 API assumptions were wrong.** The AI's first draft of `schema.prisma` used the
   Prisma 6-and-earlier pattern (`datasource { url = env("DATABASE_URL") }`, `PrismaClient()`
   with no arguments)  -  this project's `prisma` package resolved to 7.9.1, which removed that
   entirely: connection config moves to a new `prisma.config.ts`, `PrismaClient` requires an
   explicit driver adapter (`@prisma/adapter-pg`), and the generated client now lands in a
   project folder (`generated/prisma`) instead of `node_modules`. Rather than guess further,
   the AI scaffolded a throwaway `prisma init` project to see the actual current defaults,
   confirmed the driver-adapter requirement by reading the generated client's own type
   definitions, and rebuilt the schema/config/client-instantiation code to match  -  verified by
   actually running a migration and a seed against real Postgres, not just by compiling.
2. **A port conflict silently pointed at the wrong database.** `docker compose up` succeeded
   and `docker exec ... psql` could connect fine, but every connection from the app (and from
   Prisma) failed with a password-authentication error  -  even though the password was
   correct. The cause: a native Windows PostgreSQL service was already listening on port 5432,
   shadowing the container's port mapping, so `localhost:5432` from any host process was
   silently hitting the *wrong* Postgres server entirely. Diagnosed by checking what was
   actually bound to the port (`Get-NetTCPConnection`) rather than re-checking credentials
   again; fixed by remapping the container to host port 5433.
3. **A form bug that server-side tests couldn't have caught.** After building the submission
   form, the AI drove it end-to-end in a real browser (not just curl) and found two real UX
   bugs: (a) the amount `<input type="number" min={0}>` used the browser's native HTML5
   validation, which silently blocks form submission for a negative value  -  the `onSubmit`
   handler, and therefore the app's own styled error message, never ran at all, so a user
   typing a negative number just saw a generic browser tooltip instead of the designed error
   state; (b) the form unconditionally cleared all rows after every submit attempt, including
   failed ones  -  so fixing one bad field meant retyping the whole batch. Both were only
   visible by actually clicking through the form in a browser and reading what happened, not
   by reasoning about the code. Fixed by adding `noValidate` to route all validation through
   one consistent path, and by only resetting the form on a confirmed successful submission.
4. **The generated Prisma client's ESM-only output broke the Playwright test runner.** The new
   Prisma 7 generator writes client code using `import.meta.url`, which is valid ESM but a
   syntax error under Playwright's default CommonJS test transform. Rather than restructure
   the project's module system to work around a test-only dependency, the AI had the
   end-to-end test shell out to the already-working `npm run db:seed` script (a separate
   process, its own correct module context) instead of importing the Prisma client directly  -
   the smaller, more targeted fix.
5. **Dockerfile copy order broke the image build.** The first `Dockerfile` copied only
   `package.json`/`package-lock.json` before `RUN npm ci` (for better layer caching), but
   `npm ci` runs the `postinstall` hook (`prisma generate`), which needs `prisma/schema.prisma`
    -  not copied yet at that point  -  and failed with "Could not find Prisma Schema". Caught by
   actually running `docker compose build`, not by reading the Dockerfile; fixed by copying
   `prisma/` alongside the package files before `npm ci`, then verified by running the full
   containerized stack (`docker compose up`) and hitting the real API through it.

The common thread: every one of these was caught by actually executing something (a
migration, a curl request, a browser click, a test run)  -  none of them would have been visible
from a code read alone, which is the reason the build process leaned so heavily on running the
real app at every step rather than trusting that code that type-checks is code that works.
