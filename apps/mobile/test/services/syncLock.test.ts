// The lock is deliberately module-global — there is one sync process. That
// makes it shared state across tests, so each one gets a fresh module rather
// than a reset hook, which would mean test-only code in production.
type SyncLock = typeof import("@/services/syncLock")

let withSyncLock: SyncLock["withSyncLock"]
let tryWithSyncLock: SyncLock["tryWithSyncLock"]
let isSyncInFlight: SyncLock["isSyncInFlight"]
let currentSyncLabel: SyncLock["currentSyncLabel"]

beforeEach(() => {
  jest.resetModules()
  const mod = require("@/services/syncLock") as SyncLock
  withSyncLock = mod.withSyncLock
  tryWithSyncLock = mod.tryWithSyncLock
  isSyncInFlight = mod.isSyncInFlight
  currentSyncLabel = mod.currentSyncLabel
})

const defer = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("syncLock", () => {
  it("runs an operation and returns its value", async () => {
    await expect(withSyncLock("a", async () => 42)).resolves.toBe(42)
  })

  it("reports no sync in flight when idle", () => {
    expect(isSyncInFlight()).toBe(false)
    expect(currentSyncLabel()).toBeNull()
  })

  it("serialises two operations rather than interleaving them", async () => {
    const order: string[] = []
    const first = defer()
    const a = withSyncLock("a", async () => {
      order.push("a:start")
      await first.promise
      order.push("a:end")
    })
    const b = withSyncLock("b", async () => {
      order.push("b:start")
    })
    first.resolve()
    await Promise.all([a, b])
    expect(order).toEqual(["a:start", "a:end", "b:start"])
  })

  // Synchronous visibility is the whole contract: `tryWithSyncLock` and
  // `startSync`'s join both decide on the very next line after a call, with no
  // await in between. If claiming the lock is deferred to a microtask, both
  // guards read a stale `false` and admit a second concurrent sync.
  it("reports the lock as held synchronously, before any await", async () => {
    const gate = defer()
    const run = withSyncLock("manual", async () => {
      await gate.promise
    })
    expect(isSyncInFlight()).toBe(true)
    expect(currentSyncLabel()).toBe("manual")
    gate.resolve()
    await run
    expect(isSyncInFlight()).toBe(false)
    expect(currentSyncLabel()).toBeNull()
  })

  it("keeps reporting in-flight while an operation is queued behind another", async () => {
    const gate = defer()
    const first = withSyncLock("first", async () => {
      await gate.promise
    })
    const second = withSyncLock("second", async () => "done")
    expect(isSyncInFlight()).toBe(true)
    gate.resolve()
    await Promise.all([first, second])
    expect(isSyncInFlight()).toBe(false)
  })

  it("releases the lock when the operation throws", async () => {
    await expect(
      withSyncLock("boom", async () => {
        throw new Error("x")
      }),
    ).rejects.toThrow("x")
    expect(isSyncInFlight()).toBe(false)
    await expect(withSyncLock("after", async () => "ok")).resolves.toBe("ok")
  })

  it("still runs the queued operation when the one ahead of it fails", async () => {
    const failing = withSyncLock("bad", async () => {
      throw new Error("nope")
    }).catch(() => "caught")
    const queued = withSyncLock("good", async () => "ran")
    expect(await failing).toBe("caught")
    expect(await queued).toBe("ran")
  })

  it("returns to idle after a rejection so a later caller is not blocked forever", async () => {
    await withSyncLock("bad", async () => {
      throw new Error("nope")
    }).catch(() => undefined)
    expect(isSyncInFlight()).toBe(false)
    expect(currentSyncLabel()).toBeNull()
  })
})

describe("tryWithSyncLock", () => {
  it("runs when the lock is free", async () => {
    await expect(tryWithSyncLock("auto", async () => "ran")).resolves.toBe("ran")
  })

  it("skips without invoking the operation while the lock is held", async () => {
    const gate = defer()
    const held = withSyncLock("manual", async () => {
      await gate.promise
    })
    const fn = jest.fn(async () => "should not run")

    const skipped = await tryWithSyncLock("auto", fn)

    expect(skipped).toBeNull()
    expect(fn).not.toHaveBeenCalled()
    gate.resolve()
    await held
  })

  // The skip decision is made on the line after the manual sync starts, with no
  // await between. A deferred claim would let this one through.
  it("skips when called immediately after another operation starts", async () => {
    const gate = defer()
    const held = withSyncLock("manual", async () => {
      await gate.promise
    })
    const fn = jest.fn(async () => "should not run")
    const result = tryWithSyncLock("auto", fn)

    expect(fn).not.toHaveBeenCalled()
    await expect(result).resolves.toBeNull()
    gate.resolve()
    await held
  })

  it("runs again once the lock is released", async () => {
    const gate = defer()
    const held = withSyncLock("manual", async () => {
      await gate.promise
    })
    expect(await tryWithSyncLock("auto", async () => "ran")).toBeNull()
    gate.resolve()
    await held
    expect(await tryWithSyncLock("auto", async () => "ran")).toBe("ran")
  })
})
