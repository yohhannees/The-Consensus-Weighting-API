"use client";

import { useMemo, useState } from "react";
import type { ApiCallResult } from "@/lib/apiClient";
import { formatDuration } from "@/lib/format";
import { scenarioGroups, scenarios, type Scenario, type ScenarioGroup } from "@/lib/scenarios";
import { Badge, LiveDot, Panel, statusTone } from "@/components/ui/Primitives";
import type { ScenarioRun, ScenarioRunnerApi, StepRun } from "@/components/console/useScenarioRunner";

interface ScenarioLabProps {
  runner: ScenarioRunnerApi;
  /** Sends a recorded call back to the response inspector at the top of the page. */
  onInspect: (result: ApiCallResult) => void;
}

type GroupFilter = ScenarioGroup | "all";

const RUN_TONE = {
  idle: "neutral",
  running: "accent",
  passed: "success",
  failed: "critical",
  cancelled: "warning",
} as const;

export function ScenarioLab({ runner, onInspect }: ScenarioLabProps) {
  const [filter, setFilter] = useState<GroupFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? scenarios : scenarios.filter((scenario) => scenario.group === filter)),
    [filter],
  );

  const busy = runner.activeScenarioId !== null || runner.suite !== null;
  const suiteSize = scenarios.filter((scenario) => !scenario.heavy).length;

  return (
    <Panel
      title="Scenario lab"
      meta={
        <>
          <Badge tone="neutral" mono>
            {scenarios.length} scenarios
          </Badge>
          {runner.summary.ran > 0 ? (
            <>
              <Badge tone="success" mono>
                {runner.summary.passed} passed
              </Badge>
              {runner.summary.failed > 0 ? (
                <Badge tone="critical" mono>
                  {runner.summary.failed} failed
                </Badge>
              ) : null}
              <Badge tone="neutral" mono>
                {formatDuration(runner.summary.totalMs)}
              </Badge>
            </>
          ) : null}
        </>
      }
      actions={
        <div className="flex items-center gap-1.5">
          {runner.summary.ran > 0 && !busy ? (
            <button
              type="button"
              onClick={runner.reset}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ color: "var(--ink-muted)" }}
            >
              Reset
            </button>
          ) : null}
          {busy ? (
            <button
              type="button"
              onClick={runner.cancel}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--critical-wash)", color: "var(--critical)" }}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={runner.runAll}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Run all {suiteSize}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="max-w-[80ch] text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
          Each scenario fires real requests at the running API and asserts on what comes back  -  status code,
          error discriminator, and the numbers themselves. Targets are generated per run under the{" "}
          <span className="mono">lab_</span> prefix, so a scenario proves its point on data no earlier run
          touched (and the leaderboard can filter it out).
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${scenarios.length})`} />
          {scenarioGroups.map((group) => (
            <FilterChip
              key={group.id}
              active={filter === group.id}
              onClick={() => setFilter(group.id)}
              label={`${group.label} (${scenarios.filter((s) => s.group === group.id).length})`}
              title={group.blurb}
            />
          ))}
        </div>

        {runner.suite ? (
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--accent-track)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${(runner.suite.done / runner.suite.total) * 100}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
            <span className="mono tabular text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {runner.suite.done}/{runner.suite.total}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              run={runner.runs[scenario.id]}
              busy={busy}
              expanded={expandedId === scenario.id}
              onToggle={() => setExpandedId((current) => (current === scenario.id ? null : scenario.id))}
              onRun={() => runner.runScenario(scenario)}
              onInspect={onInspect}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
      style={{
        background: active ? "var(--accent-wash)" : "var(--surface-sunken)",
        color: active ? "var(--accent)" : "var(--ink-secondary)",
        border: `1px solid ${active ? "var(--accent-track)" : "var(--ring)"}`,
      }}
    >
      {label}
    </button>
  );
}

function ScenarioCard({
  scenario,
  run,
  busy,
  expanded,
  onToggle,
  onRun,
  onInspect,
}: {
  scenario: Scenario;
  run: ScenarioRun | undefined;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onInspect: (result: ApiCallResult) => void;
}) {
  const state = run?.state ?? "idle";
  const tone = RUN_TONE[state];
  const running = state === "running";

  const accent =
    state === "passed"
      ? "var(--success)"
      : state === "failed"
        ? "var(--critical)"
        : running
          ? "var(--accent)"
          : "var(--hairline)";

  return (
    <article
      className="flex flex-col gap-2 rounded-xl p-3 transition-colors"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--ring)",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <LiveDot tone={tone} pulsing={running} />
            <h3 className="min-w-0 truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              {scenario.title}
            </h3>
            {scenario.heavy ? (
              <Badge tone="warning" className="shrink-0">
                heavy
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {scenario.summary}
          </p>
        </button>

        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-40"
          style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
        >
          {running ? "Running" : run ? "Re-run" : "Run"}
        </button>
      </div>

      {run ? <StepStrip steps={run.steps} /> : null}

      {run && run.state !== "running" ? (
        <div className="flex items-start gap-1.5 text-[12px]">
          <span
            className="shrink-0 font-semibold"
            style={{
              color:
                run.state === "passed"
                  ? "var(--success)"
                  : run.state === "cancelled"
                    ? "var(--warning)"
                    : "var(--critical)",
            }}
          >
            {run.state === "passed" ? "PASS" : run.state === "cancelled" ? "STOPPED" : "FAIL"}
          </span>
          <span className="min-w-0" style={{ color: "var(--ink-secondary)" }}>
            {run.checkMessage ??
              run.steps.find((step) => step.failure)?.failure ??
              `${run.steps.length} step${run.steps.length === 1 ? "" : "s"} answered as specified`}
          </span>
          <span className="mono tabular ml-auto shrink-0" style={{ color: "var(--ink-muted)" }}>
            {formatDuration(run.durationMs)}
          </span>
        </div>
      ) : null}

      {expanded ? (
        <div className="cw-fade-up flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--hairline)" }}>
          <p className="pt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {scenario.detail}
          </p>
          {run ? (
            <ul className="flex flex-col gap-1">
              {run.steps.slice(0, 12).map((step, index) => (
                <li key={index} className="flex items-center gap-2 text-[12px]">
                  <Badge tone={step.result ? statusTone(step.result.status) : "neutral"} mono>
                    {step.result ? (step.result.status === 0 ? "ERR" : step.result.status) : " - "}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-secondary)" }}>
                    {step.label}
                  </span>
                  {step.result ? (
                    <>
                      <span className="mono tabular shrink-0" style={{ color: "var(--ink-muted)" }}>
                        {formatDuration(step.result.latencyMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspect(step.result!)}
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        Inspect
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
              {run.steps.length > 12 ? (
                <li className="text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
                  … {run.steps.length - 12} more steps (see the session log)
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
              Not run yet.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** One tick per step  -  readable whether a scenario has two steps or a hundred. */
function StepStrip({ steps }: { steps: StepRun[] }) {
  return (
    <div className="flex flex-wrap gap-[3px]">
      {steps.map((step, index) => (
        <span
          key={index}
          title={`${step.label}${step.failure ? `  -  ${step.failure}` : ""}`}
          className={`h-1.5 rounded-full ${step.state === "running" ? "cw-pulse" : ""}`}
          style={{
            width: steps.length > 30 ? 6 : steps.length > 8 ? 14 : 28,
            background:
              step.state === "passed"
                ? "var(--success)"
                : step.state === "failed"
                  ? "var(--critical)"
                  : step.state === "running"
                    ? "var(--accent)"
                    : "var(--baseline)",
          }}
        />
      ))}
    </div>
  );
}
