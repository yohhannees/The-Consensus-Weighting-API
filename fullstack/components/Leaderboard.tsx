import type { TargetWeight } from "@/domain/types";
import { consensusMultiplier, formatCompact, formatInteger } from "@/lib/format";

interface LeaderboardProps {
  weights: TargetWeight[];
}

export function Leaderboard({ weights }: LeaderboardProps) {
  if (weights.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-12 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--ring)" }}
      >
        <p className="text-[15px]" style={{ color: "var(--ink-secondary)" }}>
          No allocations yet. Submit a batch to see targets ranked here.
        </p>
      </div>
    );
  }

  const maxWeight = Math.max(...weights.map((w) => w.weight), 1);

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "var(--surface)", border: "1px solid var(--ring)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
              <Th className="w-12">#</Th>
              <Th>Target</Th>
              <Th className="text-right">Contributors</Th>
              <Th className="text-right">Raw total</Th>
              <Th className="w-[46%]">Weight</Th>
              <Th className="text-right">Boost</Th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w, index) => (
              <Row key={w.targetId} rank={index + 1} weight={w} maxWeight={maxWeight} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ rank, weight, maxWeight }: { rank: number; weight: TargetWeight; maxWeight: number }) {
  const multiplier = consensusMultiplier(weight.weight, weight.rawTotal);
  const barWidth = Math.max((weight.weight / maxWeight) * 100, 2);
  const boosted = weight.uniqueUserCount > 1 && multiplier > 1.05;

  return (
    <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
      <Td>
        <span className="tabular text-[13px]" style={{ color: "var(--ink-muted)" }}>
          {rank}
        </span>
      </Td>
      <Td>
        <span className="font-semibold" style={{ color: "var(--ink-primary)" }}>
          {weight.targetId}
        </span>
      </Td>
      <Td className="text-right">
        <span className="tabular text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          {formatInteger(weight.uniqueUserCount)}
        </span>
      </Td>
      <Td className="text-right">
        <span className="tabular text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          ${formatCompact(weight.rawTotal)}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full"
            style={{ background: "var(--accent-track)" }}
          >
            <div
              data-testid={`weight-bar-${weight.targetId}`}
              className="h-full rounded-r-full"
              style={{ width: `${barWidth}%`, background: "var(--accent)" }}
            />
          </div>
          <span className="tabular w-20 shrink-0 text-right text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {formatCompact(weight.weight)}
          </span>
        </div>
      </Td>
      <Td className="text-right">
        <span
          className="tabular inline-flex rounded-full px-2 py-0.5 text-[13px] font-medium"
          style={
            boosted
              ? { color: "var(--success)", background: "var(--success-wash)" }
              : { color: "var(--ink-muted)" }
          }
        >
          {multiplier.toFixed(1)}×
        </span>
      </Td>
    </tr>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-[12px] font-medium uppercase tracking-wide ${className}`}
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 ${className}`}>{children}</td>;
}
