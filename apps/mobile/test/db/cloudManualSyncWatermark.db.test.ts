/**
 * `runManualSync`'s completion block, against a real WatermelonDB instance.
 *
 * The thing under test is when the two sync watermarks are allowed to move.
 * They are ordinary sync's `since` — `peers.last_synced_at` for the hub path,
 * `__watermelon_last_pulled_at` for the cloud path — so advancing either past a
 * window this run did not actually fetch hides that window from ordinary sync
 * permanently. A bounded range on a stale device is exactly that case.
 */

import { getLastPulledAt, setLastPulledAt } from "@nozbe/watermelondb/sync/impl"

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

// Retry policy is covered by syncRetry's own tests. Left real, a retryable
// failure here would spend six attempts and ~31s of exponential backoff before
// the assertions could run.
jest.mock("@/services/syncRetry", () => ({
  __esModule: true,
  withRetry: (op: () => unknown) => op(),
}))

// Reached through syncRetry's default connectivity check; throws on import.
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: true }) },
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

import Peer from "@/models/Peer"
import Sync from "@/models/Sync"
import { runManualSync } from "@/db/cloudManualSync"
import { syncStore } from "@/store/sync"

const SNAPSHOT_TS = 1_800_000_000_000

let testDb: ReturnType<typeof createTestDatabase>

/** A peer with a known prior watermark. */
const seedPeer = async (lastSyncedAt: number | null): Promise<string> => {
  let id = ""
  await testDb.write(async () => {
    const record = await testDb.get("peers").create((rec: never) => {
      const r = rec as unknown as Record<string, unknown>
      r.peerId = "peer-1"
      r.name = "Test cloud"
      r.peerType = "cloud_server"
      r.status = "active"
      r.lastSyncedAt = lastSyncedAt
      r.metadata = { url: "https://api.test" }
    })
    id = record.id
  })
  return id
}

const run = (peerId: string, since: number) =>
  runManualSync({ peerId, since, signal: new AbortController().signal, onProgress: () => {} })

beforeEach(() => {
  testDb = createTestDatabase()
  ;(global as never as { __TEST_DB__: unknown }).__TEST_DB__ = testDb

  jest.clearAllMocks()
  // One page, then stop: a null next_cursor is what makes the run "complete"
  // and reach the block under test. The progress block matches what the server
  // actually sends rather than a convenient null.
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

// Existing consumers read `useSync`, which derives isSyncing straight from this
// store. It is bracketed from inside the lock so a queued ordinary sync cannot
// have started before the closing reset lands.
describe("the shared syncStore bracket", () => {
  beforeEach(() => syncStore.trigger.force_reset())

  it("marks the shared store busy while the run is in flight", async () => {
    const peerId = await seedPeer(5_000)
    let observed: unknown = null
    mockSendQuery.mockImplementation(async () => {
      observed = syncStore.getSnapshot().context.state
      return {
        ok: true,
        data: { changes: {}, next_cursor: null, timestamp: SNAPSHOT_TS, progress: null },
      }
    })

    await run(peerId, 0)

    expect(observed).toBe(Sync.State.FETCHING)
  })

  // `finish_sync` is guarded against FETCHING — the state `start_sync` sets — so
  // closing the bracket with it would leave every `useSync` consumer reporting a
  // sync that never ends.
  it("returns the shared store to idle when the run succeeds", async () => {
    const peerId = await seedPeer(5_000)
    await run(peerId, 0)
    expect(syncStore.getSnapshot().context.state).toBe(Sync.State.IDLE)
  })

  it("returns the shared store to idle when the run fails", async () => {
    const peerId = await seedPeer(5_000)
    mockSendQuery.mockResolvedValue({
      ok: false,
      error: { code: "BAD_REQUEST", message: "x", retryable: false },
    })

    await run(peerId, 0)

    expect(syncStore.getSnapshot().context.state).toBe(Sync.State.IDLE)
  })

  it("returns the shared store to idle when the peer is rejected before any work", async () => {
    const peerId = await seedPeer(5_000)
    await testDb.write(async () => {
      const record = await testDb.get("peers").find(peerId)
      await record.update((rec: never) => {
        ;(rec as unknown as Record<string, unknown>).status = "revoked"
      })
    })

    await run(peerId, 0)

    expect(syncStore.getSnapshot().context.state).toBe(Sync.State.IDLE)
  })
})

describe("runManualSync watermarks", () => {
  it("advances both watermarks when the range reaches back past both", async () => {
    const peerId = await seedPeer(5_000)
    await setLastPulledAt(testDb, 5_000)

    const result = await run(peerId, 0)

    expect(result.ok).toBe(true)
    expect((await Peer.DB.getById(peerId)).lastSyncedAt).toBe(SNAPSHOT_TS)
    expect(await getLastPulledAt(testDb)).toBe(SNAPSHOT_TS)
  })

  // Device complete to t=5000; user asks for everything since t=9000. [5000, 9000)
  // was never fetched, so the device is still only complete to 5000. Advancing
  // would hide that window from ordinary sync permanently.
  it("leaves both watermarks alone when the range starts after them", async () => {
    const peerId = await seedPeer(5_000)
    await setLastPulledAt(testDb, 5_000)

    const result = await run(peerId, 9_000)

    expect(result.ok).toBe(true)
    expect((await Peer.DB.getById(peerId)).lastSyncedAt).toBe(5_000)
    expect(await getLastPulledAt(testDb)).toBe(5_000)
  })

  // The two watermarks hold different things: ordinary cloud sync writes
  // Date.now() to peers.last_synced_at but the SERVER's timestamp to
  // __watermelon_last_pulled_at. A device clock running fast makes the former
  // look newer than it is. Guarding one against the other would advance the real
  // cursor over an unfetched gap; guarding each against itself does not.
  it("advances only the watermark whose own prior value the range reaches", async () => {
    const peerId = await seedPeer(20_000)
    await setLastPulledAt(testDb, 5_000)

    await run(peerId, 9_000)

    expect((await Peer.DB.getById(peerId)).lastSyncedAt).toBe(SNAPSHOT_TS)
    expect(await getLastPulledAt(testDb)).toBe(5_000)
  })

  it("advances from a never-synced device", async () => {
    const peerId = await seedPeer(null)

    await run(peerId, 0)

    expect((await Peer.DB.getById(peerId)).lastSyncedAt).toBe(SNAPSHOT_TS)
    expect(await getLastPulledAt(testDb)).toBe(SNAPSHOT_TS)
  })

  // A run that never completed establishes nothing, so neither watermark may
  // move regardless of how far back the range reached.
  it("leaves both watermarks alone when the run fails part-way", async () => {
    const peerId = await seedPeer(5_000)
    await setLastPulledAt(testDb, 5_000)

    mockSendQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVER_ERROR", message: "boom", retryable: false },
    })

    const result = await run(peerId, 0)

    expect(result.ok).toBe(false)
    expect((await Peer.DB.getById(peerId)).lastSyncedAt).toBe(5_000)
    expect(await getLastPulledAt(testDb)).toBe(5_000)
  })

  // A cursor encodes the server's entity list, so a redeploy invalidates it.
  // Keeping it would make every later run against the same range read it back
  // and fail identically — the user's only escape being to guess that a
  // different range works.
  it("discards a resume cursor the server will never accept again", async () => {
    const peerId = await seedPeer(5_000)
    await Peer.DB.saveResumeState(peerId, {
      cursor: "no-longer-decodable",
      since: 0,
      snapshotTs: SNAPSHOT_TS,
      pagesApplied: 3,
      recordsApplied: 30,
    })

    mockSendQuery.mockResolvedValue({
      ok: false,
      error: { code: "BAD_REQUEST", message: "malformed cursor", retryable: false },
    })

    const result = await run(peerId, 0)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.resumable).toBe(false)
    expect(await Peer.DB.getResumeState(peerId)).toBeNull()
  })

  // The opposite requirement, and the same guard has to satisfy both: a network
  // blip must leave the cursor exactly where it was.
  it("keeps the resume cursor when the failure is resumable", async () => {
    const peerId = await seedPeer(5_000)
    await Peer.DB.saveResumeState(peerId, {
      cursor: "still-good",
      since: 0,
      snapshotTs: SNAPSHOT_TS,
      pagesApplied: 3,
      recordsApplied: 30,
    })

    mockSendQuery.mockResolvedValue({
      ok: false,
      error: { code: "SERVER_ERROR", message: "boom", retryable: true },
    })

    const result = await run(peerId, 0)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.resumable).toBe(true)
    expect((await Peer.DB.getResumeState(peerId))?.cursor).toBe("still-good")
  })

  it("clears the resume state once the run completes", async () => {
    const peerId = await seedPeer(5_000)
    await Peer.DB.saveResumeState(peerId, {
      cursor: "stale",
      since: 0,
      snapshotTs: 1,
      pagesApplied: 1,
      recordsApplied: 1,
    })

    await run(peerId, 0)

    expect(await Peer.DB.getResumeState(peerId)).toBeNull()
  })

  // Resuming against a different range would walk a cursor whose keyset was
  // built for another `since`.
  it("resumes a stored cursor only when it belongs to the same range", async () => {
    const peerId = await seedPeer(5_000)
    await Peer.DB.saveResumeState(peerId, {
      cursor: "cursor-for-1000",
      since: 1_000,
      snapshotTs: SNAPSHOT_TS,
      pagesApplied: 1,
      recordsApplied: 1,
    })

    await run(peerId, 1_000)
    expect(mockSendQuery.mock.calls[0][1].cursor).toBe("cursor-for-1000")

    await Peer.DB.saveResumeState(peerId, {
      cursor: "cursor-for-1000",
      since: 1_000,
      snapshotTs: SNAPSHOT_TS,
      pagesApplied: 1,
      recordsApplied: 1,
    })
    mockSendQuery.mockClear()

    await run(peerId, 7_000)
    expect(mockSendQuery.mock.calls[0][1].cursor).toBeNull()
  })

  // The server caps rows per page at DEFAULT_PAGE_ROWS = 500 when the client
  // sends none, four times lower than MAX_PAGE_ROWS. Left implicit, the byte
  // budget never binds on ordinary rows and every page is 500 records
  // regardless of which budget the device chose.
  it("asks for the server's maximum rows per page rather than inheriting its default", async () => {
    const peerId = await seedPeer(5_000)

    await run(peerId, 0)

    expect(mockSendQuery.mock.calls[0][1].page_rows).toBe(2_000)
  })

  // The picker only ever offers cloud peers, so this transport has never been
  // handed a hub. Adding a second caller — the first-sync routing — is when
  // that stops being guaranteed, and a hub speaks its own protocol at the same
  // paths, so the failure would be a confusing 404 rather than a refusal.
  it("refuses a hub peer — this transport speaks tRPC, the hub does not", async () => {
    const peerId = await seedPeer(null)
    await testDb.write(async () => {
      const record = await testDb.get("peers").find(peerId)
      await record.update((rec: never) => {
        ;(rec as unknown as Record<string, unknown>).peerType = "sync_hub"
      })
    })

    const result = await run(peerId, 0)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/cloud/i)
      expect(result.resumable).toBe(false)
    }
    expect(mockSendQuery).not.toHaveBeenCalled()
  })

  it("refuses to run against a peer that is not active", async () => {
    const peerId = await seedPeer(5_000)
    await testDb.write(async () => {
      const record = await testDb.get("peers").find(peerId)
      await record.update((rec: never) => {
        ;(rec as unknown as Record<string, unknown>).status = "revoked"
      })
    })

    const result = await run(peerId, 0)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.resumable).toBe(false)
    expect(mockSendQuery).not.toHaveBeenCalled()
  })
})
