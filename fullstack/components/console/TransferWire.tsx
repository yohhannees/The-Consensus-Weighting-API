"use client";

import { formatBytes } from "@/lib/format";

export type WireState = "idle" | "sending" | "ok" | "error";

/**
 * The link between the two panels, drawn rather than implied: while a call is open
 * the dashes flow toward the response side and a packet dot travels the wire, so
 * "the request is on its way" is something you watch, not something you infer from
 * a spinner. After it lands, the wire stays labelled with what actually crossed it.
 */
export function TransferWire({
  state,
  requestBytes,
  responseBytes,
}: {
  state: WireState;
  requestBytes: number;
  responseBytes: number;
}) {
  const sending = state === "sending";
  const stroke =
    state === "error" ? "var(--critical)" : state === "ok" ? "var(--success)" : sending ? "var(--accent)" : "var(--baseline)";

  return (
    <div className="hidden w-16 shrink-0 flex-col items-center justify-center gap-2 py-8 lg:flex">
      <span className="mono tabular text-[10.5px]" style={{ color: "var(--ink-muted)" }}>
        {requestBytes > 0 ? `↑ ${formatBytes(requestBytes)}` : "↑  - "}
      </span>

      <svg width="64" height="120" viewBox="0 0 64 120" aria-hidden="true" className="overflow-visible">
        <line
          x1="32"
          y1="4"
          x2="32"
          y2="116"
          stroke={stroke}
          strokeWidth="1.5"
          strokeDasharray="4 6"
          strokeLinecap="round"
          style={sending ? { animation: "cw-dash 700ms linear infinite" } : undefined}
          opacity={sending ? 1 : 0.6}
        />
        {sending ? (
          <circle r="3.5" fill="var(--accent)">
            <animate attributeName="cy" from="4" to="116" dur="900ms" repeatCount="indefinite" />
            <animate attributeName="cx" from="32" to="32" dur="900ms" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" dur="900ms" repeatCount="indefinite" />
          </circle>
        ) : (
          <circle cx="32" cy="60" r="3" fill={stroke} opacity={state === "idle" ? 0.5 : 1} />
        )}
      </svg>

      <span className="mono tabular text-[10.5px]" style={{ color: "var(--ink-muted)" }}>
        {responseBytes > 0 ? `↓ ${formatBytes(responseBytes)}` : "↓  - "}
      </span>
    </div>
  );
}
