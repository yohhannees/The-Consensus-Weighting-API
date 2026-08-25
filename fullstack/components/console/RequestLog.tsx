"use client";

import type { ApiCallResult } from "@/lib/apiClient";
import { formatBytes, formatDuration } from "@/lib/format";
import { Badge, Panel, statusTone } from "@/components/ui/Primitives";

interface RequestLogProps {
  history: ApiCallResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReplay: (result: ApiCallResult) => void;
  onClear: () => void;
}

/** Latency of every call so far, oldest first — the shape of the session at a glance. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 4) return null;

  const width = 132;
  const height = 28;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function RequestLog({ history, selectedId, onSelect, onReplay, onClear }: RequestLogProps) {
  const latencies = history.map((call) => call.latencyMs);
  const sorted = [...latencies].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const failures = history.filter((call) => !call.ok).length;

  return (
    <Panel
      title="Session log"
      meta={
        history.length > 0 ? (
          <>
            <Badge tone="neutral" mono>
              {history.length} calls
            </Badge>
            <Badge tone="neutral" mono>
              p50 {formatDuration(median)}
            </Badge>
            {failures > 0 ? (
              <Badge tone="warning" mono>
                {failures} non-2xx
              </Badge>
            ) : null}
          </>
        ) : null
      }
      actions={
        <div className="flex items-center gap-2">
          <Sparkline values={[...latencies].reverse()} />
          {history.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ color: "var(--ink-muted)" }}
            >
              Clear
            </button>
          ) : null}
        </div>
      }
    >
      {history.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--ink-muted)" }}>
          Every call this session — yours and the scenario runner&apos;s — is recorded here, replayable.
        </p>
      ) : (
        <ul className="scroll-thin max-h-[320px] overflow-y-auto">
          {history.map((call) => {
            const selected = call.id === selectedId;
            return (
              <li key={call.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <div
                  className="flex items-center gap-2.5 px-3 py-2 transition-colors"
                  style={{ background: selected ? "var(--accent-wash)" : "transparent" }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(call.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="mono tabular shrink-0 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      {new Date(call.startedAt).toLocaleTimeString("en-US", { hour12: false })}
                    </span>
                    <Badge tone={call.method === "POST" ? "accent" : "alt"} mono>
                      {call.method}
                    </Badge>
                    <Badge tone={statusTone(call.status)} mono>
                      {call.status === 0 ? "ERR" : call.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
                      {call.label}
                    </span>
                    <span className="mono tabular shrink-0 text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
                      {formatDuration(call.latencyMs)}
                    </span>
                    <span
                      className="mono tabular hidden shrink-0 text-[11.5px] sm:inline"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {formatBytes(call.responseBytes)}
                    </span>
                  </button>
                  {call.requestBody !== null ? (
                    <button
                      type="button"
                      onClick={() => onReplay(call)}
                      title="Load this body back into the request editor"
                      className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{ background: "var(--surface-sunken)", color: "var(--accent)" }}
                    >
                      Load
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
