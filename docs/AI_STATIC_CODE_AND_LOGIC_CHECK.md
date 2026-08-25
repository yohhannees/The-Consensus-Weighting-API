# AI Static Code and Logic Check

**Project:** The Consensus Weighting API  
**Review date:** 2026-08-25  
**Review scope:** `backend-only/`, `fullstack/`, shared design documentation, tests, build configuration, and container configuration  
**Review mode:** Read-only code review plus local verification commands. No application source code was changed during this review.

## 1. Executive assessment

The core consensus-weighting logic is correct in both implementations. Both implementations:

- group allocations by `targetId`;
- group repeated allocations by `(targetId, userId)` before applying the square root;
- calculate `weight = (sum(sqrt(per-user-total)))²`;
- report `rawTotal`, `uniqueUserCount`, and `weight`;
- rank results by descending weight; and
- demonstrate that 100 users contributing 100 each receive 100 times the weight of one user contributing 10,000, despite equal raw totals.

The `backend-only` project is the cleanest match for the take-home specification. It has a stateless REST endpoint whose result depends only on the submitted request body.

The `fullstack` project is a useful demonstration application, but it is not behaviorally identical to the simple challenge API. Its POST endpoint persists allocations and then computes weights from the complete historical database. That is a legitimate product design, but it changes the meaning of the input/output contract and introduces database-dependent testing and operational complexity.

### Overall status

| Area | Status | Finding |
|---|---|---|
| Weighting formula | Pass | Correctly rewards distributed participation for equal raw totals. |
| Same-user grouping | Pass | Repeated allocations are merged before dampening. |
| Required Test A/Test B | Pass | Present in both implementations; backend tests pass. |
| Backend validation | Pass | Invalid arrays, IDs, negative values, and malformed amounts are rejected. |
| Backend build/typecheck/lint | Pass | All passed locally. |
| Backend Docker image | **Fail** | Dockerfile omits `tsconfig.build.json`. Verified build failure. |
| Full-stack typecheck/lint/build | Pass | All passed locally. |
| Full-stack API integration tests | **Fail** | 1 of 17 tests timed out at 5 seconds. |
| Public GitHub deliverable | **Incomplete** | Workspace has no Git repository or configured remote. |
| Extreme-number safety | Improvement needed | Finite individual numbers can still overflow when aggregated. |

## 2. Mathematical and algorithmic review

### Formula used

For each target:

```text
userTotal(u, target) = sum of all allocations by user u to target
weight(target) = (sum over users of sqrt(userTotal(u, target)))²
```

This is a quadratic-funding-style formula. It has the intended property for equal raw totals:

```text
one contributor:
  weight = sqrt(T)² = T

n equally contributing users:
  weight = (n * sqrt(T / n))² = nT
```

Therefore, if the total amount is held constant, the ratio between the distributed and concentrated cases is `n`. For the required scenario:

```text
Target A: 1 × 10,000  -> weight 10,000
Target B: 100 × 100   -> weight 1,000,000
ratio: 100×
```

The implementation and assertions agree with this derivation.

### Why grouping before `sqrt` matters

The code correctly sums repeated allocations from the same user first. If it instead applied `sqrt` to every raw row, one user could increase their score by splitting one contribution into multiple requests:

```text
sqrt(50) + sqrt(50) > sqrt(100)
```

The current behavior avoids that self-splitting loophole. This directly satisfies the challenge note that one user may submit multiple allocations to the same target.

### Important limitation of the formula

The formula strongly rewards breadth, but it does not guarantee that a crowd always beats a whale. A sufficiently large concentrated allocation can still exceed a smaller distributed total. The defensible guarantee is narrower and clearer:

> For equal raw totals, greater independent participation produces a greater weight.

The README should use this precise claim consistently. If the business requirement means that a crowd must beat a whale even when the whale contributes materially more capital, the formula would need an additional cap, normalization, or explicit participation-vs-capital weighting policy.

### Sybil resistance

The algorithm assumes that each `userId` represents one genuine independent participant. A malicious actor who can create 100 fake user IDs can reproduce the distributed multiplier. The project documentation correctly identifies this as a limitation. Preventing it requires identity, account-verification, stake, or social-graph mechanisms outside the scope of this API.

## 3. Backend-only review

### Correctness

`backend-only/src/domain/computeWeights.ts` is well isolated as a pure function. Its key behavior is sound:

- `Map<targetId, Map<userId, amount>>` gives expected O(n) grouping behavior;
- zero amounts are ignored rather than counted as contributors;
- user IDs are trimmed at the validation boundary;
- the same user is independent per target;
- results are sorted descending by weight; and
- output values are rounded to two decimal places.

The service layer validates the complete body before calling the domain function, so malformed rows do not produce partial results.

### API behavior

The endpoint is:

```text
POST /allocations/weights
```

It returns an array of target results. The path is different from the full-stack `/api/allocations/weights` path, but the challenge does not mandate a specific URL. This is acceptable if the selected endpoint is clearly documented.

The additional `/health` and Swagger routes do not interfere with the required endpoint. If the evaluator interprets “single REST API endpoint” literally, these extras could be removed or described as operational support routes; they are not part of the scoring API.

### Backend verification performed

Commands run from `backend-only/`:

```text
npm test          PASS — 2 test files, 20 tests
npm run typecheck PASS
npm run build     PASS
npm run lint      PASS
npm audit --omit=dev --audit-level=high PASS — 0 vulnerabilities
```

The backend tests cover the required scenario end-to-end through Fastify injection as well as directly through the domain function.

### Confirmed backend defect: Docker build

The documented container workflow currently fails. The Dockerfile contains:

```dockerfile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
```

But `npm run build` executes:

```text
tsc -p tsconfig.build.json
```

The build output was:

```text
error TS5058: The specified path does not exist: 'tsconfig.build.json'.
```

Recommended correction:

```dockerfile
COPY tsconfig.json tsconfig.build.json ./
```

After the correction, run `docker build` and `docker compose up --build` again.

## 4. Full-stack review

### Correctness of duplicated domain logic

`fullstack/domain/computeWeights.ts` independently implements the same algorithm as the backend. The code matches the backend in the important areas:

- repeated same-user/same-target allocations are combined;
- zero allocations are omitted;
- whitespace around IDs is normalized by the validation/domain boundary;
- results are rounded and sorted; and
- the required ratio assertions are present.

The full-stack unit test suite covers the same core scenarios and edge cases as the backend unit tests.

### Full-stack build verification

Commands run from `fullstack/`:

```text
npm run lint       PASS
npm run build      PASS
npx tsc --noEmit   PASS
```

The production Next.js build successfully compiled the page and API route.

### Full-stack API semantics differ from the challenge

The full-stack POST handler does this:

1. parse and validate the submitted array;
2. persist the rows to PostgreSQL;
3. read every persisted allocation; and
4. return weights for the accumulated database.

This means two identical POST requests do not return the same result. The second request adds another contribution. By contrast, the challenge wording describes an endpoint that accepts an array and calculates the weights for that input.

This matters for evaluation. An evaluator may send Test A, then Test B, expecting two independent calculations. The full-stack endpoint will retain Test A in the database unless the evaluator resets state. The backend-only implementation does not have this problem.

Recommended choices:

- make `backend-only` the official challenge submission; or
- change the full-stack POST route to calculate only from the submitted body; or
- explicitly document the full-stack route as a persistence/demo variant and provide a stateless scoring route for challenge compliance.

### Full-stack test result

The command:

```text
npm test
```

produced:

```text
1 failed, 16 passed, 17 total
```

The failing test was the first database-backed API test:

```text
persists allocations and returns weights for the full accumulated dataset
Error: Test timed out in 5000ms
```

The unit suite passed, and the failure occurred during the database-backed route suite. This suggests a database connection/readiness/connection-pool issue or a slow first database operation, but the timeout alone does not prove the exact root cause. The test setup should be made deterministic before presenting the full-stack project as fully green.

Recommended improvements:

- add an explicit database readiness check before starting the tests;
- ensure `DATABASE_URL` is loaded consistently in the Vitest process;
- use a test database/schema isolated from development data;
- disconnect Prisma in `afterAll`; and
- increase the timeout only after confirming the operation is healthy, rather than masking a connection problem.

The full-stack test cleanup deletes only rows whose target IDs use the test prefix. That is a good isolation technique, but it does not replace database setup and teardown guarantees.

### Database and numeric consistency

The database stores amounts as PostgreSQL `Decimal(18, 2)`, then converts them to JavaScript numbers with `toNumber()` before computing weights. This is practical for the take-home scenario, but it has two consequences:

1. values are limited to two decimal places by persistence even though the request schema accepts arbitrary finite decimals;
2. converting Decimal values to IEEE-754 numbers can introduce precision limitations for sufficiently large values.

The API should either document the two-decimal money precision or validate amounts accordingly. For production financial calculations, keeping the calculation in decimal arithmetic would be safer.

## 5. Edge-case review

### Covered well

The projects cover these cases in tests or documented design:

- empty array;
- zero amount;
- negative amount;
- missing IDs;
- empty or whitespace-only IDs;
- non-array body;
- non-numeric amount;
- repeated same-user allocations;
- same user supporting multiple targets;
- whitespace-normalized user IDs;
- large but ordinary amounts;
- deterministic descending ordering; and
- Sybil behavior as a documented limitation.

### Additional cases worth adding

1. A request with several invalid rows should return all relevant validation details, not only the first error.
2. A target ID with surrounding whitespace should be tested explicitly, not only a user ID.
3. Duplicate target IDs with different user IDs should verify raw totals and unique counts together.
4. Decimal amounts such as `0.1` and `0.2` should verify the two-decimal response behavior.
5. A very large finite amount should verify that the API rejects or safely handles aggregate overflow.
6. A maximum allocation-count test should verify that the service does not accept unbounded memory-consuming payloads.
7. Ties should verify whether input order is intentionally preserved or whether a secondary deterministic sort is required.

### Numeric overflow risk

The schema checks that each amount is finite, but this does not guarantee that the sum remains finite. For example, `Number.MAX_VALUE` passes the individual finite check, while adding or rounding values can produce `Infinity`. JSON serialization of non-finite numbers can result in `null`, which would violate the intended numeric response contract.

Recommended safeguards:

- set a maximum per-allocation amount;
- set a maximum request length;
- reject totals that exceed a defined safe range; and/or
- use decimal/big-number arithmetic where monetary precision matters.

## 6. Testing and documentation assessment

### Strengths

- The required Test A and Test B are explicit and easy to find.
- The tests assert both the minimum `2×` requirement and the exact expected `100×` ratio.
- The README explains why grouping must occur before square roots.
- The AI process log documents formula selection, implementation mistakes, and corrections.
- The plan documents the formula, API contract, edge cases, and test strategy.

### Documentation improvements

- Add the eventual public GitHub URL to the root README.
- State clearly that `backend-only` is the official take-home submission.
- Label `fullstack` as an optional persisted demo, unless its POST behavior is changed to be stateless.
- Add the Docker limitation and its fix once corrected.
- Include expected sample output in the backend README.
- Document whether amounts represent arbitrary numeric units or currency with two decimal places.
- Ensure the claimed AI tools and model names are factually accurate and reflect the actual build process.

## 7. Prioritized action plan

### P0 — required before submission

1. Fix the backend Dockerfile by copying `tsconfig.build.json`.
2. Run the Docker build again and verify the container endpoint with `curl`.
3. Publish the repository and add the GitHub link.
4. Make the backend-only folder the clearly identified official solution.

### P1 — strongly recommended

1. Resolve the full-stack database test timeout or mark the full-stack test as environment-dependent.
2. Clarify that the full-stack POST endpoint is persistent and therefore differs from the stateless challenge contract.
3. Add request-size and numeric-range limits.
4. Add overflow and target-ID normalization tests.

### P2 — production-quality improvements

1. Use decimal arithmetic throughout the full-stack calculation path.
2. Add rate limiting and payload limits to the full-stack route.
3. Add deterministic tie-breaking for equal weights.
4. Add a database readiness/health endpoint for the full-stack deployment.
5. Consider a shared package for the formula if maintaining both implementations long-term; duplicated algorithms can drift.

## 8. Final recommendation

The project demonstrates the required mathematical dampening correctly. Submit the backend-only implementation after fixing its Dockerfile and publishing the repository. Keep the full-stack implementation as an optional demonstration, but do not present it as the exact same API unless its persistence semantics and database-backed test setup are addressed.
