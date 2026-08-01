// A native module that throws on import under jest.
const mockNetInfoFetch = jest.fn()

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: () => mockNetInfoFetch() },
}))

import { withRetry, backoffDelay } from "@/services/syncRetry"

const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (retryable: boolean, extra: Record<string, unknown> = {}) => ({
  ok: false as const,
  error: { code: "SERVER_ERROR" as const, message: "boom", retryable, ...extra },
})

describe("backoffDelay", () => {
  it("grows exponentially with attempt number", () => {
    const a = backoffDelay(0, undefined, () => 0.5)
    const b = backoffDelay(1, undefined, () => 0.5)
    const c = backoffDelay(2, undefined, () => 0.5)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it("applies jitter so devices do not retry in lockstep", () => {
    const low = backoffDelay(3, undefined, () => 0)
    const high = backoffDelay(3, undefined, () => 1)
    expect(low).not.toBe(high)
  })

  it("honours the server's Retry-After over its own schedule", () => {
    expect(backoffDelay(0, 7000, () => 0.5)).toBeGreaterThanOrEqual(7000)
  })

  it("caps the delay so a long run cannot stall indefinitely", () => {
    expect(backoffDelay(50, undefined, () => 1)).toBeLessThanOrEqual(60_000)
  })

  // A server may send an absurd Retry-After; honouring it literally would park
  // the run for hours with no way for the user to tell it apart from a hang.
  it("caps an oversized Retry-After at the same ceiling", () => {
    expect(backoffDelay(0, 86_400_000, () => 0.5)).toBeLessThanOrEqual(60_000)
  })

  it("never returns a negative delay", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      expect(backoffDelay(attempt, undefined, () => 0)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("withRetry", () => {
  const noSleep = async () => {}

  it("returns a successful result without retrying", async () => {
    const op = jest.fn().mockResolvedValue(ok(1))
    const r = await withRetry(op, new AbortController().signal, { sleep: noSleep })
    expect(r).toEqual(ok(1))
    expect(op).toHaveBeenCalledTimes(1)
  })

  it("retries a retryable failure and succeeds", async () => {
    const op = jest
      .fn()
      .mockResolvedValueOnce(fail(true))
      .mockResolvedValueOnce(fail(true))
      .mockResolvedValueOnce(ok("done"))
    const r = await withRetry(op, new AbortController().signal, { sleep: noSleep })
    expect(r).toEqual(ok("done"))
    expect(op).toHaveBeenCalledTimes(3)
  })

  it("does not retry a terminal failure", async () => {
    const op = jest.fn().mockResolvedValue(fail(false))
    const r = await withRetry(op, new AbortController().signal, { sleep: noSleep })
    expect(r.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it("gives up after maxAttempts and returns the last error", async () => {
    const op = jest.fn().mockResolvedValue(fail(true))
    const r = await withRetry(op, new AbortController().signal, { sleep: noSleep, maxAttempts: 4 })
    expect(op).toHaveBeenCalledTimes(4)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe("boom")
  })

  it("stops immediately when aborted", async () => {
    const controller = new AbortController()
    const op = jest.fn().mockImplementation(async () => {
      controller.abort()
      return fail(true)
    })
    const r = await withRetry(op, controller.signal, { sleep: noSleep })
    expect(op).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
  })

  it("does not call the operation at all when already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const op = jest.fn().mockResolvedValue(ok(1))
    const r = await withRetry(op, controller.signal, { sleep: noSleep })
    expect(op).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  it("does not consume an attempt while offline", async () => {
    let online = false
    const op = jest.fn().mockResolvedValue(ok("v"))
    const r = await withRetry(op, new AbortController().signal, {
      sleep: async () => {
        online = true
      },
      isOnline: async () => online,
      maxAttempts: 2,
    })
    expect(r).toEqual(ok("v"))
    expect(op).toHaveBeenCalledTimes(1)
  })

  // A tablet carried out of range and never brought back must not spin in the
  // offline wait forever — cancelling has to break out of it.
  it("escapes the offline wait when aborted", async () => {
    const controller = new AbortController()
    const op = jest.fn().mockResolvedValue(ok("v"))
    const r = await withRetry(op, controller.signal, {
      sleep: async () => {
        controller.abort()
      },
      isOnline: async () => false,
    })
    expect(op).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  /**
   * The offline wait is bounded, and that bound is what stops a wedge.
   *
   * A caller with no abortable signal — the unattended first-sync backfill was
   * exactly that — would otherwise park here forever: holding the sync lock,
   * never settling `startSync`'s in-flight promise, and leaving the shared sync
   * store mid-cycle so the UI spins indefinitely. Ending as a resumable failure
   * is strictly better; the cursor stands and the next trigger continues.
   */
  it("gives up waiting once the offline budget is spent, and still runs the op", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined)
    const op = jest.fn().mockResolvedValue(fail(true))

    const r = await withRetry(op, new AbortController().signal, {
      sleep,
      isOnline: async () => false,
      maxAttempts: 1,
      maxOfflineWaitMs: 3_000,
    })

    // Three polls at the 1s base delay, then through to the request.
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(op).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
  })

  // The budget spans the whole call. An operation that flaps offline / online /
  // offline must not keep refilling it, or the bound above means nothing.
  it("does not refill the offline budget between attempts", async () => {
    let sleeps = 0
    const op = jest.fn().mockResolvedValue(fail(true))

    await withRetry(op, new AbortController().signal, {
      sleep: async () => {
        sleeps += 1
      },
      isOnline: async () => false,
      maxAttempts: 4,
      maxOfflineWaitMs: 2_000,
      random: () => 0,
    })

    // 2 offline polls total, plus one backoff sleep after each of the first
    // three failed attempts — not 2 polls per attempt.
    expect(sleeps).toBe(2 + 3)
    expect(op).toHaveBeenCalledTimes(4)
  })

  // Every case above injects isOnline, so the NetInfo-backed default is
  // otherwise never executed.
  describe("the default connectivity check", () => {
    it("proceeds when NetInfo reports a connection", async () => {
      mockNetInfoFetch.mockResolvedValue({ isConnected: true })
      const op = jest.fn().mockResolvedValue(ok("v"))
      await expect(withRetry(op, new AbortController().signal, { sleep: noSleep })).resolves.toEqual(
        ok("v"),
      )
      expect(op).toHaveBeenCalledTimes(1)
    })

    it("assumes online rather than stalling when NetInfo throws", async () => {
      mockNetInfoFetch.mockRejectedValue(new Error("no native module"))
      const op = jest.fn().mockResolvedValue(ok("v"))
      await expect(withRetry(op, new AbortController().signal, { sleep: noSleep })).resolves.toEqual(
        ok("v"),
      )
      expect(op).toHaveBeenCalledTimes(1)
    })

    it("waits instead of spending attempts when NetInfo reports no connection", async () => {
      let calls = 0
      mockNetInfoFetch.mockImplementation(async () => ({ isConnected: ++calls > 2 }))
      const op = jest.fn().mockResolvedValue(ok("v"))
      await expect(
        withRetry(op, new AbortController().signal, { sleep: noSleep, maxAttempts: 1 }),
      ).resolves.toEqual(ok("v"))
      expect(op).toHaveBeenCalledTimes(1)
    })
  })

  it("waits the server's Retry-After when rate limited", async () => {
    const slept: number[] = []
    const op = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        error: { code: "RATE_LIMITED" as const, message: "slow down", retryable: true, retryAfterMs: 5_000 },
      })
      .mockResolvedValueOnce(ok("done"))
    await withRetry(op, new AbortController().signal, {
      sleep: async (ms: number) => {
        slept.push(ms)
      },
      random: () => 0,
    })
    expect(slept).toEqual([5_000])
  })
})
