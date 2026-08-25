import { getDashboardData } from "@/lib/getTargetWeights";
import { formatCompact, formatInteger } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { Leaderboard } from "@/components/Leaderboard";
import { AllocationForm } from "@/components/AllocationForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { weights, totalContributors, totalRawCapital } = await getDashboardData();
  const topWeight = weights[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
          <h1 className="text-[15px] font-semibold tracking-wide" style={{ color: "var(--ink-muted)" }}>
            CONSENSUS WEIGHTING
          </h1>
        </div>
        <p className="max-w-2xl text-[22px] font-semibold leading-snug" style={{ color: "var(--ink-primary)" }}>
          Broad, distributed support outweighs a single large contribution of the same size.
        </p>
        <p className="max-w-2xl text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          Each target&apos;s weight is <code className="tabular">(Σ√userTotal)²</code> — contributions from the
          same user to the same target are summed first, so splitting one contribution into many never
          helps. See the demo scenario below: two targets, identical $10,000 raised, very different weight.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Targets" value={formatInteger(weights.length)} />
        <StatTile label="Contributors" value={formatInteger(totalContributors)} />
        <StatTile label="Raw capital" value={`$${formatCompact(totalRawCapital)}`} />
        <StatTile
          label="Top target"
          value={topWeight ? topWeight.targetId : "—"}
          sublabel={topWeight ? `${formatCompact(topWeight.weight)} weight` : undefined}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Leaderboard weights={weights} />
        <AllocationForm />
      </section>
    </div>
  );
}
