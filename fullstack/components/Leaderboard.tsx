"use client";

import type { TargetWeight } from "@/domain/types";
import { consensusMultiplier, formatCompact, formatInteger, formatPrecise, percentDelta } from "@/lib/format";

interface LeaderboardProps {
  weights: TargetWeight[];
  /** Weight per target as of the previous response, for the change column. */
  previous?: Map<string, number>;
  /** Targets the most recent call moved — these rows flash once. */
  changed?: Set<string>;
}

export function Leaderboard({ weights, previous, changed }: LeaderboardProps) {
  if (weights.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          No targets match. Submit a batch — or clear the filter — to see the ranking.
        </p>
      </div>
    );
  }

  const maxWeight = Math.max(...weights.map((w) => w.weight), 1);
  const maxRaw = Math.max(...weights.map((w) => w.rawTotal), 1);

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
            <Th className="w-12">#</Th>
            <Th>Target</Th>
            <Th className="text-right">Contributors</Th>
            <Th className="text-right">Raw total</Th>
            <Th className="w-[38%]">Weight vs raw capital</Th>
            <Th className="text-right">Boost</Th>
            <Th className="text-right">Change</Th>
          </tr>
        </thead>
        <tbody>
          {weights.map((weight, index) => (
            <Row
              key={weight.targetId}
              rank={index + 1}
              weight={weight}
              maxWeight={maxWeight}
              maxRaw={maxRaw}
              previousWeight={previous?.get(weight.targetId)}
              flash={changed?.has(weight.targetId) ?? false}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  rank,
  weight,
  maxWeight,
  maxRaw,
  previousWeight,
  flash,
}: {
  rank: number;
  weight: TargetWeight;
  maxWeight: number;
  maxRaw: number;
  previousWeight: number | undefined;
  flash: boolean;
}) {
  const multiplier = consensusMultiplier(weight.weight, weight.rawTotal);
  const barWidth = Math.max((weight.weight / maxWeight) * 100, 2);
  // Raw capital gets its own scale: the point of the pair is the *contrast* in
  // rank between dollars and weight, which a shared scale would flatten to nothing.
  const rawWidth = Math.max((weight.rawTotal / maxRaw) * 100, 2);
  const boosted = weight.uniqueUserCount > 1 && multiplier > 1.05;
  const delta = previousWeight === undefined ? null : percentDelta(weight.weight, previousWeight);
  const isNew = previousWeight === undefined;

  return (
    <tr className={flash ? "cw-flash" : ""} style={{ borderBottom: "1px solid var(--hairline)" }}>
      <Td>
        <span className="tabular text-[13px]" style={{ color: "var(--ink-muted)" }}>
          {rank}
        </span>
      </Td>
      <Td>
        <span className="mono text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          {weight.targetId}
        </span>
      </Td>
      <Td className="text-right">
        <span className="tabular text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
          {formatInteger(weight.uniqueUserCount)}
        </span>
      </Td>
      <Td className="text-right">
        <span className="tabular text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
          ${formatCompact(weight.rawTotal)}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--accent-track)" }}>
              <div
                data-testid={`weight-bar-${weight.targetId}`}
                className="h-full rounded-r-full transition-[width] duration-500"
                style={{ width: `${barWidth}%`, background: "var(--accent)" }}
                title={`weight ${formatPrecise(weight.weight)}`}
              />
            </div>
            <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--accent-2-wash)" }}>
              <div
                className="h-full rounded-r-full transition-[width] duration-500"
                style={{ width: `${rawWidth}%`, background: "var(--accent-2)", opacity: 0.7 }}
                title={`raw capital $${formatPrecise(weight.rawTotal)}`}
              />
            </div>
          </div>
          <span
            className="tabular w-20 shrink-0 text-right text-[14.5px] font-semibold"
            style={{ color: "var(--ink-primary)" }}
          >
            {formatCompact(weight.weight)}
          </span>
        </div>
      </Td>
      <Td className="text-right">
        <span
          className="tabular inline-flex rounded-full px-2 py-0.5 text-[13px] font-medium"
          style={boosted ? { color: "var(--success)", background: "var(--success-wash)" } : { color: "var(--ink-muted)" }}
        >
          {multiplier.toFixed(1)}×
        </span>
      </Td>
      <Td className="text-right">
        {isNew ? (
          <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
            —
          </span>
        ) : delta === null || Math.abs(delta) < 0.05 ? (
          <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
            no change
          </span>
        ) : (
          <span
            className="tabular text-[12.5px] font-medium"
            style={{ color: delta > 0 ? "var(--success)" : "var(--critical)" }}
          >
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </Td>
    </tr>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] ${className}`}
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
