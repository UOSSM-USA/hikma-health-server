/**
 * The manual sync progress store.
 *
 * Separate from `syncStore` because that store's transitions are guarded around
 * a fetch → resolve → push cycle, which a push-first many-page operation cannot
 * express. What matters here is that the context is always a coherent snapshot
 * for a screen to render: no stale error surviving a new run, no phase the UI
 * does not know, and totals that only ever come from the run they belong to.
 */

import fc from "fast-check"

import { manualSyncStore, type ManualSyncPhase } from "@/store/manualSync"

const PHASES: ManualSyncPhase[] = ["idle", "pushing", "pulling", "done", "error"]

const context = () => manualSyncStore.getSnapshot().context

const progress = (over: Partial<ReturnType<typeof context>> = {}) => ({
  phase: "pulling" as const,
  table: "patients",
  pagesApplied: 2,
  recordsApplied: 600,
  recordsPushed: 10,
  rejectedCount: 0,
  tablesRemaining: 4,
  ...over,
})

beforeEach(() => manualSyncStore.trigger.reset())

describe("manualSyncStore", () => {
  it("starts idle", () => {
    expect(context().phase).toBe("idle")
  })

  it("moves to pushing when a run begins", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    expect(context().phase).toBe("pushing")
  })

  it("remembers which range the run was started for", () => {
    manualSyncStore.trigger.begin({ since: 1_700_000_000_000 })
    expect(context().since).toBe(1_700_000_000_000)
  })

  it("accumulates page progress", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.progress(progress())

    const c = context()
    expect(c.pagesApplied).toBe(2)
    expect(c.recordsApplied).toBe(600)
    expect(c.table).toBe("patients")
    expect(c.phase).toBe("pulling")
  })

  it("records a conflict count so the UI can surface it", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.finish({ recordsPushed: 5, recordsApplied: 9, rejectedCount: 3 })

    const c = context()
    expect(c.phase).toBe("done")
    expect(c.rejectedCount).toBe(3)
  })

  it("marks a failed run resumable when it can be continued", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.fail({ error: "Network unavailable", resumable: true })

    const c = context()
    expect(c.phase).toBe("error")
    expect(c.resumable).toBe(true)
    expect(c.error).toBe("Network unavailable")
  })

  it("allows a new run to begin after a failure", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.fail({ error: "x", resumable: true })
    manualSyncStore.trigger.begin({ since: 0 })

    expect(context().phase).toBe("pushing")
    expect(context().error).toBeNull()
  })

  // A second run inheriting the first's totals would show a page count that
  // never happened, which on a recovery screen reads as data that never arrived.
  it("does not carry a previous run's totals into the next one", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.progress(progress())
    manualSyncStore.trigger.finish({ recordsPushed: 10, recordsApplied: 600, rejectedCount: 2 })

    manualSyncStore.trigger.begin({ since: 0 })

    const c = context()
    expect(c.pagesApplied).toBe(0)
    expect(c.recordsApplied).toBe(0)
    expect(c.recordsPushed).toBe(0)
    expect(c.rejectedCount).toBe(0)
    expect(c.table).toBe("")
    expect(c.resumable).toBe(false)
  })

  it("clears a stale resumable flag when a later run succeeds", () => {
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.fail({ error: "x", resumable: true })
    manualSyncStore.trigger.begin({ since: 0 })
    manualSyncStore.trigger.finish({ recordsPushed: 1, recordsApplied: 1, rejectedCount: 0 })

    expect(context().resumable).toBe(false)
    expect(context().error).toBeNull()
  })
})

// XState/store hands the handler an event object carrying its own `type` key.
// Spreading that into the context would leave a stray `type` field on a store
// whose shape a screen renders directly.
describe("context shape", () => {
  it("never gains keys the initial context did not have", () => {
    manualSyncStore.trigger.reset()
    const expected = Object.keys(context()).sort()

    manualSyncStore.trigger.begin({ since: 5 })
    manualSyncStore.trigger.progress(progress())
    manualSyncStore.trigger.fail({ error: "e", resumable: true })
    manualSyncStore.trigger.finish({ recordsPushed: 1, recordsApplied: 1, rejectedCount: 0 })

    expect(Object.keys(context()).sort()).toEqual(expected)
  })
})

describe("across arbitrary event sequences", () => {
  type StoreEvent =
    | { type: "reset" }
    | { type: "begin"; since: number }
    | { type: "progress"; phase: "pushing" | "pulling" | "done" }
    | { type: "finish"; rejectedCount: number }
    | { type: "fail"; resumable: boolean }

  const arbEvent: fc.Arbitrary<StoreEvent> = fc.oneof(
    fc.record({ type: fc.constant("reset" as const) }),
    fc.record({ type: fc.constant("begin" as const), since: fc.nat() }),
    fc.record({
      type: fc.constant("progress" as const),
      phase: fc.constantFrom("pushing" as const, "pulling" as const, "done" as const),
    }),
    fc.record({ type: fc.constant("finish" as const), rejectedCount: fc.nat() }),
    fc.record({ type: fc.constant("fail" as const), resumable: fc.boolean() }),
  )

  const apply = (event: StoreEvent) => {
    switch (event.type) {
      case "reset":
        return manualSyncStore.trigger.reset()
      case "begin":
        return manualSyncStore.trigger.begin({ since: event.since })
      case "progress":
        return manualSyncStore.trigger.progress(progress({ phase: event.phase }))
      case "finish":
        return manualSyncStore.trigger.finish({
          recordsPushed: 1,
          recordsApplied: 1,
          rejectedCount: event.rejectedCount,
        })
      case "fail":
        return manualSyncStore.trigger.fail({ error: "e", resumable: event.resumable })
    }
  }

  it("always holds a phase the UI knows how to render", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 30 }), (events) => {
        manualSyncStore.trigger.reset()
        events.forEach(apply)
        return PHASES.includes(context().phase)
      }),
    )
  })

  it("never reports a negative count", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 30 }), (events) => {
        manualSyncStore.trigger.reset()
        events.forEach(apply)
        const c = context()
        return (
          c.pagesApplied >= 0 &&
          c.recordsApplied >= 0 &&
          c.recordsPushed >= 0 &&
          c.rejectedCount >= 0
        )
      }),
    )
  })

  // An error message left over from a failed run, still on screen while a new
  // run is midway, is the specific thing this rules out.
  it("only carries an error message while in the error phase", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 30 }), (events) => {
        manualSyncStore.trigger.reset()
        events.forEach(apply)
        const c = context()
        return c.error === null || c.phase === "error"
      }),
    )
  })
})
