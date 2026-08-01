/**
 * Closes the loop on Task 2a's wire-format decision.
 *
 * `createTrpcCloudTransport` deliberately returns superjson's `json` half
 * without deserialising, so every timestamp arrives as an ISO string. That is
 * only safe because `updateDates` converts ISO to the epoch numbers WatermelonDB
 * stores. This asserts the second half against a payload shaped exactly like one
 * captured from the real server — otherwise the two halves could drift and the
 * symptom would be silent per-field corruption.
 */

import * as Sentry from "@sentry/react-native"

import { updateDates } from "@/db/syncNormalize"

jest.mock("@sentry/react-native", () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}))

// Verbatim shapes from a live `sync.backfillPull` — ISO-8601 with milliseconds
// and a `Z` offset, which is what Postgres `timestamptz` serialises to.
const SERVER_PAGE = () => ({
  patients: {
    created: [
      {
        id: "p1",
        given_name: "Idris",
        created_at: "2025-02-10T20:43:52.926Z",
        updated_at: "2026-08-04T22:02:46.532Z",
      },
    ],
    updated: [],
    deleted: [],
  },
  visits: {
    created: [
      {
        id: "v1",
        created_at: "2025-02-10T20:43:52.926Z",
        updated_at: "2025-02-10T20:43:52.926Z",
        check_in_timestamp: "2025-02-10T20:43:52.926Z",
      },
    ],
    updated: [],
    deleted: ["v-gone"],
  },
})

describe("a real backfillPull page survives updateDates", () => {
  beforeEach(() => jest.clearAllMocks())

  it("converts every ISO timestamp to an epoch number", () => {
    const page = SERVER_PAGE() as any
    updateDates(page)

    const patient = page.patients.created[0]
    expect(typeof patient.created_at).toBe("number")
    expect(patient.created_at).toBe(new Date("2025-02-10T20:43:52.926Z").getTime())
    expect(patient.updated_at).toBe(new Date("2026-08-04T22:02:46.532Z").getTime())

    const visit = page.visits.created[0]
    expect(typeof visit.check_in_timestamp).toBe("number")
    expect(visit.check_in_timestamp).toBe(new Date("2025-02-10T20:43:52.926Z").getTime())
  })

  // Every fallback reports to Sentry, so a conversion the transport's format
  // silently defeats shows up here rather than as a plausible-looking wrong date.
  it("takes no fallback path — no date is guessed", () => {
    updateDates(SERVER_PAGE() as any)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it("leaves the deleted bucket's string ids alone", () => {
    const page = SERVER_PAGE() as any
    updateDates(page)
    expect(page.visits.deleted).toEqual(["v-gone"])
  })
})
