/**
 * Tests for the mode switch service.
 * Verifies switching logic, peer-aware unsynced changes guard, and MMKV persistence.
 */

import fc from "fast-check"
import { operationModeStore } from "../../app/store/operationMode"
import type Peer from "../../app/models/Peer"
import type { PeerType } from "../../app/db/model/Peer"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockHasUnsynced = false
let mockActivePeer: Peer.T | null = null
let mockLocalChangesCount = 0

jest.mock("@nozbe/watermelondb/sync", () => ({
  hasUnsyncedChanges: jest.fn(() => Promise.resolve(mockHasUnsynced)),
}))

jest.mock("../../app/db", () => ({}))

jest.mock("../../app/db/localSync", () => ({
  getLocalChangesSince: jest.fn(() => Promise.resolve({})),
}))

jest.mock("../../app/db/syncNormalize", () => ({
  countRecordsInChanges: jest.fn(() => mockLocalChangesCount),
}))

jest.mock("../../app/models/Peer", () => ({
  __esModule: true,
  default: {
    DB: {
      resolveActive: jest.fn(() => Promise.resolve(mockActivePeer)),
    },
  },
}))

const savedValues: Record<string, string> = {}
jest.mock("../../app/utils/storage", () => ({
  saveString: jest.fn((key: string, value: string) => {
    savedValues[key] = value
    return true
  }),
  loadString: jest.fn((key: string) => savedValues[key] ?? null),
}))

// Import after mocks are in place
import {
  switchToOnlineMode,
  switchToOfflineMode,
  checkUnsyncedChanges,
} from "../../app/services/modeSwitchService"
import { MODE_PREFERENCE_KEY } from "../../app/hooks/useOperationModeInit"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCloudPeer = (overrides?: Partial<Peer.T>): Peer.T => ({
  id: "cloud-1",
  peerId: "cloud:https://api.example.com",
  name: "Cloud Server",
  ipAddress: null,
  port: null,
  publicKey: "",
  lastSyncedAt: null,
  peerType: "cloud_server",
  isLeader: false,
  status: "active",
  protocolVersion: "1",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeHubPeer = (overrides?: Partial<Peer.T>): Peer.T => ({
  id: "hub-1",
  peerId: "hub-abc",
  name: "Local Hub",
  ipAddress: "192.168.1.10",
  port: 8080,
  publicKey: "pk-abc",
  lastSyncedAt: 1000,
  peerType: "sync_hub",
  isLeader: false,
  status: "active",
  protocolVersion: "1",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  operationModeStore.send({ type: "reset" })
  mockHasUnsynced = false
  mockActivePeer = null
  mockLocalChangesCount = 0
  for (const key of Object.keys(savedValues)) delete savedValues[key]
})

// ---------------------------------------------------------------------------
// checkUnsyncedChanges — pure peer-dispatch logic
// ---------------------------------------------------------------------------

describe("checkUnsyncedChanges", () => {
  it("returns false when no peer is provided", async () => {
    expect(await checkUnsyncedChanges(null)).toBe(false)
  })

  it("delegates to hasUnsyncedChanges for cloud_server peer", async () => {
    mockHasUnsynced = true
    expect(await checkUnsyncedChanges(makeCloudPeer())).toBe(true)

    mockHasUnsynced = false
    expect(await checkUnsyncedChanges(makeCloudPeer())).toBe(false)
  })

  it("delegates to getLocalChangesSince for sync_hub peer", async () => {
    mockLocalChangesCount = 5
    expect(await checkUnsyncedChanges(makeHubPeer())).toBe(true)

    mockLocalChangesCount = 0
    expect(await checkUnsyncedChanges(makeHubPeer())).toBe(false)
  })

  it("uses peer.lastSyncedAt for hub timestamp (falls back to 0 when null)", async () => {
    const { getLocalChangesSince } = require("../../app/db/localSync")
    mockLocalChangesCount = 0

    await checkUnsyncedChanges(makeHubPeer({ lastSyncedAt: 5000 }))
    expect(getLocalChangesSince).toHaveBeenCalledWith(5000, [])

    await checkUnsyncedChanges(makeHubPeer({ lastSyncedAt: null }))
    expect(getLocalChangesSince).toHaveBeenCalledWith(0, [])
  })

  it("returns false for mobile_app peer (defensive)", async () => {
    const mobilePeer = makeCloudPeer({ peerType: "mobile_app" as PeerType })
    expect(await checkUnsyncedChanges(mobilePeer)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// switchToOnlineMode
// ---------------------------------------------------------------------------

describe("switchToOnlineMode — refused while online mode is disabled", () => {
  it("refuses whatever the peer and whatever the unsynced state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Peer.T | null>(null, makeCloudPeer(), makeHubPeer()),
        fc.boolean(),
        fc.nat({ max: 10 }),
        async (peer, hasUnsynced, changeCount) => {
          operationModeStore.send({ type: "reset" })
          mockActivePeer = peer
          mockHasUnsynced = hasUnsynced
          mockLocalChangesCount = changeCount

          const result = await switchToOnlineMode()

          expect(result.ok).toBe(false)
          if (!result.ok) expect(result.reason).toBe("disabled")
          expect(operationModeStore.getSnapshot().context.mode).toBe("offline")
        },
      ),
    )
  })

  // It returns before `start_transition` and before the preference is written.
  // A refusal that left either behind would strand the UI mid-transition or
  // silently arm online mode for the next launch.
  it("leaves no trace — no stored preference, no transition, no peer lookup", async () => {
    mockActivePeer = makeCloudPeer()
    const resolveActive = (jest.requireMock("../../app/models/Peer") as any).default.DB
      .resolveActive as jest.Mock
    resolveActive.mockClear()

    await switchToOnlineMode()

    expect(savedValues[MODE_PREFERENCE_KEY]).toBeUndefined()
    expect(operationModeStore.getSnapshot().context.isTransitioning).toBe(false)
    expect(resolveActive).not.toHaveBeenCalled()
  })

  // Refusing takes priority over "already online" — the store cannot be in
  // online mode to begin with, so that branch is unreachable.
  it("still refuses when something has tried to set the mode to online", async () => {
    operationModeStore.send({ type: "set_mode", mode: "online" })

    const result = await switchToOnlineMode()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("disabled")
  })
})

// ---------------------------------------------------------------------------
// switchToOfflineMode
// ---------------------------------------------------------------------------

describe("switchToOfflineMode", () => {
  // Its success path is unreachable while online mode is disabled: the store
  // can never hold "online", so the guard at the top always fires. The path
  // itself is untouched and returns when the gate is lifted.
  it("reports already_in_mode, because offline is the only reachable mode", async () => {
    operationModeStore.send({ type: "set_mode", mode: "online" })

    const result = await switchToOfflineMode()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("already_in_mode")
    expect(operationModeStore.getSnapshot().context.mode).toBe("offline")
  })

  it("returns already_in_mode from a clean start too", async () => {
    const result = await switchToOfflineMode()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("already_in_mode")
  })
})

// ---------------------------------------------------------------------------
// Property-based: checkUnsyncedChanges dispatch invariants
// ---------------------------------------------------------------------------

describe("checkUnsyncedChanges — properties", () => {
  const arbPeerType = fc.constantFrom<PeerType>("sync_hub", "cloud_server", "mobile_app")

  it("never throws regardless of peer shape", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc
            .record({
              peerType: arbPeerType,
              lastSyncedAt: fc.oneof(fc.constant(null), fc.integer({ min: 0 })),
            })
            .map((partial) =>
              makeCloudPeer({
                peerType: partial.peerType,
                lastSyncedAt: partial.lastSyncedAt,
              }),
            ),
        ),
        async (peer) => {
          // Should never throw
          const result = await checkUnsyncedChanges(peer)
          expect(typeof result).toBe("boolean")
        },
      ),
    )
  })

  it("null peer always returns false", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async (peer) => {
        expect(await checkUnsyncedChanges(peer)).toBe(false)
      }),
    )
  })
})
