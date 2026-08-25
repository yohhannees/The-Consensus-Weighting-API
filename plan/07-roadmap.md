# Roadmap / Build Order

`backend-only/` and `fullstack/` are two fully independent projects — no shared workspace,
no shared package, no root `package.json` tying them together. Each is scaffolded, built, and
tested on its own, and each writes its own copy of the weighting algorithm from the same spec
in [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md). The sequencing below still
does the algorithm first *within* each folder, before its HTTP/DB layer, so the math is proven
correct in isolation before anything is built around it — that discipline just gets applied
twice instead of once.

## Milestone 0 — Repo scaffolding
- `git init` at the repo root.
- Root `README.md` linking to `plan/`, `backend-only/`, and `fullstack/` — a pointer, not a
  workspace config.
- `.gitignore`, `.editorconfig` at the root (language-agnostic housekeeping only).
- No root `package.json`, no `packages/` directory.

## Milestone 1 — `backend-only/`
- Scaffold its own `package.json`, `tsconfig.json`, independent of anything outside the folder.
- Write `src/domain/computeWeights.ts` per the pseudocode in
  [02-algorithm-and-edge-cases.md §5](02-algorithm-and-edge-cases.md#5-pseudocode-language-agnostic-both-implementations-follow-this-exactly).
- Full unit test suite from [06-testing-strategy.md](06-testing-strategy.md) — including the
  graded Test A / Test B / ≥2× assertions — green before touching Fastify.
- Fastify app skeleton (`app.ts`/`server.ts` split), Zod schemas matching
  [03-api-contract.md](03-api-contract.md), route wired to `domain/computeWeights.ts`,
  centralized error handler.
- Integration tests via `.inject()`.
- Swagger UI, health check, rate limiting, Dockerfile, CI workflow.
- `backend-only/README.md`: run instructions + this project's own AI process log section.

## Milestone 2 — `fullstack/`
- Scaffold its own `package.json` (Next.js), independent of `backend-only/`.
- Write its own `domain/computeWeights.ts` — same spec, own implementation, own unit tests,
  green before wiring any route or database.
- Prisma schema + migration, Docker Compose Postgres.
- Route handlers (`GET`/`POST`) wired to the local `domain/computeWeights.ts`, persisting via
  Prisma.
- Seed script with the Test A/B scenario.
- Dashboard page (leaderboard + bar chart) and submit form.
- API tests against a test DB, one Playwright e2e test.
- `fullstack/README.md`: run instructions + AI process log section.

## Milestone 3 — Top-level polish
- Root README tying both folders together, explaining the two-implementation decision (same
  content as [README.md](README.md)'s "two-folder decision" section, adapted for an external
  reviewer) — and explicitly noting they're independent, not sharing code.
- Verify both implementations against the identical contract with a couple of `curl` examples
  in each README, confirming they return matching results for the same input despite being
  separately implemented.
- Final pass on the AI process log per the challenge's deliverable #3 — written *honestly and
  specifically* as the build actually happens (which formula the AI proposed first, what got
  corrected, not a generic "AI helped a lot" paragraph).

## Explicit non-goals (documented, not silently skipped)
- No shared package/workspace between `backend-only/` and `fullstack/` — each is standalone by
  deliberate choice.
- No auth/authz on the endpoint — out of scope for the challenge.
- No Sybil-resistance implementation — flagged as a known limitation (edge case #12 in
  [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md)), not solved.
- No weight caching/precomputation in `fullstack/` — deliberate simplicity tradeoff, documented
  in [05-architecture-fullstack.md](05-architecture-fullstack.md).
