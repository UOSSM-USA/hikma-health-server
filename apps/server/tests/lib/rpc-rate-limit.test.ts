import { describe, it, expect } from "vitest";
import {
  isBackfillOnly,
  callerKey,
  checkBackfillLimit,
} from "@/lib/rpc-rate-limit";

const QUERY = "/rpc/query";
const COMMAND = "/rpc/command";

describe("isBackfillOnly", () => {
  it("recognises each backfill procedure", () => {
    expect(isBackfillOnly("/rpc/query/sync.backfillPull", QUERY)).toBe(true);
    expect(isBackfillOnly("/rpc/command/sync.backfillPush", COMMAND)).toBe(
      true,
    );
  });

  it("does not recognise an ordinary procedure", () => {
    expect(isBackfillOnly("/rpc/query/sync.pull", QUERY)).toBe(false);
    expect(isBackfillOnly("/rpc/query/patients.list", QUERY)).toBe(false);
  });

  // tRPC batches several procedures into one request as a comma-separated
  // path. A batch earns the backfill treatment only if every member deserves
  // it; one ordinary procedure in the list pulls the whole request back to the
  // route's usual limiter.
  it("recognises a batch of nothing but backfill procedures", () => {
    expect(
      isBackfillOnly("/rpc/query/sync.backfillPull,sync.backfillPull", QUERY),
    ).toBe(true);
  });

  it("refuses a batch that mixes in an ordinary procedure", () => {
    expect(
      isBackfillOnly("/rpc/query/sync.backfillPull,sync.pull", QUERY),
    ).toBe(false);
  });

  // `[].every(...)` is true, so a path that yields no names would otherwise be
  // treated as all-backfill and get the *permissive* limiter. Malformed input
  // must fall through to the route's usual one.
  it("refuses a path that names no procedure", () => {
    expect(isBackfillOnly("/rpc/query/", QUERY)).toBe(false);
    expect(isBackfillOnly("/rpc/query", QUERY)).toBe(false);
    expect(isBackfillOnly("", QUERY)).toBe(false);
  });

  it("refuses a path with an empty name in the batch", () => {
    expect(isBackfillOnly("/rpc/query/sync.backfillPull,", QUERY)).toBe(false);
    expect(isBackfillOnly("/rpc/query/,sync.backfillPull", QUERY)).toBe(false);
  });

  // Decoded before splitting, so an encoded comma cannot hide a second
  // procedure behind a name that looks like a lone backfill call.
  it("refuses a percent-encoded batch hiding an ordinary procedure", () => {
    expect(
      isBackfillOnly("/rpc/query/sync.backfillPull%2Csync.pull", QUERY),
    ).toBe(false);
  });

  it("refuses a malformed percent escape", () => {
    expect(isBackfillOnly("/rpc/query/sync.backfillPull%ZZ", QUERY)).toBe(
      false,
    );
  });

  it("refuses a path under a different endpoint", () => {
    expect(isBackfillOnly("/api/v2/sync.backfillPull", QUERY)).toBe(false);
    expect(isBackfillOnly("/rpc/queryX/sync.backfillPull", QUERY)).toBe(false);
  });
});

const withAuth = (header: string | null): Request =>
  new Request("https://example.test/rpc/query/sync.backfillPull", {
    headers: {
      ...(header ? { Authorization: header } : {}),
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    },
  });

describe("callerKey", () => {
  it("keys on the caller when a bearer token is present", () => {
    expect(callerKey(withAuth("Bearer abc123"))).toMatch(/^t:/);
  });

  it("gives one caller a stable key and two callers different keys", () => {
    expect(callerKey(withAuth("Bearer abc123"))).toBe(
      callerKey(withAuth("Bearer abc123")),
    );
    expect(callerKey(withAuth("Bearer abc123"))).not.toBe(
      callerKey(withAuth("Bearer def456")),
    );
  });

  // Tokens are stored in plaintext and looked up by equality, so a token
  // fragment held in a long-lived map is live credential material.
  it("never carries the token itself", () => {
    const key = callerKey(withAuth("Bearer super-secret-token-value"));
    expect(key).not.toContain("super-secret");
    expect(key).not.toContain("token-value");
  });

  it("falls back to the client IP when there is no usable token", () => {
    expect(callerKey(withAuth(null))).toBe("ip:203.0.113.9");
    expect(callerKey(withAuth("Bearer "))).toBe("ip:203.0.113.9");
    expect(callerKey(withAuth("Basic abc123"))).toBe("ip:203.0.113.9");
  });
});

/**
 * The limiters are module-level and per-process, so these tests share them and
 * the order matters. Each uses its own IP so one cannot spend another's budget.
 */
const requestFrom = (ip: string, token: string | null): Request =>
  new Request("https://example.test/rpc/query/sync.backfillPull", {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-forwarded-for": ip,
    },
  });

describe("checkBackfillLimit", () => {
  it("lets one caller through at the per-device rate", () => {
    for (let i = 0; i < 600; i++) {
      expect(checkBackfillLimit(requestFrom("198.51.100.1", "device-a")).allowed).toBe(true);
    }
    expect(checkBackfillLimit(requestFrom("198.51.100.1", "device-a")).allowed).toBe(false);
  });

  // The reason the ceiling is keyed on the caller at all: a clinic behind one
  // NAT must not have its tablets starve each other.
  it("does not let one exhausted device block another behind the same NAT", () => {
    for (let i = 0; i < 600; i++) {
      checkBackfillLimit(requestFrom("198.51.100.2", "device-b"));
    }
    expect(checkBackfillLimit(requestFrom("198.51.100.2", "device-b")).allowed).toBe(false);
    expect(checkBackfillLimit(requestFrom("198.51.100.2", "device-c")).allowed).toBe(true);
  });

  /**
   * The bypass this backstop closes.
   *
   * `callerKey` reads the bearer token off the header, and nothing has validated
   * it at that point — the route runs before the procedure. So a fresh random
   * token per request minted a fresh 600/min bucket every time and the ceiling
   * bound only clients that were already well-behaved. Rotation now tops out at
   * the per-IP backstop instead of at infinity.
   */
  it("bounds a caller rotating bearer tokens to mint fresh buckets", () => {
    let allowed = 0;
    for (let i = 0; i < 7_000; i++) {
      if (checkBackfillLimit(requestFrom("198.51.100.3", `rotated-${i}`)).allowed) allowed += 1;
    }
    expect(allowed).toBe(6_000);
    expect(checkBackfillLimit(requestFrom("198.51.100.3", "rotated-again")).allowed).toBe(false);
  });

  it("reports a retry delay when it refuses", () => {
    for (let i = 0; i < 600; i++) checkBackfillLimit(requestFrom("198.51.100.4", "device-d"));
    const refused = checkBackfillLimit(requestFrom("198.51.100.4", "device-d"));
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryAfterMs).toBeGreaterThan(0);
      expect(refused.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });
});
