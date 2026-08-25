"use client";

import { useEffect, useState } from "react";
import type { ApiCallResult } from "@/lib/apiClient";
import { toCurl } from "@/lib/apiClient";
import { formatBytes, formatCompact, formatDuration } from "@/lib/format";
import { prettyJson } from "@/lib/json";
import type { WeightDelta } from "@/lib/weightDiff";
import { Badge, CopyButton, Panel, SegmentedControl, StatusPill } from "@/components/ui/Primitives";
import { JsonPane } from "@/components/console/JsonPane";

type ResponseTab = "body" | "headers" | "impact" | "curl";

interface ResponsePanelProps {
  result: ApiCallResult | null;
  /** Wall-clock start of the in-flight call, or null when idle. */
  inFlightSince: number | null;
  inFlightLabel: string | null;
  impact: WeightDelta[] | null;
}

/**
 * Ticks while a call is open so latency is watchable, not just reported afterwards.
 * The effect only starts a clock  -  the elapsed value is derived at render time, so
 * opening a call never has to seed state from inside an effect.
 */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(timer);
  }, [since]);

  return since === null ? 0 : Math.max(now - since, 0);
}

export function ResponsePanel({ result, inFlightSince, inFlightLabel, impact }: ResponsePanelProps) {
  const [tab, setTab] = useState<ResponseTab>("body");
  const elapsed = useElapsed(inFlightSince);
  const inFlight = inFlightSince !== null;

  const bodyText = result
    ? result.body === undefined
      ? result.responseText
      : prettyJson(result.body)
    : "";

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <Panel
      title="Response"
      meta={
        inFlight ? (
          <>
            <Badge tone="accent" mono className="cw-pulse">
              in flight
            </Badge>
            <span className="mono tabular text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {formatDuration(elapsed)}
            </span>
            {inFlightLabel ? (
              <span className="truncate text-[12px]" style={{ color: "var(--ink-muted)" }}>
                {inFlightLabel}
              </span>
            ) : null}
          </>
        ) : result ? (
          <>
            <StatusPill status={result.status} networkError={result.networkError} />
            <span className="mono tabular text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {formatDuration(result.latencyMs)}
            </span>
            <Badge tone="neutral" mono>
              {formatBytes(result.responseBytes)}
            </Badge>
          </>
        ) : (
          <Badge tone="neutral">idle</Badge>
        )
      }
      actions={
        <SegmentedControl
          ariaLabel="Response view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "body", label: "Body" },
            { value: "headers", label: "Headers" },
            { value: "impact", label: "Impact", title: "What this call changed in the ranking" },
            { value: "curl", label: "cURL" },
          ]}
        />
      }
    >
      {inFlight ? (
        <JsonPane text="" loading minHeight={300} />
      ) : !result ? (
        <div
          className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
          style={{ color: "var(--ink-muted)" }}
        >
          <span className="text-[13px]">No call yet.</span>
          <span className="max-w-[34ch] text-[12.5px]">
            Send the request on the left, or run a scenario below  -  the full response lands here.
          </span>
        </div>
      ) : tab === "body" ? (
        <>
          {result.networkError ? (
            <div className="px-4 py-3 text-[12.5px]" style={{ background: "var(--critical-wash)", color: "var(--critical)" }}>
              {result.networkError}  -  is the dev server running?
            </div>
          ) : null}
          <JsonPane
            text={bodyText}
            revealKey={result.id}
            emptyLabel="Empty response body"
            minHeight={300}
            maxHeight={420}
          />
        </>
      ) : tab === "headers" ? (
        <HeadersView result={result} />
      ) : tab === "impact" ? (
        <ImpactView impact={impact} result={result} />
      ) : (
        <CurlView command={toCurl(result, origin)} />
      )}
    </Panel>
  );
}

function HeadersView({ result }: { result: ApiCallResult }) {
  const sections: Array<[string, Record<string, string>]> = [
    ["Request", result.requestHeaders],
    ["Response", result.responseHeaders],
  ];

  return (
    <div className="scroll-thin flex flex-col gap-4 overflow-auto px-4 py-3" style={{ maxHeight: 420 }}>
      {sections.map(([label, headers]) => (
        <div key={label} className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
            {label}
          </span>
          {Object.keys(headers).length === 0 ? (
            <span className="text-[12.5px]" style={{ color: "var(--ink-muted)" }}>
              none
            </span>
          ) : (
            <dl className="mono flex flex-col gap-1 text-[12px]">
              {Object.entries(headers).map(([name, value]) => (
                <div key={name} className="flex gap-2">
                  <dt className="shrink-0" style={{ color: "var(--json-key)" }}>
                    {name}:
                  </dt>
                  <dd className="min-w-0 break-all" style={{ color: "var(--ink-secondary)" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

function ImpactView({ impact, result }: { impact: WeightDelta[] | null; result: ApiCallResult }) {
  if (!impact || impact.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-8 text-center">
        <span className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          {result.method === "GET"
            ? "A read changes nothing  -  that is the point."
            : result.ok
              ? "No target's weight moved."
              : "Rejected, so nothing was written."}
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-muted)" }}>
          Impact compares the ranking before this call with the one it returned.
        </span>
      </div>
    );
  }

  const largest = Math.max(...impact.map((delta) => Math.abs(delta.change)), 1);

  return (
    <div className="scroll-thin flex flex-col divide-y overflow-auto" style={{ maxHeight: 420 }}>
      {impact.map((delta) => (
        <div key={delta.targetId} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "var(--hairline)" }}>
          <span className="mono min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--ink-primary)" }}>
            {delta.targetId}
          </span>
          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--accent-track)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((Math.abs(delta.change) / largest) * 100, 3)}%`,
                background: delta.before === null ? "var(--accent-2)" : "var(--accent)",
              }}
            />
          </div>
          <span className="tabular w-28 shrink-0 text-right text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
            {delta.before === null ? "new" : formatCompact(delta.before)} → {formatCompact(delta.after)}
          </span>
          <span
            className="tabular w-20 shrink-0 text-right text-[12.5px] font-semibold"
            style={{ color: delta.change >= 0 ? "var(--success)" : "var(--critical)" }}
          >
            {delta.change >= 0 ? "+" : " - "}
            {formatCompact(Math.abs(delta.change))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CurlView({ command }: { command: string }) {
  return (
    <div className="relative">
      <pre
        className="scroll-thin mono overflow-auto px-4 py-3 text-[12px] leading-[1.6] whitespace-pre"
        style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)", maxHeight: 420, minHeight: 200 }}
      >
        {command}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={command} label="Copy command" />
      </div>
    </div>
  );
}
