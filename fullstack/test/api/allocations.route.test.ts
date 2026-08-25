import { afterAll, describe, expect, it } from "vitest";
import { GET, POST } from "../../app/api/allocations/weights/route";
import { prisma } from "../../lib/prisma";

// Uses a dedicated, disposable target/user prefix so these tests never touch
// the demo seed data (Target A / Target B) that the dashboard displays.
const TEST_PREFIX = "vitest_api_";

function post(payload: unknown): Promise<Response> {
  return POST(new Request("http://test.local/api/allocations/weights", { method: "POST", body: JSON.stringify(payload) }));
}

describe("POST /api/allocations/weights", () => {
  afterAll(async () => {
    await prisma.allocation.deleteMany({ where: { targetId: { startsWith: TEST_PREFIX } } });
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
});

describe("GET /api/allocations/weights", () => {
  it("returns the seeded demo scenario ranked descending by weight", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ targetId: string; weight: number }>;
    const targetIds = body.map((r) => r.targetId);
    // Both demo targets should be present, B (distributed) ranked above A (concentrated).
    expect(targetIds.indexOf("B")).toBeGreaterThanOrEqual(0);
    expect(targetIds.indexOf("A")).toBeGreaterThanOrEqual(0);
    expect(targetIds.indexOf("B")).toBeLessThan(targetIds.indexOf("A"));
  });
});
