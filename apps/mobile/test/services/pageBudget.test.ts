// Both are native modules that throw on import under jest.
const mockGetTotalMemory = jest.fn()
const mockGetUsedMemory = jest.fn()
const mockNetInfoFetch = jest.fn()

jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: {
    getTotalMemory: () => mockGetTotalMemory(),
    getUsedMemory: () => mockGetUsedMemory(),
  },
}))

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: () => mockNetInfoFetch() },
}))

import {
  choosePageBytes,
  pickPageBudget,
  PAGE_BUDGETS,
  SERVER_MAX_PAGE_BYTES,
} from "@/services/pageBudget"

const CONNECTIONS = ["wifi", "cellular-fast", "cellular-slow", "unknown", "offline"] as const

describe("choosePageBytes", () => {
  it("uses the largest budget on wifi with plenty of memory", () => {
    expect(choosePageBytes({ availableMemoryBytes: 3_000_000_000, connection: "wifi" })).toBe(
      PAGE_BUDGETS.large,
    )
  })

  it("uses the smallest budget when memory is tight, even on wifi", () => {
    expect(choosePageBytes({ availableMemoryBytes: 200_000_000, connection: "wifi" })).toBe(
      PAGE_BUDGETS.small,
    )
  })

  it("caps at medium on fast cellular despite ample memory", () => {
    expect(
      choosePageBytes({ availableMemoryBytes: 3_000_000_000, connection: "cellular-fast" }),
    ).toBe(PAGE_BUDGETS.medium)
  })

  it("caps at small on slow cellular despite ample memory", () => {
    expect(
      choosePageBytes({ availableMemoryBytes: 3_000_000_000, connection: "cellular-slow" }),
    ).toBe(PAGE_BUDGETS.small)
  })

  it("defaults to the smallest budget when memory is unknown", () => {
    expect(choosePageBytes({ availableMemoryBytes: null, connection: "wifi" })).toBe(
      PAGE_BUDGETS.small,
    )
  })

  it("defaults to the smallest budget when the connection is unknown", () => {
    expect(choosePageBytes({ availableMemoryBytes: 3_000_000_000, connection: "unknown" })).toBe(
      PAGE_BUDGETS.small,
    )
  })

  it("uses the smallest budget when offline", () => {
    expect(choosePageBytes({ availableMemoryBytes: 3_000_000_000, connection: "offline" })).toBe(
      PAGE_BUDGETS.small,
    )
  })

  it("never returns zero or a negative budget", () => {
    for (const memory of [null, 0, -1, 1, 8_000_000_000]) {
      for (const connection of CONNECTIONS) {
        expect(choosePageBytes({ availableMemoryBytes: memory, connection })).toBeGreaterThan(0)
      }
    }
  })

  // Every unknown must resolve downward: a wrong-but-small page costs a round
  // trip, a wrong-but-large one costs the whole operation on a low-memory device.
  it("never returns more than the smallest budget for a non-finite memory reading", () => {
    for (const memory of [NaN, Infinity, -Infinity]) {
      for (const connection of CONNECTIONS) {
        expect(choosePageBytes({ availableMemoryBytes: memory, connection })).toBe(
          PAGE_BUDGETS.small,
        )
      }
    }
  })

  it("is monotonic in memory — more memory never yields a smaller page", () => {
    for (const connection of CONNECTIONS) {
      const ascending = [
        100_000_000, 599_999_999, 600_000_000, 1_499_999_999, 1_500_000_000, 8_000_000_000,
      ].map((memory) => choosePageBytes({ availableMemoryBytes: memory, connection }))
      const sorted = [...ascending].sort((a, b) => a - b)
      expect(ascending).toEqual(sorted)
    }
  })

  // `getDeltaPage` clamps `page_bytes` to MAX_PAGE_BYTES server-side. A budget
  // above that is silently reduced, so the client would believe it asked for
  // something it did not get. Pins the cross-boundary invariant.
  it("keeps every budget within what the server will honour", () => {
    for (const budget of Object.values(PAGE_BUDGETS)) {
      expect(budget).toBeLessThanOrEqual(SERVER_MAX_PAGE_BYTES)
    }
  })

  it("orders the budgets small < medium < large", () => {
    expect(PAGE_BUDGETS.small).toBeLessThan(PAGE_BUDGETS.medium)
    expect(PAGE_BUDGETS.medium).toBeLessThan(PAGE_BUDGETS.large)
  })
})

describe("pickPageBudget", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTotalMemory.mockResolvedValue(4_000_000_000)
    mockGetUsedMemory.mockResolvedValue(1_000_000_000)
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, type: "wifi", details: {} })
  })

  it("combines a healthy memory reading with wifi", async () => {
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.large)
  })

  it("treats 4g and 5g as fast cellular", async () => {
    for (const cellularGeneration of ["4g", "5g"]) {
      mockNetInfoFetch.mockResolvedValue({
        isConnected: true,
        type: "cellular",
        details: { cellularGeneration },
      })
      await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.medium)
    }
  })

  it("treats older cellular generations as slow", async () => {
    for (const cellularGeneration of ["2g", "3g", undefined]) {
      mockNetInfoFetch.mockResolvedValue({
        isConnected: true,
        type: "cellular",
        details: { cellularGeneration },
      })
      await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
    }
  })

  // A device reporting more used than total memory is not a device we should
  // trust with a 10 MB page.
  it("falls back to the smallest budget when used exceeds total", async () => {
    mockGetUsedMemory.mockResolvedValue(5_000_000_000)
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
  })

  it("falls back to the smallest budget when the memory read throws", async () => {
    mockGetTotalMemory.mockRejectedValue(new Error("no native module"))
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
  })

  // Connectivity unknown must not inherit the memory-derived budget: the
  // connection ceiling is what protects a metered link.
  it("falls back to the smallest budget when the connectivity read throws", async () => {
    mockNetInfoFetch.mockRejectedValue(new Error("no native module"))
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
  })

  it("uses the smallest budget when the device reports itself offline", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false, type: "none", details: null })
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
  })

  it("survives a null details object on a cellular connection", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, type: "cellular", details: null })
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.small)
  })

  it("treats ethernet as wifi", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, type: "ethernet", details: {} })
    await expect(pickPageBudget()).resolves.toBe(PAGE_BUDGETS.large)
  })
})
