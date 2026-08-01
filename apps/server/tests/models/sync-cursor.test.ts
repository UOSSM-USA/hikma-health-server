import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  type PageCursor,
} from "@/models/sync-paged";

const valid: PageCursor = {
  v: 1,
  since: 1_700_000_000_000,
  ts: 1_800_000_000_000,
  t: 2,
  b: "updated",
  k: ["2026-01-01T00:00:00.000Z", "abc-123"],
  n: {},
};

describe("cursor codec", () => {
  it("round-trips a cursor unchanged", () => {
    expect(decodeCursor(encodeCursor(valid), 10)).toEqual(valid);
  });

  it("round-trips a first-page cursor with a null key", () => {
    const first = { ...valid, k: null };
    expect(decodeCursor(encodeCursor(first), 10)).toEqual(first);
  });

  it("rejects a table index outside the entity list", () => {
    const evil = encodeCursor({ ...valid, t: 99 });
    expect(() => decodeCursor(evil, 10)).toThrow(/table index/i);
  });

  it("rejects a negative table index", () => {
    const evil = encodeCursor({ ...valid, t: -1 });
    expect(() => decodeCursor(evil, 10)).toThrow(/table index/i);
  });

  it("rejects an unknown bucket name", () => {
    const evil = encodeCursor({ ...valid, b: "drop_table" as never });
    expect(() => decodeCursor(evil, 10)).toThrow(/bucket/i);
  });

  it("rejects an unknown cursor version", () => {
    const evil = encodeCursor({ ...valid, v: 2 as never });
    expect(() => decodeCursor(evil, 10)).toThrow(/version/i);
  });

  it("rejects a non-numeric snapshot timestamp", () => {
    const evil = Buffer.from(JSON.stringify({ ...valid, ts: "now" })).toString(
      "base64",
    );
    expect(() => decodeCursor(evil, 10)).toThrow(/timestamp/i);
  });

  it("rejects a malformed key tuple", () => {
    const evil = Buffer.from(
      JSON.stringify({ ...valid, k: ["only-one"] }),
    ).toString("base64");
    expect(() => decodeCursor(evil, 10)).toThrow(/key/i);
  });

  // The running row tally rides in the cursor so the audit row written on the
  // final page can report the whole run, not just its last page.
  it("round-trips the running row tally", () => {
    const counted = { ...valid, n: { patients: 120, visits: 43 } };
    expect(decodeCursor(encodeCursor(counted), 10)).toEqual(counted);
  });

  it("reads a cursor issued before the tally existed as an empty tally", () => {
    const { n: _n, ...withoutTally } = valid;
    const raw = Buffer.from(JSON.stringify(withoutTally)).toString("base64");
    expect(decodeCursor(raw, 10).n).toEqual({});
  });

  it("rejects a tally that is not a map", () => {
    const evil = Buffer.from(
      JSON.stringify({ ...valid, n: [1, 2, 3] }),
    ).toString("base64");
    expect(() => decodeCursor(evil, 10)).toThrow(/tally/i);
  });

  it("rejects a non-numeric tally entry", () => {
    const evil = Buffer.from(
      JSON.stringify({ ...valid, n: { patients: "many" } }),
    ).toString("base64");
    expect(() => decodeCursor(evil, 10)).toThrow(/tally/i);
  });

  it("rejects a negative tally entry", () => {
    const evil = Buffer.from(
      JSON.stringify({ ...valid, n: { patients: -1 } }),
    ).toString("base64");
    expect(() => decodeCursor(evil, 10)).toThrow(/tally/i);
  });

  it("rejects non-base64 junk", () => {
    expect(() => decodeCursor("!!!not base64!!!", 10)).toThrow();
  });

  it("rejects base64 that is not JSON", () => {
    expect(() => decodeCursor(Buffer.from("hello").toString("base64"), 10)).toThrow();
  });
});
