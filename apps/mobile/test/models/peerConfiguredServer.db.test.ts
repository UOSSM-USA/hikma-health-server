/**
 * `Peer.hasNoConfiguredServer` against a real WatermelonDB instance.
 *
 * This decides whether the app signs a provider out on launch, so a false
 * positive logs someone out of a working install.
 */

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"

let mockLegacyUrl: string | null = null

jest.mock("@/db", () => ({
  __esModule: true,
  get default() {
    return (global as never as { __TEST_DB__: unknown }).__TEST_DB__
  },
  get database() {
    return (global as never as { __TEST_DB__: unknown }).__TEST_DB__
  },
}))

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => (key === "HIKMA_API" ? mockLegacyUrl : null)),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
}))

import Peer from "@/models/Peer"

let testDb: ReturnType<typeof createTestDatabase>
const devTestingUrl = process.env.EXPO_PUBLIC_HIKMA_API_TESTING
const realDev = __DEV__

/** `__DEV__` is read at call time, so the release-build branch is reachable here. */
const withDev = (value: boolean): void => {
  ;(global as never as { __DEV__: boolean }).__DEV__ = value
}

const seedPeer = async (status: string): Promise<void> => {
  const collection = testDb.get("peers")
  await testDb.write(async () => {
    await collection.create((rec: never) => {
      const r = rec as unknown as Record<string, unknown>
      r.peerId = `peer-${status}`
      r.name = "Test server"
      r.peerType = "cloud_server"
      r.status = status
      r.metadata = { url: "https://api.test" }
    })
  })
}

beforeEach(() => {
  testDb = createTestDatabase()
  ;(global as never as { __TEST_DB__: unknown }).__TEST_DB__ = testDb
  mockLegacyUrl = null
  delete process.env.EXPO_PUBLIC_HIKMA_API_TESTING
})

afterEach(async () => {
  await resetTestDatabase(testDb)
  withDev(realDev)
  if (devTestingUrl === undefined) {
    delete process.env.EXPO_PUBLIC_HIKMA_API_TESTING
  } else {
    process.env.EXPO_PUBLIC_HIKMA_API_TESTING = devTestingUrl
  }
})

describe("Peer.hasNoConfiguredServer", () => {
  it("reports unconfigured when nothing at all is registered", async () => {
    expect(await Peer.hasNoConfiguredServer()).toBe(true)
  })

  it("reports configured when an active peer exists", async () => {
    await seedPeer("active")

    expect(await Peer.hasNoConfiguredServer()).toBe(false)
  })

  // A deactivated peer is still a known server; the disconnect dialog handles
  // that case, not a silent sign-out.
  it("reports configured when the only peer is inactive", async () => {
    await seedPeer("inactive")

    expect(await Peer.hasNoConfiguredServer()).toBe(false)
  })

  it("reports configured when the only peer is revoked", async () => {
    await seedPeer("revoked")

    expect(await Peer.hasNoConfiguredServer()).toBe(false)
  })

  // `migrateFromLegacyApiUrl` has not turned this into a row yet — reading it as
  // unconfigured would sign out every device still on the legacy url.
  it("reports configured from the legacy SecureStore url with no peer rows", async () => {
    mockLegacyUrl = "https://legacy.test"

    expect(await Peer.hasNoConfiguredServer()).toBe(false)
  })

  // Same race, via the migration's other branch.
  it("reports configured from the dev testing url with no peer rows", async () => {
    process.env.EXPO_PUBLIC_HIKMA_API_TESTING = "https://dev.test"
    withDev(true)

    expect(await Peer.hasNoConfiguredServer()).toBe(false)
  })

  // The migration only honours the testing url under __DEV__.
  it("ignores the dev testing url in a release build", async () => {
    process.env.EXPO_PUBLIC_HIKMA_API_TESTING = "https://dev.test"
    withDev(false)

    expect(await Peer.hasNoConfiguredServer()).toBe(true)
  })
})
