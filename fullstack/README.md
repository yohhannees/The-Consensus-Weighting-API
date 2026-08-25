# Consensus Weighting API — Fullstack

Next.js (App Router) + Prisma + PostgreSQL. Same weighting formula and API contract as
[`../backend-only/`](../backend-only/), implemented independently (no shared code — see
[../plan/README.md](../plan/README.md#the-two-folder-decision)), plus a persisted dataset and
a dashboard that makes the dampening effect visible at a glance.

Full design rationale lives in [../plan/](../plan/) —
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md) has the math,
[../plan/05-architecture-fullstack.md](../plan/05-architecture-fullstack.md) has this
implementation's architecture.

## Run it

Requires Docker (for Postgres) and Node 20+.

```bash
npm install                 # also runs `prisma generate` via postinstall
docker compose up -d postgres
npm run db:migrate          # first run only — applies prisma/migrations
npm run db:seed             # seeds the Test A vs Test B demo scenario
npm run dev
```

Open http://localhost:3000. The dashboard is seeded with the exact scenario from the spec:
1 user × $10,000 → Target A, 100 users × $100 → Target B — same $10,000 raised, ~100× the
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

## Test it

```bash
npm test                    # vitest — unit (algorithm) + API route tests, against real Postgres
npm run typecheck
npm run lint
npm run test:e2e            # playwright — drives the actual dashboard in a browser
```

`test/unit/computeWeights.test.ts` has the graded assertions (Test A, Test B, the ≥2× —
actually 100× — ratio). `test/api/allocations.route.test.ts` runs the same scenario through
the real Next.js route handlers against a real database (using a disposable `vitest_api_`
target/user prefix so it never touches the demo seed data). `test/e2e/dashboard.spec.ts`
resets the database to the exact demo scenario, loads the real page in a browser, and asserts
Target B's weight *bar* — not just the number next to it — renders visibly larger than
Target A's.

## The algorithm, briefly

```
weight(target) = ( Σ over unique contributing users of sqrt(userTotal) )²
```

Same formula, same edge-case handling, same reasoning as `backend-only/` — see
[../plan/02-algorithm-and-edge-cases.md](../plan/02-algorithm-and-edge-cases.md). This app's
own copy lives in [`domain/computeWeights.ts`](domain/computeWeights.ts).

## Architecture

```
app/
  page.tsx                       dashboard — Server Component, queries Prisma directly
  api/allocations/weights/route.ts   the REST endpoint: GET (read) + POST (persist + read)
domain/
  computeWeights.ts               the pure algorithm — own copy, no dependency on backend-only/
components/
  Leaderboard.tsx                  ranked targets, inline weight bars, consensus-multiplier badge
  AllocationForm.tsx                submission panel (Client Component)
  StatTile.tsx                      KPI tiles
lib/
  prisma.ts                         Prisma Client, wired with the pg driver adapter (Prisma 7)
  getTargetWeights.ts                shared DB-read + compute, used by both the page and the route
  validation.ts / errors.ts          Zod schema + the API contract's error shape
prisma/
  schema.prisma, seed.ts             1 Allocation model; seed script loads the demo scenario
```

Weights are **derived, computed on every read** from persisted allocations — never cached or
stored — so the dashboard can never show a stale number after a new submission. See
[../plan/05-architecture-fullstack.md](../plan/05-architecture-fullstack.md) for the tradeoff
reasoning.

## UI notes

The dashboard was built to make the core mechanism legible without reading a single number
closely: the leaderboard's weight column is a real magnitude bar (not a decoration — its width
*is* the weight, linear, so Target A's bar being nearly invisible next to Target B's *is* the
point), and every row carries a "boost" badge (`weight ÷ rawTotal`) that reads as a plain
multiplier — 100.0× for a fully distributed target, exactly 1.0× for anything with a single
contributor, by construction of the formula. Colors, spacing, and the bar/meter treatment
follow a validated categorical/sequential palette rather than an ad hoc choice; both light and
dark mode use the same tokens, redefined per surface, not an automatic filter.

## AI Process Log

**Tools used:** Claude Code (Claude Sonnet 5, Anthropic).

**Process:** This implementation reused the algorithm design from the planning phase (see
`backend-only/README.md`'s process log for how the formula itself was derived) but was built
as a genuinely separate implementation, not a port — the instruction going in was explicit:
no shared package between `backend-only/` and `fullstack/`, so the AI wrote
`domain/computeWeights.ts` again from the same spec in `plan/`, independently.

For the UI specifically, the instruction was to avoid a generic, template-feeling result. The
AI's approach was to treat the visualization as the deliverable's actual argument, not
decoration: it picked a chart form (a linear magnitude bar embedded in a ranked table, plus a
derived "consensus multiplier" stat) based on what would make the 100× gap self-evident, chose
a validated categorical/sequential color system with real light/dark contrast checking rather
than picking colors by eye, and then verified the result by actually rendering it — launching
the dev server, loading the page in a real headless browser, and screenshotting both color
schemes — rather than describing what the UI should look like.

**Mistakes the AI made and had to correct**, all found by actually running the app rather than
by reading the code:

1. **Prisma 7 API assumptions were wrong.** The AI's first draft of `schema.prisma` used the
   Prisma 6-and-earlier pattern (`datasource { url = env("DATABASE_URL") }`, `PrismaClient()`
   with no arguments) — this project's `prisma` package resolved to 7.9.1, which removed that
   entirely: connection config moves to a new `prisma.config.ts`, `PrismaClient` requires an
   explicit driver adapter (`@prisma/adapter-pg`), and the generated client now lands in a
   project folder (`generated/prisma`) instead of `node_modules`. Rather than guess further,
   the AI scaffolded a throwaway `prisma init` project to see the actual current defaults,
   confirmed the driver-adapter requirement by reading the generated client's own type
   definitions, and rebuilt the schema/config/client-instantiation code to match — verified by
   actually running a migration and a seed against real Postgres, not just by compiling.
2. **A port conflict silently pointed at the wrong database.** `docker compose up` succeeded
   and `docker exec ... psql` could connect fine, but every connection from the app (and from
   Prisma) failed with a password-authentication error — even though the password was
   correct. The cause: a native Windows PostgreSQL service was already listening on port 5432,
   shadowing the container's port mapping, so `localhost:5432` from any host process was
   silently hitting the *wrong* Postgres server entirely. Diagnosed by checking what was
   actually bound to the port (`Get-NetTCPConnection`) rather than re-checking credentials
   again; fixed by remapping the container to host port 5433.
3. **A form bug that server-side tests couldn't have caught.** After building the submission
   form, the AI drove it end-to-end in a real browser (not just curl) and found two real UX
   bugs: (a) the amount `<input type="number" min={0}>` used the browser's native HTML5
   validation, which silently blocks form submission for a negative value — the `onSubmit`
   handler, and therefore the app's own styled error message, never ran at all, so a user
   typing a negative number just saw a generic browser tooltip instead of the designed error
   state; (b) the form unconditionally cleared all rows after every submit attempt, including
   failed ones — so fixing one bad field meant retyping the whole batch. Both were only
   visible by actually clicking through the form in a browser and reading what happened, not
   by reasoning about the code. Fixed by adding `noValidate` to route all validation through
   one consistent path, and by only resetting the form on a confirmed successful submission.
4. **The generated Prisma client's ESM-only output broke the Playwright test runner.** The new
   Prisma 7 generator writes client code using `import.meta.url`, which is valid ESM but a
   syntax error under Playwright's default CommonJS test transform. Rather than restructure
   the project's module system to work around a test-only dependency, the AI had the
   end-to-end test shell out to the already-working `npm run db:seed` script (a separate
   process, its own correct module context) instead of importing the Prisma client directly —
   the smaller, more targeted fix.
5. **Dockerfile copy order broke the image build.** The first `Dockerfile` copied only
   `package.json`/`package-lock.json` before `RUN npm ci` (for better layer caching), but
   `npm ci` runs the `postinstall` hook (`prisma generate`), which needs `prisma/schema.prisma`
   — not copied yet at that point — and failed with "Could not find Prisma Schema". Caught by
   actually running `docker compose build`, not by reading the Dockerfile; fixed by copying
   `prisma/` alongside the package files before `npm ci`, then verified by running the full
   containerized stack (`docker compose up`) and hitting the real API through it.

The common thread: every one of these was caught by actually executing something (a
migration, a curl request, a browser click, a test run) — none of them would have been visible
from a code read alone, which is the reason the build process leaned so heavily on running the
real app at every step rather than trusting that code that type-checks is code that works.
