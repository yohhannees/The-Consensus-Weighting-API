

# Engineering rules

These rules apply to every change in this folder. The goal is code that is correct, explainable, maintainable, and easy to verify.

## Before changing code

- Read the relevant implementation and nearby tests before editing.
- Check git status and preserve unrelated user changes.
- Follow existing conventions before adding abstractions, dependencies, or new styles.
- Identify the user-visible behavior and make the smallest safe change.
- Treat environment files, database state, generated clients, and build output as sensitive project state.

## Programming rules

- Prefer simple, explicit code over clever code or premature abstraction.
- Keep business logic pure where possible. Do not mix database, HTTP, rendering, and calculation concerns unnecessarily.
- Preserve API contracts, response shapes, status codes, validation, and error behavior unless the task explicitly changes them.
- Validate at boundaries and keep the server as the source of truth. Do not hide invalid input with client-only coercion.
- Do not silently swallow errors. Use the established error shape and retain useful debugging context.
- Make loading, empty, success, failure, and in-flight UI states explicit.
- Keep controls keyboard accessible, clearly labeled, and usable on narrow screens.
- Reuse existing design tokens and components before adding one-off styles.
- Avoid unrelated formatting, generated files, dependency changes, and configuration changes.
- Never add secrets, credentials, production URLs, or personal data to code, tests, logs, or documentation.

## Testing rules

- Add or update a focused test when behavior changes.
- Prefer unit tests for pure logic and API tests for request and response behavior.
- Do not rely on end-to-end tests for every change. Use E2E only for critical journeys that cross the real browser, app, and database boundary.
- Do not write brittle tests based on timing, screen position, generated ids, seed order, or unrelated database state.
- Tests must create or clearly scope their own data. Never depend on whatever happens to be in a shared database.
- Do not weaken an assertion just to make a failing test pass. Fix the implementation or document the contract change.
- Destructive tests must use a local or disposable database with an obvious scope.
- Keep tests deterministic. Mock time, randomness, or network boundaries when they are not the behavior under test.

## Verification rules

Run the narrowest relevant checks first, then the full checks when practical:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

For database or UI changes, run the relevant integration or E2E test when local services are available. A successful typecheck is not proof that runtime behavior works.

Before handoff, verify the happy path, invalid input, failure states, existing tests, and the final diff. Remove debug logs and temporary files. Report any check that could not be run and why.

## Git rules

- Do not commit, push, create branches, amend commits, or rewrite history unless explicitly asked.
- Never use destructive commands such as `git reset --hard` or `git checkout --` to clean up work.
- Do not hide failing tests, remove coverage, or change configuration only to make CI green.
- Keep commits small and focused when commits are requested.
- Commit messages should describe the user-visible change, not the tool or model that made it.

## AI coding workflow

When an AI coding agent is used:

1. Ask it to inspect the relevant code and tests before editing.
2. Give it one focused outcome at a time.
3. Require it to explain assumptions when requirements are ambiguous.
4. Require evidence from tests, builds, or a manual check before accepting success.
5. Review the diff for scope, security, unnecessary complexity, and regressions.
6. Keep the final decision and commit under human control.

An agent must never claim that a feature was tested, deployed, rendered, or reviewed unless it actually performed that verification and can name the result.
