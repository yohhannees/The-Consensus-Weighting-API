"use client";

import { ALLOCATIONS_ENDPOINT } from "@/lib/apiClient";
import { formatBytes } from "@/lib/format";
import { Badge, Panel, SegmentedControl } from "@/components/ui/Primitives";
import { JsonPane } from "@/components/console/JsonPane";
import type { RequestDraft } from "@/components/console/useRequestDraft";

export interface RequestStatusMessage {
  tone: "success" | "critical" | "warning";
  text: string;
}

interface RequestPanelProps {
  draft: RequestDraft;
  inFlight: boolean;
  onSend: () => void;
  status: RequestStatusMessage | null;
}

const FIELD_STYLE: React.CSSProperties = {
  background: "var(--surface-sunken)",
  border: "1px solid var(--ring)",
  color: "var(--ink-primary)",
};

export function RequestPanel({ draft, inFlight, onSend, status }: RequestPanelProps) {
  const isPost = draft.method === "POST";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSend();
  }

  return (
    <Panel
      title="Request"
      meta={
        <>
          <Badge tone={isPost ? "accent" : "alt"} mono>
            {draft.method}
          </Badge>
          <span className="mono truncate text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {ALLOCATIONS_ENDPOINT}
          </span>
        </>
      }
      actions={
        <SegmentedControl
          ariaLabel="HTTP method"
          value={draft.method}
          onChange={draft.setMethod}
          options={[
            { value: "POST", label: "POST", title: "Persist allocations, then return weights" },
            { value: "GET", label: "GET", title: "Read current weights without writing" },
          ]}
        />
      }
    >
      {/*
        noValidate: without it the browser's native min={0} constraint on the amount
        field silently blocks submission (a native tooltip, no submit event at all) for
        a negative value  -  so the API's own validation-error path, which this console
        exists to show, would never run for that case.
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col">
        {isPost ? (
          <>
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <SegmentedControl
                ariaLabel="Body editor mode"
                value={draft.mode}
                onChange={draft.switchMode}
                options={[
                  { value: "form", label: "Rows", title: "Build the batch row by row" },
                  { value: "raw", label: "Raw JSON", title: "Edit the body directly, including invalid input" },
                ]}
              />
              <div className="flex items-center gap-1.5">
                <SampleSelect onLoad={(body) => draft.loadBody(body)} />
                <QuickAction label="+10 backers" onClick={() => draft.appendCrowd(10, 100)} />
                <QuickAction label="+100 backers" onClick={() => draft.appendCrowd(100, 100)} />
                <QuickAction label="Clear" onClick={draft.clearRows} />
              </div>
            </div>

            {draft.mode === "form" ? (
              <div className="flex flex-col gap-2 px-4 py-3">
                <div
                  className="grid grid-cols-[1fr_1fr_92px_52px] gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.06em]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <span>userId</span>
                  <span>targetId</span>
                  <span className="text-right">amount</span>
                  <span />
                </div>

                <div className="scroll-thin flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-1">
                  {draft.rows.map((row) => (
                    <div key={row.id} className="grid grid-cols-[1fr_1fr_92px_52px] items-center gap-2">
                      <input
                        aria-label="User ID"
                        placeholder="user_1"
                        value={row.userId}
                        onChange={(e) => draft.updateRow(row.id, { userId: e.target.value })}
                        className="mono min-w-0 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                        style={FIELD_STYLE}
                      />
                      <input
                        aria-label="Target ID"
                        placeholder="A"
                        value={row.targetId}
                        onChange={(e) => draft.updateRow(row.id, { targetId: e.target.value })}
                        className="mono min-w-0 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                        style={FIELD_STYLE}
                      />
                      <input
                        aria-label="Amount"
                        placeholder="100"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => draft.updateRow(row.id, { amount: e.target.value })}
                        className="mono tabular min-w-0 rounded-lg px-2.5 py-1.5 text-right text-[12.5px] outline-none"
                        style={FIELD_STYLE}
                      />
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => draft.duplicateRow(row.id)}
                          aria-label="Duplicate row"
                          title="Duplicate row"
                          className="rounded-md px-1.5 py-1 text-[12px]"
                          style={{ color: "var(--ink-muted)" }}
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          onClick={() => draft.removeRow(row.id)}
                          aria-label="Remove row"
                          title="Remove row"
                          className="rounded-md px-1.5 py-1 text-[12px]"
                          style={{ color: "var(--ink-muted)" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={draft.addRow}
                  className="self-start rounded-lg px-2 py-1 text-[12.5px] font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  + Add row
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 px-4 py-3">
                <label className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--ink-muted)" }}>
                  Body  -  sent exactly as typed
                </label>
                <textarea
                  aria-label="Raw JSON body"
                  spellCheck={false}
                  value={draft.rawText}
                  onChange={(e) => draft.setRawText(e.target.value)}
                  rows={10}
                  className="scroll-thin mono w-full resize-y rounded-lg px-3 py-2 text-[12.5px] leading-[1.55] outline-none"
                  style={FIELD_STYLE}
                />
                <p className="text-[12px]" style={{ color: draft.parseError ? "var(--critical)" : "var(--ink-muted)" }}>
                  {draft.parseError
                    ? `Invalid JSON  -  ${draft.parseError}. It will still be sent, so you can see the API reject it.`
                    : "Malformed JSON is allowed here on purpose  -  the API's error path is part of the contract."}
                </p>
              </div>
            )}

            <div
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              style={{ borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}
            >
              <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
                <input
                  type="checkbox"
                  checked={draft.useIdempotencyKey}
                  onChange={(e) => draft.setUseIdempotencyKey(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="mono">Idempotency-Key</span>
              </label>
              {draft.useIdempotencyKey ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    aria-label="Idempotency key"
                    value={draft.idempotencyKey}
                    onChange={(e) => draft.setIdempotencyKey(e.target.value)}
                    className="mono min-w-0 flex-1 rounded-lg px-2.5 py-1 text-[12px] outline-none"
                    style={FIELD_STYLE}
                  />
                  <button
                    type="button"
                    onClick={draft.regenerateKey}
                    className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium"
                    style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
                  >
                    New key
                  </button>
                </div>
              ) : (
                <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
                  Off  -  a retry of this exact request would count twice.
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            <p>
              <span className="mono">GET</span> takes no body. It recomputes every weight from the full
              allocation table and returns the ranking  -  no cache, no write.
            </p>
          </div>
        )}

        {isPost ? (
          <div className="flex flex-col">
            <div
              className="flex items-center gap-2 px-4 py-2"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--ink-muted)" }}
              >
                Live payload
              </span>
              <Badge tone="neutral" mono>
                {draft.itemCount === null ? "unparsed" : `${draft.itemCount.toLocaleString("en-US")} rows`}
              </Badge>
              <Badge tone="neutral" mono>
                {formatBytes(draft.bodyBytes)}
              </Badge>
              {inFlight ? (
                <Badge tone="accent" mono className="cw-pulse">
                  sending
                </Badge>
              ) : null}
            </div>
            <JsonPane
              text={draft.bodyText}
              revealKey={draft.mode}
              emptyLabel="Add a row to build the request body"
              minHeight={140}
              maxHeight={260}
              problem={draft.parseError ? "This body is not valid JSON" : null}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2 px-4 py-3">
          <button
            type="submit"
            disabled={inFlight}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {inFlight ? (
              <>
                <span
                  className="cw-spin inline-block h-3.5 w-3.5 rounded-full"
                  style={{ border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "var(--accent-ink)" }}
                />
                Sending…
              </>
            ) : isPost ? (
              "Submit allocations"
            ) : (
              "Fetch weights"
            )}
          </button>

          {status ? (
            <p
              role="status"
              className="cw-fade-up text-[12.5px]"
              style={{
                color:
                  status.tone === "success"
                    ? "var(--success)"
                    : status.tone === "warning"
                      ? "var(--warning)"
                      : "var(--critical)",
              }}
            >
              {status.text}
            </p>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-[11.5px] font-medium transition-colors"
      style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)", border: "1px solid var(--ring)" }}
    >
      {label}
    </button>
  );
}

const SAMPLE_REQUESTS = {
  crowd: JSON.stringify(
    [
      { userId: "alice", targetId: "community-garden", amount: 250 },
      { userId: "ben", targetId: "community-garden", amount: 250 },
      { userId: "chris", targetId: "community-garden", amount: 250 },
      { userId: "dana", targetId: "community-garden", amount: 250 },
      { userId: "whale", targetId: "new-library", amount: 1000 },
    ],
    null,
    2,
  ),
  balanced: JSON.stringify(
    [
      { userId: "user_1", targetId: "target-a", amount: 100 },
      { userId: "user_2", targetId: "target-a", amount: 100 },
      { userId: "user_3", targetId: "target-b", amount: 300 },
    ],
    null,
    2,
  ),
  invalid: JSON.stringify(
    [{ userId: "demo-user", targetId: "demo-target", amount: -50 }],
    null,
    2,
  ),
} as const;

function SampleSelect({ onLoad }: { onLoad: (body: string) => void }) {
  return (
    <label className="flex items-center gap-1.5" title="Load an example request into the editor">
      <span className="sr-only">Load sample request</span>
      <select
        aria-label="Load sample request"
        defaultValue=""
        onChange={(event) => {
          const key = event.target.value as keyof typeof SAMPLE_REQUESTS;
          if (key) onLoad(SAMPLE_REQUESTS[key]);
          event.currentTarget.value = "";
        }}
        className="rounded-lg px-2 py-1 text-[11.5px] font-medium outline-none"
        style={{
          background: "var(--accent-wash)",
          border: "1px solid var(--accent-track)",
          color: "var(--accent)",
        }}
      >
        <option value="">Load sample</option>
        <option value="crowd">Crowd vs whale</option>
        <option value="balanced">Balanced targets</option>
        <option value="invalid">Validation error</option>
      </select>
    </label>
  );
}
