import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rate-limiter";

// `createRateLimiter` is already key-agnostic — every existing call site just
// happens to pass an IP. These pin the property the backfill limiter depends
// on, so a future change that assumes an IP key breaks here rather than in
// production, where the symptom would be one clinic's devices sharing a quota.
describe("rate limiter keyed on identity", () => {
  it("counts two identities behind one IP separately", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    expect(limiter.check("user-a").allowed).toBe(true);
    expect(limiter.check("user-a").allowed).toBe(true);
    expect(limiter.check("user-a").allowed).toBe(false);
    expect(limiter.check("user-b").allowed).toBe(true);
  });

  it("supplies a retry hint once exhausted", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    limiter.check("k");
    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error("expected the request to be blocked");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("stops at the configured ceiling rather than near it", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 600 });
    for (let i = 0; i < 600; i++) {
      expect(limiter.check("caller").allowed).toBe(true);
    }
    expect(limiter.check("caller").allowed).toBe(false);
  });
});
