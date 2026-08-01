/**
 * `runManualSync`'s push phase, against a real WatermelonDB instance.
 *
 * The watermark tests run with nothing pending, so none of this is reached
 * there. What matters here: pending work is offered in bounded requests before
 * the pull can overwrite it, accepted rows stop being pending, and rejected rows
 * stay pending so a later pull cannot silently discard the edit.
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

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
}))

jest.mock("@hikmahealth/js-utils", () => ({
  Logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: true }) },
}))

const mockSendQuery = jest.fn()
const mockSendCommand = jest.fn()

jest.mock("@/rpc/transport", () => ({
  __esModule: true,
  createTrpcCloudTransport: () => ({
    sendQuery: (...a: unknown[]) => mockSendQuery(...a),
    sendCommand: (...a: unknown[]) => mockSendCommand(...a),
    login: jest.fn(),
    heartbeat: jest.fn(),
  }),
}))

jest.mock("@/services/pageBudget", () => ({
  __esModule: true,
  pickPageBudget: async () => 2_000_000,
}))

jest.mock("@/utils/authHeader", () => ({
  __esModule: true,
  getBearerToken: async () => "Bearer test-token",
  refreshBearerToken: async () => true,
}))

import { fetchLocalChanges } from "@nozbe/watermelondb/sync/impl"

import { runManualSync } from "@/db/cloudManualSync"

const SNAPSHOT_TS = 1_800_000_000_000

let testDb: ReturnType<typeof createTestDatabase>

const seedPeer = async (): Promise<string> => {
  let id = ""
  await testDb.write(async () => {
    const record = await testDb.get("peers").create((rec: never) => {
      const r = rec as unknown as Record<string, unknown>
      r.peerId = "peer-1"
      r.name = "Test cloud"
      r.peerType = "cloud_server"
      r.status = "active"
      r.lastSyncedAt = 5_000
      r.metadata = { url: "https://api.test" }
    })
    id = record.id
  })
  return id
}

/** `count` locally-created patients, all pending push. */
const seedPatients = async (count: number): Promise<string[]> => {
  const ids: string[] = []
  await testDb.write(async () => {
    for (let i = 0; i < count; i++) {
      const record = await testDb.get("patients").create((rec: never) => {
        const r = rec as unknown as Record<string, unknown>
        r.givenName = `Given${i}`
        r.surname = `Surname${i}`
      })
      ids.push(record.id)
    }
  })
  return ids
}

const run = (peerId: string, since = 0) =>
  runManualSync({ peerId, since, signal: new AbortController().signal, onProgress: () => {} })

const pushedChanges = () =>
  mockSendCommand.mock.calls.map((call) => call[1] as { changes: Record<string, unknown> })

beforeEach(() => {
  testDb = createTestDatabase()
  ;(global as never as { __TEST_DB__: unknown }).__TEST_DB__ = testDb

  jest.clearAllMocks()
  mockSendQuery.mockResolvedValue({
    ok: true,
    data: {
      changes: {},
      next_cursor: null,
      timestamp: SNAPSHOT_TS,
      progress: { table: "patients", bucket: "created", tables_remaining: 0 },
    },
  })
  mockSendCommand.mockResolvedValue({
    ok: true,
    data: { accepted: 0, rejected: {}, by_table: {} },
  })
})

afterEach(async () => {
  await resetTestDatabase(testDb)
})

describe("runManualSync push phase", () => {
  it("sends nothing when there is no pending local work", async () => {
    const peerId = await seedPeer()

    await run(peerId)

    expect(mockSendCommand).not.toHaveBeenCalled()
  })

  it("pushes pending records before pulling", async () => {
    const peerId = await seedPeer()
    await seedPatients(3)

    const result = await run(peerId)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.recordsPushed).toBe(3)
    expect(mockSendCommand).toHaveBeenCalledTimes(1)
    expect(mockSendCommand.mock.calls[0][0]).toBe("sync.backfillPush")
  })

  // Where the split falls is covered by chunkLocalChanges' own tests; seeding
  // past the production chunk size here would cost more than it proves. What
  // this pins is that routing the push through the chunker loses nothing.
  it("offers every pending record exactly once across the requests it sends", async () => {
    const peerId = await seedPeer()
    const ids = await seedPatients(5)

    await run(peerId)

    const sent = pushedChanges().flatMap((body) => {
      const patients = body.changes.patients as {
        created: { id: string }[]
        updated: { id: string }[]
      }
      return [...patients.created, ...patients.updated].map((r) => r.id)
    })
    expect(sent.sort()).toEqual([...ids].sort())
  })

  it("marks accepted records as no longer pending", async () => {
    const peerId = await seedPeer()
    await seedPatients(3)

    await run(peerId)

    const after = await fetchLocalChanges(testDb)
    const patients = after.changes.patients ?? { created: [], updated: [], deleted: [] }
    expect(patients.created.length + patients.updated.length).toBe(0)
  })

  // A rejected edit that gets marked synced is silently discarded and then
  // overwritten by the next pull. It has to stay pending.
  it("leaves rejected records pending so a later pull cannot discard them", async () => {
    const peerId = await seedPeer()
    const ids = await seedPatients(3)

    mockSendCommand.mockResolvedValue({
      ok: true,
      data: { accepted: 2, rejected: { patients: [ids[0]] }, by_table: {} },
    })

    const result = await run(peerId)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rejected.patients).toEqual([ids[0]])

    const after = await fetchLocalChanges(testDb)
    const patients = after.changes.patients ?? { created: [], updated: [], deleted: [] }
    const stillPending = [...patients.created, ...patients.updated].map((r) => r.id)
    expect(stillPending).toEqual([ids[0]])
  })

  // Reaching the pull would overwrite local state with server rows while the
  // device's own edits were never accepted.
  it("does not pull when the push fails", async () => {
    const peerId = await seedPeer()
    await seedPatients(2)

    mockSendCommand.mockResolvedValue({
      ok: false,
      error: { code: "BAD_REQUEST", message: "nope", retryable: false },
    })

    const result = await run(peerId)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.resumable).toBe(true)
    expect(mockSendQuery).not.toHaveBeenCalled()
  })

  it("keeps records pending when the push fails", async () => {
    const peerId = await seedPeer()
    await seedPatients(2)

    mockSendCommand.mockResolvedValue({
      ok: false,
      error: { code: "BAD_REQUEST", message: "nope", retryable: false },
    })

    await run(peerId)

    const after = await fetchLocalChanges(testDb)
    const patients = after.changes.patients ?? { created: [], updated: [], deleted: [] }
    expect(patients.created.length + patients.updated.length).toBe(2)
  })

  it("tells the server which kind of device is calling", async () => {
    const peerId = await seedPeer()
    await seedPatients(1)

    await run(peerId)

    expect(mockSendCommand.mock.calls[0][1].peer_type).not.toBe("unknown")
    expect(mockSendQuery.mock.calls[0][1].peer_type).not.toBe("unknown")
  })
})
