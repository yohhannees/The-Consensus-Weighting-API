# The Consensus Weighting API

> A funding API that makes broad support count more than concentrated capital.

[![Live demo](https://img.shields.io/badge/live%20demo-working-22c55e?style=flat-square)](https://the-consensus-weighting-api.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-111827?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

**Live fullstack demo:** [the-consensus-weighting-api.vercel.app](https://the-consensus-weighting-api.vercel.app/)

## The problem

In a normal funding leaderboard, the largest wallet usually wins. That makes a single large contribution look more important than broad support from many independent people.

For example:

| Target | Support pattern | Raw capital |
| --- | --- | ---: |
| A | 1 user gives $10,000 | $10,000 |
| B | 100 users give $100 each | $10,000 |

Both targets raise the same amount. A raw-total ranking treats them as equal, even though Target B has a much stronger signal of shared demand.

## The solution

The API uses a quadratic funding style score:

```text
weight(target) = (sum of sqrt(each user's total contribution))^2
```

The important detail is the grouping order. Contributions from the same user to the same target are merged before the square root is applied. This prevents one user from gaining extra influence by splitting one contribution into many rows.

With the example above:

```text
Target A: (sqrt(10,000))^2 = 10,000
Target B: (100 * sqrt(100))^2 = 1,000,000
```

Target B receives the same raw capital but 100 times the consensus weight. The challenge only requires a 2 times advantage, so the mechanism clears that requirement with a wide margin.

## Explore the project

| Area | What it contains |
| --- | --- |
| [Live demo](https://the-consensus-weighting-api.vercel.app/) | Working fullstack dashboard with request editor, response inspector, ranking table, chart, scenario lab, and session log. |
| [`plan/`](plan/) | Problem statement, formula derivation, edge cases, API contract, architecture, testing strategy, and roadmap. |
| [`backend-only/`](backend-only/) | Official stateless TypeScript and Fastify submission. The result depends only on the request body. |
| [`fullstack/`](fullstack/) | Persisted Next.js, Prisma, and PostgreSQL demo with a visual dashboard. |
| [`docs/`](docs/) | Review notes and detailed AI process logs for both implementations. |
| [`backend-only/README.md`](backend-only/README.md) | Backend setup, API examples, tests, and backend process documentation. |
| [`fullstack/README.md`](fullstack/README.md) | Fullstack setup, database workflow, dashboard behavior, and deployment notes. |
| [`docs/AI_PROCESS_LOG_BACKEND.md`](docs/AI_PROCESS_LOG_BACKEND.md) | Backend prompts, Plan Mode workflow, model roles, corrections, and verification. |
| [`docs/AI_PROCESS_LOG_FULLSTACK.md`](docs/AI_PROCESS_LOG_FULLSTACK.md) | Fullstack prompts, Plan Mode workflow, model roles, corrections, and verification. |

## Two implementations

### Backend only

The official take-home submission is a stateless REST API built with TypeScript and Fastify.

- No persistence
- Request body determines the complete result
- OpenAPI and Swagger UI
- Structured validation errors
- Rate limiting and health checks
- Unit and HTTP integration tests
- Docker support

Start with [`backend-only/README.md`](backend-only/README.md).

### Fullstack demo

The fullstack version turns the same algorithm into an interactive product. It persists allocations in PostgreSQL and recomputes the ranking from the accumulated dataset.

- Next.js App Router
- Prisma 7 with the PostgreSQL driver adapter
- Request editor with form and raw JSON modes
- Live request payload and response inspection
- Headers, impact, cURL, and request history views
- Ranking table and log-log chart
- Scenario lab with real API calls and assertions
- Local Docker workflow and Vercel deployment

The deployed fullstack application is live at [the-consensus-weighting-api.vercel.app](https://the-consensus-weighting-api.vercel.app/).

Start with [`fullstack/README.md`](fullstack/README.md).

## Recommended reading order

1. Read this page for the problem and solution at a glance.
2. Read [`plan/01-problem-and-solution.md`](plan/01-problem-and-solution.md) for the motivation.
3. Read [`plan/02-algorithm-and-edge-cases.md`](plan/02-algorithm-and-edge-cases.md) for the proof and edge cases.
4. Read [`plan/03-api-contract.md`](plan/03-api-contract.md) for request, response, and error behavior.
5. Choose the [backend-only README](backend-only/README.md) or [fullstack README](fullstack/README.md).
6. Read the relevant [AI process log](docs/AI_PROCESS_LOG_BACKEND.md) or [fullstack process log](docs/AI_PROCESS_LOG_FULLSTACK.md) to see how the work was planned, implemented, tested, reviewed, and verified.

## Run each implementation

The two implementations are independent. Run commands from the respective folder, not from the repository root. Each folder has its own `package.json`, dependencies, tests, configuration, and README.

### Backend-only repository

Run from `backend-only/`:

```bash
cd backend-only
npm install
npm run dev
```

The backend starts at [http://localhost:3000](http://localhost:3000). Swagger UI is available at [http://localhost:3000/docs](http://localhost:3000/docs).

Backend checks, also run from `backend-only/`:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

See [`backend-only/README.md`](backend-only/README.md) for API examples, Docker usage, and backend-specific details.

### Fullstack repository

Run from `fullstack/`:

```bash
cd fullstack
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard.

Fullstack checks, also run from `fullstack/`:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

The fullstack browser suite is also run from `fullstack/` and requires the local database:

```bash
npm run test:e2e
```

See [`fullstack/README.md`](fullstack/README.md) for database safety, Vercel deployment, dashboard behavior, and fullstack-specific details.

## Verification

The project uses a plan-first, evidence-based workflow. Tests and builds are intentionally kept inside their respective implementation folders so each project can be verified independently. Destructive seed and end-to-end workflows are intended for a local or disposable database.

## Repository

[github.com/yohhannees/The-Consensus-Weighting-API](https://github.com/yohhannees/The-Consensus-Weighting-API)
