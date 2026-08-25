import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../app/api/allocations/weights/route";
import { prisma } from "../../lib/prisma";
import { MAX_ALLOCATIONS, MAX_AMOUNT } from "../../lib/validation";

// Uses a dedicated, disposable target/user prefix so these tests never touch
// the demo seed data (Target A / Target B) that the dashboard displays.
const TEST_PREFIX = "vitest_api_";

function post(payload: unknown, headers?: Record<string, string>): Promise<Response> {
  return POST(
    new Request("http://test.local/api/allocations/weights", { method: "POST", headers, body: JSON.stringify(payload) }),
  );
}

describe("POST /api/allocations/weights", () => {
  // Opens the pool connection outside any timed test, so a slow first
  // connection (cold start against a remote/pooled Postgres) can't eat into
  // the first real test's timeout budget and read as a false failure there.
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  }, 20_000);

  afterAll(async () => {
    await prisma.allocation.deleteMany({ where: { targetId: { startsWith: TEST_PREFIX } } });
    await prisma.processedRequest.deleteMany({ where: { idempotencyKey: { startsWith: TEST_PREFIX } } });
  });

  it("persists allocations and returns weights for the full accumulated dataset", async () => {
    const targetId = `${TEST_PREFIX}A`;
    const response = await post([{ userId: `${TEST_PREFIX}user_1`, targetId, amount: 10_000 }]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ targetId: string; weight: number }>;
    expect(body.find((r) => r.targetId === targetId)?.weight).toBe(10_000);
  });

  it("dampens a distributed target's weight above a concentrated one for the same raw total", async () => {
    const concentratedTarget = `${TEST_PREFIX}concentrated`;
    const distributedTarget = `${TEST_PREFIX}distributed`;

    await post([{ userId: `${TEST_PREFIX}whale`, targetId: concentratedTarget, amount: 10_000 }]);
    await post(
      Array.from({ length: 100 }, (_, i) => ({
        userId: `${TEST_PREFIX}u${i}`,
        targetId: distributedTarget,
        amount: 100,
      })),
    );

    const response = await post([]);
    const body = (await response.json()) as Array<{ targetId: string; weight: number; rawTotal: number }>;
    const concentrated = body.find((r) => r.targetId === concentratedTarget)!;
    const distributed = body.find((r) => r.targetId === distributedTarget)!;

    expect(concentrated.rawTotal).toBe(distributed.rawTotal);
    expect(distributed.weight).toBeGreaterThanOrEqual(concentrated.weight * 2);
  });

  it("rejects a negative amount with a 400 ValidationError matching the API contract", async () => {
    const response = await post([{ userId: "user_1", targetId: "A", amount: -50 }]);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe("ValidationError");
    expect(body.details).toEqual([{ index: 0, field: "amount", value: -50 }]);
  });

  it("rejects a missing targetId with a 400", async () => {
    const response = await post([{ userId: "user_1", amount: 10 }]);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("ValidationError");
  });

  it("rejects a non-array body with a 400", async () => {
    const response = await post({ not: "an array" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("ValidationError");
  });

  it("accepts an empty array without persisting anything", async () => {
    const response = await post([]);
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  it("trims whitespace around targetId, merging it with an untrimmed duplicate", async () => {
    const targetId = `${TEST_PREFIX}trim`;
    const response = await post([
      { userId: `${TEST_PREFIX}user_a`, targetId, amount: 50 },
      { userId: `${TEST_PREFIX}user_b`, targetId: ` ${targetId} `, amount: 50 },
    ]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ targetId: string; rawTotal: number; uniqueUserCount: number }>;
    const row = body.find((r) => r.targetId === targetId)!;
    expect(row.rawTotal).toBe(100);
    expect(row.uniqueUserCount).toBe(2);
  });

  it("rejects an amount above the maximum with a 400", async () => {
    const response = await post([{ userId: "user_1", targetId: "A", amount: MAX_AMOUNT + 1 }]);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("ValidationError");
  });

  it("rejects a request with more allocations than the maximum with a 400", async () => {
    const response = await post(
      Array.from({ length: MAX_ALLOCATIONS + 1 }, (_, i) => ({ userId: `user_${i}`, targetId: "A", amount: 1 })),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("ValidationError");
  });

  it("returns all validation details for a request with multiple invalid rows, not just the first", async () => {
    const response = await post([
      { userId: "user_1", targetId: "A", amount: -50 },
      { userId: "user_2", targetId: "B", amount: "not-a-number" },
    ]);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { details: unknown[] };
    expect(body.details).toEqual([
      { index: 0, field: "amount", value: -50 },
      { index: 1, field: "amount", value: "not-a-number" },
    ]);
  });

  it("does not duplicate allocations when the same Idempotency-Key is POSTed twice", async () => {
    const targetId = `${TEST_PREFIX}idempotent`;
    const idempotencyKey = `${TEST_PREFIX}key-${Date.now()}-${Math.random()}`;
    const payload = [{ userId: `${TEST_PREFIX}user_idem`, targetId, amount: 100 }];

    const first = await post(payload, { "Idempotency-Key": idempotencyKey });
    const second = await post(payload, { "Idempotency-Key": idempotencyKey });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const rows = await prisma.allocation.findMany({ where: { targetId } });
    expect(rows).toHaveLength(1);
  });

  it("returns 409 (and persists nothing) when an Idempotency-Key is reused with a DIFFERENT payload", async () => {
    const targetId = `${TEST_PREFIX}idem_conflict`;
    const idempotencyKey = `${TEST_PREFIX}key-conflict-${Date.now()}-${Math.random()}`;

    const first = await post([{ userId: `${TEST_PREFIX}user_c1`, targetId, amount: 100 }], {
      "Idempotency-Key": idempotencyKey,
    });
    const second = await post([{ userId: `${TEST_PREFIX}user_c2`, targetId, amount: 999 }], {
      "Idempotency-Key": idempotencyKey,
    });

    expect(first.status).toBe(200);
    // Before bodyHash existed this silently returned 200 and discarded the second
    // payload — a client bug (key reuse) lost data with a success status.
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("IdempotencyConflict");

    const rows = await prisma.allocation.findMany({ where: { targetId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(`${TEST_PREFIX}user_c1`);
  });

  it("rejects an amount with more than 2 decimal places (storage is Decimal(18,2)) with a 400", async () => {
    const response = await post([{ userId: "user_1", targetId: "A", amount: 0.005 }]);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe("ValidationError");
    expect(body.details).toEqual([{ index: 0, field: "amount", value: 0.005 }]);
  });

  it("accepts a 2-decimal amount at the top of the allowed range (round-trip precision check)", async () => {
    const targetId = `${TEST_PREFIX}precision`;
    const response = await post([{ userId: `${TEST_PREFIX}user_p`, targetId, amount: 999_999_999_999.99 }]);
    expect(response.status).toBe(200);
  });

  it("returns 429 once a client exhausts the rate limit, without touching the database", async () => {
    // Unique forwarded-for key so this test can't exhaust the shared "unknown"
    // bucket the rest of the suite implicitly uses. Invalid-JSON requests are
    // used because the limiter runs before parsing — each costs no DB round trip.
    const headers = { "x-forwarded-for": `${TEST_PREFIX}rate-${Date.now()}-${Math.random()}` };
    const badJson = () =>
      POST(new Request("http://test.local/api/allocations/weights", { method: "POST", headers, body: "not json" }));

    for (let i = 0; i < 100; i++) {
      expect((await badJson()).status).toBe(400);
    }
    const limited = await badJson();
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: string }).error).toBe("TooManyRequests");
  });

  it("persists independently on repeat POSTs when no Idempotency-Key is given (prior behavior preserved)", async () => {
    const targetId = `${TEST_PREFIX}no_key`;
    const payload = [{ userId: `${TEST_PREFIX}user_no_key`, targetId, amount: 100 }];

    await post(payload);
    await post(payload);

    const rows = await prisma.allocation.findMany({ where: { targetId } });
    expect(rows).toHaveLength(2);
  });

  // This is the one test in the file that mocks Prisma rather than hitting real Postgres — the
  // whole point is to exercise a failure path (a healthy database can't be made to fail on
  // demand) and confirm it degrades to the documented { error, message } contract instead of
  // an unstructured framework error page.
  it("returns a structured 500 InternalError when persisting fails, not an unstructured framework error", async () => {
    const spy = vi.spyOn(prisma.allocation, "createMany").mockRejectedValueOnce(new Error("simulated database failure"));

    const response = await post([{ userId: "user_1", targetId: "A", amount: 1 }]);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "InternalError", message: "Something went wrong" });

    spy.mockRestore();
  });
});

describe("GET /api/allocations/weights", () => {
  function get(): Promise<Response> {
    return GET(new Request("http://test.local/api/allocations/weights"));
  }

  it("ranks a distributed target above a concentrated one of equal raw total, descending by weight", async () => {
    // Inserts its own fixture rather than relying on the demo seed being present,
    // so this test passes on a fresh database (e.g. in CI, where `db:seed` does
    // not run before the test step).
    const concentratedTarget = `${TEST_PREFIX}get_concentrated`;
    const distributedTarget = `${TEST_PREFIX}get_distributed`;
    await post([
      { userId: `${TEST_PREFIX}get_whale`, targetId: concentratedTarget, amount: 1_000 },
      ...Array.from({ length: 10 }, (_, i) => ({
        userId: `${TEST_PREFIX}get_u${i}`,
        targetId: distributedTarget,
        amount: 100,
      })),
    ]);

    const response = await get();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ targetId: string; weight: number }>;
    const targetIds = body.map((r) => r.targetId);
    const distributedRank = targetIds.indexOf(distributedTarget);
    const concentratedRank = targetIds.indexOf(concentratedTarget);
    expect(distributedRank).toBeGreaterThanOrEqual(0);
    expect(concentratedRank).toBeGreaterThanOrEqual(0);
    expect(distributedRank).toBeLessThan(concentratedRank);
  });

  it("returns a structured 500 InternalError when the database read fails, not an unstructured framework error", async () => {
    const spy = vi.spyOn(prisma.allocation, "findMany").mockRejectedValueOnce(new Error("simulated database failure"));

    const response = await get();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "InternalError", message: "Something went wrong" });

    spy.mockRestore();
  });
});

// File-scoped, not describe-scoped: both suites above share this one Prisma client
// (see lib/prisma.ts's global singleton), so the pool must only close once everything
// in this file is done with it — closing it inside either suite's own afterAll would
// break whichever suite runs after.
afterAll(async () => {
  await prisma.$disconnect();
});
