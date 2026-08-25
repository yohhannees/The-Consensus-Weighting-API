"use client";

import { useCallback, useMemo, useState } from "react";
import { newIdempotencyKey } from "@/lib/apiClient";
import { byteLength } from "@/lib/json";

export interface AllocationRow {
  id: string;
  userId: string;
  targetId: string;
  amount: string;
}

export type RequestMode = "form" | "raw";
export type RequestMethod = "GET" | "POST";

let rowCounter = 0;

function emptyRow(): AllocationRow {
  rowCounter += 1;
  return { id: `row_${rowCounter}`, userId: "", targetId: "", amount: "" };
}

function isBlank(row: AllocationRow): boolean {
  return !row.userId.trim() && !row.targetId.trim() && !row.amount.trim();
}

/**
 * Turns one form row into the JSON value it will actually be sent as.
 *
 * Deliberately *not* sanitizing: a blank amount omits the field and a
 * non-numeric one is sent as the typed string, so the console can drive the
 * API's real validation errors instead of hiding them behind client-side
 * coercion. The API remains the source of truth for what is valid.
 */
function rowToJson(row: AllocationRow): Record<string, unknown> {
  const value: Record<string, unknown> = { userId: row.userId, targetId: row.targetId };
  const amount = row.amount.trim();
  if (amount === "") return value;
  const parsed = Number(amount);
  value.amount = Number.isNaN(parsed) ? amount : parsed;
  return value;
}

export interface RequestDraft {
  method: RequestMethod;
  setMethod: (method: RequestMethod) => void;
  mode: RequestMode;
  switchMode: (mode: RequestMode) => void;
  rows: AllocationRow[];
  updateRow: (id: string, patch: Partial<AllocationRow>) => void;
  addRow: () => void;
  removeRow: (id: string) => void;
  duplicateRow: (id: string) => void;
  /** Appends `count` distinct users all backing one target — the "crowd" shape. */
  appendCrowd: (count: number, amount: number) => void;
  clearRows: () => void;
  rawText: string;
  setRawText: (text: string) => void;
  /** Exactly what will be put on the wire. */
  bodyText: string;
  bodyBytes: number;
  /** Number of allocations the body describes, or null when it cannot be parsed. */
  itemCount: number | null;
  parseError: string | null;
  useIdempotencyKey: boolean;
  setUseIdempotencyKey: (use: boolean) => void;
  idempotencyKey: string;
  setIdempotencyKey: (key: string) => void;
  regenerateKey: () => void;
  /** Loads a body from elsewhere (a log entry, a scenario) into the raw editor. */
  loadBody: (text: string, method?: RequestMethod) => void;
}

export function useRequestDraft(): RequestDraft {
  const [method, setMethod] = useState<RequestMethod>("POST");
  const [mode, setMode] = useState<RequestMode>("form");
  const [rows, setRows] = useState<AllocationRow[]>(() => [emptyRow(), emptyRow()]);
  const [rawText, setRawText] = useState("[]");
  const [useIdempotencyKey, setUseIdempotencyKey] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const formBody = useMemo(
    () => JSON.stringify(rows.filter((row) => !isBlank(row)).map(rowToJson), null, 2),
    [rows],
  );

  const bodyText = mode === "form" ? formBody : rawText;

  const parseError = useMemo(() => {
    if (mode === "form") return null;
    try {
      JSON.parse(rawText);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid JSON";
    }
  }, [mode, rawText]);

  const itemCount = useMemo(() => {
    if (mode === "form") return rows.filter((row) => !isBlank(row)).length;
    try {
      const parsed: unknown = JSON.parse(rawText);
      return Array.isArray(parsed) ? parsed.length : null;
    } catch {
      return null;
    }
  }, [mode, rawText, rows]);

  const switchMode = useCallback(
    (next: RequestMode) => {
      setMode((current) => {
        if (current === next) return current;
        // Carry the payload across the switch so toggling never loses work: form
        // rows serialize into the editor, and well-formed editor JSON parses back
        // into rows (anything the form can't represent stays in raw mode).
        if (next === "raw") {
          setRawText(formBody);
        } else {
          try {
            const parsed: unknown = JSON.parse(rawText);
            if (Array.isArray(parsed)) {
              setRows(
                parsed.map((item) => {
                  const record = (item ?? {}) as Record<string, unknown>;
                  return {
                    ...emptyRow(),
                    userId: typeof record.userId === "string" ? record.userId : "",
                    targetId: typeof record.targetId === "string" ? record.targetId : "",
                    amount: record.amount === undefined ? "" : String(record.amount),
                  };
                }),
              );
            }
          } catch {
            // Unparseable raw JSON simply leaves the existing rows alone.
          }
        }
        return next;
      });
    },
    [formBody, rawText],
  );

  const updateRow = useCallback((id: string, patch: Partial<AllocationRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const addRow = useCallback(() => setRows((current) => [...current, emptyRow()]), []);

  const removeRow = useCallback((id: string) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : [emptyRow()]));
  }, []);

  const duplicateRow = useCallback((id: string) => {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      if (index === -1) return current;
      const clone: AllocationRow = { ...current[index]!, id: emptyRow().id };
      return [...current.slice(0, index + 1), clone, ...current.slice(index + 1)];
    });
  }, []);

  const appendCrowd = useCallback((count: number, amount: number) => {
    setRows((current) => {
      const seed = current.find((row) => row.targetId.trim());
      const targetId = seed?.targetId.trim() || "CROWD";
      const stamp = Math.random().toString(36).slice(2, 6);
      const crowd = Array.from({ length: count }, (_, i) => ({
        ...emptyRow(),
        userId: `crowd_${stamp}_${i}`,
        targetId,
        amount: String(amount),
      }));
      return [...current.filter((row) => !isBlank(row)), ...crowd];
    });
  }, []);

  const clearRows = useCallback(() => setRows([emptyRow(), emptyRow()]), []);

  const regenerateKey = useCallback(() => setIdempotencyKey(newIdempotencyKey()), []);

  const loadBody = useCallback((text: string, nextMethod: RequestMethod = "POST") => {
    setMethod(nextMethod);
    setRawText(text);
    setMode("raw");
  }, []);

  return {
    method,
    setMethod,
    mode,
    switchMode,
    rows,
    updateRow,
    addRow,
    removeRow,
    duplicateRow,
    appendCrowd,
    clearRows,
    rawText,
    setRawText,
    bodyText,
    bodyBytes: byteLength(bodyText),
    itemCount,
    parseError,
    useIdempotencyKey,
    setUseIdempotencyKey,
    idempotencyKey,
    setIdempotencyKey,
    regenerateKey,
    loadBody,
  };
}
