import { describe, it, expect } from "vitest";
import AccessGrant from "../../src/models/access-grant";

const SCOPE = AccessGrant.SCOPES.EVENT_FORM_ATTACHMENTS_READ;

describe("AccessGrant.clampExpiryDays", () => {
  it("passes through a value inside the scope's range", () => {
    expect(AccessGrant.clampExpiryDays(SCOPE, 7)).toBe(7);
    expect(
      AccessGrant.clampExpiryDays(SCOPE, AccessGrant.EXPIRY_DAYS_MIN),
    ).toBe(AccessGrant.EXPIRY_DAYS_MIN);
  });

  it("caps a value above the scope's ceiling", () => {
    const max = AccessGrant.expiryDaysMax(SCOPE);
    expect(AccessGrant.clampExpiryDays(SCOPE, max + 1)).toBe(max);
    expect(AccessGrant.clampExpiryDays(SCOPE, 10_000)).toBe(max);
    expect(AccessGrant.clampExpiryDays(SCOPE, Infinity)).toBe(
      AccessGrant.EXPIRY_DAYS_MIN,
    );
  });

  // A cleared number input arrives as NaN, or null once serialized.
  it("collapses non-finite, negative and fractional values to the minimum", () => {
    const min = AccessGrant.EXPIRY_DAYS_MIN;
    expect(AccessGrant.clampExpiryDays(SCOPE, NaN)).toBe(min);
    expect(AccessGrant.clampExpiryDays(SCOPE, 0)).toBe(min);
    expect(AccessGrant.clampExpiryDays(SCOPE, -30)).toBe(min);
    expect(AccessGrant.clampExpiryDays(SCOPE, 0.9)).toBe(min);
    expect(AccessGrant.clampExpiryDays(SCOPE, null as unknown as number)).toBe(
      min,
    );
  });

  it("truncates a fractional value rather than rounding it up", () => {
    expect(AccessGrant.clampExpiryDays(SCOPE, 7.9)).toBe(7);
  });
});

describe("AccessGrant.SCOPES", () => {
  // A scope missing from SCOPE_EXPIRY_DAYS_MAX would mint permanent credentials.
  it("gives every scope a positive expiry ceiling", () => {
    for (const scope of Object.values(AccessGrant.SCOPES)) {
      expect(AccessGrant.expiryDaysMax(scope)).toBeGreaterThan(0);
    }
  });
});
