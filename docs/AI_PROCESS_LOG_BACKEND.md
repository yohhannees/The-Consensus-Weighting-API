# AI process log: backend-only implementation

This document records the AI-assisted workflow used to build the stateless Fastify implementation. The backend was developed as an independent implementation from the same written specification used by the fullstack demo.

## Model roles

| Role | Tool or model | Responsibility |
| --- | --- | --- |
| Planning and visual or product framing | Fable | Early planning, problem framing, and making the intended user and evaluator outcome explicit. |
| Test design and test writing | Sol | Unit and integration test cases, edge-case coverage, and assertion quality. |
| Primary implementation | Claude Sonnet | Fastify setup, schemas, routes, domain code, logging, and first-pass fixes. |
| Review and difficult corrections | Claude Opus | Reviewing assumptions, finding subtle defects, and hardening implementation details. |
| Repository review and documentation | Codex with ChatGPT 5.6 | Plan review, cross-file consistency, documentation, and final verification. |

## Plan Mode workflow

The process started in Plan Mode rather than immediately editing code:

1. Inspect the repository, specification, plan documents, package versions, and existing tests.
2. Write a concrete plan with files, invariants, risks, test cases, and verification commands.
3. Review and approve the plan before implementation begins.
4. Derive and prove the formula before selecting framework code.
5. Implement the pure domain function and its tests first.
6. Add schemas, routes, error handling, logging, rate limiting, and OpenAPI behavior around the proven domain logic.
7. Review the code and assertions with a second model.
8. Run the real test suite, build, lint, typecheck, container, and HTTP checks where applicable.
9. Update documentation only after the behavior and verification results are known.

The approval gate prevented the implementation from drifting away from the requested contract and made risks visible before code was written.

## Detailed math prompt

```text
Design a stateless HTTP API that scores allocations per target.

The score must reward broad independent support over concentrated capital. For the
same total amount C, one user contributing all C should score C, while n independent
users contributing C/n each should score nC. Prove the ratio generally and confirm
that the challenge's distributed example clears its minimum 2x requirement.

Compare raw totals, logarithmic dampening, sqrt per row, sqrt per user total, and
quadratic funding. Do not select a named formula without showing its behavior and
failure modes. Include zero, negative, non-finite, duplicate, whitespace, very large,
and empty inputs. Return the formula, proof, pseudocode, edge-case table, and tests.
```

## Detailed grouping prompt

```text
Implement the formula as a pure TypeScript function with no Fastify, database, or
logging dependencies.

Rows can repeat the same userId and targetId. Group by target first, then by user
within that target. Sum all allocations for a user before applying sqrt. This must
make splitting one user's contribution into multiple rows score exactly the same as
one merged contribution.

Do not apply sqrt per row. Do not mutate input. Return deterministic output sorted by
descending weight and then ascending targetId. Write tests for repeated rows, equal
crowd contributions, empty input, zero values, ties, whitespace ids, and the attempted
self-splitting exploit.
```

## Detailed API and test prompt

```text
Wrap the proven domain function in a Fastify route without changing its math.

Define request and response schemas, structured validation errors, malformed JSON
handling, request size and allocation limits, rate limiting, health behavior, and
OpenAPI documentation. Client mistakes must return the documented 4xx error shape;
only genuine server failures should return 500.

Write unit tests for the formula and integration tests through Fastify inject. Test
the exact status code, error discriminator, message, per-row details, response body,
rate-limit behavior, and docs endpoint. Avoid weak assertions, shared state, and
tests that pass only because of a seeded database.
```

## Corrections found during implementation

- The build output initially placed the server under `dist/src`, so `npm start` could not find it. A separate build tsconfig fixed the entrypoint without changing typecheck coverage.
- The response schema omitted the offending validation value, so Fastify stripped it from the output. The schema was corrected and the integration test asserted the full error detail.
- A test used `302 || 200`, which evaluates to `302` in JavaScript. It was replaced with an explicit membership assertion.
- Initial dependency versions had audit findings. They were updated, the lockfile was regenerated, and the complete suite was rerun.

## Evidence

The implementation was accepted only after typecheck, lint, unit tests, HTTP integration tests, production build, and container checks were run. The final README and plan documents link back to this process log so the implementation decisions and evidence can be reviewed together.
