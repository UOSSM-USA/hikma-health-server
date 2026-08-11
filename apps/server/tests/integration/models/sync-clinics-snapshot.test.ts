/**
 * Clinics are replicated whole on every pull rather than as a delta.
 *
 * These pin the property that makes a missed clinic self-correcting: it is
 * delivered regardless of how recent the client's watermark is.
 */

import { describe, it, expect, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";

import { testDb } from "../setup";
import Sync from "@/models/sync";
import type { RequestCaller } from "@/types";

const createdClinicIds: string[] = [];

const insertClinic = async (overrides: Record<string, unknown> = {}) => {
  const id = uuidV1();
  createdClinicIds.push(id);
  await testDb
    .insertInto("clinics")
    .values({
      id,
      name: "Snapshot Test Clinic",
      is_deleted: false,
      is_archived: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
      ...overrides,
    })
    .execute();
  return id;
};

const caller: RequestCaller = {
  user: { id: uuidV1(), name: "Snapshot User", role: "provider" } as any,
  clinic: { id: uuidV1(), name: "Snapshot Test Clinic" } as any,
  token: "test-token",
} as RequestCaller;

/** A watermark far in the future — no delta bucket could match anything. */
const FUTURE = Date.now() + 60 * 60 * 1000;

afterEach(async () => {
  for (const id of createdClinicIds) {
    await testDb.deleteFrom("clinics").where("id", "=", id).execute();
  }
  createdClinicIds.length = 0;
});

describe("Sync.getDeltaRecords clinics snapshot (integration)", () => {
  it("delivers a clinic even when the client watermark is newer than every change", async () => {
    const id = await insertClinic();

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    // The whole point: an ordinary delta would return nothing here.
    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
  });

  it("puts live clinics in updated, never created", async () => {
    await insertClinic();

    const delta = await Sync.getDeltaRecords(0, "mobile", caller);

    // WatermelonDB creates unknown ids from `updated`, but logs an error for
    // every id in `created` that already exists locally.
    expect(delta.clinics.created).toEqual([]);
    expect(delta.clinics.updated.length).toBeGreaterThan(0);
  });

  it("reports a soft-deleted clinic as deleted and omits it from updated", async () => {
    const id = await insertClinic({
      is_deleted: true,
      deleted_at: sql`now()`,
    });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.deleted).toContain(id);
    expect(delta.clinics.updated.map((r: any) => r.id)).not.toContain(id);
  });

  it("reports a clinic flagged deleted with no deleted_at", async () => {
    // The delete path has historically set one column without the other.
    const id = await insertClinic({ is_deleted: true, deleted_at: null });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.deleted).toContain(id);
    expect(delta.clinics.updated.map((r: any) => r.id)).not.toContain(id);
  });

  it("treats a null is_deleted as live rather than dropping it from both lists", async () => {
    // `is_deleted` is nullable, and `is_deleted = false` does not match NULL.
    const id = await insertClinic({ is_deleted: null });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
    expect(delta.clinics.deleted).not.toContain(id);
  });

  it("still delivers a clinic whose sync timestamps were never populated", async () => {
    const id = await insertClinic({
      server_created_at: null,
      last_modified: null,
    });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
  });

  it("leaves the delta behaviour of other tables alone", async () => {
    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    // Patients stay watermark-driven; a future `since` matches nothing.
    expect(delta.patients.created).toEqual([]);
    expect(delta.patients.updated).toEqual([]);
  });
});
