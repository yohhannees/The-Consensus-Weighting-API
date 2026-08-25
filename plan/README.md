# Plan Folder — Index

This folder is the design phase for the "Consensus Weighting API" take-home challenge.
Nothing here is code — it's the thinking, written down, so a decision made on day 1 doesn't
get silently re-litigated on day 3. Read in this order:

1. [01-problem-and-solution.md](01-problem-and-solution.md) — what's actually being asked,
   in plain language first, then restated technically. This is the "explain it to me twice"
   document.
2. [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md) — the weighting formula
   itself: why this one and not another, the worked math for the two required test cases,
   and the full edge-case catalog with a decision for each one.
3. [03-api-contract.md](03-api-contract.md) — the exact request/response shapes, status
   codes, and validation errors. This is the contract both implementations must satisfy
   identically.
4. [04-architecture-backend-only.md](04-architecture-backend-only.md) — the TypeScript +
   Fastify build.
5. [05-architecture-fullstack.md](05-architecture-fullstack.md) — the Next.js + Prisma +
   PostgreSQL build.
6. [06-testing-strategy.md](06-testing-strategy.md) — what gets tested, and specifically how
   the "distributed beats concentrated" claim gets proven programmatically, not just asserted.
7. [07-roadmap.md](07-roadmap.md) — the build order, as milestones, for both folders.

## The two-folder decision

Two separate, runnable implementations of the same contract:

- `backend-only/` — TypeScript + Fastify. A deliberately deep, production-shaped backend:
  layered architecture, validation, structured errors, OpenAPI docs, full test suite,
  Docker, CI.
- `fullstack/` — Next.js (App Router) + Prisma + PostgreSQL. The same algorithm, but
  allocations are persisted, and there's a real UI: a dashboard that visualizes *why*
  distributed targets outrank concentrated ones (this is the most convincing way to
  demonstrate the mechanism to a reviewer who doesn't want to read math).

These are **fully independent** — no shared workspace, no shared package, no cross-folder
import. Each implements the weighting formula from
[02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md) itself, from scratch, in its
own `src/`. They agree on the same math and the same API contract by *spec*, not by *sharing
code* — each folder is a standalone, cloneable, independently deployable project. See
[07-roadmap.md](07-roadmap.md) for the build order.
