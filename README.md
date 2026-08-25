# The Consensus Weighting API

An API that scores funding-style allocations per target so that broad, distributed support
outweighs a single large contribution of the same size — a single whale can't easily
outweigh a crowd.

- **[plan/](plan/)** — the design: problem statement, the chosen weighting formula (quadratic
  funding) with a worked proof of the required dampening ratio, the full edge-case catalog,
  the API contract, and the architecture for both implementations below.
- **[backend-only/](backend-only/)** — TypeScript + Fastify. Standalone, no persistence.
  ✅ built, tested, documented.
- **[fullstack/](fullstack/)** — Next.js + Prisma + PostgreSQL, with a dashboard that
  visualizes the dampening effect live. ✅ built, tested, documented.

`backend-only/` and `fullstack/` are **fully independent** projects — no shared package or
workspace. Each implements the same formula from the same spec in `plan/`, on its own.

Run instructions and the AI build process log for each implementation are in that
implementation's own README.
