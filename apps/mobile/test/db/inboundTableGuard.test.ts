/**
 * A peer may not write this device's local tables.
 *
 * `peers` holds each peer's URL, key and status. A hub that could write it would
 * repoint the next cloud sync — Basic-auth credentials and the full changeset —
 * at a host of its choosing, so applyRemoteChanges refuses tables outside
 * INBOUND_TABLES.
 */

import { Database, Model, appSchema, tableSchema } from "@nozbe/watermelondb"
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs"
import type { SyncDatabaseChangeSet } from "@nozbe/watermelondb/sync"

const testSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "patients",
      columns: [
        { name: "name", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "peers",
      columns: [
        { name: "peer_id", type: "string" },
        { name: "metadata", type: "string", isOptional: true },
        { name: "status", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
  ],
})

class Patient extends Model {
  static table = "patients"
}
class PeerRow extends Model {
  static table = "peers"
}

const database = new Database({
  adapter: new LokiJSAdapter({
    schema: testSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: "inbound-table-guard-test",
  }),
  modelClasses: [Patient, PeerRow],
})

jest.mock("../../app/db", () => ({
  __esModule: true,
  get default() {
    return (global as any).__LOCAL_SYNC_DB__
  },
}))

;(global as any).__LOCAL_SYNC_DB__ = database

import { applyRemoteChanges, INBOUND_TABLES } from "../../app/db/localSync"

const changeset = (tables: Record<string, unknown>): SyncDatabaseChangeSet =>
  tables as unknown as SyncDatabaseChangeSet

const table = (over: { created?: any[]; updated?: any[]; deleted?: any[] } = {}) => ({
  created: over.created ?? [],
  updated: over.updated ?? [],
  deleted: over.deleted ?? [],
})

beforeEach(async () => {
  await database.write(() => database.unsafeResetDatabase())
})

describe("INBOUND_TABLES", () => {
  it("excludes the device-local tables", () => {
    expect(INBOUND_TABLES.has("peers")).toBe(false)
    expect(INBOUND_TABLES.has("event_logs")).toBe(false)
  })

  it("includes the server-authoritative tables the device never pushes", () => {
    expect(INBOUND_TABLES.has("user_clinic_permissions")).toBe(true)
    expect(INBOUND_TABLES.has("app_config")).toBe(true)
  })
})

describe("applyRemoteChanges — inbound table guard", () => {
  it("refuses a peer's attempt to create a row in the peers registry", async () => {
    await applyRemoteChanges(
      changeset({
        patients: table({ created: [{ id: "p1", name: "Ada", created_at: 1, updated_at: 2 }] }),
        peers: table({
          created: [
            {
              id: "hostile",
              peer_id: "cloud:1",
              metadata: '{"url":"https://attacker.example"}',
              status: "active",
              created_at: 1,
              updated_at: 2,
            },
          ],
        }),
      }),
    )

    expect(await database.get("peers").query().fetchCount()).toBe(0)
    expect(await database.get("patients").query().fetchCount()).toBe(1)
  })

  it("refuses to let a peer rewrite an existing peer's url", async () => {
    await database.write(() =>
      database.get("peers").create((record) => {
        ;(record._raw as any).id = "cloud-1"
        ;(record._raw as any).peer_id = "cloud:1"
        ;(record._raw as any).metadata = '{"url":"https://real.example"}'
        ;(record._raw as any).status = "active"
      }),
    )

    await applyRemoteChanges(
      changeset({
        peers: table({
          updated: [
            {
              id: "cloud-1",
              peer_id: "cloud:1",
              metadata: '{"url":"https://attacker.example"}',
              status: "active",
              created_at: 1,
              updated_at: 9,
            },
          ],
        }),
      }),
    )

    const record = await database.get("peers").find("cloud-1")
    expect((record._raw as any).metadata).toBe('{"url":"https://real.example"}')
  })

  it("still applies the tables a peer is allowed to write", async () => {
    await applyRemoteChanges(
      changeset({
        patients: table({ created: [{ id: "p1", name: "Ada", created_at: 1, updated_at: 2 }] }),
      }),
    )

    expect(await database.get("patients").query().fetchCount()).toBe(1)
  })
})
