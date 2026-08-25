"use client";

import { useState } from "react";
import type { TargetWeight } from "@/domain/types";
import { consensusMultiplier, formatCompact } from "@/lib/format";

const WIDTH = 760;
const HEIGHT = 380;
const PADDING = { top: 24, right: 24, bottom: 44, left: 56 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

/** log10 with a +1 shift so a $0.01 target and an empty domain both stay finite. */
function toLog(value: number): number {
  return Math.log10(Math.max(value, 0) + 1);
}

function ticksUpTo(maxLog: number): number[] {
  const ticks: number[] = [];
  for (let power = 0; power <= Math.ceil(maxLog); power += 1) ticks.push(power);
  return ticks;
}

function tickLabel(power: number): string {
  return power === 0 ? "0" : formatCompact(10 ** power);
}

interface WeightChartProps {
  weights: TargetWeight[];
  /** Targets to draw with emphasis — the ones a call just moved. */
  highlighted?: Set<string>;
}

/**
 * Raw dollars (x) against weight (y), both log-scaled, with the diagonal drawn in.
 *
 * The diagonal is `weight = rawTotal`: exactly where a target lands when a single
 * contributor funds it, because (√total)² is the total. Every point *above* the line
 * is consensus, and its vertical distance from the line is the multiplier — which
 * makes the chart a direct picture of the rule rather than a decoration on top of it.
 * Bubble area encodes contributor count, the input that does the lifting.
 */
export function WeightChart({ weights, highlighted }: WeightChartProps) {
  const [hovered, setHovered] = useState<TargetWeight | null>(null);

  if (weights.length === 0) {
    return (
      <div className="flex items-center justify-center px-6 py-16 text-[13px]" style={{ color: "var(--ink-muted)" }}>
        No targets to plot yet.
      </div>
    );
  }

  const maxLog = Math.max(
    ...weights.map((w) => Math.max(toLog(w.rawTotal), toLog(w.weight))),
    1,
  );
  const domainMax = Math.ceil(maxLog) + 0.15;

  const x = (value: number) => PADDING.left + (toLog(value) / domainMax) * PLOT_WIDTH;
  const y = (value: number) => PADDING.top + PLOT_HEIGHT - (toLog(value) / domainMax) * PLOT_HEIGHT;

  const maxUsers = Math.max(...weights.map((w) => w.uniqueUserCount), 1);
  const radius = (users: number) => 4 + 14 * Math.sqrt(users / maxUsers);

  const ticks = ticksUpTo(domainMax);

  return (
    <div className="relative mx-auto w-full max-w-[900px] px-2 pt-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Raw capital against consensus weight"
      >
        <title>Each target plotted by raw capital raised and the weight it earned</title>

        {ticks.map((power) => (
          <g key={`grid-${power}`}>
            <line
              x1={x(10 ** power)}
              y1={PADDING.top}
              x2={x(10 ** power)}
              y2={PADDING.top + PLOT_HEIGHT}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            <line
              x1={PADDING.left}
              y1={y(10 ** power)}
              x2={PADDING.left + PLOT_WIDTH}
              y2={y(10 ** power)}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            <text
              x={x(10 ** power)}
              y={HEIGHT - PADDING.bottom + 18}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-muted)"
            >
              {tickLabel(power)}
            </text>
            <text
              x={PADDING.left - 10}
              y={y(10 ** power) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--ink-muted)"
            >
              {tickLabel(power)}
            </text>
          </g>
        ))}

        {/* weight = rawTotal: the line a single-contributor target sits exactly on. */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + PLOT_HEIGHT}
          x2={PADDING.left + PLOT_WIDTH}
          y2={PADDING.top}
          stroke="var(--baseline)"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        {/* Weight can never fall below raw total, so the area under the line is
            always empty — the safest place for the label. */}
        <text
          x={PADDING.left + PLOT_WIDTH - 6}
          y={PADDING.top + PLOT_HEIGHT - 12}
          textAnchor="end"
          fontSize="11"
          fill="var(--ink-muted)"
        >
          weight = dollars (a single contributor)
        </text>

        {weights.map((target) => {
          const isHot = highlighted?.has(target.targetId) ?? false;
          const boosted = consensusMultiplier(target.weight, target.rawTotal) > 1.05;
          return (
            <circle
              key={target.targetId}
              cx={x(target.rawTotal)}
              cy={y(target.weight)}
              r={radius(target.uniqueUserCount)}
              fill={boosted ? "var(--accent)" : "var(--accent-2)"}
              fillOpacity={hovered && hovered.targetId !== target.targetId ? 0.25 : 0.55}
              stroke={isHot ? "var(--ink-primary)" : boosted ? "var(--accent)" : "var(--accent-2)"}
              strokeWidth={isHot ? 2 : 1}
              onMouseEnter={() => setHovered(target)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        <text x={PADDING.left} y={HEIGHT - 8} fontSize="11" fill="var(--ink-secondary)">
          raw capital ($, log)
        </text>
        <text
          x={-(PADDING.top + PLOT_HEIGHT / 2)}
          y={16}
          fontSize="11"
          fill="var(--ink-secondary)"
          transform="rotate(-90)"
          textAnchor="middle"
        >
          weight (log)
        </text>
      </svg>

      <div className="flex flex-wrap items-center gap-4 px-4 pb-3 text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
        <LegendSwatch color="var(--accent)" label="consensus boost (many contributors)" />
        <LegendSwatch color="var(--accent-2)" label="single contributor — sits on the line" />
        <span>bubble size = unique contributors</span>
      </div>

      {hovered ? (
        <div
          className="pointer-events-none absolute left-4 top-4 rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--ring)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mono font-semibold" style={{ color: "var(--ink-primary)" }}>
            {hovered.targetId}
          </div>
          <div className="tabular" style={{ color: "var(--ink-secondary)" }}>
            ${formatCompact(hovered.rawTotal)} raw · {hovered.uniqueUserCount.toLocaleString("en-US")} contributors
          </div>
          <div className="tabular" style={{ color: "var(--ink-secondary)" }}>
            weight {formatCompact(hovered.weight)} ·{" "}
            <span style={{ color: "var(--accent)" }}>
              {consensusMultiplier(hovered.weight, hovered.rawTotal).toFixed(1)}×
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, opacity: 0.6 }} />
      {label}
    </span>
  );
}
