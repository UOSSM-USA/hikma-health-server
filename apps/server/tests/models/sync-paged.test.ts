import { describe, it, expect } from "vitest";
import {
  assemblePage,
  AUX_DELIVERY_NAMES,
  SORT_COLUMN,
  SORT_KEY_ALIAS,
  MAX_PAGE_BYTES,
} from "@/models/sync-paged";
import {
  ENTITIES_TO_PUSH_TO_HUB,
  ENTITIES_TO_PUSH_TO_MOBILE,
} from "@/models/sync-shared";

const row = (id: string, sortValue: string, padding = 0) => ({
  id,
  server_created_at: sortValue,
  last_modified: sortValue,
  deleted_at: sortValue,
  blob: "x".repeat(padding),
});

describe("SORT_COLUMN", () => {
  it("maps each bucket to the column its query orders by", () => {
    expect(SORT_COLUMN.created).toBe("server_created_at");
    expect(SORT_COLUMN.updated).toBe("last_modified");
    expect(SORT_COLUMN.deleted).toBe("deleted_at");
  });
});

describe("assemblePage", () => {
  it("takes every row when the budget is ample", () => {
    const rows = [row("a", "2026-01-01"), row("b", "2026-01-02")];
    const { taken, exhausted } = assemblePage(
      rows,
      "created",
      MAX_PAGE_BYTES,
      500,
    );
    expect(taken).toHaveLength(2);
    expect(exhausted).toBe(true);
  });

  it("stops at the row cap and reports not exhausted", () => {
    const rows = [
      row("a", "2026-01-01"),
      row("b", "2026-01-02"),
      row("c", "2026-01-03"),
    ];
    const { taken, exhausted } = assemblePage(
      rows,
      "created",
      MAX_PAGE_BYTES,
      2,
    );
    expect(taken.map((r) => r.id)).toEqual(["a", "b"]);
    expect(exhausted).toBe(false);
  });

  it("stops at the byte budget even when far under the row cap", () => {
    const rows = [row("a", "2026-01-01", 5000), row("b", "2026-01-02", 5000)];
    const { taken, exhausted } = assemblePage(rows, "created", 6000, 500);
    expect(taken).toHaveLength(1);
    expect(exhausted).toBe(false);
  });

  it("always takes at least one row, even one larger than the whole budget", () => {
    const rows = [row("a", "2026-01-01", 50_000)];
    const { taken, exhausted } = assemblePage(rows, "created", 1000, 500);
    expect(taken).toHaveLength(1);
    expect(exhausted).toBe(true);
  });

  it("reports the keyset position of the last row it took", () => {
    const rows = [
      row("a", "2026-01-01"),
      row("b", "2026-01-02"),
      row("c", "2026-01-03"),
    ];
    const { lastKey } = assemblePage(rows, "created", MAX_PAGE_BYTES, 2);
    expect(lastKey).toEqual(["2026-01-02", "b"]);
  });

  it("reports a null key for an empty result", () => {
    const { taken, lastKey, exhausted } = assemblePage(
      [],
      "created",
      MAX_PAGE_BYTES,
      500,
    );
    expect(taken).toHaveLength(0);
    expect(lastKey).toBeNull();
    expect(exhausted).toBe(true);
  });

  it("keys the deleted bucket on deleted_at", () => {
    const rows = [row("a", "2026-01-01"), row("b", "2026-01-02")];
    const { lastKey } = assemblePage(rows, "deleted", MAX_PAGE_BYTES, 1);
    expect(lastKey).toEqual(["2026-01-01", "a"]);
  });

  // node-postgres hands back `timestamptz` as a JS Date. `String(date)` would
  // produce "Thu Jan 01 2026 00:00:00 GMT+0000 (Coordinated Universal Time)",
  // which the next page feeds straight back to Postgres as a ::timestamptz
  // literal. ISO-8601 is the only form that survives that round trip.
  it("serialises a Date sort value as ISO-8601 for the cursor", () => {
    const at = new Date("2026-01-01T12:34:56.789Z");
    const rows = [{ id: "a", server_created_at: at }];
    const { lastKey } = assemblePage(rows, "created", MAX_PAGE_BYTES, 500);
    expect(lastKey).toEqual(["2026-01-01T12:34:56.789Z", "a"]);
  });

  // The Date the driver returns is millisecond-truncated. A cursor built from
  // it names an instant before the row it came from, so the next page's
  // `sort > cursor` re-matches that same row and the pull never advances.
  it("prefers the full-precision sort alias over the truncated Date", () => {
    const rows = [
      {
        id: "a",
        server_created_at: new Date("2026-04-27T18:13:18.539Z"),
        [SORT_KEY_ALIAS]: "2026-04-27T18:13:18.539950Z",
      },
    ];
    const { lastKey } = assemblePage(rows, "created", MAX_PAGE_BYTES, 500);
    expect(lastKey).toEqual(["2026-04-27T18:13:18.539950Z", "a"]);
  });
});

describe("auxiliary tables", () => {
  // `getDeltaRecords` appends exactly these two after its entity loop. A paged
  // pull that omits one loses it permanently, because a completed run advances
  // the client's watermark past this snapshot and ordinary sync then never asks
  // for the window again. This pins the list against that pair.
  //
  // It pins ONE direction. Dropping a table from the paged side turns this red;
  // appending a THIRD table to `getDeltaRecords` and forgetting it here does
  // not, which is the direction the original bug came from. Anything added
  // there has to be added to AUX_TABLES by hand.
  it("covers every table the ordinary pull delivers outside the entity lists", () => {
    expect([...AUX_DELIVERY_NAMES].sort()).toEqual([
      "app_config",
      "user_clinic_permissions",
    ]);
  });

  // Auxiliary tables are delivered whole on the final page. If one also entered
  // an entity list it would be walked AND appended — two changesets for one
  // table under the same key, the second silently replacing the first.
  it("does not overlap the entity lists in either direction", () => {
    const entityNames = new Set(
      [...ENTITIES_TO_PUSH_TO_MOBILE, ...ENTITIES_TO_PUSH_TO_HUB].map(
        (e) => e.Table.mobileName ?? e.Table.name,
      ),
    );
    for (const name of AUX_DELIVERY_NAMES) {
      expect(entityNames.has(name)).toBe(false);
    }
  });
});
