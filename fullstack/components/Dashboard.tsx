"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetWeight } from "@/domain/types";
import { callApi, type ApiCallResult } from "@/lib/apiClient";
import { formatCompact, formatDuration, formatInteger } from "@/lib/format";
import type { DashboardData } from "@/lib/getTargetWeights";
import { diffWeights, weightsFromBody, type WeightDelta } from "@/lib/weightDiff";
import { StatTile } from "@/components/StatTile";
import { RankingsPanel } from "@/components/RankingsPanel";
import { Badge, Panel } from "@/components/ui/Primitives";
import { HealthBadge } from "@/components/console/HealthBadge";
import { JsonPane } from "@/components/console/JsonPane";
import { RequestLog } from "@/components/console/RequestLog";
import { RequestPanel, type RequestStatusMessage } from "@/components/console/RequestPanel";
import { ResponsePanel } from "@/components/console/ResponsePanel";
import { ScenarioLab } from "@/components/console/ScenarioLab";
import { TransferWire, type WireState } from "@/components/console/TransferWire";
import { useRequestDraft } from "@/components/console/useRequestDraft";
import { useScenarioRunner } from "@/components/console/useScenarioRunner";

/** How long a row stays highlighted after a call moved it. */
const FLASH_MS = 1800;
/**
 * Server data is re-fetched after writes, but a scenario run fires dozens of them  -
 * coalescing keeps that to one round trip per burst instead of one per call.
 */
const REFRESH_DEBOUNCE_MS = 900;
const AUTO_REFRESH_MS = 10_000;
const MAX_HISTORY = 60;

interface DashboardProps {
  initial: DashboardData;
}

export function Dashboard({ initial }: DashboardProps) {
  const router = useRouter();
  const draft = useRequestDraft();

  const [weights, setWeights] = useState<TargetWeight[]>(initial.weights);
  const [previous, setPrevious] = useState<Map<string, number>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<ApiCallResult[]>([]);
  const [impacts, setImpacts] = useState<Record<string, WeightDelta[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<{ since: number; label: string } | null>(null);
  const [status, setStatus] = useState<RequestStatusMessage | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [serverStats, setServerStats] = useState({
    contributors: initial.totalContributors,
    rawCapital: initial.totalRawCapital,
  });

  // The authoritative "weights before this call", read synchronously inside the
  // call handler  -  state would still hold the previous render's value there.
  const weightsRef = useRef<TargetWeight[]>(initial.weights);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-rendered data wins whenever it arrives (initial load and every
  // router.refresh()), because it is computed from the database rather than
  // inferred from one response body. Adjusting state during render  -  rather than
  // in an effect  -  is React's own pattern for "a prop changed, derived state must
  // follow": it re-renders before anything paints, with no intermediate frame.
  const [syncedFrom, setSyncedFrom] = useState(initial);
  if (syncedFrom !== initial) {
    setSyncedFrom(initial);
    setWeights(initial.weights);
    setServerStats({ contributors: initial.totalContributors, rawCapital: initial.totalRawCapital });
  }

  useEffect(() => {
    weightsRef.current = initial.weights;
  }, [initial]);

  useEffect(() => {
    if (changed.size === 0) return;
    const timer = setTimeout(() => setChanged(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [changed]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
  }, [router]);

  /** Single funnel for every call the page makes  -  manual sends and scenario steps alike. */
  const recordCall = useCallback(
    (result: ApiCallResult) => {
      setHistory((current) => [result, ...current].slice(0, MAX_HISTORY));
      setSelectedId(result.id);

      const returned = weightsFromBody(result.body);
      if (returned) {
        const before = weightsRef.current;
        const delta = diffWeights(before, returned);
        weightsRef.current = returned;
        setPrevious(new Map(before.map((w) => [w.targetId, w.weight])));
        setWeights(returned);
        setImpacts((current) => ({ ...current, [result.id]: delta }));
        if (delta.length > 0) setChanged(new Set(delta.map((d) => d.targetId)));
      }

      if (result.method === "POST" && result.ok) scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const runner = useScenarioRunner(recordCall);

  const send = useCallback(async () => {
    if (draft.method === "POST" && draft.mode === "form" && draft.itemCount === 0) {
      setStatus({ tone: "warning", text: "Add at least one allocation row." });
      return;
    }

    const label =
      draft.method === "GET"
        ? "Read current weights"
        : `Submit ${draft.itemCount === null ? "raw" : formatInteger(draft.itemCount)} allocation${
            draft.itemCount === 1 ? "" : "s"
          }`;

    setStatus(null);
    setInFlight({ since: Date.now(), label });

    const result = await callApi({
      method: draft.method,
      body: draft.bodyText,
      idempotencyKey: draft.useIdempotencyKey ? draft.idempotencyKey : null,
      label,
    });

    recordCall(result);
    setInFlight(null);

    if (result.networkError) {
      setStatus({ tone: "critical", text: `Could not reach the API  -  ${result.networkError}` });
      return;
    }
    if (result.ok) {
      setStatus({
        tone: "success",
        text:
          draft.method === "POST"
            ? "Submitted  -  the leaderboard has been updated."
            : `Weights refreshed  -  ${formatInteger(weightsFromBody(result.body)?.length ?? 0)} targets in ${formatDuration(result.latencyMs)}.`,
      });
      return;
    }

    const body = result.body as { error?: string; message?: string } | undefined;
    setStatus({
      tone: result.status >= 500 ? "critical" : "warning",
      text: `${result.status} ${body?.error ?? "Error"}  -  ${body?.message ?? "the API rejected this request"}`,
    });
  }, [draft, recordCall]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (inFlight || runner.activeScenarioId) return;
      void callApi({ method: "GET", label: "Auto-refresh" }).then(recordCall);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, inFlight, recordCall, runner.activeScenarioId]);

  const selected = useMemo(
    () => history.find((call) => call.id === selectedId) ?? null,
    [history, selectedId],
  );

  const latencies = history.map((call) => call.latencyMs).sort((a, b) => a - b);
  const medianLatency = latencies.length ? latencies[Math.floor(latencies.length / 2)]! : 0;
  const topTarget = weights[0];
  const rawCapitalFromWeights = weights.reduce((sum, w) => sum + w.rawTotal, 0);

  const wireState: WireState = inFlight
    ? "sending"
    : selected
      ? selected.ok
        ? "ok"
        : "error"
      : "idle";

  return (
    <main className="dashboard-shell mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-8 lg:gap-7 lg:py-8">
      <header className="dashboard-hero">
        <div className="dashboard-hero-glow" aria-hidden="true" />
        <div className="relative flex flex-col gap-7 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="max-w-3xl">
            <div className="dashboard-kicker">
              <span className="dashboard-kicker-mark" />
              <span>Consensus Weighting</span>
              <span className="dashboard-kicker-divider" />
              <span className="dashboard-kicker-muted">Live workspace</span>
            </div>
            <h1 className="dashboard-title">Make collective support count.</h1>
            <p className="dashboard-subtitle">
              Compare how much money a target raised with how broadly people supported it. The consensus score
              rewards many independent contributors without letting one person game the result by splitting a gift.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="dashboard-formula mono">(Σ√userTotal)²</span>
              <span className="dashboard-formula-note">broad support becomes visible in the ranking</span>
            </div>
          </div>

          <div className="relative flex shrink-0 flex-wrap items-center gap-2">
            <HealthBadge />
            <label className="dashboard-toggle" title="Poll GET /api/allocations/weights every 10 seconds">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              Auto-refresh
            </label>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Targets" value={weights.length} />
        <StatTile label="Contributors" value={serverStats.contributors} />
        <StatTile label="Raw capital" value={rawCapitalFromWeights} format={(v) => `$${formatCompact(v)}`} />
        <StatTile
          label="Top target"
          value={topTarget ? topTarget.targetId : " - "}
          sublabel={topTarget ? `${formatCompact(topTarget.weight)} weight` : undefined}
        />
        <StatTile
          label="Calls this session"
          value={history.length}
          sublabel={history.length ? `p50 ${formatDuration(medianLatency)}` : "none yet"}
        />
        <StatTile
          label="Scenarios passed"
          value={runner.summary.ran === 0 ? " - " : `${runner.summary.passed}/${runner.summary.ran}`}
          sublabel={runner.summary.failed > 0 ? `${runner.summary.failed} failing` : "of those run"}
          tone={runner.summary.ran > 0 && runner.summary.failed === 0 ? "accent" : "default"}
        />
      </section>

      <section className="workspace-grid">
        <div className="min-w-0 flex-1">
          <RequestPanel draft={draft} inFlight={inFlight !== null} onSend={() => void send()} status={status} />
        </div>
        <TransferWire
          state={wireState}
          requestBytes={inFlight ? draft.bodyBytes : (selected?.requestBytes ?? 0)}
          responseBytes={selected?.responseBytes ?? 0}
        />
        <div className="min-w-0 flex-1">
          <ResponsePanel
            result={selected}
            inFlightSince={inFlight?.since ?? null}
            inFlightLabel={inFlight?.label ?? null}
            impact={selected ? (impacts[selected.id] ?? null) : null}
          />
        </div>
      </section>

      <RankingsPanel
        weights={weights}
        previous={previous}
        changed={changed}
        refreshing={inFlight !== null || runner.activeScenarioId !== null}
      />

      <ScenarioLab
        runner={runner}
        onInspect={(result) => {
          setSelectedId(result.id);
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <RequestLog
          history={history}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReplay={(result) => {
            draft.loadBody(result.requestBody ?? "[]", result.method);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onClear={() => {
            setHistory([]);
            setSelectedId(null);
          }}
        />

        <Panel
          title="Contract"
          meta={
            <Badge tone="neutral" mono>
              /api/allocations/weights
            </Badge>
          }
        >
          <div className="flex flex-col gap-2 px-4 py-3">
            <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
              <span className="mono">POST</span> persists the batch and answers with the full recomputed
              ranking; <span className="mono">GET</span> returns that ranking without writing. Both are rate
              limited to 100 requests per minute per client.
            </p>
            <JsonPane
              text={SHAPE_EXAMPLE}
              minHeight={150}
              maxHeight={220}
              copyLabel="Copy shape"
            />
          </div>
        </Panel>
      </section>
    </main>
  );
}

const SHAPE_EXAMPLE = `// request  -  POST body
[
  { "userId": "user_1", "targetId": "A", "amount": 10000 }
]

// response  -  200
[
  {
    "targetId": "A",
    "rawTotal": 10000,
    "uniqueUserCount": 1,
    "weight": 10000
  }
]

// response  -  400 / 409 / 429 / 500
{
  "error": "ValidationError",
  "message": "amount must be a non-negative number",
  "details": [
    { "index": 0, "field": "amount", "value": -50 }
  ]
}`;
