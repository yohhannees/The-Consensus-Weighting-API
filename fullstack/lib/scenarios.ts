import type { TargetWeight } from "@/domain/types";
import { MAX_ALLOCATIONS, MAX_AMOUNT } from "@/lib/validation";

export type ScenarioGroup = "mechanism" | "validation" | "protocol" | "load";

export interface ScenarioStep {
  label: string;
  method: "GET" | "POST";
  /** Raw request body  -  a string so a step can send input the API must reject. */
  body?: string;
  idempotencyKey?: string;
  /** Status(es) the API contract says this step must answer with. */
  expectStatus: number | number[];
  /** Expected `error` discriminator on a non-2xx body, when the contract names one. */
  expectError?: string;
}

export interface ScenarioContext {
  /** Per-run suffix, so every run works on target ids no earlier run touched. */
  nonce: string;
}

export interface StepOutcome {
  status: number;
  body: unknown;
}

export interface CheckResult {
  ok: boolean;
  /** Always shown  -  the observed numbers, whether the check passed or failed. */
  message: string;
}

export interface Scenario {
  id: string;
  group: ScenarioGroup;
  title: string;
  /** One line: what is being sent. */
  summary: string;
  /** What a pass actually proves about the API. */
  detail: string;
  /**
   * Excluded from "run all": these either burn the whole per-minute rate-limit
   * budget or push a maximum-size body, so they stay opt-in.
   */
  heavy?: boolean;
  build(ctx: ScenarioContext): ScenarioStep[];
  /** Beyond status codes: the behavioral assertion this scenario exists for. */
  check?(outcomes: StepOutcome[]): CheckResult;
}

/**
 * Every id a scenario writes is prefixed, because POST here *persists*: without a
 * marker, a test run would be indistinguishable from real data in the leaderboard
 * forever. The dashboard filters on this prefix.
 */
export const LAB_PREFIX = "lab_";

export function isLabTarget(targetId: string): boolean {
  return targetId.startsWith(LAB_PREFIX);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function weightsOf(body: unknown): TargetWeight[] {
  return Array.isArray(body) ? (body as TargetWeight[]) : [];
}

/** Finds a target by the distinctive middle segment of its generated id. */
function labTarget(body: unknown, marker: string): TargetWeight | undefined {
  return weightsOf(body).find((w) => w.targetId.startsWith(LAB_PREFIX + marker));
}

function n(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function missing(marker: string): CheckResult {
  return { ok: false, message: `target "${marker}" is missing from the response body` };
}

export const scenarios: Scenario[] = [
  {
    id: "crowd-beats-whale",
    group: "mechanism",
    title: "Crowd beats whale",
    summary: "$10,000 from 1 user vs $10,000 from 100 users, in one batch",
    detail: "Identical raw totals must not produce identical weight  -  distributed support wins by ~100x.",
    build: ({ nonce }) => {
      const whale = LAB_PREFIX + "whale_" + nonce;
      const crowd = LAB_PREFIX + "crowd_" + nonce;
      return [
        {
          label: "POST 101 allocations across two targets",
          method: "POST",
          expectStatus: 200,
          body: json([
            { userId: LAB_PREFIX + "whale_user_" + nonce, targetId: whale, amount: 10_000 },
            ...Array.from({ length: 100 }, (_, i) => ({
              userId: LAB_PREFIX + "crowd_user_" + i + "_" + nonce,
              targetId: crowd,
              amount: 100,
            })),
          ]),
        },
      ];
    },
    check: (outcomes) => {
      const whale = labTarget(outcomes[0]?.body, "whale_");
      const crowd = labTarget(outcomes[0]?.body, "crowd_");
      if (!whale || !crowd) return missing("whale/crowd");
      const ratio = whale.weight === 0 ? 0 : crowd.weight / whale.weight;
      return {
        ok: whale.rawTotal === crowd.rawTotal && ratio >= 2,
        message:
          "equal raw totals ($" +
          n(whale.rawTotal) +
          "), weight " +
          n(crowd.weight) +
          " vs " +
          n(whale.weight) +
          "  -  " +
          ratio.toFixed(1) +
          "x (spec floor: 2x)",
      };
    },
  },
  {
    id: "split-does-not-help",
    group: "mechanism",
    title: "Splitting one wallet never helps",
    summary: "One user sends $100 a hundred separate times to the same target",
    detail:
      "Per-user totals are summed before the square root, so a sybil split scores exactly the same as one $10,000 contribution: multiplier 1.0x.",
    build: ({ nonce }) => [
      {
        label: "POST 100 allocations from a single userId",
        method: "POST",
        expectStatus: 200,
        body: json(
          Array.from({ length: 100 }, () => ({
            userId: LAB_PREFIX + "splitter_" + nonce,
            targetId: LAB_PREFIX + "split_" + nonce,
            amount: 100,
          })),
        ),
      },
    ],
    check: (outcomes) => {
      const target = labTarget(outcomes[0]?.body, "split_");
      if (!target) return missing("split");
      const multiplier = target.rawTotal === 0 ? 0 : target.weight / target.rawTotal;
      return {
        ok: target.uniqueUserCount === 1 && Math.abs(multiplier - 1) < 0.001,
        message:
          target.uniqueUserCount +
          " unique user, weight " +
          n(target.weight) +
          " on $" +
          n(target.rawTotal) +
          " raw  -  " +
          multiplier.toFixed(2) +
          "x (no gain)",
      };
    },
  },
  {
    id: "same-user-merges",
    group: "mechanism",
    title: "Same user merges, two users do not",
    summary: "$4,000 + $6,000 from one user vs $5,000 each from two users",
    detail:
      "Both targets raise $10,000. Merging first gives 1 x 10,000; two contributors give (sqrt(5000) + sqrt(5000))squared = 20,000.",
    build: ({ nonce }) => {
      const merged = LAB_PREFIX + "merged_" + nonce;
      const pair = LAB_PREFIX + "pair_" + nonce;
      return [
        {
          label: "POST 4 allocations across two targets",
          method: "POST",
          expectStatus: 200,
          body: json([
            { userId: LAB_PREFIX + "solo_" + nonce, targetId: merged, amount: 4000 },
            { userId: LAB_PREFIX + "solo_" + nonce, targetId: merged, amount: 6000 },
            { userId: LAB_PREFIX + "duo_a_" + nonce, targetId: pair, amount: 5000 },
            { userId: LAB_PREFIX + "duo_b_" + nonce, targetId: pair, amount: 5000 },
          ]),
        },
      ];
    },
    check: (outcomes) => {
      const merged = labTarget(outcomes[0]?.body, "merged_");
      const pair = labTarget(outcomes[0]?.body, "pair_");
      if (!merged || !pair) return missing("merged/pair");
      return {
        ok: merged.weight === 10_000 && pair.weight === 20_000 && merged.uniqueUserCount === 1,
        message:
          "merged " +
          n(merged.weight) +
          " (" +
          merged.uniqueUserCount +
          " user) vs pair " +
          n(pair.weight) +
          " (" +
          pair.uniqueUserCount +
          " users) on the same $10,000",
      };
    },
  },
  {
    id: "whitespace-identity",
    group: "mechanism",
    title: "Padded ids are the same identity",
    summary: "The same user submitted once padded with spaces, once not",
    detail: "Ids are trimmed at the boundary, so whitespace cannot be used to fake a second contributor.",
    build: ({ nonce }) => {
      const target = LAB_PREFIX + "trim_" + nonce;
      const user = LAB_PREFIX + "padded_" + nonce;
      return [
        {
          label: "POST the same userId with and without padding",
          method: "POST",
          expectStatus: 200,
          body: json([
            { userId: "   " + user + "   ", targetId: target, amount: 500 },
            { userId: user, targetId: "  " + target + "  ", amount: 500 },
          ]),
        },
      ];
    },
    check: (outcomes) => {
      const target = labTarget(outcomes[0]?.body, "trim_");
      if (!target) return missing("trim");
      return {
        ok: target.uniqueUserCount === 1 && target.weight === 1000,
        message:
          target.uniqueUserCount +
          " unique user, weight " +
          n(target.weight) +
          " on $" +
          n(target.rawTotal) +
          "  -  padding merged, not counted twice",
      };
    },
  },
  {
    id: "zero-amount-ignored",
    group: "mechanism",
    title: "Zero is valid but not a contribution",
    summary: "A batch of $0 allocations",
    detail: "Zero passes validation (it is well-formed) but creates no weight, so the target never appears.",
    build: ({ nonce }) => {
      const target = LAB_PREFIX + "zero_" + nonce;
      return [
        {
          label: "POST two $0 allocations",
          method: "POST",
          expectStatus: 200,
          body: json([
            { userId: LAB_PREFIX + "zero_a_" + nonce, targetId: target, amount: 0 },
            { userId: LAB_PREFIX + "zero_b_" + nonce, targetId: target, amount: 0 },
          ]),
        },
      ];
    },
    check: (outcomes) => {
      const present = labTarget(outcomes[0]?.body, "zero_") !== undefined;
      return {
        ok: !present,
        message: present
          ? "the $0 target appeared in the weights  -  it should have been dropped"
          : "accepted with 200 and correctly absent from the ranked weights",
      };
    },
  },
  {
    id: "cent-precision",
    group: "mechanism",
    title: "Cents survive the round trip",
    summary: "$0.01 and $1,234.56 through Decimal(18,2) storage",
    detail: "Two-decimal amounts are stored and returned exactly  -  the raw total must match what was sent.",
    build: ({ nonce }) => {
      const target = LAB_PREFIX + "cents_" + nonce;
      return [
        {
          label: "POST two amounts with cents",
          method: "POST",
          expectStatus: 200,
          body: json([
            { userId: LAB_PREFIX + "cent_a_" + nonce, targetId: target, amount: 0.01 },
            { userId: LAB_PREFIX + "cent_b_" + nonce, targetId: target, amount: 1234.56 },
          ]),
        },
      ];
    },
    check: (outcomes) => {
      const target = labTarget(outcomes[0]?.body, "cents_");
      if (!target) return missing("cents");
      return {
        ok: target.rawTotal === 1234.57,
        message: "raw total returned as $" + n(target.rawTotal) + " (sent $1,234.57)",
      };
    },
  },

  {
    id: "reject-negative",
    group: "validation",
    title: "Negative amount",
    summary: "amount: -50",
    detail: "A negative contribution would produce NaN under the square root  -  rejected at the boundary.",
    build: ({ nonce }) => [
      {
        label: "POST a negative amount",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([
          { userId: LAB_PREFIX + "neg_" + nonce, targetId: LAB_PREFIX + "neg_" + nonce, amount: -50 },
        ]),
      },
    ],
  },
  {
    id: "reject-string-amount",
    group: "validation",
    title: "Amount as a string",
    summary: 'amount: "100"',
    detail: "No silent coercion: a numeric-looking string is still the wrong type.",
    build: ({ nonce }) => [
      {
        label: "POST a string amount",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([
          { userId: LAB_PREFIX + "str_" + nonce, targetId: LAB_PREFIX + "str_" + nonce, amount: "100" },
        ]),
      },
    ],
  },
  {
    id: "reject-missing-field",
    group: "validation",
    title: "Missing targetId",
    summary: "A row with only userId and amount",
    detail: "The error body names the offending row index and field, not just 'invalid request'.",
    build: ({ nonce }) => [
      {
        label: "POST a row with no targetId",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([{ userId: LAB_PREFIX + "nofield_" + nonce, amount: 100 }]),
      },
    ],
    check: (outcomes) => {
      const details = (outcomes[0]?.body as { details?: Array<{ index: number; field: string }> } | undefined)
        ?.details;
      const first = details?.[0];
      return {
        ok: first?.field === "targetId" && first?.index === 0,
        message: first
          ? 'pinpointed row ' + first.index + ', field "' + first.field + '"'
          : "no per-row details returned",
      };
    },
  },
  {
    id: "reject-empty-id",
    group: "validation",
    title: "Whitespace-only userId",
    summary: "userId is three spaces",
    detail: "Trimming happens before the emptiness check, so a blank id cannot slip through as a contributor.",
    build: ({ nonce }) => [
      {
        label: "POST a blank userId",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([{ userId: "   ", targetId: LAB_PREFIX + "blank_" + nonce, amount: 100 }]),
      },
    ],
  },
  {
    id: "reject-sub-cent",
    group: "validation",
    title: "Three decimal places",
    summary: "amount: 10.555",
    detail:
      "Storage is Decimal(18,2). Anything finer would be silently rounded on insert, so the raw total would stop matching the request  -  rejected instead.",
    build: ({ nonce }) => [
      {
        label: "POST a sub-cent amount",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([
          { userId: LAB_PREFIX + "dec_" + nonce, targetId: LAB_PREFIX + "dec_" + nonce, amount: 10.555 },
        ]),
      },
    ],
  },
  {
    id: "reject-over-max",
    group: "validation",
    title: "Amount above the cap",
    summary: "amount: " + MAX_AMOUNT * 10,
    detail:
      "Per-allocation amounts are capped at " +
      MAX_AMOUNT.toExponential() +
      " so aggregate sums stay far from float precision loss.",
    build: ({ nonce }) => [
      {
        label: "POST an over-cap amount",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json([
          {
            userId: LAB_PREFIX + "max_" + nonce,
            targetId: LAB_PREFIX + "max_" + nonce,
            amount: MAX_AMOUNT * 10,
          },
        ]),
      },
    ],
  },
  {
    id: "reject-infinity",
    group: "validation",
    title: "Infinity through raw JSON",
    summary: "amount: 1e999  -  parses to Infinity",
    detail:
      "1e999 is legal JSON that JSON.parse turns into Infinity. The schema's finiteness check is what stops it.",
    build: ({ nonce }) => [
      {
        label: "POST a body that parses to Infinity",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body:
          '[{"userId":"' +
          LAB_PREFIX +
          "inf_" +
          nonce +
          '","targetId":"' +
          LAB_PREFIX +
          "inf_" +
          nonce +
          '","amount":1e999}]',
      },
    ],
  },
  {
    id: "reject-not-array",
    group: "validation",
    title: "Object instead of array",
    summary: "A single allocation object, not wrapped in an array",
    detail: "The contract takes an array; a bare object gets a shape error rather than a 500.",
    build: ({ nonce }) => [
      {
        label: "POST an object body",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json({
          userId: LAB_PREFIX + "obj_" + nonce,
          targetId: LAB_PREFIX + "obj_" + nonce,
          amount: 100,
        }),
      },
    ],
  },
  {
    id: "reject-malformed-json",
    group: "validation",
    title: "Truncated JSON",
    summary: "A body that is cut off mid-object",
    detail: "A body that never parses is answered with the same structured error shape as any other bad input.",
    build: () => [
      {
        label: "POST an unparseable body",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: '[{"userId":"a",',
      },
    ],
  },

  {
    id: "idempotent-replay",
    group: "protocol",
    title: "Retry with the same key is safe",
    summary: "The same POST sent twice with one Idempotency-Key",
    detail:
      "Because POST persists, a naive retry would double-count. The second call must return 200 with the weight unchanged.",
    build: ({ nonce }) => {
      const key = LAB_PREFIX + "key_" + nonce;
      const body = json([
        { userId: LAB_PREFIX + "idem_" + nonce, targetId: LAB_PREFIX + "idem_" + nonce, amount: 400 },
      ]);
      return [
        { label: "First POST with Idempotency-Key", method: "POST", body, idempotencyKey: key, expectStatus: 200 },
        { label: "Retry  -  identical key and body", method: "POST", body, idempotencyKey: key, expectStatus: 200 },
      ];
    },
    check: (outcomes) => {
      const first = labTarget(outcomes[0]?.body, "idem_");
      const second = labTarget(outcomes[1]?.body, "idem_");
      if (!first || !second) return missing("idem");
      return {
        ok: first.weight === second.weight && second.rawTotal === 400,
        message:
          "weight " +
          n(first.weight) +
          " → " +
          n(second.weight) +
          " after the retry (raw total still $" +
          n(second.rawTotal) +
          ")",
      };
    },
  },
  {
    id: "idempotency-conflict",
    group: "protocol",
    title: "Key reused with a different body",
    summary: "Same Idempotency-Key, different allocations",
    detail:
      "Silently skipping the second body would discard the caller's data. The key is bound to a payload hash, so this is a 409.",
    build: ({ nonce }) => {
      const key = LAB_PREFIX + "conflict_" + nonce;
      const target = LAB_PREFIX + "conflict_" + nonce;
      return [
        {
          label: "First POST claims the key",
          method: "POST",
          idempotencyKey: key,
          expectStatus: 200,
          body: json([{ userId: LAB_PREFIX + "c_a_" + nonce, targetId: target, amount: 100 }]),
        },
        {
          label: "Same key, different payload",
          method: "POST",
          idempotencyKey: key,
          expectStatus: 409,
          expectError: "IdempotencyConflict",
          body: json([{ userId: LAB_PREFIX + "c_b_" + nonce, targetId: target, amount: 999 }]),
        },
      ];
    },
  },
  {
    id: "unkeyed-retry-double-counts",
    group: "protocol",
    title: "...and without a key it double-counts",
    summary: "The same POST sent twice with no Idempotency-Key",
    detail:
      "The documented tradeoff, made visible: unprotected retries really do apply twice. This is why the header exists.",
    build: ({ nonce }) => {
      const body = json([
        { userId: LAB_PREFIX + "dbl_" + nonce, targetId: LAB_PREFIX + "dbl_" + nonce, amount: 250 },
      ]);
      return [
        { label: "First POST, no key", method: "POST", body, expectStatus: 200 },
        { label: "Identical POST, no key", method: "POST", body, expectStatus: 200 },
      ];
    },
    check: (outcomes) => {
      const first = labTarget(outcomes[0]?.body, "dbl_");
      const second = labTarget(outcomes[1]?.body, "dbl_");
      if (!first || !second) return missing("dbl");
      return {
        ok: second.rawTotal === first.rawTotal * 2,
        message:
          "raw total $" +
          n(first.rawTotal) +
          " → $" +
          n(second.rawTotal) +
          "  -  counted twice, exactly as documented",
      };
    },
  },
  {
    id: "get-is-pure",
    group: "protocol",
    title: "GET changes nothing",
    summary: "Two consecutive reads of the weights",
    detail: "Weights are derived on every read, never cached  -  but reading must not mutate anything either.",
    build: () => [
      { label: "GET weights", method: "GET", expectStatus: 200 },
      { label: "GET weights again", method: "GET", expectStatus: 200 },
    ],
    check: (outcomes) => {
      const first = JSON.stringify(outcomes[0]?.body);
      const second = JSON.stringify(outcomes[1]?.body);
      return {
        ok: first === second,
        message:
          first === second
            ? "both reads returned an identical " + weightsOf(outcomes[0]?.body).length + "-target body"
            : "the two reads disagreed",
      };
    },
  },

  {
    id: "bulk-thousand",
    group: "load",
    title: "1,000 contributors in one batch",
    summary: "1,000 distinct users x $10 to a single target",
    detail:
      "A realistic large batch: $10,000 raised across 1,000 wallets should score 1,000x its raw total, in one request.",
    build: ({ nonce }) => [
      {
        label: "POST 1,000 allocations",
        method: "POST",
        expectStatus: 200,
        body: json(
          Array.from({ length: 1000 }, (_, i) => ({
            userId: LAB_PREFIX + "bulk_user_" + i + "_" + nonce,
            targetId: LAB_PREFIX + "bulk_" + nonce,
            amount: 10,
          })),
        ),
      },
    ],
    check: (outcomes) => {
      const target = labTarget(outcomes[0]?.body, "bulk_");
      if (!target) return missing("bulk");
      const multiplier = target.rawTotal === 0 ? 0 : target.weight / target.rawTotal;
      return {
        ok: target.uniqueUserCount === 1000 && Math.abs(multiplier - 1000) < 1,
        message:
          n(target.uniqueUserCount) +
          " unique users, weight " +
          n(target.weight) +
          " on $" +
          n(target.rawTotal) +
          "  -  " +
          multiplier.toFixed(0) +
          "x",
      };
    },
  },
  {
    id: "reject-over-batch-limit",
    group: "load",
    title: "More than " + MAX_ALLOCATIONS.toLocaleString("en-US") + " rows",
    summary: "A body with " + (MAX_ALLOCATIONS + 1).toLocaleString("en-US") + " allocations",
    detail: "The batch cap is what keeps a single request from forcing an unbounded insert. Sends ~700 KB.",
    heavy: true,
    build: ({ nonce }) => [
      {
        label: "POST " + (MAX_ALLOCATIONS + 1).toLocaleString("en-US") + " allocations",
        method: "POST",
        expectStatus: 400,
        expectError: "ValidationError",
        body: json(
          Array.from({ length: MAX_ALLOCATIONS + 1 }, (_, i) => ({
            userId: LAB_PREFIX + "cap_user_" + i + "_" + nonce,
            targetId: LAB_PREFIX + "cap_" + nonce,
            amount: 1,
          })),
        ),
      },
    ],
  },
  {
    id: "rate-limit-burst",
    group: "load",
    title: "Rate-limit burst",
    summary: "105 reads in a row against a 100/minute limit",
    detail:
      "The limiter covers GET too, because a read does a full-table load and recompute. Expect a 429 near the end, and a throttled minute afterwards.",
    heavy: true,
    build: () =>
      Array.from({ length: 105 }, (_, i) => ({
        label: "GET #" + (i + 1),
        method: "GET" as const,
        expectStatus: [200, 429],
      })),
    check: (outcomes) => {
      const limited = outcomes.filter((o) => o.status === 429).length;
      const firstLimited = outcomes.findIndex((o) => o.status === 429);
      return {
        ok: limited > 0,
        message: limited
          ? "first 429 at request #" + (firstLimited + 1) + "; " + limited + " of " + outcomes.length + " throttled"
          : "no request was throttled  -  the limiter did not engage",
      };
    },
  },
];

export const scenarioGroups: Array<{ id: ScenarioGroup; label: string; blurb: string }> = [
  { id: "mechanism", label: "Mechanism", blurb: "The weighting rule, proved on fresh targets" },
  { id: "validation", label: "Validation", blurb: "Input the API must refuse, with a useful error" },
  { id: "protocol", label: "Protocol", blurb: "Retries, idempotency, and read purity" },
  { id: "load", label: "Load & limits", blurb: "Batch size, throughput, and the rate limiter" },
];

/** Short, collision-resistant suffix so each run targets ids no previous run used. */
export function newRunNonce(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function statusMatches(expected: number | number[], actual: number): boolean {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}
