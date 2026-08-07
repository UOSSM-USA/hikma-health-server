/**
 * `startSync`'s gating, now that it shares a lock with manual sync.
 *
 * Three behaviours matter and only one is new:
 *  - joining an in-flight ordinary sync (existing — must not regress)
 *  - queueing behind a manual sync for a user-initiated trigger (new)
 *  - skipping for an automatic trigger while something else holds the lock (new)
 */

const mockSyncDB = jest.fn()
const mockGetActive = jest.fn()

jest.mock("@/db", () => ({ __esModule: true, default: {} }))
jest.mock("@/db/peerSync", () => ({
  syncDB: (...args: unknown[]) => mockSyncDB(...args),
  getCredentials: async () => ({ email: "provider@example.com", password: "pw" }),
}))
jest.mock("@/models/Peer", () => ({
  __esModule: true,
  default: {
    DB: {
      getActive: (...args: unknown[]) => mockGetActive(...args),
      deactivatePeersById: jest.fn(async () => undefined),
    },
  },
}))
jest.mock("@nozbe/watermelondb/sync", () => ({ hasUnsyncedChanges: jest.fn(async () => false) }))
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { signIn: jest.fn(async () => undefined), signOut: jest.fn(async () => undefined) },
}))

// Reached transitively now that syncService imports the first-sync backfill,
// which pulls in pageBudget. Both throw on import outside a native runtime.
jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: { getTotalMemory: jest.fn(), getUsedMemory: jest.fn() },
}))
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}))
jest.mock("react-native-root-toast", () => ({
  __esModule: true,
  default: { show: jest.fn(), positions: { BOTTOM: 0 }, durations: { LONG: 0 } },
}))
jest.mock("@/i18n/translate", () => ({ translate: (k: string) => k }))

const defer = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

type SyncService = typeof import("@/services/syncService")
type SyncLock = typeof import("@/services/syncLock")

let startSync: SyncService["startSync"]
let withSyncLock: SyncLock["withSyncLock"]

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  mockGetActive.mockResolvedValue([{ id: "peer-1", peerType: "sync_hub" }])
  mockSyncDB.mockResolvedValue(undefined)
  // Both modules must come from the same fresh registry or they hold different locks.
  withSyncLock = (require("@/services/syncLock") as SyncLock).withSyncLock
  startSync = (require("@/services/syncService") as SyncService).startSync
})

describe("startSync and the shared sync lock", () => {
  it("runs an ordinary sync", async () => {
    await startSync()
    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })

  // Pre-existing behaviour. Two triggers racing across login and netinfo settle
  // must share one run rather than producing two syncs.
  it("joins an in-flight ordinary sync instead of starting a second", async () => {
    const gate = defer()
    mockSyncDB.mockImplementation(() => gate.promise)

    const first = startSync()
    const second = startSync()
    gate.resolve()
    await Promise.all([first, second])

    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })

  it("skips an automatic trigger while a manual sync holds the lock", async () => {
    const gate = defer()
    const manual = withSyncLock("manual", async () => {
      await gate.promise
    })

    await startSync(undefined, { trigger: "auto" })
    expect(mockSyncDB).not.toHaveBeenCalled()

    gate.resolve()
    await manual
  })

  it("queues a user-initiated trigger behind a manual sync rather than skipping it", async () => {
    const order: string[] = []
    const gate = defer()
    const manual = withSyncLock("manual", async () => {
      order.push("manual:start")
      await gate.promise
      order.push("manual:end")
    })
    mockSyncDB.mockImplementation(async () => {
      order.push("ordinary")
    })

    const ordinary = startSync()
    gate.resolve()
    await Promise.all([manual, ordinary])

    expect(order).toEqual(["manual:start", "manual:end", "ordinary"])
    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })

  // Defaulting to queueing is the safe choice: a delayed sync is recoverable,
  // a skipped one may not be.
  it("queues by default when no trigger is given", async () => {
    const gate = defer()
    const manual = withSyncLock("manual", async () => {
      await gate.promise
    })

    const ordinary = startSync()
    gate.resolve()
    await Promise.all([manual, ordinary])

    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })

  it("still runs an automatic trigger when nothing holds the lock", async () => {
    await startSync(undefined, { trigger: "auto" })
    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })

  // An automatic trigger arriving during an ordinary sync joined that run
  // before the lock existed. It must keep joining rather than skipping.
  it("joins an in-flight ordinary sync even when the trigger is automatic", async () => {
    const gate = defer()
    mockSyncDB.mockImplementation(() => gate.promise)

    const first = startSync()
    const auto = startSync(undefined, { trigger: "auto" })
    gate.resolve()
    await Promise.all([first, auto])

    expect(mockSyncDB).toHaveBeenCalledTimes(1)
  })
})
