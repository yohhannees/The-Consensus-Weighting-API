# `fullstack/` — Next.js + Prisma + PostgreSQL

Goal: same contract and same math as `backend-only/`, but allocations are persisted, and a
UI makes the "distributed beats concentrated" result visible without reading JSON — this is
the folder that *sells* the mechanism to a non-technical reviewer.

## Stack

- **Next.js 16, App Router**, TypeScript. Built against the actual installed version rather
  than assumed APIs — see the AI process log in `fullstack/README.md` for what changed
  underneath (Prisma 7's driver-adapter requirement in particular).
- **Route Handlers** (`app/api/allocations/weights/route.ts`) implementing the same contract
  as [03-api-contract.md](03-api-contract.md).
- **Prisma 7** ORM + **PostgreSQL**, via `@prisma/adapter-pg` (Prisma 7 requires an explicit
  driver adapter — there is no more implicit `DATABASE_URL`-from-schema connection). Allocations
  are persisted, not just computed and discarded; weights become a derived read (recomputed on
  read, not stored, so they're never stale — see schema note below).
- **Tailwind CSS v4**, hand-built components (no chart/UI library) — the leaderboard's weight
  bar is a plain proportional `<div>`, not a charting-library primitive. Simpler, and it keeps
  the bar-width math (and therefore the visual claim it makes) fully auditable in one file
  rather than behind a library's scale/axis abstraction.
- **Vitest** for unit/API tests (against a real Postgres, not mocked), **Playwright** for
  end-to-end tests that drive the actual dashboard in a browser.
- **Docker Compose** for local Postgres (and, optionally, the app itself — see the fullstack
  README for the containerized run).

## Data model (Prisma schema, sketch)

```prisma
model Allocation {
  id        String   @id @default(cuid())
  userId    String
  targetId  String
  amount    Decimal  @db.Decimal(18, 2)
  createdAt DateTime @default(now())

  @@index([targetId])
  @@index([userId, targetId])
}
```

Notes:
- `Decimal` (not `Float`) for `amount` — avoids the float-precision edge case (case #10 in
  [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md)) at the storage layer;
  converted to `number` only at the boundary where this app's own `computeWeights` needs it.
- No `Weight` table. Weights are **derived, computed on read** from persisted allocations,
  not cached/stored — this guarantees the dashboard can never show a stale weight after a new
  allocation is submitted, at the cost of recomputing on every read. Given the O(n) grouping
  algorithm from [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md#5-pseudocode-language-agnostic-both-implementations-follow-this-exactly),
  this is cheap at any realistic scale for a take-home; documented as a deliberate tradeoff
  (simplicity + correctness over premature caching).
- The composite index on `(userId, targetId)` matches the exact grouping key the algorithm
  uses, so the DB-side aggregation (if ever pushed down with a `GROUP BY` for scale) has the
  right index already in place.

## Structure

```
fullstack/
  prisma/
    schema.prisma
    migrations/
    seed.ts                       # seeds the exact Test A / Test B scenario for manual demo
  app/
    page.tsx                       # dashboard — single page: KPIs, leaderboard, submit panel
    api/allocations/weights/route.ts  # GET (read) + POST (persist + read) — the one REST endpoint
  domain/
    computeWeights.ts             # the algorithm itself — self-contained, own copy, no external deps
  components/
    Leaderboard.tsx                # ranked targets, inline weight bar, consensus-multiplier badge
    AllocationForm.tsx              # submission panel (Client Component)
    StatTile.tsx                    # KPI tiles
  lib/
    prisma.ts                      # PrismaClient + pg driver adapter (singleton, HMR-safe)
    getTargetWeights.ts             # shared DB-read + compute, used by both the page and the route
    validation.ts / errors.ts       # Zod schema + the API contract's error shape
  prisma.config.ts                 # Prisma 7 CLI config (schema path, migrations, seed, datasource url)
  test/
    unit/
      computeWeights.test.ts
    api/
    e2e/
  docker-compose.yml               # postgres, and optionally the app itself
  README.md
```

(The plan originally sketched a separate `submit/page.tsx`; built as one page instead — a
single dashboard with the submit panel alongside the leaderboard reads better than navigating
away to submit data and back to see the effect.)

## Why persistence changes the endpoint slightly

The raw challenge only asks for one endpoint that accepts allocations and returns weights in
the same call. In `fullstack/`, that's `POST /api/allocations/weights` — same request/response
contract as [03-api-contract.md](03-api-contract.md), but it also durably records the
allocations before responding, and a companion `GET` on the same path lets the dashboard
re-fetch current standings without resubmitting data. Both routes call this app's own
`domain/computeWeights.ts` — persistence never touches the math, and this file has no
dependency on `backend-only/` or vice versa.

## Dashboard — what it's for

The single most useful thing this folder adds over `backend-only/`: seeded with the exact
Test A vs Test B scenario, the dashboard renders two bars — Target A (1 user, $10,000,
weight 10,000) and Target B (100 users, $10,000, weight 1,000,000) — side by side, with
`rawTotal` and `weight` both visible. Seeing a 100× visual gap between two bars with
*identical raw totals* is a more convincing demonstration than any unit test output, and
that's the deliberate purpose of building this folder at all rather than shipping
`backend-only/` alone.

## Local run (full instructions in `fullstack/README.md`)

```
npm install                    # also runs `prisma generate` via postinstall
docker compose up -d postgres
npm run db:migrate             # first run only
npm run db:seed
npm run dev
npm test                       # vitest (unit + api, against real Postgres)
npm run test:e2e                # playwright — drives the real dashboard in a browser
```

Postgres is mapped to host port **5433**, not 5432 — a native Postgres install already
listening on 5432 silently shadowed the container during the build (see the fullstack
README's AI process log for how that was diagnosed).
