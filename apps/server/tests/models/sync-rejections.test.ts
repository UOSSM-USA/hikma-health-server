import { describe, it, expect } from "vitest";
import { classifyUpsertResult } from "@/models/sync";

describe("classifyUpsertResult", () => {
  // What a guard-rejected upsert actually returns, verified against Postgres in
  // tests/integration/models/sync-rejections.test.ts. Note this is NOT
  // `undefined`, contrary to the inline comment in event.ts.
  it("treats a zero row count as a rejection", () => {
    expect(classifyUpsertResult({ numInsertedOrUpdatedRows: 0n } as any)).toBe(
      false,
    );
  });

  it("treats a positive row count as accepted", () => {
    expect(classifyUpsertResult({ numInsertedOrUpdatedRows: 1n } as any)).toBe(
      true,
    );
  });

  // appointment.ts rebuilds the result as `{ numInsertedOrUpdatedRows:
  // Number(...) }`, so the count arrives as a JS number rather than a bigint.
  // Reading only the bigint shape classified a REJECTED appointment as
  // accepted, the client marked it synced, and the next pull overwrote the
  // user's edit.
  it("treats a zero row count as a rejection when it arrives as a number", () => {
    expect(classifyUpsertResult({ numInsertedOrUpdatedRows: 0 } as any)).toBe(
      false,
    );
  });

  it("treats a positive row count as accepted when it arrives as a number", () => {
    expect(classifyUpsertResult({ numInsertedOrUpdatedRows: 1 } as any)).toBe(
      true,
    );
  });

  // `Number(undefined)` is how a count would go wrong silently; it must not
  // read as accepted.
  it("treats a NaN row count as a rejection", () => {
    expect(classifyUpsertResult({ numInsertedOrUpdatedRows: NaN } as any)).toBe(
      false,
    );
  });

  // Defensive: no driver path currently produces these, but a model that adds
  // RETURNING, or a future Kysely change, would.
  it("treats undefined as a rejection", () => {
    expect(classifyUpsertResult(undefined)).toBe(false);
  });

  it("treats null as a rejection", () => {
    expect(classifyUpsertResult(null)).toBe(false);
  });

  it("treats a returned row as accepted", () => {
    expect(classifyUpsertResult({ id: "abc" } as any)).toBe(true);
  });
});
