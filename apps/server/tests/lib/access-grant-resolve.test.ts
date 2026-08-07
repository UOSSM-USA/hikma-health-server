import { describe, it, expect } from "vitest";
import AccessGrant from "../../src/models/access-grant";

const SCOPE = AccessGrant.SCOPES.EVENT_FORM_ATTACHMENTS_READ;
const OTHER_SCOPE = "some_future_capability:read" as typeof SCOPE;

const NOW = Date.UTC(2026, 7, 7, 12, 0, 0);
const LATER = new Date(NOW + 86_400_000);
const EARLIER = new Date(NOW - 86_400_000);

const digest = AccessGrant.digestOf("plaintext-token");

const storedGrant = (
  overrides: Partial<AccessGrant.StoredGrant> = {},
): AccessGrant.StoredGrant => ({
  id: "grant-1",
  token_hash: digest,
  scope: SCOPE,
  subject_id: null,
  created_by_user_id: "user-1",
  expires_at: LATER,
  revoked_at: null,
  ...overrides,
});

const evaluate = (
  row: AccessGrant.StoredGrant | undefined | null,
  required: { scope?: typeof SCOPE; subjectId?: string | null } = {},
) =>
  AccessGrant.evaluateStoredGrant(
    row,
    {
      scope: required.scope ?? SCOPE,
      subjectId: required.subjectId,
      digest,
    },
    NOW,
  );

describe("AccessGrant.evaluateStoredGrant", () => {
  it("honours a live grant, reporting the minting user", () => {
    expect(evaluate(storedGrant())).toEqual({
      id: "grant-1",
      scope: SCOPE,
      subjectId: null,
      userId: "user-1",
      expiresAt: LATER,
    });
  });

  it("rejects an unknown token", () => {
    expect(evaluate(undefined)).toBeNull();
    expect(evaluate(null)).toBeNull();
  });

  it("rejects a digest that does not match the presented token", () => {
    expect(
      evaluate(storedGrant({ token_hash: AccessGrant.digestOf("other") })),
    ).toBeNull();
  });

  // Buffer.from silently drops non-hex, so these decode shorter than they look.
  it("rejects a malformed stored hash rather than throwing", () => {
    expect(evaluate(storedGrant({ token_hash: "z".repeat(64) }))).toBeNull();
    expect(evaluate(storedGrant({ token_hash: "" }))).toBeNull();
    expect(evaluate(storedGrant({ token_hash: "abcd" }))).toBeNull();
  });

  it("rejects a grant minted for a different scope", () => {
    expect(evaluate(storedGrant({ scope: OTHER_SCOPE }))).toBeNull();
    expect(evaluate(storedGrant(), { scope: OTHER_SCOPE })).toBeNull();
  });

  it("rejects a revoked grant even before it expires", () => {
    expect(
      evaluate(storedGrant({ revoked_at: EARLIER, expires_at: LATER })),
    ).toBeNull();
  });

  it("rejects an expired grant, treating the expiry instant as already past", () => {
    expect(evaluate(storedGrant({ expires_at: EARLIER }))).toBeNull();
    expect(evaluate(storedGrant({ expires_at: new Date(NOW) }))).toBeNull();
  });

  it("reads an expiry given as an ISO string", () => {
    expect(evaluate(storedGrant({ expires_at: LATER.toISOString() }))).not.toBe(
      null,
    );
    expect(
      evaluate(storedGrant({ expires_at: EARLIER.toISOString() })),
    ).toBeNull();
  });

  describe("subject narrowing", () => {
    it("honours a narrowed grant only for its own subject", () => {
      const row = storedGrant({ subject_id: "event-1" });
      expect(evaluate(row, { subjectId: "event-1" })).not.toBeNull();
      expect(evaluate(row, { subjectId: "event-2" })).toBeNull();
      expect(evaluate(row, { subjectId: null })).toBeNull();
      expect(evaluate(row)).toBeNull();
    });

    it("honours an unnarrowed grant for any subject", () => {
      const row = storedGrant({ subject_id: null });
      expect(evaluate(row, { subjectId: "event-1" })).not.toBeNull();
      expect(evaluate(row, { subjectId: "event-2" })).not.toBeNull();
      expect(evaluate(row)).not.toBeNull();
    });
  });
});
