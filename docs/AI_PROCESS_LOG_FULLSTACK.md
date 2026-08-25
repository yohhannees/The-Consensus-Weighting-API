# AI process log: fullstack implementation

This document records how the fullstack implementation was built with AI and what was checked manually. It answers the process-log requirement directly instead of treating AI usage as a black box.

## 1. Multi-model workflow

Different models were used for different jobs so that planning, implementation, testing, writing, and visual review were not all performed by one pass of one model.

| Role | Tool or model | Responsibility |
| --- | --- | --- |
| Planning and visual direction | Fable | Product framing, UI direction, page composition, and visual review of the dashboard experience. |
| Test design and test writing | Sol | Test cases, edge-case coverage, assertions, and checks for regressions. |
| Implementation and refactoring | Claude Sonnet | Primary coding, component implementation, API integration, debugging, and first-pass fixes. |
| Implementation review and difficult fixes | Claude Opus | Reviewing Sonnet's work, finding subtle correctness issues, improving code quality, and handling harder debugging tasks. |
| Documentation, review, and integration | Codex with ChatGPT 5.6 | Repository inspection, documentation structure, deployment review, cross-file consistency, and final verification. |

The terminal, local PostgreSQL database, build tools, and browser were used as evidence sources. They were not treated as AI opinions.

The models did not replace engineering judgment. Every important claim was checked by running code, inspecting output, or exercising the application.

## 2. Process and handoffs

The work used Plan Mode as an explicit quality gate. Code was not written immediately after a request. First, the repository and requirements were inspected, then a written plan was created, reviewed, and approved. Only after approval did implementation begin.

### Phase 1: Discover

Codex inspected the repository tree, package manifests, installed framework versions, current tests, plan documents, and both implementations. The goal was to understand existing behavior before suggesting a change and to avoid importing assumptions from older Next.js, Prisma, or testing conventions.

Output:

- Relevant files and entry points
- Existing contracts and invariants
- Known risks and dependencies
- Checks that would prove the change works

### Phase 2: Plan in Plan Mode

The request was converted into a concrete implementation plan before code changes. The plan described the intended behavior, affected files, test strategy, safety concerns, and an ordered list of small implementation steps.

The plan was written for review. It was not treated as private model reasoning or as permission to edit. This made it possible to catch scope problems, missing tests, risky database operations, and incorrect assumptions before implementation started.

### Phase 3: Approve the plan

The plan was reviewed and approved before the coding phase. Approval confirmed:

- The requested outcome was understood correctly.
- The scope was limited to the relevant files.
- Existing behavior that must remain unchanged was identified.
- The testing and verification approach was acceptable.
- Destructive actions and deployment changes were understood before execution.

This approval gate kept the work aligned with the user instead of allowing the model to expand the task silently.

### Phase 4: Design the product and algorithm

Fable shaped the product and visual direction so the dashboard explained the consensus mechanism instead of exposing a collection of unrelated controls. The math was reasoned about independently from framework code. Candidate formulas and grouping order were compared before implementation.

### Phase 5: Design the tests

Sol translated the specification into focused tests for the formula, grouping behavior, validation, idempotency, API responses, database boundaries, and important browser behavior. Tests were designed from the contract and edge cases, not merely copied from the implementation.

### Phase 6: Implement in small slices

Sonnet implemented the domain logic, routes, persistence, UI components, and interactions according to the approved plan. Each meaningful slice was checked before the next one was added. User input, error states, loading states, and existing API behavior were treated as part of the implementation contract.

### Phase 7: Review and harden

Opus reviewed the implementation for incorrect assumptions, hidden state, weak assertions, error paths, security risks, framework version changes, and unnecessary complexity. It then made targeted corrections rather than rewriting the project without evidence.

### Phase 8: Document and integrate

Codex consolidated the decisions, improved the README and agent instructions, checked deployment configuration, linked the supporting documents, and verified that the documentation matched the code.

### Phase 9: Verify the real application

The final behavior was checked with the real database, API routes, browser interactions, tests, and production build. A typecheck alone was never treated as proof that runtime behavior worked.

Each handoff had a concrete artifact: a discovery summary, an approved plan, a formula proof, a test matrix, an implementation, a review finding, or a verification result. No model was accepted as the authority merely because it generated confident text.

## 3. Detailed prompts and expected artifacts

The prompts were structured as engineering briefs. Each one named the constraints, the expected output, and the checks that had to pass. The prompts below are representative of the prompts used in the process, expanded so the reasoning is reproducible.

### 3.1 Repository planning prompt

```text
You are working in an existing repository called The Consensus Weighting API.
Before changing files, inspect the repository tree, package manifests, current tests,
the plan documents, and both implementations. Do not assume that the framework or
database APIs match your training data. Read the installed package documentation and
the existing code first.

The repository contains a stateless backend-only implementation and an independent
fullstack implementation. Keep those folders independent unless the task explicitly
requests a shared package.

Produce a short implementation plan before editing. The plan must identify:
1. the files that need to change;
2. the existing behavior that must not regress;
3. the relevant unit, API, integration, or browser tests;
4. data-loss, security, migration, and deployment risks;
5. the commands that will prove the change works.

Prefer the smallest change that satisfies the request. Do not rewrite unrelated code,
add dependencies without a reason, commit changes, or claim success before running
the relevant checks.
```

Expected artifact: a file-level plan with explicit risks and a verification checklist.

### 3.2 Math and formula prompt

```text
Design a weighting function for funding-style allocations grouped by target.

Required behavior:
- A target backed by many independent users should outrank a target backed by one
  user when both targets receive the same total capital.
- If one user contributes C to a target, the result should equal C.
- If n users each contribute C/n to that target, the result should be n times the
  concentrated result. The implementation must satisfy the challenge's minimum 2x
  comparison and explain the general ratio, not only the sample.
- Contributions must be non-negative and finite.
- The function must be deterministic and sortable with a documented tie-break rule.
- Explain zero amounts, duplicate rows, whitespace ids, negative amounts, large inputs,
  and repeated submissions.

Do not jump directly to a named mechanism. Compare raw sum, logarithmic dampening,
sqrt per row, sqrt per user total, and quadratic funding. For each candidate, show
whether it satisfies the concentrated versus distributed comparison and identify any
gaming opportunity.

Return the selected formula, an algebraic proof of the ratio, README-ready wording,
framework-free pseudocode, an edge-case table, and unit tests that would falsify an
incorrect implementation.
```

The prompt did not prescribe quadratic funding. The chosen formula was:

```text
weight(target) = (sum of sqrt(total contributed by each unique user))^2
```

The ratio was then proved with equal total capital. If one user contributes `C`, the weight is `C`. If `n` users each contribute `C / n`, the weight is:

```text
(n * sqrt(C / n))^2 = nC
```

Therefore the distributed case has an `n` times advantage for the same raw total. The required two times threshold is comfortably satisfied by the test scenario with 100 contributors.

### 3.3 Grouping and domain implementation prompt

```text
Implement the selected weighting formula as a pure domain function.

Input rows have userId, targetId, and amount. A user may appear multiple times for
the same target. Group by targetId, then by userId, sum all rows for that pair, and
only then apply the square root to each user's total. Never apply sqrt to individual
rows before merging.

Use an O(n) grouping structure. Trim ids only at the documented boundary. Do not
mutate caller input. Do not add framework or database imports.

Return deterministic output sorted by descending weight, then ascending targetId.
Handle empty input, zero totals, ties, and invalid boundary input according to the
specification.

Write tests for one user, 100 equal users, repeated rows, two users, self-splitting,
zero amounts, empty input, tied weights, and whitespace normalization.
```

The implementation groups by target, then by user, sums each user's allocations, and only then applies `sqrt`. This order is essential:

The implementation groups by target, then by user, sums each user's allocations, and only then applies `sqrt`. This order is essential:

```text
sqrt(a + b) < sqrt(a) + sqrt(b)
```

If the square root were applied to each row first, one user could increase a target's score by splitting one contribution into many rows. The grouping rule closes that self-splitting exploit.

### 3.4 Test design prompt

```text
Act as a strict test engineer for the Consensus Weighting API.

Read the specification, domain implementation, route schemas, persistence behavior,
and existing tests. Build a test matrix instead of only adding happy-path examples.

Cover pure domain invariants, API parsing and validation, response shapes and status
codes, headers, rate limits, persistence, idempotency, database failures, and the
critical browser journey. Use E2E only where a real browser proves something that
unit and API tests cannot.

Every test must state the contract it protects. Tests must own or clearly scope their
data. Prefix test-created ids. Do not depend on seed order, timing, screen position,
or unrelated database state. Do not use weak assertions such as 302 || 200. Do not
weaken an assertion to make a failing suite pass.

For every failure, identify whether the problem is in the implementation, test,
environment, or specification.
```

### 3.5 Implementation prompt

```text
Implement the approved plan in small, reviewable steps.

Preserve API contracts, response shapes, status codes, validation, and existing public
behavior unless the task explicitly changes them. Use the installed versions of Next.js,
Prisma, React, Zod, and the database adapter. Read local documentation and generated
types instead of relying on older examples.

Keep the domain formula independent from the UI and database. Keep validation at the
request boundary. Make errors structured and useful. For writes, reason explicitly
about retries, idempotency, transaction boundaries, and lost responses after commits.

For UI changes, keep loading, empty, success, error, and in-flight states visible.
Preserve user input after rejected requests. Keep controls accessible and responsive.

Run the narrowest relevant test after each meaningful change. At the end, run typecheck,
lint, the test suite, and the production build. Report changed files, behavior changed,
checks run, and anything that could not be verified.
```

### 3.6 UI and visual direction prompt

```text
Improve the dashboard without changing its API behavior or data flow.

The page must communicate one idea immediately: many independent contributors can
produce more consensus weight than one large contribution with the same raw total.
Create a clear hierarchy with a short explanation, useful summary metrics, a primary
request and response workspace, and quieter secondary tools.

Do not make the page look like an unstructured debug panel. Use consistent spacing,
surface treatment, typography, focus states, and responsive behavior. Keep the request
editor able to send valid and intentionally invalid JSON. Make samples, status, loading,
empty, and failure states discoverable. Do not remove headers, impact, cURL, history,
or scenario features.

Review desktop and narrow layouts, keyboard focus, contrast, long ids, large JSON bodies,
and reduced-motion behavior.
```

### 3.7 Review and deployment prompt

```text
Review the completed change as a skeptical maintainer.

Inspect the diff, not only the final files. Look for regressions in API contracts,
validation, database safety, idempotency, rate limiting, accessibility, responsive UI,
test independence, and secret handling. Check that documentation matches real commands.

For deployment, distinguish local Docker output from Vercel output. Confirm that build
configuration matches the target platform, DATABASE_URL is runtime-only, migrations
are deliberate, and local .env files cannot enter an image or repository.

Return findings ordered by severity. Each finding must include evidence, risk, and a
concrete fix. Never report deployment success from a source review alone.
```

## 4. Mistakes found and corrected

### Prisma version assumptions

The first implementation assumed the older Prisma configuration and client construction. The installed Prisma 7 version requires `prisma.config.ts` and an explicit PostgreSQL driver adapter. The configuration was rebuilt from the installed package's generated types and then verified with a real migration and seed.

### Browser validation blocked API error demonstrations

The amount field's native browser validation prevented a negative value from reaching the API. That meant the console could not demonstrate the API's own validation response. The form now uses `noValidate`, allowing the server contract to remain the source of truth and letting the UI display the structured error.

### Failed submissions erased user input

The first form behavior cleared rows after any submission attempt. That made correcting an invalid request unnecessarily painful. Rows are now retained after failures and cleared only after a confirmed successful submission.

### E2E test database coupling

The browser test initially depended too heavily on seed state. It was changed so the test prepares the known local scenario explicitly and asserts the visible ranking behavior rather than relying on unrelated rows already present in the database.

### Docker and Vercel output conflict

Docker needs Next standalone output, while Vercel supplies its own deployment pipeline. Forcing standalone output on Vercel caused a missing `.next/next-server.js.nft.json` error. The Next configuration now enables standalone output for Docker and disables it when `VERCEL` is set.

### Test assertion quality

An early assertion used JavaScript's `302 || 200`, which evaluates to `302` and does not mean either status. It was corrected to assert membership in `[200, 302]`. This is a reminder to review test expressions for real behavior, not just readable intent.

## 5. Verification approach

The implementation was checked with:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

The dashboard was also exercised through the browser, including request editing, invalid input, API submission, response inspection, scenario execution, and responsive layout checks. Destructive seed and end-to-end workflows are intended for a local or disposable database only.

## 6. What remains intentionally out of scope

- Authentication and authorization.
- Distributed rate-limit storage.
- Incremental precomputed aggregates for very large datasets.
- Sybil resistance or proof of personhood.

These are documented product boundaries, not hidden gaps in the formula.
