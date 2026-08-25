"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  userId: string;
  targetId: string;
  amount: string;
}

function emptyRow(): Row {
  return { userId: "", targetId: "", amount: "" };
}

interface ApiError {
  error: string;
  message: string;
  details?: Array<{ index: number; field: string; value?: unknown }>;
}

export function AllocationForm() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }

  /** Returns whether the submission succeeded, so callers only reset state on success. */
  async function submitPayload(payload: unknown[]): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    setJustSubmitted(false);
    try {
      const response = await fetch("/api/allocations/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body as ApiError);
        return false;
      }
      setJustSubmitted(true);
      router.refresh();
      return true;
    } catch {
      setError({ error: "NetworkError", message: "Could not reach the API. Is the server running?" });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = rows
      .filter((row) => row.userId.trim() || row.targetId.trim() || row.amount.trim())
      .map((row) => ({ userId: row.userId, targetId: row.targetId, amount: Number(row.amount) }));

    if (payload.length === 0) {
      setError({ error: "ValidationError", message: "Add at least one allocation row." });
      return;
    }

    // Only clear the rows on success — on failure, leave them so the user can
    // fix just the one bad field instead of retyping everything.
    const succeeded = await submitPayload(payload);
    if (succeeded) {
      setRows([emptyRow(), emptyRow()]);
    }
  }

  async function loadDemoScenario() {
    const demo = [
      { userId: "user_1", targetId: "A", amount: 10_000 },
      ...Array.from({ length: 100 }, (_, i) => ({ userId: `user_${i}`, targetId: "B", amount: 100 })),
    ];
    await submitPayload(demo);
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--ring)" }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          Submit allocations
        </h2>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          Each row is one allocation. The same user can appear more than once for the same target —
          they&apos;ll be summed before the dampening is applied.
        </p>
      </div>

      {/*
        noValidate: without it, the browser's native min={0} constraint on the amount
        field silently blocks submission (a native tooltip, no submit event at all) for
        a negative value — so the app's own validation-error UI below never runs for
        that case. Disabling native validation routes every case through one consistent
        error path; the API's own Zod validation is still the real source of truth.
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                aria-label="User ID"
                placeholder="userId"
                value={row.userId}
                onChange={(e) => updateRow(index, { userId: e.target.value })}
                className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                style={{ background: "var(--page)", border: "1px solid var(--ring)", color: "var(--ink-primary)" }}
              />
              <input
                aria-label="Target ID"
                placeholder="targetId"
                value={row.targetId}
                onChange={(e) => updateRow(index, { targetId: e.target.value })}
                className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                style={{ background: "var(--page)", border: "1px solid var(--ring)", color: "var(--ink-primary)" }}
              />
              <input
                aria-label="Amount"
                placeholder="amount"
                type="number"
                min={0}
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                className="tabular w-24 shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                style={{ background: "var(--page)", border: "1px solid var(--ring)", color: "var(--ink-primary)" }}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label="Remove row"
                className="shrink-0 rounded-lg px-2 py-1.5 text-[13px]"
                style={{ color: "var(--ink-muted)" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
            style={{ color: "var(--accent)" }}
          >
            + Add row
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {submitting ? "Submitting…" : "Submit allocations"}
          </button>
        </div>
      </form>

      <div className="pt-1" style={{ borderTop: "1px solid var(--hairline)" }}>
        <button
          type="button"
          onClick={loadDemoScenario}
          disabled={submitting}
          className="mt-3 w-full rounded-lg py-2 text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
        >
          Load demo scenario (1 user × $10,000 vs 100 users × $100)
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg px-3 py-2 text-[13px]"
          style={{ background: "var(--critical-wash)", color: "var(--ink-primary)", border: "1px solid var(--ring)" }}
        >
          <strong style={{ color: "var(--critical)" }}>{error.error}:</strong> {error.message}
          {error.details && error.details.length > 0 ? (
            <ul className="mt-1 list-disc pl-4" style={{ color: "var(--ink-secondary)" }}>
              {error.details.map((d, i) => (
                <li key={i}>
                  row {d.index}, field &ldquo;{d.field}&rdquo;{d.value !== undefined ? `: ${JSON.stringify(d.value)}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {justSubmitted && !error ? (
        <p className="text-[13px]" style={{ color: "var(--success)" }}>
          Submitted — the leaderboard has been updated.
        </p>
      ) : null}
    </div>
  );
}
