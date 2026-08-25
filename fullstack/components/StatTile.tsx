"use client";

import { useEffect, useRef, useState } from "react";

const COUNT_UP_MS = 460;

/**
 * Eases a displayed number toward a new value instead of swapping it.
 *
 * The tiles change as a side effect of calls made elsewhere on the page, so a bare
 * swap is easy to miss entirely; a short ramp is what makes "that number just moved"
 * visible. Non-finite or unchanged values skip the animation.
 */
function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (!Number.isFinite(target) || from === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from + (target - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = target;
    };
  }, [target]);

  return display;
}

interface StatTileProps {
  label: string;
  /** Numeric tiles animate and can show a delta; string tiles are rendered as-is. */
  value: number | string;
  format?: (value: number) => string;
  sublabel?: string;
  /** Change since the previous snapshot, in the same unit as `value`. */
  delta?: number | null;
  tone?: "default" | "accent";
}

export function StatTile({ label, value, format, sublabel, delta, tone = "default" }: StatTileProps) {
  const numeric = typeof value === "number" ? value : 0;
  const animated = useCountUp(numeric);
  const rendered =
    typeof value === "number" ? (format ? format(animated) : Math.round(animated).toLocaleString("en-US")) : value;

  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 rounded-2xl px-4 py-3.5"
      style={{
        background: tone === "accent" ? "var(--accent-wash)" : "var(--surface)",
        border: `1px solid ${tone === "accent" ? "var(--accent-track)" : "var(--ring)"}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        className="truncate text-[11.5px] font-medium uppercase tracking-[0.06em]"
        style={{ color: "var(--ink-muted)" }}
      >
        {label}
      </span>
      <span
        className="tabular truncate text-[26px] font-semibold leading-none"
        style={{ color: tone === "accent" ? "var(--accent)" : "var(--ink-primary)" }}
        title={typeof value === "string" ? value : undefined}
      >
        {rendered}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        {sublabel ? (
          <span className="truncate text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {sublabel}
          </span>
        ) : null}
        {delta !== undefined && delta !== null && Math.abs(delta) > 0 ? (
          <span
            className="tabular shrink-0 text-[12px] font-medium"
            style={{ color: delta > 0 ? "var(--success)" : "var(--critical)" }}
          >
            {delta > 0 ? "+" : "−"}
            {format ? format(Math.abs(delta)) : Math.abs(delta).toLocaleString("en-US")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
