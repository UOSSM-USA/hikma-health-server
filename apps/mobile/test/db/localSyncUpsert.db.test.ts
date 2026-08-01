/**
 * `applyRemoteChanges` upsert and deletion semantics, against a real database.
 *
 * This is the hub pull path. Two behaviours here diverge from upstream
 * WatermelonDB's `applyRemote`, and both lose data quietly:
 *
 *  - the `updated` bucket is classified by the *peer* relative to its cursor,
 *    not relative to what this device holds, so a record created long ago and
 *    edited recently arrives as "updated" on a device that has never seen it;
 *  - the `deleted` bucket carries bare id strings, which this module's raw-record
 *    helpers do not understand.
 *
 * Mocks would assert nothing: the behaviour lives in WatermelonDB's batch and
 * `sanitizedRaw` semantics against the real schema.
 */

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"

jest.mock("@/db", () => ({
  __esModule: true,
  get default() {
    return (global as never as { __TEST_DB__: unknown }).__TEST_DB__
  },
  get database() {
    return (global as never as { __TEST_DB__: unknown }).__TEST_DB__
  },
}))

jest.mock("@hikmahealth/js-utils", () => ({
  Logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import type { Database } from "@nozbe/watermelondb"
import type { SyncDatabaseChangeSet } from "@nozbe/watermelondb/sync"

import type PatientModel from "@/db/model/Patient"

import { applyRemoteChanges } from "@/db/localSync"

const patients = (over: {
  created?: unknown[]
  updated?: unknown[]
  deleted?: string[]
}): SyncDatabaseChangeSet =>
  ({
    patients: {
      created: over.created ?? [],
      updated: over.updated ?? [],
      deleted: over.deleted ?? [],
    },
  }) as unknown as SyncDatabaseChangeSet

/** A full row, as the hub sends it — every pull column, not a delta. */
const row = (id: string, givenName: string) => ({
  id,
  given_name: givenName,
  surname: "Lovelace",
  date_of_birth: "1815-12-10",
  citizenship: "gb",
  hometown: "London",
  phone: "",
  sex: "female",
  additional_data: "{}",
  metadata: "{}",
  government_id: "",
  external_patient_id: "",
  is_deleted: false,
  created_at: 1_000,
  updated_at: 2_000,
})

let db: Database

beforeEach(() => {
  db = createTestDatabase()
  ;(global as never as { __TEST_DB__: Database }).__TEST_DB__ = db
})

afterEach(async () => {
  await resetTestDatabase(db)
})

const findPatient = (id: string) => db.get<PatientModel>("patients").find(id)

/**
 * Make a genuine pending local edit.
 *
 * It has to go through the decorated setter — writing `_raw` directly changes
 * the value but leaves the column out of `_changed`, so conflict resolution has
 * nothing to preserve and the test would pass or fail for the wrong reason.
 */
const editLocally = async (id: string, givenName: string) => {
  const record = await findPatient(id)
  await db.write(async () => {
    await record.update((r) => {
      r.givenName = givenName
    })
  })
}

describe("applyRemoteChanges — the updated bucket upserts", () => {
  it("creates an updated record the device has never seen", async () => {
    await applyRemoteChanges(patients({ updated: [row("p1", "Ada")] }))

    const found = await findPatient("p1")
    expect(found.id).toBe("p1")
    expect((found._raw as { given_name: string }).given_name).toBe("Ada")
    expect(found._raw._status).toBe("synced")
  })

  it("still updates a record that does exist", async () => {
    await applyRemoteChanges(patients({ created: [row("p2", "Grace")] }))
    await applyRemoteChanges(patients({ updated: [{ ...row("p2", "Grace Hopper") }] }))

    const found = await findPatient("p2")
    expect((found._raw as { given_name: string }).given_name).toBe("Grace Hopper")
  })

  it("preserves a pending local edit when the same column arrives remotely", async () => {
    await applyRemoteChanges(patients({ created: [row("p3", "Katherine")] }))
    await editLocally("p3", "Katherine Johnson")

    await applyRemoteChanges(patients({ updated: [row("p3", "Overwritten")] }))

    const found = await findPatient("p3")
    expect(found.givenName).toBe("Katherine Johnson")
  })
})

describe("applyRemoteChanges — the deleted bucket", () => {
  it("removes a remotely deleted record", async () => {
    await applyRemoteChanges(patients({ created: [row("p4", "Hedy")] }))
    await applyRemoteChanges(patients({ deleted: ["p4"] }))

    await expect(findPatient("p4")).rejects.toThrow()
  })

  // A pending local deletion is pushed back to the peer on the next sync and
  // keeps `hasUnsyncedChanges` true forever, because nothing on this path ever
  // marks it synced. The peer already knows the record is gone.
  it("does not leave a pending deletion to echo back to the peer", async () => {
    await applyRemoteChanges(patients({ created: [row("p5", "Radia")] }))
    await applyRemoteChanges(patients({ deleted: ["p5"] }))

    const pending = await db.adapter.getDeletedRecords("patients")
    expect(pending).not.toContain("p5")
  })

  // Upstream WatermelonDB's semantics: a remote delete wins over an unsynced
  // local edit. Pinned here because it is a real behaviour change for the hub,
  // not an incidental one.
  it("destroys a record that has a pending local edit", async () => {
    await applyRemoteChanges(patients({ created: [row("p6", "Annie")] }))
    await editLocally("p6", "Annie Easley")

    await applyRemoteChanges(patients({ deleted: ["p6"] }))

    await expect(findPatient("p6")).rejects.toThrow()
  })

  it("ignores a deletion for a record it never had", async () => {
    await expect(
      applyRemoteChanges(patients({ deleted: ["never-existed"] })),
    ).resolves.toBeUndefined()
  })
})

/**
 * A locally tombstoned record is invisible to `collection.query` — WatermelonDB
 * appends `_status != 'deleted'` to every query description — but its row is
 * still there. Creating over it collides on the primary key, and because the
 * whole pull runs in one `database.write`, that takes the entire sync down
 * rather than one record.
 */
describe("applyRemoteChanges — a record tombstoned locally but not yet pushed", () => {
  const tombstone = async (id: string) => {
    const record = await findPatient(id)
    await db.write(async () => {
      await record.markAsDeleted()
    })
  }

  // Upstream: "Nothing to do, record was locally deleted, deletion will be
  // pushed later." Recreating it would resurrect a record the user deleted.
  it("leaves the tombstone alone when the peer sends an update", async () => {
    await applyRemoteChanges(patients({ created: [row("p7", "Dorothy")] }))
    await tombstone("p7")

    await expect(
      applyRemoteChanges(patients({ updated: [row("p7", "Dorothy Vaughan")] })),
    ).resolves.toBeUndefined()

    // `find` still resolves a tombstone from the collection cache, so assert on
    // the record's state rather than on the lookup failing.
    const stillDeleted = await findPatient("p7")
    expect(stillDeleted._raw._status).toBe("deleted")
    expect(stillDeleted.givenName).toBe("Dorothy")
    expect(await db.adapter.getDeletedRecords("patients")).toContain("p7")
  })

  // Upstream destroys the tombstone and recreates. A peer that classifies the
  // record as created has no knowledge of a deletion this device never pushed.
  it("replaces the tombstone when the peer sends a create", async () => {
    await applyRemoteChanges(patients({ created: [row("p8", "Mary")] }))
    await tombstone("p8")

    await expect(
      applyRemoteChanges(patients({ created: [row("p8", "Mary Jackson")] })),
    ).resolves.toBeUndefined()

    const found = await findPatient("p8")
    expect(found.givenName).toBe("Mary Jackson")
    expect(await db.adapter.getDeletedRecords("patients")).not.toContain("p8")
  })
})

// The bug this suite exists for was deletion entries being discarded without a
// trace. A peer that starts sending something other than an id should be loud.
describe("applyRemoteChanges — malformed input", () => {
  it("warns rather than silently dropping a deletion entry that is not an id", async () => {
    const { Logger } = jest.requireMock("@hikmahealth/js-utils") as {
      Logger: { warn: jest.Mock }
    }
    Logger.warn.mockClear()

    await applyRemoteChanges(patients({ deleted: [{ id: "p9" } as unknown as string] }))

    expect(Logger.warn).toHaveBeenCalled()
  })
})
