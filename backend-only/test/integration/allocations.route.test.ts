import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { MAX_ALLOCATIONS, MAX_AMOUNT } from "../../src/schemas/allocation.schema.js";

describe("POST /allocations/weights", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns weights ranked descending, proving distributed beats concentrated end-to-end", async () => {
    const allocations = [
      { userId: "user_1", targetId: "A", amount: 10_000 },
      ...Array.from({ length: 100 }, (_, i) => ({
        userId: `user_${i}`,
        targetId: "B",
        amount: 100,
      })),
    ];

    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: allocations,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { targetId: "B", rawTotal: 10_000, uniqueUserCount: 100, weight: 1_000_000 },
      { targetId: "A", rawTotal: 10_000, uniqueUserCount: 1, weight: 10_000 },
    ]);
  });

  it("returns 200 and [] for an empty array", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [],
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("rejects a negative amount with a 400 ValidationError matching the API contract", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [{ userId: "user_1", targetId: "A", amount: -50 }],
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("ValidationError");
    expect(body.details).toEqual([{ index: 0, field: "amount", value: -50 }]);
  });

  it("rejects a missing targetId with a 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [{ userId: "user_1", amount: 10 }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ValidationError");
  });

  it("rejects a non-array body with a 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: { not: "an array" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ValidationError");
  });

  it("rejects a non-numeric amount with a 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [{ userId: "user_1", targetId: "A", amount: "lots" }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ValidationError");
  });

  it("trims whitespace around targetId, merging it with an untrimmed duplicate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [
        { userId: "user_1", targetId: "A", amount: 50 },
        { userId: "user_2", targetId: " A ", amount: 50 },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ targetId: "A", rawTotal: 100, uniqueUserCount: 2, weight: 200 }]);
  });

  it("rejects an amount above the maximum with a 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [{ userId: "user_1", targetId: "A", amount: MAX_AMOUNT + 1 }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ValidationError");
  });

  it("rejects a request with more allocations than the maximum with a 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: Array.from({ length: MAX_ALLOCATIONS + 1 }, (_, i) => ({
        userId: `user_${i}`,
        targetId: "A",
        amount: 1,
      })),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ValidationError");
  });

  it("returns all validation details for a request with multiple invalid rows, not just the first", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/allocations/weights",
      payload: [
        { userId: "user_1", targetId: "A", amount: -50 },
        { userId: "user_2", targetId: "B", amount: "not-a-number" },
      ],
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.details).toEqual([
      { index: 0, field: "amount", value: -50 },
      { index: 1, field: "amount", value: "not-a-number" },
    ]);
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});

describe("GET /docs", () => {
  it("serves the Swagger UI", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/docs" });

    // swagger-ui redirects "/docs" -> "/docs/", so either is a healthy response.
    expect([200, 302]).toContain(response.statusCode);
    await app.close();
  });
});
