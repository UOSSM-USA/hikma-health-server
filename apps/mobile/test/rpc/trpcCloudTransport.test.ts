import { createTrpcCloudTransport } from "@/rpc/transport"

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null },
})

const makeTransport = (auth: () => string | Promise<string> = () => "Bearer tok") =>
  createTrpcCloudTransport("https://api.test", auth)

describe("createTrpcCloudTransport — tRPC wire format", () => {
  let fetchMock: jest.Mock
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okJson({ result: { data: { json: { hi: 1 } } } }))
    global.fetch = fetchMock as any
  })

  it("sends a query as GET with the procedure in the path", async () => {
    await makeTransport().sendQuery("sync.backfillPull", { since: 0 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("https://api.test/rpc/query/sync.backfillPull")
    expect(init.method ?? "GET").toBe("GET")
  })

  it("superjson-wraps query input in the ?input= parameter", async () => {
    await makeTransport().sendQuery("sync.backfillPull", { since: 42, cursor: null })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(JSON.parse(url.searchParams.get("input")!)).toEqual({
      json: { since: 42, cursor: null },
    })
  })

  it("sends a command as POST with the procedure in the path", async () => {
    await makeTransport().sendCommand("sync.backfillPush", { changes: {} })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.test/rpc/command/sync.backfillPush")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ json: { changes: {} } })
  })

  it("unwraps the superjson result envelope", async () => {
    const r = await makeTransport().sendQuery<{ hi: number }>("sync.backfillPull", {})
    expect(r).toEqual({ ok: true, data: { hi: 1 } })
  })

  it("sends the bearer token", async () => {
    await makeTransport().sendQuery("sync.backfillPull", {})
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok")
  })

  it("awaits an async auth provider", async () => {
    await makeTransport(async () => "Bearer fresh").sendQuery("sync.backfillPull", {})
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer fresh")
  })

  // The server tags every timestamp column of every row in `meta.values`. The
  // transport deliberately returns the `json` half untouched — dates stay ISO
  // strings — because `superjson` is not a declared mobile dependency and
  // `updateDates` already normalises ISO to epoch for WatermelonDB. What must
  // never happen is the caller receiving the `{json, meta}` wrapper itself.
  it("returns the json half, not the wrapper, when meta is present", async () => {
    fetchMock.mockResolvedValue(
      okJson({
        result: {
          data: {
            json: {
              changes: {
                patients: { created: [{ id: "p1", created_at: "2026-08-05T00:00:00.000Z" }] },
              },
            },
            meta: { values: { "changes.patients.created.0.created_at": ["Date"] } },
          },
        },
      }),
    )
    const r = await makeTransport().sendQuery<any>("sync.backfillPull", {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).not.toHaveProperty("meta")
    expect(r.data.changes.patients.created[0].created_at).toBe("2026-08-05T00:00:00.000Z")
  })

  // A procedure returning null yields {result:{data:{json:null}}}. A `??`
  // fallback treats that as "no json half" and hands back the wrapper instead.
  it("returns null for a procedure whose result is null", async () => {
    fetchMock.mockResolvedValue(okJson({ result: { data: { json: null } } }))
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    expect(r).toEqual({ ok: true, data: null })
  })

  it("classifies a 429 as retryable and surfaces Retry-After", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "slow down",
      headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? "3" : null) },
    })
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe("RATE_LIMITED")
    expect(r.error.retryable).toBe(true)
    expect(r.error.retryAfterMs).toBe(3000)
    expect(r.error.status).toBe(429)
  })

  // Anything that is not a positive number of seconds is dropped rather than
  // propagated. A negative value is the case worth pinning: it survives a plain
  // truthiness check and reaches the caller as a negative delay.
  it.each([
    ["unparseable", "later"],
    ["absent", null],
    ["negative", "-5"],
    ["zero", "0"],
  ])("omits retryAfterMs when Retry-After is %s", async (_label, header) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "slow down",
      headers: { get: () => header },
    })
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    if (r.ok) return
    expect(r.error.retryAfterMs).toBeUndefined()
  })

  // A non-ok tRPC response carries a full error envelope whose `stack` includes
  // absolute server paths. Using the raw body as the message ships that into
  // mobile logs and Sentry. Observed live against a real server.
  it("extracts the message from a tRPC error envelope rather than dumping the body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          error: {
            json: {
              message: "Malformed sync cursor",
              code: -32600,
              data: {
                code: "BAD_REQUEST",
                httpStatus: 400,
                stack: "TRPCError: …\n    at /Users/someone/server/src/init.ts:68:11",
              },
            },
          },
        }),
    })
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    if (r.ok) return
    expect(r.error.message).toBe("Malformed sync cursor")
    expect(r.error.message).not.toContain("stack")
    expect(r.error.message).not.toContain("/Users/")
  })

  it("falls back to the raw body when it is not a tRPC envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => '{"error":"Too many requests. Please try again later."}',
    })
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    if (r.ok) return
    expect(r.error.message).toContain("Too many requests")
  })

  it("classifies a 400 as terminal", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad cursor",
      headers: { get: () => null },
    })
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    if (r.ok) return
    expect(r.error.retryable).toBe(false)
  })

  it("marks a thrown network failure retryable", async () => {
    fetchMock.mockRejectedValue(new Error("Network request failed"))
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    if (r.ok) return
    expect(r.error.code).toBe("NETWORK_ERROR")
    expect(r.error.retryable).toBe(true)
  })

  it("surfaces a tRPC error envelope as a terminal error", async () => {
    fetchMock.mockResolvedValue(
      okJson({ error: { json: { message: "Invalid sync cursor", code: -32600 } } }),
    )
    const r = await makeTransport().sendQuery("sync.backfillPull", {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain("Invalid sync cursor")
    expect(r.error.retryable).toBe(false)
  })

  // `heartbeat` is a query procedure on the tRPC router, so it moves from the
  // legacy `/rpc/heartbeat` to `/rpc/query/heartbeat`. The old path 404s.
  it("hits heartbeat as a query procedure", async () => {
    const ok = await makeTransport().heartbeat()
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/rpc/query/heartbeat")
    expect(ok).toBe(true)
  })

  it("reports heartbeat failure rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("Network request failed"))
    await expect(makeTransport().heartbeat()).resolves.toBe(false)
  })

  it("posts login without an Authorization header", async () => {
    fetchMock.mockResolvedValue(okJson({ result: { data: { json: { token: "t" } } } }))
    await makeTransport().login("a@b.c", "pw")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.test/rpc/command/login")
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body)).toEqual({ json: { email: "a@b.c", password: "pw" } })
  })
})
