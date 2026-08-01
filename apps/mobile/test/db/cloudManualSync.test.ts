/**
 * The pure halves of the manual sync driver: page normalisation, push chunking,
 * and the cursor loop. `runManualSync` itself needs a real database and is
 * covered in `cloudManualSyncWatermark.db.test.ts`.
 */

jest.mock("@/db", () => ({ __esModule: true, default: {}, database: {} }))

// Native modules reached transitively through pageBudget; they throw on import.
jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: { getTotalMemory: jest.fn(), getUsedMemory: jest.fn() },
}))

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}))

// Dropping a table or a poisoned record is expected here and logs a warning;
// the assertions cover the behaviour, so keep the run's output readable.
jest.mock("@hikmahealth/js-utils", () => ({
  Logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
}))

import { chunkLocalChanges, prepareInboundPage, pullLoop } from "@/db/cloudManualSync"

/**
 * Tables the local schema knows about. `app_config` is deliberately absent
 * despite being an INBOUND_TABLE, so the schema check is exercised rather than
 * shadowed by the allowlist check.
 */
const KNOWN = new Set(["patients", "events", "visits", "user_clinic_permissions"])

describe("prepareInboundPage", () => {
  it("merges the created bucket into updated so every row is upserted", () => {
    const out = prepareInboundPage(
      { patients: { created: [{ id: "a" }], updated: [{ id: "b" }], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.patients.created).toEqual([])
    expect(out.patients.updated.map((r: never) => (r as { id: string }).id).sort()).toEqual([
      "a",
      "b",
    ])
  })

  it("preserves the deleted bucket untouched", () => {
    const out = prepareInboundPage(
      { patients: { created: [], updated: [], deleted: ["x", "y"] } } as never,
      KNOWN,
    )
    expect(out.patients.deleted).toEqual(["x", "y"])
  })

  // A peer able to write `peers.metadata.url` would point the next sync — and
  // its credentials — at a host of its choosing.
  it("drops tables a peer may not write into this device", () => {
    const out = prepareInboundPage(
      {
        patients: { created: [{ id: "a" }], updated: [], deleted: [] },
        peers: { created: [{ id: "evil" }], updated: [], deleted: [] },
      } as never,
      KNOWN,
    )
    expect(out.peers).toBeUndefined()
    expect(out.patients).toBeDefined()
  })

  // Allowed by the server, unknown to this schema version: upstream calls
  // db.get(table) directly and throws, which would roll back the whole page.
  it("drops a permitted table that this schema version does not have", () => {
    const out = prepareInboundPage(
      { app_config: { created: [{ id: "a" }], updated: [], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.app_config).toBeUndefined()
  })

  it("keeps a permitted table that this schema version does have", () => {
    const out = prepareInboundPage(
      { user_clinic_permissions: { created: [{ id: "a" }], updated: [], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.user_clinic_permissions).toBeDefined()
  })

  it("strips _status and _changed, which upstream rejects as a fatal invariant", () => {
    const out = prepareInboundPage(
      {
        patients: {
          created: [{ id: "a", _status: "synced", _changed: "" }],
          updated: [],
          deleted: [],
        },
      } as never,
      KNOWN,
    )
    expect(out.patients.updated[0]).not.toHaveProperty("_status")
    expect(out.patients.updated[0]).not.toHaveProperty("_changed")
    expect(out.patients.updated[0]).toHaveProperty("id", "a")
  })

  it("drops records carrying an own __proto__ key", () => {
    const evil = JSON.parse('{"id":"a","__proto__":{"polluted":true}}')
    const out = prepareInboundPage(
      { patients: { created: [evil, { id: "b" }], updated: [], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.patients.updated.map((r: never) => (r as { id: string }).id)).toEqual(["b"])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("omits a table entirely when it has no rows left after filtering", () => {
    const out = prepareInboundPage(
      { patients: { created: [], updated: [], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.patients).toBeUndefined()
  })

  it("keeps a table that has only deletions", () => {
    const out = prepareInboundPage(
      { patients: { created: [], updated: [], deleted: ["gone"] } } as never,
      KNOWN,
    )
    expect(out.patients.deleted).toEqual(["gone"])
  })

  it("tolerates missing buckets and a null changeset", () => {
    expect(prepareInboundPage({ patients: {} } as never, KNOWN)).toEqual({})
    expect(prepareInboundPage(null as never, KNOWN)).toEqual({})
  })

  it("drops non-object rows instead of passing them to the database", () => {
    const out = prepareInboundPage(
      { patients: { created: [null, "nope", { id: "b" }], updated: [], deleted: [] } } as never,
      KNOWN,
    )
    expect(out.patients.updated.map((r: never) => (r as { id: string }).id)).toEqual(["b"])
  })
})

type Bucket = { created: { id: string }[]; updated: { id: string }[]; deleted: string[] }

describe("chunkLocalChanges", () => {
  const model = (table: string, id: string) => ({ id, table }) as never

  const local = {
    changes: {
      patients: {
        created: [{ id: "p1" }, { id: "p2" }],
        updated: [{ id: "p3" }],
        deleted: ["p4"],
      },
      events: { created: [{ id: "e1" }], updated: [], deleted: [] },
    },
    affectedRecords: [
      model("patients", "p1"),
      model("patients", "p2"),
      model("patients", "p3"),
      model("events", "e1"),
    ],
  } as never

  const idsIn = (chunk: { changes: Record<string, { created: { id: string }[]; updated: { id: string }[]; deleted: string[] }> }) =>
    Object.values(chunk.changes)
      .flatMap((t) => [...t.created.map((r) => r.id), ...t.updated.map((r) => r.id), ...t.deleted])
      .sort()

  it("returns a single chunk when everything fits", () => {
    const chunks = chunkLocalChanges(local, 100)
    expect(chunks).toHaveLength(1)
    expect(idsIn(chunks[0] as never)).toEqual(["e1", "p1", "p2", "p3", "p4"])
  })

  it("splits into chunks no larger than the limit", () => {
    const chunks = chunkLocalChanges(local, 2)
    expect(chunks).toHaveLength(3)
    for (const chunk of chunks) {
      expect(idsIn(chunk as never).length).toBeLessThanOrEqual(2)
    }
  })

  // Every pending record must be offered exactly once: a dropped one is a lost
  // edit, a duplicated one is wasted bandwidth on a recovery device.
  it("preserves every record exactly once across chunks", () => {
    for (const size of [1, 2, 3, 4, 5, 100]) {
      const all = chunkLocalChanges(local, size).flatMap((c) => idsIn(c as never))
      expect(all.sort()).toEqual(["e1", "p1", "p2", "p3", "p4"])
    }
  })

  // markLocalChangesAsSynced looks each raw up in affectedRecords by id+table
  // and logs an error when it cannot find it, so a chunk must carry its own.
  it("carries the affectedRecords belonging to each chunk", () => {
    const chunks = chunkLocalChanges(local, 2)
    for (const chunk of chunks) {
      const c = chunk as unknown as {
        changes: Record<string, { created: { id: string }[]; updated: { id: string }[] }>
        affectedRecords: { id: string; table: string }[]
      }
      const rowIds = Object.entries(c.changes).flatMap(([table, t]) =>
        [...t.created, ...t.updated].map((r) => `${table}/${r.id}`),
      )
      const recordIds = c.affectedRecords.map((m) => `${m.table}/${m.id}`)
      expect(recordIds.sort()).toEqual(rowIds.sort())
    }
  })

  it("never emits an empty chunk", () => {
    for (const size of [1, 2, 3, 100]) {
      for (const chunk of chunkLocalChanges(local, size)) {
        expect(idsIn(chunk as never).length).toBeGreaterThan(0)
      }
    }
  })

  // Inbound the server's split is untrustworthy and gets merged; outbound this
  // device genuinely knows what it created, and ordinary sync sends the split
  // intact. Merging here would discard accurate information.
  it("preserves the created/updated split it was given", () => {
    const chunks = chunkLocalChanges(local, 100)
    const patients = (chunks[0] as unknown as { changes: Record<string, Bucket> }).changes.patients
    expect(patients.created.map((r) => r.id)).toEqual(["p1", "p2"])
    expect(patients.updated.map((r) => r.id)).toEqual(["p3"])
  })

  it("keeps the split intact across a chunk boundary", () => {
    for (const chunk of chunkLocalChanges(local, 2)) {
      const c = (chunk as unknown as { changes: Record<string, Bucket> }).changes
      for (const [table, bucket] of Object.entries(c)) {
        if (table !== "patients") continue
        // p3 is the only updated record; it must never appear as created.
        expect(bucket.created.map((r) => r.id)).not.toContain("p3")
        expect(bucket.updated.every((r) => r.id === "p3")).toBe(true)
      }
    }
  })

  // fetchLocalChanges reports pending records for EVERY collection, including
  // device-local ones. `peers` holds hub URLs and public keys; pushing it would
  // hand a peer's address book to the server.
  it("drops tables this device may not send", () => {
    const withLocalTables = {
      changes: {
        patients: { created: [{ id: "p1" }], updated: [], deleted: [] },
        peers: { created: [{ id: "peer1" }], updated: [], deleted: [] },
        event_logs: { created: [{ id: "log1" }], updated: [], deleted: [] },
      },
      affectedRecords: [model("patients", "p1"), model("peers", "peer1")],
    } as never

    const chunks = chunkLocalChanges(withLocalTables, 100)

    expect(chunks).toHaveLength(1)
    expect(idsIn(chunks[0] as never)).toEqual(["p1"])
  })

  it("returns no chunks when every pending table is device-local", () => {
    const localOnly = {
      changes: { peers: { created: [{ id: "peer1" }], updated: [], deleted: [] } },
      affectedRecords: [model("peers", "peer1")],
    } as never
    expect(chunkLocalChanges(localOnly, 100)).toEqual([])
  })

  it("returns no chunks when there is nothing pending", () => {
    const empty = {
      changes: { patients: { created: [], updated: [], deleted: [] } },
      affectedRecords: [],
    } as never
    expect(chunkLocalChanges(empty, 10)).toEqual([])
  })

  // A deletion is a tombstone id with no model behind it; splitting must not
  // expect one.
  it("chunks deletions that have no corresponding affectedRecord", () => {
    const deletionsOnly = {
      changes: { patients: { created: [], updated: [], deleted: ["a", "b", "c"] } },
      affectedRecords: [],
    } as never
    const chunks = chunkLocalChanges(deletionsOnly, 2)
    expect(chunks).toHaveLength(2)
    expect(chunks.flatMap((c) => idsIn(c as never)).sort()).toEqual(["a", "b", "c"])
  })
})

const page = (nextCursor: string | null, ids: string[] = []) => ({
  ok: true as const,
  data: {
    changes: ids.length
      ? { patients: { created: ids.map((id) => ({ id })), updated: [], deleted: [] } }
      : {},
    next_cursor: nextCursor,
    timestamp: 1_800_000_000_000,
    progress: { table: "patients", bucket: "created", tables_remaining: 1 },
  },
})

describe("pullLoop", () => {
  const applied: string[][] = []
  const saved: unknown[] = []
  const deps = () => ({
    apply: async (changes: never) => {
      const tables = Object.values(changes as Record<string, { created: { id: string }[] }>)
      const ids = tables.flatMap((t) => t.created.map((r) => r.id))
      applied.push(ids)
      return ids.length
    },
    saveResume: async (s: unknown) => {
      saved.push(s)
    },
    onProgress: () => {},
  })

  beforeEach(() => {
    applied.length = 0
    saved.length = 0
  })

  const run = (fetchPage: unknown, startCursor: string | null, signal: AbortSignal) =>
    pullLoop({ fetchPage: fetchPage as never, since: 0, startCursor, signal, ...deps() })

  it("follows cursors until the server reports none left", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page("c1", ["a"]))
      .mockResolvedValueOnce(page("c2", ["b"]))
      .mockResolvedValueOnce(page(null, ["c"]))

    const r = await run(fetchPage, null, new AbortController().signal)

    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(applied).toEqual([["a"], ["b"], ["c"]])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.recordsApplied).toBe(3)
      expect(r.pagesApplied).toBe(3)
    }
  })

  it("resumes from a stored cursor instead of starting over", async () => {
    const fetchPage = jest.fn().mockResolvedValue(page(null))
    await run(fetchPage, "resume-me", new AbortController().signal)
    expect(fetchPage.mock.calls[0][0].cursor).toBe("resume-me")
  })

  it("persists the resume cursor after every non-final page", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page("c1", ["a"]))
      .mockResolvedValueOnce(page(null, ["b"]))

    await run(fetchPage, null, new AbortController().signal)

    expect(saved).toHaveLength(1)
    expect((saved[0] as { cursor: string }).cursor).toBe("c1")
  })

  it("stops when aborted and reports the run as resumable", async () => {
    const controller = new AbortController()
    const fetchPage = jest.fn().mockImplementation(async () => {
      controller.abort()
      return page("more", ["a"])
    })

    const r = await run(fetchPage, null, controller.signal)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resumable).toBe(true)
  })

  // withRetry reports a cancelled request as a non-retryable NETWORK_ERROR, so
  // classifying resumability from `retryable` alone would call an aborted run
  // unresumable and discard a cursor that is still perfectly good.
  it("reports an abort as resumable even when the fetch fails non-retryably", async () => {
    const controller = new AbortController()
    const fetchPage = jest.fn().mockImplementation(async () => {
      controller.abort()
      return {
        ok: false,
        error: { code: "NETWORK_ERROR", message: "Cancelled", retryable: false },
      }
    })

    const r = await run(fetchPage, null, controller.signal)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resumable).toBe(true)
  })

  it("reports a terminal error as not resumable", async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      ok: false,
      error: { code: "BAD_REQUEST", message: "bad cursor", retryable: false },
    })

    const r = await run(fetchPage, null, new AbortController().signal)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resumable).toBe(false)
  })

  it("reports an exhausted retryable error as resumable", async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      ok: false,
      error: { code: "SERVER_ERROR", message: "boom", retryable: true },
    })

    const r = await run(fetchPage, null, new AbortController().signal)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resumable).toBe(true)
  })

  it("does not apply a page whose fetch failed", async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      ok: false,
      error: { code: "SERVER_ERROR", message: "boom", retryable: true },
    })

    await run(fetchPage, null, new AbortController().signal)

    expect(applied).toEqual([])
  })

  it("does not fetch at all when already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchPage = jest.fn().mockResolvedValue(page(null))

    const r = await run(fetchPage, null, controller.signal)

    expect(fetchPage).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  // `progress` is display-only. A page missing it must not take down a run that
  // is otherwise applying data correctly.
  it("survives a page with no progress block", async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      ok: true,
      data: { changes: {}, next_cursor: null, timestamp: 1, progress: null },
    })

    const r = await run(fetchPage, null, new AbortController().signal)

    expect(r.ok).toBe(true)
  })

  it("reports the snapshot timestamp the server sent", async () => {
    const fetchPage = jest.fn().mockResolvedValue(page(null))
    const r = await run(fetchPage, null, new AbortController().signal)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.snapshotTs).toBe(1_800_000_000_000)
  })
})
