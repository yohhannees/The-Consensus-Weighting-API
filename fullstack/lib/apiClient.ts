import { byteLength } from "@/lib/json";

export const ALLOCATIONS_ENDPOINT = "/api/allocations/weights";

export interface ApiCallSpec {
  method: "GET" | "POST";
  /**
   * Raw body text, already serialized. The console sends a *string* rather than an
   * object on purpose: several scenarios (and the raw-JSON editor) need to put
   * deliberately malformed bodies on the wire, which `JSON.stringify` could never produce.
   */
  body?: string | null;
  idempotencyKey?: string | null;
  label?: string;
}

export interface ApiCallResult {
  id: string;
  label: string;
  method: "GET" | "POST";
  url: string;
  startedAt: number;
  latencyMs: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBytes: number;
  /** 0 when the request never reached the server (see `networkError`). */
  status: number;
  ok: boolean;
  responseHeaders: Record<string, string>;
  responseText: string;
  responseBytes: number;
  /** Parsed response body, or `undefined` when the response wasn't JSON. */
  body: unknown;
  networkError?: string;
}

let callCounter = 0;

function nextCallId(): string {
  callCounter += 1;
  return `call_${callCounter}`;
}

/** Client-generated unique key for the API's optional `Idempotency-Key` header. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Performs one API call and records everything the console needs to *show* it:
 * both header sets, both raw bodies, byte counts, wall-clock latency, and the
 * status  -  including for failures, which are returned as results rather than
 * thrown, so a 400 or a dropped connection is inspectable exactly like a 200.
 */
export async function callApi(spec: ApiCallSpec): Promise<ApiCallResult> {
  const requestHeaders: Record<string, string> = {};
  if (spec.method === "POST") requestHeaders["Content-Type"] = "application/json";
  if (spec.idempotencyKey) requestHeaders["Idempotency-Key"] = spec.idempotencyKey;

  const requestBody = spec.method === "POST" ? (spec.body ?? "") : null;
  const startedAt = Date.now();
  const startMark = performance.now();

  const base = {
    id: nextCallId(),
    label: spec.label ?? `${spec.method} weights`,
    method: spec.method,
    url: ALLOCATIONS_ENDPOINT,
    startedAt,
    requestHeaders,
    requestBody,
    requestBytes: requestBody === null ? 0 : byteLength(requestBody),
  };

  try {
    const response = await fetch(ALLOCATIONS_ENDPOINT, {
      method: spec.method,
      headers: requestHeaders,
      body: requestBody,
      cache: "no-store",
    });
    const responseText = await response.text();

    let body: unknown;
    try {
      body = JSON.parse(responseText);
    } catch {
      body = undefined;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ...base,
      latencyMs: performance.now() - startMark,
      status: response.status,
      ok: response.ok,
      responseHeaders,
      responseText,
      responseBytes: byteLength(responseText),
      body,
    };
  } catch (error) {
    return {
      ...base,
      latencyMs: performance.now() - startMark,
      status: 0,
      ok: false,
      responseHeaders: {},
      responseText: "",
      responseBytes: 0,
      body: undefined,
      networkError: error instanceof Error ? error.message : "Could not reach the API",
    };
  }
}

/** The same call as a copy-pasteable curl command, so the console is a starting point, not a silo. */
export function toCurl(result: ApiCallResult, origin: string): string {
  const parts = [`curl -X ${result.method} ${origin}${result.url}`];
  for (const [name, value] of Object.entries(result.requestHeaders)) {
    parts.push(`  -H '${name}: ${value}'`);
  }
  if (result.requestBody !== null) {
    // Close the quoted section, emit an escaped quote, reopen it: the only way to
    // put a literal ' inside a single-quoted shell argument.
    const body = result.requestBody.replace(/'/g, `'\\''`);
    parts.push(`  -d '${body}'`);
  }
  return parts.join(" \\n");
}
