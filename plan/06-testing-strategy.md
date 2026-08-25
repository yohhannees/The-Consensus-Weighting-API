# Testing Strategy

## The two required tests (the graded core)

This suite is written once here as the spec, then implemented **twice**  -  once in
`backend-only/test/unit/computeWeights.test.ts` against that app's own
`src/domain/computeWeights.ts`, and once in `fullstack/test/unit/computeWeights.test.ts`
against its own `domain/computeWeights.ts`. Same assertions, two independent
implementations under test, no shared import between them.

```ts
import { computeWeights } from "../../src/domain/computeWeights"; // path per-implementation

describe("consensus dampening", () => {
  it("Test A  -  concentrated: 1 user, $10,000 to target A", () => {
    const result = computeWeights([
      { userId: "user_1", targetId: "A", amount: 10_000 },
    ]);
    expect(result[0].rawTotal).toBe(10_000);
    expect(result[0].uniqueUserCount).toBe(1);
    expect(result[0].weight).toBe(10_000); // sqrt(10000)^2
  });

  it("Test B  -  distributed: 100 users, $100 each, to target B", () => {
    const allocations = Array.from({ length: 100 }, (_, i) => ({
      userId: `user_${i}`,
      targetId: "B",
      amount: 100,
    }));
    const result = computeWeights(allocations);
    expect(result[0].rawTotal).toBe(10_000);
    expect(result[0].uniqueUserCount).toBe(100);
    expect(result[0].weight).toBe(1_000_000); // (100 * sqrt(100))^2
  });

  it("distributed weight is at least 2x concentrated weight for equal raw totals", () => {
    const concentrated = computeWeights([
      { userId: "user_1", targetId: "A", amount: 10_000 },
    ]);
    const distributed = computeWeights(
      Array.from({ length: 100 }, (_, i) => ({
        userId: `user_${i}`,
        targetId: "B",
        amount: 100,
      }))
    );
    const weightA = concentrated.find((r) => r.targetId === "A")!.weight;
    const weightB = distributed.find((r) => r.targetId === "B")!.weight;

    expect(weightB).toBeGreaterThanOrEqual(weightA * 2); // spec's literal requirement
    expect(weightB).toBe(weightA * 100);                  // the actual, much stronger result
  });
});
```

The third test is the one that's literally graded against ("must assert Target B's weight is
at least 2x Target A's")  -  written as `>= 2 *`, not `> 2 *`, to match the spec's wording
exactly, with a second, stricter assertion (`=== 100x`) alongside it so a future change to the
formula that weakens dampening below the proven ratio fails loudly instead of silently
passing a loose bound.

## Edge-case tests (mapped 1:1 to the catalog in [02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md))

| Test | Verifies catalog # |
|---|---|
| Same user, two allocations to same target → summed into one `userTotal`, `uniqueUserCount = 1` | #1 |
| Same user, allocations to two different targets → both targets present, independent | #2 |
| `amount: 0` allocation → excluded from `rawTotal` and `uniqueUserCount` | #3 |
| Negative `amount` → `400`, request rejected atomically | #4 |
| Non-numeric / `NaN` / `Infinity` `amount` → `400` | #5 |
| Missing `userId` / `targetId` → `400` | #6 |
| `[]` input → `200`, `[]` output | #7 |
| `userId` with leading/trailing whitespace → trimmed, merged with untrimmed duplicate | #8 |
| Large `amount` (`1e12`+) → no precision loss, weight computed correctly | #9 |
| Output rounding → `weight`/`rawTotal` rounded to 2 decimals | #10 |
| Malformed body (not an array) → `400` before processing | #13 |
| Result ordering → descending by `weight` | (contract, §03) |

## Layer-by-layer coverage

- **`domain/computeWeights.ts` (each implementation, own copy)**: pure unit tests, no I/O  -
  this is where the math tests above live, and where most edge-case tests live (fastest, most
  isolated). Written and passing independently in both `backend-only/` and `fullstack/`.
- **`backend-only/`**: integration tests via Fastify's `app.inject()`  -  verifies HTTP status
  codes, error response shape, and that the route correctly wires request → `computeWeights` →
  response, without re-testing the math itself.
- **`fullstack/`**: API route tests hitting the Next.js route handler against a test Postgres
  database (via Docker in CI), plus one Playwright e2e test: submit the Test A/B scenario
  through the UI form, assert the dashboard renders Target B's bar visibly larger than
  Target A's.

## CI

Both `backend-only/` and `fullstack/` run their full suite (lint, typecheck, unit,
integration) on every push via GitHub Actions; `fullstack/`'s workflow additionally spins up
a `postgres:16` service container for the API/e2e tests.
