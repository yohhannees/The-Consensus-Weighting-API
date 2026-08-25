"use client";

import { useEffect, useState } from "react";

/**
 * The shared card shell. Every panel on the dashboard uses the same surface,
 * hairline, and header rhythm so the page reads as one instrument rather than a
 * pile of unrelated widgets.
 */
export function Panel({
  title,
  meta,
  actions,
  children,
  className = "",
  bodyClassName = "",
  tone = "default",
}: {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "default" | "raised";
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl ${className}`}
      style={{
        background: tone === "raised" ? "var(--surface-raised)" : "var(--surface)",
        border: "1px solid var(--ring)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {title !== undefined ? (
        <header
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--ink-muted)" }}
            >
              {title}
            </h2>
            {meta ? <div className="flex min-w-0 items-center gap-2">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "accent" | "success" | "warning" | "critical" | "alt";

const TONE_STYLES: Record<Tone, { color: string; background: string }> = {
  neutral: { color: "var(--ink-muted)", background: "var(--surface-sunken)" },
  accent: { color: "var(--accent)", background: "var(--accent-wash)" },
  alt: { color: "var(--accent-2)", background: "var(--accent-2-wash)" },
  success: { color: "var(--success)", background: "var(--success-wash)" },
  warning: { color: "var(--warning)", background: "var(--warning-wash)" },
  critical: { color: "var(--critical)", background: "var(--critical-wash)" },
};

export function Badge({
  children,
  tone = "neutral",
  mono = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        mono ? "mono" : ""
      } ${className}`}
      style={TONE_STYLES[tone]}
    >
      {children}
    </span>
  );
}

/** Maps an HTTP status onto the palette: 2xx success, 4xx warning, 5xx/0 critical. */
export function statusTone(status: number): Tone {
  if (status === 0) return "critical";
  if (status < 300) return "success";
  if (status < 500) return "warning";
  return "critical";
}

export function StatusPill({ status, networkError }: { status: number; networkError?: string }) {
  const label = status === 0 ? "NETWORK" : String(status);
  return (
    <Badge tone={statusTone(status)} mono className="px-2 py-1 text-[12px] font-semibold">
      {label}
      {networkError ? " · unreachable" : ""}
    </Badge>
  );
}

export function IconButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40"
      style={{
        color: active ? "var(--accent)" : "var(--ink-muted)",
        background: active ? "var(--accent-wash)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

/** Copy-to-clipboard with its own confirmation state — used on every JSON pane. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions) — a failed
      // copy shouldn't throw into the render tree, and the button just stays idle.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
      style={{
        color: copied ? "var(--success)" : "var(--ink-muted)",
        background: copied ? "var(--success-wash)" : "transparent",
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: "var(--surface-sunken)", border: "1px solid var(--ring)" }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            title={option.title}
            type="button"
            onClick={() => onChange(option.value)}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={{
              background: selected ? "var(--surface-raised)" : "transparent",
              color: selected ? "var(--ink-primary)" : "var(--ink-muted)",
              boxShadow: selected ? "var(--shadow-sm)" : "none",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A dot that pulses while something is genuinely in flight, steady otherwise. */
export function LiveDot({ tone = "accent", pulsing = false }: { tone?: Tone; pulsing?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${pulsing ? "cw-pulse" : ""}`}
      style={{ background: TONE_STYLES[tone].color }}
    />
  );
}
