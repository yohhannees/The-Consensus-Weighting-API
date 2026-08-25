"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";
import { LiveDot } from "@/components/ui/Primitives";

type Health = "checking" | "ok" | "degraded" | "unreachable";

const POLL_MS = 20_000;

const LABEL: Record<Health, string> = {
  checking: "checking",
  ok: "API + database live",
  degraded: "database unreachable",
  unreachable: "API unreachable",
};

/**
 * Polls `/api/health`, which probes the database rather than just process liveness  -
 * so "live" here means a submitted allocation can actually be persisted, not merely
 * that Next.js is answering.
 */
export function HealthBadge() {
  const [health, setHealth] = useState<Health>("checking");
  const [latency, setLatency] = useState<number | null>(null);

  const check = useCallback(async () => {
    const started = performance.now();
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setLatency(performance.now() - started);
      setHealth(response.ok ? "ok" : "degraded");
    } catch {
      setLatency(null);
      setHealth("unreachable");
    }
  }, []);

  useEffect(() => {
    // Both the first probe and the poll run from timers rather than from the effect
    // body itself, so mounting never sets state synchronously mid-commit.
    const first = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [check]);

  const tone = health === "ok" ? "success" : health === "checking" ? "neutral" : "critical";

  return (
    <button
      type="button"
      onClick={() => void check()}
      title="Re-check /api/health"
      className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px]"
      style={{ background: "var(--surface)", border: "1px solid var(--ring)", color: "var(--ink-secondary)" }}
    >
      <LiveDot tone={tone} pulsing={health === "checking"} />
      {LABEL[health]}
      {latency !== null && health === "ok" ? (
        <span className="mono tabular" style={{ color: "var(--ink-muted)" }}>
          {formatDuration(latency)}
        </span>
      ) : null}
    </button>
  );
}
