"use client";

import { useMemo, useState } from "react";
import { tokenizeJsonLine, type JsonTokenKind } from "@/lib/json";
import { CopyButton } from "@/components/ui/Primitives";

const TOKEN_COLOR: Record<JsonTokenKind, string> = {
  key: "var(--json-key)",
  string: "var(--json-string)",
  number: "var(--json-number)",
  boolean: "var(--json-boolean)",
  null: "var(--json-null)",
  punct: "var(--json-punct)",
};

/**
 * A 10,000-row body is ~700 KB and 60,000 lines: rendering it as DOM nodes would
 * lock the tab. The pane shows a window of it and offers one expansion, itself
 * still capped  -  enough to inspect the shape without ever mounting the whole thing.
 */
const DEFAULT_VISIBLE_LINES = 160;
const EXPANDED_VISIBLE_LINES = 2000;

interface JsonPaneProps {
  text: string;
  /** Changing this restarts the line-by-line reveal  -  one "arrival" per response. */
  revealKey?: string;
  emptyLabel?: string;
  /** Renders shimmer placeholders instead of content while a call is in flight. */
  loading?: boolean;
  minHeight?: number;
  maxHeight?: number;
  copyLabel?: string;
  /** Error text shown as a banner above the body (raw-mode parse failures). */
  problem?: string | null;
}

export function JsonPane({
  text,
  revealKey,
  emptyLabel = "Nothing to show yet",
  loading = false,
  minHeight = 180,
  maxHeight = 360,
  copyLabel = "Copy",
  problem = null,
}: JsonPaneProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => (text ? text.split("\n") : []), [text]);
  const limit = expanded ? EXPANDED_VISIBLE_LINES : DEFAULT_VISIBLE_LINES;
  const visible = lines.slice(0, limit);
  const hidden = lines.length - visible.length;

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3" style={{ minHeight }}>
        {[92, 74, 84, 60, 78, 52].map((width, index) => (
          <div key={index} className="cw-skeleton h-3" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  if (!text) {
    return (
      <div
        className="flex items-center justify-center px-4 text-[13px]"
        style={{ minHeight, color: "var(--ink-muted)" }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">
      {problem ? (
        <div
          className="px-4 py-2 text-[12px]"
          style={{ background: "var(--critical-wash)", color: "var(--critical)" }}
        >
          {problem}
        </div>
      ) : null}

      <div
        key={revealKey}
        className="scroll-thin mono overflow-auto px-1 py-2 text-[12px] leading-[1.55]"
        style={{ minHeight, maxHeight, background: "var(--surface-sunken)" }}
      >
        {visible.map((line, index) => (
          <div
            key={index}
            className="cw-line-in flex gap-3 px-3"
            // Cap the stagger: past ~48 lines the reveal should already be done,
            // otherwise a long body would animate for several seconds.
            style={{ ["--i" as string]: Math.min(index, 48) }}
          >
            <span
              className="w-8 shrink-0 select-none text-right tabular"
              style={{ color: "var(--baseline)" }}
            >
              {index + 1}
            </span>
            <span className="min-w-0 whitespace-pre">
              {tokenizeJsonLine(line).map((token, tokenIndex) => (
                <span key={tokenIndex} style={{ color: TOKEN_COLOR[token.kind] }}>
                  {token.text}
                </span>
              ))}
            </span>
          </div>
        ))}

        {hidden > 0 ? (
          <div className="flex items-center gap-3 px-3 pt-2">
            <span className="w-8 shrink-0" />
            {expanded ? (
              <span style={{ color: "var(--ink-muted)" }}>
                … {hidden.toLocaleString("en-US")} more lines not rendered
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
              >
                Show {Math.min(hidden, EXPANDED_VISIBLE_LINES - DEFAULT_VISIBLE_LINES).toLocaleString("en-US")} more
                lines
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="absolute right-2 top-2">
        <CopyButton value={text} label={copyLabel} />
      </div>
    </div>
  );
}
