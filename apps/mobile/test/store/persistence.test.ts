/**
 * Both stores must reach SecureStore on every transition that changes them.
 *
 * @xstate/store v4 stopped invoking `emits` handlers, with no compile error, so
 * nothing wrote the `providerStore` key `app.tsx` reads — every cold start
 * hydrated an empty provider and bounced the user to the login screen.
 */

const mockSetItemAsync = jest.fn(async () => undefined)
const mockGetItemAsync = jest.fn(async (): Promise<string | null> => null)

jest.mock("@/db", () => ({ __esModule: true, default: {} }))

jest.mock("expo-secure-store", () => ({
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  deleteItemAsync: jest.fn(async () => undefined),
}))

import { Option } from "effect"

import { appStateStore, APP_STATE_STORAGE_KEY, hydrateAppState } from "@/store/appState"
import { providerStore, PROVIDER_STORAGE_KEY } from "@/store/provider"

const writesTo = (key: string): string[] =>
  mockSetItemAsync.mock.calls.filter((call) => call[0] === key).map((call) => call[1] as string)

const signIn = () =>
  providerStore.send({
    type: "set_provider",
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: Option.some("provider"),
    instance_url: Option.none(),
    clinic_id: Option.some("clinic-9"),
    clinic_name: Option.none(),
    permissions: Option.none(),
  })

beforeEach(() => {
  mockSetItemAsync.mockClear()
})

describe("providerStore persistence", () => {
  it("persists the session on set_provider", () => {
    signIn()

    expect(writesTo(PROVIDER_STORAGE_KEY)).toHaveLength(1)
  })

  it("flattens Options to the shape app.tsx hydrates from", () => {
    signIn()

    const stored = JSON.parse(writesTo(PROVIDER_STORAGE_KEY)[0])
    expect(stored).toMatchObject({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      role: "provider",
      clinic_id: "clinic-9",
      instance_url: null,
      clinic_name: null,
    })
  })

  it("persists the cleared session on reset", () => {
    providerStore.send({ type: "reset" })

    const stored = JSON.parse(writesTo(PROVIDER_STORAGE_KEY)[0])
    expect(stored).toMatchObject({ id: "", name: "", email: "" })
  })
})

describe("appStateStore persistence", () => {
  it("persists settings when one changes", () => {
    appStateStore.send({ type: "SET_LOCK_WHEN_IDLE", lockWhenIdle: true })

    const stored = JSON.parse(writesTo(APP_STATE_STORAGE_KEY)[0])
    expect(stored.lockWhenIdle).toBe(true)
  })

  it("stores exactly the fields hydrateAppState reads back", () => {
    appStateStore.send({ type: "RESET" })
    appStateStore.send({ type: "SET_NOTIFICATIONS_ENABLED", notificationsEnabled: true })
    appStateStore.send({ type: "SET_LOCK_WHEN_IDLE", lockWhenIdle: true })
    appStateStore.send({ type: "SET_HERS_ENABLED", hersEnabled: true })

    const blobs = writesTo(APP_STATE_STORAGE_KEY)
    expect(JSON.parse(blobs[blobs.length - 1])).toEqual({
      notificationsEnabled: true,
      lockWhenIdle: true,
      hersEnabled: true,
    })
  })

  it("hydrates from storage without writing back", async () => {
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({ notificationsEnabled: true, lockWhenIdle: true, hersEnabled: false }),
    )

    await hydrateAppState()

    // Three racing writes on one key is how a hydrated setting silently reverts.
    expect(writesTo(APP_STATE_STORAGE_KEY)).toHaveLength(0)
    expect(appStateStore.getSnapshot().context).toMatchObject({
      notificationsEnabled: true,
      lockWhenIdle: true,
      hersEnabled: false,
    })
  })

  it("omits lastActiveTime, an Option that would not survive JSON", () => {
    appStateStore.send({ type: "SET_LAST_ACTIVE_TIME", lastActiveTime: new Date() })
    appStateStore.send({ type: "SET_NOTIFICATIONS_ENABLED", notificationsEnabled: true })

    const blobs = writesTo(APP_STATE_STORAGE_KEY)
    expect(JSON.parse(blobs[blobs.length - 1])).not.toHaveProperty("lastActiveTime")
  })
})
