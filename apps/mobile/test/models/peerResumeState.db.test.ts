/**
 * The `Peer.DB` resume-state wrappers against a real WatermelonDB instance.
 *
 * The pure merge/read helpers are covered by `peerResumeCursor.test.ts`. These
 * exercise what that cannot: that a `@json` column actually round-trips a nested
 * object through its sanitiser, and that writing resume state does not disturb
 * the peer URL that lives in the same blob.
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

import Peer from "@/models/Peer"

const state: Peer.ResumeState = {
  cursor: "eyJ2IjoxfQ",
  since: 1_700_000_000_000,
  snapshotTs: 1_800_000_000_000,
  pagesApplied: 12,
  recordsApplied: 24_000,
}

let testDb: ReturnType<typeof createTestDatabase>

const seedPeer = async (metadata: Record<string, unknown>): Promise<string> => {
  const collection = testDb.get("peers")
  let id = ""
  await testDb.write(async () => {
    const record = await collection.create((rec: never) => {
      const r = rec as unknown as Record<string, unknown>
      r.peerId = "peer-1"
      r.name = "Test cloud"
      r.peerType = "cloud"
      r.status = "active"
      r.metadata = metadata
    })
    id = record.id
  })
  return id
}

beforeEach(() => {
  testDb = createTestDatabase()
  ;(global as never as { __TEST_DB__: unknown }).__TEST_DB__ = testDb
})

afterEach(async () => {
  await resetTestDatabase(testDb)
})

describe("Peer.DB resume state", () => {
  it("round-trips resume state through the json column", async () => {
    const id = await seedPeer({ url: "https://api.test" })

    await Peer.DB.saveResumeState(id, state)

    expect(await Peer.DB.getResumeState(id)).toEqual(state)
  })

  // The peer URL shares the metadata blob. Losing it would make the peer
  // unreachable — worse than losing the cursor this feature exists to store.
  it("leaves the peer url intact", async () => {
    const id = await seedPeer({ url: "https://api.test" })

    await Peer.DB.saveResumeState(id, state)

    const record = await testDb.get("peers").find(id)
    expect((record as unknown as { metadata: Record<string, unknown> }).metadata.url).toBe(
      "https://api.test",
    )
    expect(Peer.getUrl(Peer.fromDB(record as never))).toBe("https://api.test")
  })

  it("returns null before anything has been stored", async () => {
    const id = await seedPeer({ url: "https://api.test" })
    expect(await Peer.DB.getResumeState(id)).toBeNull()
  })

  it("clears resume state while keeping the url", async () => {
    const id = await seedPeer({ url: "https://api.test" })
    await Peer.DB.saveResumeState(id, state)

    await Peer.DB.clearResumeState(id)

    expect(await Peer.DB.getResumeState(id)).toBeNull()
    const record = await testDb.get("peers").find(id)
    expect((record as unknown as { metadata: Record<string, unknown> }).metadata.url).toBe(
      "https://api.test",
    )
  })

  it("overwrites an earlier cursor rather than accumulating", async () => {
    const id = await seedPeer({})
    await Peer.DB.saveResumeState(id, state)

    const later = { ...state, cursor: "later", pagesApplied: 13 }
    await Peer.DB.saveResumeState(id, later)

    expect(await Peer.DB.getResumeState(id)).toEqual(later)
  })

  // A peer deleted mid-run leaves nothing to resume, which is the same answer as
  // never having stored anything. Throwing here would surface as a crash in the
  // driver's resume check.
  it("returns null for a peer that no longer exists", async () => {
    expect(await Peer.DB.getResumeState("does-not-exist")).toBeNull()
  })
})
