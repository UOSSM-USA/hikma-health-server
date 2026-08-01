/**
 * Two credentials, two schemes, and they are not interchangeable.
 *
 * The REST `/api/v2/sync` path accepts Basic; tRPC's authedProcedure rejects
 * anything that is not a Bearer token. `getProviderAuthHeader` therefore keeps
 * its Basic fallback and `getBearerToken` must not grow one.
 */

const mockGetItemAsync = jest.fn()
const mockSetItemAsync = jest.fn()

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
}))

import { getBearerToken, getProviderAuthHeader, refreshBearerToken } from "@/utils/authHeader"

/** Back the mocked SecureStore with a plain map. */
const store = (entries: Record<string, string | null>) => {
  mockGetItemAsync.mockImplementation(async (key: string) => entries[key] ?? null)
  mockSetItemAsync.mockImplementation(async (key: string, value: string) => {
    entries[key] = value
  })
  return entries
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("getProviderAuthHeader", () => {
  it("prefers a token over stored credentials", async () => {
    store({ provider_token: "tok", provider_email: "a@b.c", provider_password: "pw" })
    await expect(getProviderAuthHeader()).resolves.toBe("Bearer tok")
  })

  it("falls back to Basic when only credentials are stored", async () => {
    store({ provider_email: "a@b.c", provider_password: "pw" })
    const header = await getProviderAuthHeader()
    expect(header).toBe(`Basic ${Buffer.from("a@b.c:pw").toString("base64")}`)
  })

  it("returns null when nothing is stored", async () => {
    store({})
    await expect(getProviderAuthHeader()).resolves.toBeNull()
  })

  it("returns null when the password is missing", async () => {
    store({ provider_email: "a@b.c" })
    await expect(getProviderAuthHeader()).resolves.toBeNull()
  })
})

describe("getBearerToken", () => {
  it("returns the Bearer header when a token is cached", async () => {
    store({ provider_token: "tok" })
    await expect(getBearerToken()).resolves.toBe("Bearer tok")
  })

  // A Basic header against tRPC is rejected outright, so falling back to one
  // would turn a recoverable "no token yet" into a confusing 401.
  it("returns an empty string rather than falling back to Basic", async () => {
    store({ provider_email: "a@b.c", provider_password: "pw" })
    await expect(getBearerToken()).resolves.toBe("")
  })

  it("returns an empty string when nothing is stored", async () => {
    store({})
    await expect(getBearerToken()).resolves.toBe("")
  })
})

describe("refreshBearerToken", () => {
  const transport = (result: unknown) => ({ login: jest.fn().mockResolvedValue(result) })

  it("mints a token from stored credentials and caches it", async () => {
    const entries = store({ provider_email: "a@b.c", provider_password: "pw" })
    const t = transport({ ok: true, data: { token: "fresh" } })

    await expect(refreshBearerToken(t as never)).resolves.toBe(true)

    expect(t.login).toHaveBeenCalledWith("a@b.c", "pw")
    expect(entries.provider_token).toBe("fresh")
    await expect(getBearerToken()).resolves.toBe("Bearer fresh")
  })

  it("reports failure without calling the server when no credentials are stored", async () => {
    store({ provider_token: "stale" })
    const t = transport({ ok: true, data: { token: "fresh" } })

    await expect(refreshBearerToken(t as never)).resolves.toBe(false)
    expect(t.login).not.toHaveBeenCalled()
  })

  // The stale token must survive a failed refresh: overwriting it with nothing
  // would turn a transient outage into a forced re-login.
  it("leaves the cached token alone when the login fails", async () => {
    const entries = store({
      provider_token: "stale",
      provider_email: "a@b.c",
      provider_password: "pw",
    })
    const t = transport({ ok: false, error: { code: "AUTH_FAILED", message: "nope" } })

    await expect(refreshBearerToken(t as never)).resolves.toBe(false)
    expect(entries.provider_token).toBe("stale")
  })

  it("treats a successful login carrying no token as a failure", async () => {
    const entries = store({
      provider_token: "stale",
      provider_email: "a@b.c",
      provider_password: "pw",
    })
    const t = transport({ ok: true, data: {} })

    await expect(refreshBearerToken(t as never)).resolves.toBe(false)
    expect(entries.provider_token).toBe("stale")
  })
})
