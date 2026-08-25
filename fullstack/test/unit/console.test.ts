import { describe, expect, it } from "vitest";
import { byteLength, prettyJson, tokenizeJsonLine } from "../../lib/json";
import { diffWeights, weightsFromBody } from "../../lib/weightDiff";
import { computeWeights } from "../../domain/computeWeights";
import type { Allocation, TargetWeight } from "../../domain/types";
import { LAB_PREFIX, newRunNonce, scenarios, statusMatches, type ScenarioStep } from "../../lib/scenarios";

describe("JSON tokenizer (console syntax highlighting)", () => {
  it("distinguishes a key from a string value", () => {
    const tokens = tokenizeJsonLine(`  "userId": "user_1",`);
    expect(tokens.find((t) => t.text === `"userId"`)?.kind).toBe("key");
    expect(tokens.find((t) => t.text === `"user_1"`)?.kind).toBe("string");
  });

  it("classifies numbers, booleans and null", () => {
    const kinds = tokenizeJsonLine(`[1, -2.5, 1e3, true, false, null]`)
      .filter((token) => token.kind !== "punct")
      .map((token) => token.kind);
    expect(kinds).toEqual(["number", "number", "number", "boolean", "boolean", "null"]);
  });

  it("never drops characters — concatenated tokens reproduce the line", () => {
    const line = `    { "targetId": "A", "weight": 1000000, "flag": null },`;
    expect(tokenizeJsonLine(line).map((token) => token.text).join("")).toBe(line);
  });

  it("does not mistake a colon inside a string for a key separator", () => {
    const tokens = tokenizeJsonLine(`  "message": "amount: -50 is invalid"`);
    expect(tokens.find((t) => t.text.includes("-50"))?.kind).toBe("string");
  });

  it("counts payload size in bytes, not code units", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("señor")).toBe(6);
  });

  it("falls back to a string for values JSON.stringify cannot handle", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof prettyJson(circular)).toBe("string");
  });
});

describe("call impact diff", () => {
  const before: TargetWeight[] = [
    { targetId: "A", rawTotal: 100, uniqueUserCount: 1, weight: 100 },
    { targetId: "B", rawTotal: 200, uniqueUserCount: 2, weight: 400 },
  ];

  it("reports new targets, changed targets, and skips untouched ones", () => {
    const after: TargetWeight[] = [
      { targetId: "B", rawTotal: 200, uniqueUserCount: 2, weight: 900 },
      { targetId: "C", rawTotal: 50, uniqueUserCount: 1, weight: 50 },
      ...before.filter((w) => w.targetId === "A"),
    ];

    const deltas = diffWeights(before, after);
    expect(deltas.map((d) => d.targetId)).toEqual(["B", "C"]);
    expect(deltas[0]).toMatchObject({ before: 400, after: 900, change: 500 });
    expect(deltas[1]!.before).toBeNull();
  });

  it("only treats a weights array as weights", () => {
    expect(weightsFromBody({ error: "ValidationError" })).toBeNull();
    expect(weightsFromBody([{ nope: true }])).toBeNull();
    expect(weightsFromBody(before)).toHaveLength(2);
  });
});

describe("scenario catalog", () => {
  const built = scenarios.map((scenario) => ({
    scenario,
    steps: scenario.build({ nonce: newRunNonce() }),
  }));

  it("has unique ids", () => {
    const ids = scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scenario builds at least one step, and POST steps carry a body", () => {
    for (const { scenario, steps } of built) {
      expect(steps.length, scenario.id).toBeGreaterThan(0);
      for (const step of steps) {
        if (step.method === "POST") expect(typeof step.body, scenario.id).toBe("string");
      }
    }
  });

  it("only ever writes to lab_-prefixed ids, so real data stays untouched", () => {
    for (const { scenario, steps } of built) {
      for (const step of steps) {
        if (step.method !== "POST" || !step.body) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(step.body);
        } catch {
          continue; // deliberately malformed bodies never reach the database
        }
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed as Array<Record<string, unknown>>) {
          const targetId = row.targetId;
          if (typeof targetId !== "string") continue;
          expect(targetId.trim().startsWith(LAB_PREFIX), `${scenario.id}: ${targetId}`).toBe(true);
        }
      }
    }
  });

  it("the mechanism scenarios assert the same numbers the algorithm actually produces", () => {
    // Runs each mechanism scenario's payload through the real compute function and
    // feeds the result to its own check — so a change to the algorithm fails here,
    // in CI, rather than only when someone clicks Run in the browser.
    const mechanisms = built.filter(({ scenario }) => scenario.group === "mechanism" && scenario.check);

    for (const { scenario, steps } of mechanisms) {
      const outcomes = steps.map((step: ScenarioStep) => {
        const allocations = JSON.parse(step.body!) as Allocation[];
        return { status: 200, body: computeWeights(allocations) };
      });
      const result = scenario.check!(outcomes);
      expect(result.ok, `${scenario.id}: ${result.message}`).toBe(true);
    }
  });

  it("matches a step's expected status whether one code or several are allowed", () => {
    expect(statusMatches(200, 200)).toBe(true);
    expect(statusMatches(200, 400)).toBe(false);
    expect(statusMatches([200, 429], 429)).toBe(true);
    expect(statusMatches([200, 429], 500)).toBe(false);
  });
});
