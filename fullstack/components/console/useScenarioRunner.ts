"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { callApi, type ApiCallResult } from "@/lib/apiClient";
import {
  newRunNonce,
  scenarios,
  statusMatches,
  type Scenario,
  type ScenarioStep,
  type StepOutcome,
} from "@/lib/scenarios";

export type RunState = "idle" | "running" | "passed" | "failed" | "cancelled";

export interface StepRun {
  label: string;
  method: "GET" | "POST";
  expectStatus: number | number[];
  state: "pending" | "running" | "passed" | "failed";
  /** The recorded call, so any step of any scenario stays fully inspectable. */
  result?: ApiCallResult;
  failure?: string;
}

export interface ScenarioRun {
  state: RunState;
  steps: StepRun[];
  /** Result of the scenario's behavioral assertion, once its steps have all run. */
  checkMessage?: string;
  checkOk?: boolean;
  durationMs: number;
  finishedAt?: number;
}

function describeExpected(expected: number | number[]): string {
  return Array.isArray(expected) ? expected.join(" or ") : String(expected);
}

function errorCodeOf(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error: unknown }).error;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function toPendingStep(step: ScenarioStep): StepRun {
  return {
    label: step.label,
    method: step.method,
    expectStatus: step.expectStatus,
    state: "pending",
  };
}

export interface ScenarioRunnerApi {
  runs: Record<string, ScenarioRun>;
  activeScenarioId: string | null;
  /** Suite progress while "run all" is in flight, null otherwise. */
  suite: { done: number; total: number } | null;
  runScenario: (scenario: Scenario) => Promise<void>;
  runAll: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
  summary: { passed: number; failed: number; ran: number; totalMs: number };
}

/**
 * Runs scenarios one at a time, against the live API, recording each call.
 *
 * Sequential on purpose: the API is rate-limited per client and several scenarios
 * assert on *ordering* (a retry after a first write, a second read matching the
 * first), which parallel execution would make meaningless.
 */
export function useScenarioRunner(onCall: (result: ApiCallResult) => void): ScenarioRunnerApi {
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [suite, setSuite] = useState<{ done: number; total: number } | null>(null);
  const cancelledRef = useRef(false);

  const patchRun = useCallback((id: string, patch: Partial<ScenarioRun>) => {
    setRuns((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }));
  }, []);

  const patchStep = useCallback((id: string, index: number, patch: Partial<StepRun>) => {
    setRuns((current) => {
      const run = current[id];
      if (!run) return current;
      const steps = run.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
      return { ...current, [id]: { ...run, steps } };
    });
  }, []);

  const runScenario = useCallback(
    async (scenario: Scenario) => {
      const steps = scenario.build({ nonce: newRunNonce() });
      const startedAt = performance.now();

      setActiveScenarioId(scenario.id);
      setRuns((current) => ({
        ...current,
        [scenario.id]: { state: "running", steps: steps.map(toPendingStep), durationMs: 0 },
      }));

      const outcomes: StepOutcome[] = [];
      let allStepsPassed = true;

      for (const [index, step] of steps.entries()) {
        if (cancelledRef.current) {
          patchRun(scenario.id, { state: "cancelled", durationMs: performance.now() - startedAt });
          setActiveScenarioId(null);
          return;
        }

        patchStep(scenario.id, index, { state: "running" });

        const result = await callApi({
          method: step.method,
          body: step.body,
          idempotencyKey: step.idempotencyKey,
          label: `${scenario.title} · ${step.label}`,
        });
        onCall(result);
        outcomes.push({ status: result.status, body: result.body });

        const statusOk = statusMatches(step.expectStatus, result.status);
        const actualError = errorCodeOf(result.body);
        const errorOk = !step.expectError || actualError === step.expectError;

        let failure: string | undefined;
        if (!statusOk) {
          failure = `expected ${describeExpected(step.expectStatus)}, got ${
            result.status === 0 ? "no response" : result.status
          }`;
        } else if (!errorOk) {
          failure = `expected error "${step.expectError}", got "${actualError ?? "none"}"`;
        }

        if (failure) allStepsPassed = false;
        patchStep(scenario.id, index, {
          state: failure ? "failed" : "passed",
          result,
          failure,
        });
      }

      const check = scenario.check?.(outcomes);
      patchRun(scenario.id, {
        state: allStepsPassed && (check?.ok ?? true) ? "passed" : "failed",
        checkOk: check?.ok,
        checkMessage: check?.message,
        durationMs: performance.now() - startedAt,
        finishedAt: Date.now(),
      });
      setActiveScenarioId(null);
    },
    [onCall, patchRun, patchStep],
  );

  const runAll = useCallback(async () => {
    // Heavy scenarios (a maximum-size body, a deliberate rate-limit burst) stay
    // opt-in: including them would leave the limiter tripped for the next minute,
    // failing every scenario after them for reasons that aren't real defects.
    const queue = scenarios.filter((scenario) => !scenario.heavy);
    cancelledRef.current = false;
    setSuite({ done: 0, total: queue.length });

    for (const [index, scenario] of queue.entries()) {
      if (cancelledRef.current) break;
      await runScenario(scenario);
      setSuite({ done: index + 1, total: queue.length });
    }

    setSuite(null);
  }, [runScenario]);

  const runOne = useCallback(
    async (scenario: Scenario) => {
      cancelledRef.current = false;
      await runScenario(scenario);
    },
    [runScenario],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setRuns({});
    setSuite(null);
  }, []);

  const summary = useMemo(() => {
    const values = Object.values(runs);
    return {
      passed: values.filter((run) => run.state === "passed").length,
      failed: values.filter((run) => run.state === "failed").length,
      ran: values.filter((run) => run.state === "passed" || run.state === "failed").length,
      totalMs: values.reduce((total, run) => total + run.durationMs, 0),
    };
  }, [runs]);

  return {
    runs,
    activeScenarioId,
    suite,
    runScenario: runOne,
    runAll,
    cancel,
    reset,
    summary,
  };
}
