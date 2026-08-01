import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import { getDeltaPage, decodeCursor, encodeCursor } from "@/models/sync-paged";
import type { RequestCaller } from "@/types";

const createdIds: {
  patients: string[];
  clinics: string[];
  users: string[];
  permissions: string[];
} = {
  patients: [],
  clinics: [],
  users: [],
  permissions: [],
};

const insertClinic = async () => {
  const id = uuidV1();
  createdIds.clinics.push(id);
  await testDb
    .insertInto("clinics")
    .values({
      id,
      name: "Paged Test Clinic",
      is_deleted: false,
      is_archived: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    })
    .execute();
  return id;
};

const insertUser = async (clinicId: string) => {
  const id = uuidV1();
  createdIds.users.push(id);
  await testDb
    .insertInto("users")
    .values({
      id,
      name: "Paged Test User",
      role: "provider",
      email: `paged-test-${id}@example.com`,
      hashed_password: "not-a-real-hash",
      instance_url: null,
      clinic_id: clinicId,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    })
    .execute();
  return id;
};

/**
 * `createdAt` is passed explicitly so a group of patients can share one
 * `server_created_at` — that collision is what forces the keyset comparison to
 * fall through to `id` rather than skipping or repeating rows.
 */
const insertPatient = async (createdAt: string) => {
  const id = uuidV1();
  createdIds.patients.push(id);
  await testDb
    .insertInto("patients")
    .values({
      id,
      given_name: "Paged",
      surname: "TestPatient",
      date_of_birth: sql`'1985-06-15'::date`,
      sex: "female",
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`${createdAt}::timestamptz`,
      server_created_at: sql`${createdAt}::timestamptz`,
      metadata: sql`'{}'::jsonb`,
    } as any)
    .execute();
  return id;
};

/**
 * A clinic-permission row, the table whose omission this fixture guards.
 *
 * It has no `server_created_at`/`last_modified`, so it cannot ride the keyset
 * walk — `getDeltaPage` appends it whole on the final page instead. If that
 * append is ever dropped, a device that backfills loses clinic access silently:
 * the run's watermark moves past the row and ordinary sync never re-requests it.
 */
const insertPermission = async (userId: string, clinicId: string, at: string) => {
  const id = uuidV1();
  createdIds.permissions.push(id);
  await testDb
    .insertInto("user_clinic_permissions")
    .values({
      id,
      user_id: userId,
      clinic_id: clinicId,
      can_register_patients: true,
      can_view_history: true,
      created_at: sql`${at}::timestamptz`,
      updated_at: sql`${at}::timestamptz`,
    } as any)
    .execute();
  return id;
};

const makeMobileCaller = (userId: string, clinicId: string): RequestCaller =>
  ({
    user: {
      id: userId,
      name: "Paged Test User",
      role: "provider",
      email: "paged@test.com",
      clinic_id: clinicId,
    },
    clinic: { id: clinicId, name: "Paged Test Clinic" },
    token: "test-token",
  }) as any;

// Five patients sharing one timestamp, five spread across distinct ones. The
// shared group is the interesting half; the spread half keeps the ordinary
// path covered in the same run.
//
// Everything is seeded just after `sinceMark` and every pull below passes
// `since: sinceMark`, so a run sees this fixture rather than the whole table.
// The target database holds thousands of rows and is written to concurrently;
// draining it wholesale at pageRows=3 is hundreds of round trips and makes the
// assertions depend on data no test controls.
let sinceMark: number;
let sharedAt: string;
const seeded: string[] = [];
let seededPermissionId: string;
let caller: RequestCaller;

beforeAll(async () => {
  const clinicId = await insertClinic();
  const userId = await insertUser(clinicId);
  caller = makeMobileCaller(userId, clinicId);

  sinceMark = Date.now();
  sharedAt = new Date(sinceMark + 10).toISOString();

  for (let i = 0; i < 5; i++) seeded.push(await insertPatient(sharedAt));
  for (let i = 1; i <= 5; i++) {
    seeded.push(await insertPatient(new Date(sinceMark + 20 * i).toISOString()));
  }

  seededPermissionId = await insertPermission(userId, clinicId, sharedAt);
});

afterAll(async () => {
  for (const id of createdIds.permissions)
    await testDb
      .deleteFrom("user_clinic_permissions")
      .where("id", "=", id)
      .execute();
  for (const id of createdIds.patients)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();
  for (const id of createdIds.users)
    await testDb.deleteFrom("users").where("id", "=", id).execute();
  for (const id of createdIds.clinics)
    await testDb.deleteFrom("clinics").where("id", "=", id).execute();
});

/**
 * Drain a whole pull, returning every id seen plus how many pages it took.
 *
 * `perPageTables` records which table keys each page carried, so a test can
 * assert not just that a table arrived but on WHICH page — the auxiliary tables
 * must appear exactly once, on the last one.
 */
const drain = async (pageRows: number, pageBytes = 12_000_000) => {
  const seen: string[] = [];
  const tombstoned: string[] = [];
  const perPageTables: string[][] = [];
  let cursor: string | null = null;
  let pages = 0;
  let snapshot: number | null = null;
  let totals: Record<string, number> = {};

  do {
    const page = await getDeltaPage({
      since: sinceMark,
      cursor,
      pageBytes,
      pageRows,
      peerType: "android",
      caller,
    });
    snapshot ??= page.timestamp;
    expect(page.timestamp).toBe(snapshot);
    perPageTables.push(Object.keys(page.changes));
    for (const table of Object.values(page.changes)) {
      seen.push(...table.created.map((r: any) => String(r.id)));
      seen.push(...table.updated.map((r: any) => String(r.id)));
      tombstoned.push(...table.deleted.map((id: any) => String(id)));
    }
    cursor = page.nextCursor;
    totals = page.totals;
    pages += 1;
    expect(pages).toBeLessThan(10_000);
  } while (cursor);

  return { seen, tombstoned, pages, totals, perPageTables };
};

describe("getDeltaPage against a real database", () => {
  it("returns each record exactly once across page boundaries", async () => {
    const { seen, pages } = await drain(3);
    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("returns every seeded patient", async () => {
    const { seen } = await drain(3);
    for (const id of seeded) expect(seen).toContain(id);
  });

  // The five patients sharing SHARED_AT cannot be separated by timestamp
  // alone, so a keyset that ignored `id` would loop on them or skip them.
  it("separates rows sharing one timestamp, using id as the tiebreak", async () => {
    const shared = seeded.slice(0, 5);
    const { seen } = await drain(2);
    for (const id of shared) {
      expect(seen.filter((s) => s === id)).toHaveLength(1);
    }
  });

  // Compared over the seeded ids only. The target database is written to
  // concurrently, so full-set equality between two drains would be flaky for
  // reasons that have nothing to do with paging.
  it("returns the same seeded records regardless of page size", async () => {
    const small = new Set((await drain(2)).seen);
    const large = new Set((await drain(1000)).seen);
    for (const id of seeded) {
      expect(small.has(id)).toBe(true);
      expect(large.has(id)).toBe(true);
    }
  });

  it("terminates with a null cursor", async () => {
    const { pages } = await drain(1000);
    expect(pages).toBeGreaterThan(0);
  });

  it("carries the snapshot and lower bound forward in the cursor", async () => {
    const page = await getDeltaPage({
      since: sinceMark,
      cursor: null,
      pageBytes: 12_000_000,
      pageRows: 2,
      peerType: "android",
      caller,
    });
    expect(page.nextCursor).not.toBeNull();
    const decoded = decodeCursor(page.nextCursor!, 100);
    expect(decoded.ts).toBe(page.timestamp);
    expect(decoded.since).toBe(sinceMark);
    expect(decoded.k).not.toBeNull();
  });

  // The tally is what the audit row reports for the whole operation, so it has
  // to survive every page boundary — counting only the last page would report
  // near-zero for a run of any size.
  // Tombstones are counted too: a delete is a record the run delivered, and
  // another suite soft-deleting inside this window is exactly how an earlier
  // version of this assertion — which counted only created and updated — went
  // green alone and red in a full run.
  it("accumulates a row tally across every page of the run", async () => {
    const { seen, tombstoned, totals, pages } = await drain(3);
    expect(pages).toBeGreaterThan(1);
    const counted = Object.values(totals).reduce((a, b) => a + b, 0);
    expect(counted).toBe(seen.length + tombstoned.length);
  });

  // The cursor is client-modifiable, and its tally is written verbatim into an
  // audit record. Only tables this peer actually syncs may appear there.
  it("drops a tally entry for a table the peer does not sync", async () => {
    const page = await getDeltaPage({
      since: sinceMark,
      cursor: encodeCursor({
        v: 1,
        since: sinceMark,
        ts: Date.now(),
        t: 0,
        b: "created",
        k: null,
        n: { patients: 5, "'; DROP TABLE patients; --": 999 },
      }),
      pageBytes: 12_000_000,
      pageRows: 2,
      peerType: "android",
      caller,
    });

    expect(page.totals).not.toHaveProperty("'; DROP TABLE patients; --");
    expect(page.totals.patients).toBeGreaterThanOrEqual(5);
  });

  it("refuses a cursor whose since disagrees with the request", async () => {
    const page = await getDeltaPage({
      since: sinceMark,
      cursor: null,
      pageBytes: 12_000_000,
      pageRows: 2,
      peerType: "android",
      caller,
    });
    await expect(
      getDeltaPage({
        since: 12345,
        cursor: page.nextCursor,
        pageBytes: 12_000_000,
        pageRows: 2,
        peerType: "android",
        caller,
      }),
    ).rejects.toThrow(/since must not change/i);
  });

  // The regression this fixture exists for. `user_clinic_permissions` is not in
  // any entity list and has none of the columns the keyset walk sorts on, so it
  // was absent from every page — while a completed run still advanced the
  // client's watermark past it. A device whose first sync routed through the
  // backfill ended up with no clinic permissions at all, and ordinary sync
  // never asked for the window again.
  it("delivers user_clinic_permissions, which no entity list contains", async () => {
    const { seen } = await drain(3);
    expect(seen).toContain(seededPermissionId);
  });

  it("delivers the auxiliary tables exactly once, on the final page", async () => {
    const { perPageTables } = await drain(3);
    expect(perPageTables.length).toBeGreaterThan(1);

    const appearances = perPageTables.filter((tables) =>
      tables.includes("user_clinic_permissions"),
    );
    expect(appearances).toHaveLength(1);

    // Repeating them per page would multiply a config table by the page count;
    // omitting them from the last page would lose them entirely.
    const last = perPageTables[perPageTables.length - 1];
    expect(last).toContain("user_clinic_permissions");
  });

  it("counts auxiliary rows in the run totals the audit record reports", async () => {
    const { totals } = await drain(3);
    expect(totals.user_clinic_permissions).toBeGreaterThanOrEqual(1);
  });

  // A byte budget below one row's size must still make progress, or the pull
  // never terminates. This degenerates to one row per page — one round trip per
  // row, plus a walk through every empty bucket — so it is deliberately slow
  // against a remote database. Slowness is the cost of the guarantee; a hang
  // would be the bug.
  it(
    "makes progress even when the byte budget cannot fit a single row",
    async () => {
      const { seen, pages } = await drain(500, 1);
      expect(pages).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(seen.length);
      for (const id of seeded) expect(seen).toContain(id);
    },
    180_000,
  );
});
