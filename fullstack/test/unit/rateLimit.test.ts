import { describe, expect, it } from "vitest";
import { clientKeyFromRequest, isRateLimited } from "../../lib/rateLimit";

describe("isRateLimited", () => {
  it("allows requests under the limit and blocks the one that exceeds it", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 100; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
    expect(isRateLimited(key)).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    for (let i = 0; i < 100; i++) isRateLimited(keyA);

    expect(isRateLimited(keyA)).toBe(true);
    expect(isRateLimited(keyB)).toBe(false);
  });
});

describe("clientKeyFromRequest", () => {
  it("uses the first address in x-forwarded-for when present", () => {
    const request = new Request("http://test.local", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKeyFromRequest(request)).toBe("1.2.3.4");
  });

  it("falls back to a constant key when the header is absent", () => {
    const request = new Request("http://test.local");
    expect(clientKeyFromRequest(request)).toBe("unknown");
  });
});
