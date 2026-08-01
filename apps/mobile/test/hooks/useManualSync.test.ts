/**
 * The screen-facing hook for a manual sync run.
 *
 * Two things here are not obvious from the hook's shape. It brackets the shared
 * `syncStore` so existing consumers do not read "idle" through a ten-minute
 * operation — and that bracket has to close, because `finish_sync` is guarded
 * against the very state `start_sync` produces. And it must refuse a second
 * concurrent run: `withSyncLock` queues rather than rejects, so an unguarded
 * double tap is two full backfills, not one.
 */

// Reached transitively through the stores; nothing here touches it, and letting
// it load spins up a real LokiJS database.
jest.mock("@/db", () => ({ __esModule: true, default: {}, database: {} }))

const mockRunManualSync = jest.fn()

jest.mock("@/db/cloudManualSync", () => ({
  __esModule: true,
  runManualSync: (...a: unknown[]) => mockRunManualSync(...a),
}))

import { act, renderHook, waitFor } from "@testing-library/react-native"

import Sync from "@/models/Sync"
import { useManualSync } from "@/hooks/useManualSync"
import { manualSyncStore } from "@/store/manualSync"
import { syncStore } from "@/store/sync"

const NOW = 1_800_000_000_000
const DAY = 86_400_000

const succeed = (over: Record<string, unknown> = {}) => ({
  ok: true,
  recordsPushed: 2,
  recordsApplied: 7,
  rejected: {},
  ...over,
})

const context = () => manualSyncStore.getSnapshot().context
const syncState = () => syncStore.getSnapshot().context.state

beforeEach(() => {
  jest.clearAllMocks()
  manualSyncStore.trigger.reset()
  syncStore.trigger.force_reset()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  mockRunManualSync.mockResolvedValue(succeed())
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("useManualSync", () => {
  it("counts whole days back from now", async () => {
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(7)
    })

    expect(mockRunManualSync.mock.calls[0][0].since).toBe(NOW - 7 * DAY)
    expect(mockRunManualSync.mock.calls[0][0].peerId).toBe("peer-1")
  })

  // "Everything" is the widest and most expensive range; it must be an explicit
  // choice, never something a fallback can land on.
  it("treats null as everything", async () => {
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(null)
    })

    expect(mockRunManualSync.mock.calls[0][0].since).toBe(0)
  })

  it("records a successful run, counting rejections across tables", async () => {
    mockRunManualSync.mockResolvedValue(
      succeed({ rejected: { patients: ["a", "b"], events: ["c"] } }),
    )
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(1)
    })

    const c = context()
    expect(c.phase).toBe("done")
    expect(c.recordsApplied).toBe(7)
    expect(c.recordsPushed).toBe(2)
    expect(c.rejectedCount).toBe(3)
  })

  it("records a failed run and whether it can be resumed", async () => {
    mockRunManualSync.mockResolvedValue({ ok: false, error: "Network gone", resumable: true })
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(1)
    })

    const c = context()
    expect(c.phase).toBe("error")
    expect(c.error).toBe("Network gone")
    expect(c.resumable).toBe(true)
  })

  it("survives the driver throwing instead of returning a failure", async () => {
    mockRunManualSync.mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(1)
    })

    expect(context().phase).toBe("error")
    expect(context().error).toContain("boom")
  })

  // The driver adopts a stored cursor only when `resume.since` matches the
  // range asked for, so recomputing it from the clock would discard the cursor
  // and restart the whole backfill.
  it("resumes against the range the failed run used, not a freshly computed one", async () => {
    mockRunManualSync.mockResolvedValue({ ok: false, error: "dropped", resumable: true })
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(7)
    })
    const originalSince = mockRunManualSync.mock.calls[0][0].since

    // The user stares at the error for a while before tapping Continue.
    jest.spyOn(Date, "now").mockReturnValue(NOW + 45_000)
    await act(async () => {
      await result.current.resume()
    })

    expect(mockRunManualSync).toHaveBeenCalledTimes(2)
    expect(mockRunManualSync.mock.calls[1][0].since).toBe(originalSince)
  })

  // The double-start guard releases in `startWith`'s finally, which runs in the
  // same synchronous block as the failure it just recorded. If it did not,
  // Continue would be a dead button for exactly the state that produces it.
  it("allows resuming in the same tick the failure was recorded", async () => {
    mockRunManualSync.mockResolvedValue({ ok: false, error: "dropped", resumable: true })
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(7)
      // No intervening await: the guard must already have been released.
      await result.current.resume()
    })

    expect(mockRunManualSync).toHaveBeenCalledTimes(2)
  })

  it("forwards progress to the store", async () => {
    mockRunManualSync.mockImplementation(async (args: { onProgress: (p: unknown) => void }) => {
      args.onProgress({
        phase: "pulling",
        table: "events",
        pagesApplied: 4,
        recordsApplied: 800,
        recordsPushed: 2,
        rejectedCount: 0,
        tablesRemaining: 3,
      })
      return succeed()
    })
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(1)
    })

    expect(context().table).toBe("events")
    expect(context().pagesApplied).toBe(4)
  })
})

// The shared-store bracket lives inside `runManualSync`, under the sync lock —
// see cloudManualSyncWatermark.db.test.ts. The hook must not touch it: doing so
// from out here releases the lock first, letting a queued ordinary sync set
// FETCHING before the reset lands.
it("leaves the shared sync store alone", async () => {
  const { result } = renderHook(() => useManualSync("peer-1"))

  await act(async () => {
    await result.current.start(1)
  })

  expect(syncState()).toBe(Sync.State.IDLE)
})

describe("concurrency", () => {
  // withSyncLock QUEUES rather than rejects, so an unguarded second tap is a
  // second full backfill running straight after the first.
  it("ignores a second start while one is already running", async () => {
    let release: (() => void) | null = null
    mockRunManualSync.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(succeed())
        }),
    )
    const { result } = renderHook(() => useManualSync("peer-1"))

    let first: Promise<void>
    act(() => {
      first = result.current.start(1)
      result.current.start(30)
    })

    await waitFor(() => expect(release).not.toBeNull())
    expect(mockRunManualSync).toHaveBeenCalledTimes(1)

    await act(async () => {
      release!()
      await first!
    })

    expect(mockRunManualSync).toHaveBeenCalledTimes(1)
  })

  it("allows a new run once the previous one has finished", async () => {
    const { result } = renderHook(() => useManualSync("peer-1"))

    await act(async () => {
      await result.current.start(1)
    })
    await act(async () => {
      await result.current.start(1)
    })

    expect(mockRunManualSync).toHaveBeenCalledTimes(2)
  })

  it("aborts the signal the run was given", async () => {
    let seen: AbortSignal | null = null
    let release: (() => void) | null = null
    mockRunManualSync.mockImplementation(
      (args: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          seen = args.signal
          release = () => resolve(succeed())
        }),
    )
    const { result } = renderHook(() => useManualSync("peer-1"))

    let run: Promise<void>
    act(() => {
      run = result.current.start(1)
    })
    await waitFor(() => expect(seen).not.toBeNull())

    act(() => result.current.abort())
    expect(seen!.aborted).toBe(true)

    await act(async () => {
      release!()
      await run!
    })
  })

  it("does nothing when abort is called with no run in flight", () => {
    const { result } = renderHook(() => useManualSync("peer-1"))
    expect(() => result.current.abort()).not.toThrow()
  })
})
