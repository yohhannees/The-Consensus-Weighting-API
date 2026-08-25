"use client";

import { useMemo, useState } from "react";
import type { TargetWeight } from "@/domain/types";
import { isLabTarget } from "@/lib/scenarios";
import { Badge, Panel, SegmentedControl } from "@/components/ui/Primitives";
import { Leaderboard } from "@/components/Leaderboard";
import { WeightChart } from "@/components/WeightChart";

interface RankingsPanelProps {
  weights: TargetWeight[];
  previous: Map<string, number>;
  changed: Set<string>;
  /** True while a call that will replace this ranking is in flight. */
  refreshing: boolean;
}

export function RankingsPanel({ weights, previous, changed, refreshing }: RankingsPanelProps) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [query, setQuery] = useState("");
  const [hideLab, setHideLab] = useState(false);

  const labCount = useMemo(() => weights.filter((w) => isLabTarget(w.targetId)).length, [weights]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return weights.filter((w) => {
      if (hideLab && isLabTarget(w.targetId)) return false;
      return needle === "" || w.targetId.toLowerCase().includes(needle);
    });
  }, [hideLab, query, weights]);

  return (
    <Panel
      title="Ranking"
      meta={
        <>
          <Badge tone="neutral" mono>
            {visible.length} of {weights.length} targets
          </Badge>
          {refreshing ? (
            <Badge tone="accent" mono className="cw-pulse">
              recomputing
            </Badge>
          ) : null}
        </>
      }
      actions={
        <SegmentedControl
          ariaLabel="Ranking view"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Table" },
            { value: "chart", label: "Chart", title: "Raw capital against weight, log - log" },
          ]}
        />
      }
    >
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <input
          aria-label="Filter targets"
          placeholder="Filter targets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mono min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--ring)", color: "var(--ink-primary)" }}
        />
        <label
          className="flex shrink-0 items-center gap-2 text-[12.5px]"
          style={{ color: labCount === 0 ? "var(--ink-muted)" : "var(--ink-secondary)" }}
          title="Scenario runs write to generated lab_ targets. Hide them to see only real data."
        >
          <input
            type="checkbox"
            checked={hideLab}
            onChange={(e) => setHideLab(e.target.checked)}
            disabled={labCount === 0}
            style={{ accentColor: "var(--accent)" }}
          />
          Hide <span className="mono">lab_</span> targets ({labCount})
        </label>
      </div>

      {view === "table" ? (
        <Leaderboard weights={visible} previous={previous} changed={changed} />
      ) : (
        <WeightChart weights={visible} highlighted={changed} />
      )}
    </Panel>
  );
}
