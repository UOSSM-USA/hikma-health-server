import { classifyHttpStatus } from "@/rpc/types"

describe("classifyHttpStatus", () => {
  it("marks 429 retryable", () => {
    expect(classifyHttpStatus(429)).toEqual({ code: "RATE_LIMITED", retryable: true })
  })

  it("marks 500 retryable", () => {
    expect(classifyHttpStatus(500)).toEqual({ code: "SERVER_ERROR", retryable: true })
  })

  it("marks 503 retryable", () => {
    expect(classifyHttpStatus(503)).toEqual({ code: "SERVER_ERROR", retryable: true })
  })

  it("marks 401 not retryable — the caller decides whether to refresh once", () => {
    expect(classifyHttpStatus(401)).toEqual({ code: "AUTH_FAILED", retryable: false })
  })

  it("marks 403 not retryable", () => {
    expect(classifyHttpStatus(403)).toEqual({ code: "AUTH_FAILED", retryable: false })
  })

  it("marks 400 not retryable", () => {
    expect(classifyHttpStatus(400)).toEqual({ code: "BAD_REQUEST", retryable: false })
  })

  it("marks 422 not retryable", () => {
    expect(classifyHttpStatus(422)).toEqual({ code: "BAD_REQUEST", retryable: false })
  })

  it("treats an unknown 4xx as a terminal bad request", () => {
    expect(classifyHttpStatus(418)).toEqual({ code: "BAD_REQUEST", retryable: false })
  })

  // A 2xx reaching the classifier means a caller checked `!response.ok` wrongly.
  // Reporting it as retryable would spin forever on a response that will never
  // change, so it lands in the terminal bucket with everything else unmapped.
  it("treats a success status as terminal rather than retryable", () => {
    expect(classifyHttpStatus(200)).toEqual({ code: "BAD_REQUEST", retryable: false })
  })

  // 408 and 425 are the two 4xx the server can resolve on its own — the request
  // timed out or arrived too early. Retrying the identical request is exactly
  // the documented remedy for both.
  it("marks 408 retryable", () => {
    expect(classifyHttpStatus(408)).toEqual({ code: "TIMEOUT", retryable: true })
  })

  it("marks 425 retryable", () => {
    expect(classifyHttpStatus(425)).toEqual({ code: "SERVER_ERROR", retryable: true })
  })
})
