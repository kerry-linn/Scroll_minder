import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock @upstash/redis and @upstash/ratelimit before importing the module ───
const mockLimit = vi.fn();

vi.mock("@upstash/redis", () => {
  // Plain vi.fn() is a valid constructor for `new Redis(...)`
  const Redis = vi.fn();
  return { Redis };
});

vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn(function (this: { limit: typeof mockLimit }) {
    this.limit = mockLimit;
  });
  // @ts-expect-error — attaching static method to vi mock
  Ratelimit.slidingWindow = vi.fn().mockReturnValue("sliding-window-config");
  return { Ratelimit };
});

// Set env vars before importing the module under test.
process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

const { checkTaskCreationLimit } = await import("../index");

// ─────────────────────────────────────────────────────────────────────────────

describe("checkTaskCreationLimit", () => {
  beforeEach(() => {
    mockLimit.mockReset();
  });

  it("returns allowed:true when the rate limit has not been exceeded", async () => {
    mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 10_000 });

    const result = await checkTaskCreationLimit("user-1");

    expect(result.allowed).toBe(true);
  });

  it("returns allowed:false with a positive retryAfterMs when the limit is exceeded", async () => {
    const futureReset = Date.now() + 5_000;
    mockLimit.mockResolvedValue({ success: false, reset: futureReset });

    const result = await checkTaskCreationLimit("user-1");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(5_000);
    }
  });

  it("uses the userId as the rate-limit key", async () => {
    mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 10_000 });

    await checkTaskCreationLimit("user-abc");

    expect(mockLimit).toHaveBeenCalledWith("user-abc");
  });

  it("returns retryAfterMs of 0 when reset is in the past", async () => {
    mockLimit.mockResolvedValue({ success: false, reset: Date.now() - 100 });

    const result = await checkTaskCreationLimit("user-1");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(0);
    }
  });
});
