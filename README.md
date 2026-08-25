# The Consensus Weighting API

An API that scores funding-style allocations per target so that broad, distributed support
outweighs a single large contribution of the same size  -  a single whale can't easily
outweigh a crowd.

**Repository:** https://github.com/yohhannees/The-Consensus-Weighting-API

- **[plan/](plan/)**  -  the design: problem statement, the chosen weighting formula (quadratic
  funding) with a worked proof of the required dampening ratio, the full edge-case catalog,
  the API contract, and the architecture for both implementations below.
- **[backend-only/](backend-only/)**  -  TypeScript + Fastify. Standalone, no persistence.
  **This is the official take-home submission**: a stateless REST endpoint whose result
  depends only on the submitted request body, matching the challenge's contract exactly.
  ✅ built, tested, documented.
- **[fullstack/](fullstack/)**  -  Next.js + Prisma + PostgreSQL, with a dashboard that
  visualizes the dampening effect live. An optional, persisted demo of the same algorithm  -
  its `POST` endpoint persists submitted allocations and returns weights computed over the
  *entire* accumulated database, so two identical requests do not return the same result.
  That's a legitimate product design, but it means this endpoint is not behaviorally
  identical to the stateless challenge contract; use `backend-only/` if you need that.
  ✅ built, tested, documented.

`backend-only/` and `fullstack/` are **fully independent** projects  -  no shared package or
workspace. Each implements the same formula from the same spec in `plan/`, on its own.

Run instructions and the AI build process log for each implementation are in that
implementation's own README.
