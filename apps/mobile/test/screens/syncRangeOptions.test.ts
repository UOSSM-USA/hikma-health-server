/**
 * The ranges a manual sync can be started for.
 *
 * The old date input had two failure modes this replaces: a local-vs-UTC round
 * trip between its formatter and parser, and a parser that returned 0 — "the
 * entire database" — for anything unreadable, while the confirmation dialog
 * quoted the user's typo back at them as though it had been understood. Nothing
 * here may fall back to the widest range; unreadable input throws.
 */

import { SYNC_RANGES, rangeToSinceDays } from "@/screens/syncSettingsHelpers"

describe("sync range options", () => {
  it("offers exactly the agreed presets in order", () => {
    expect(SYNC_RANGES.map((r) => r.id)).toEqual([
      "24h",
      "3d",
      "7d",
      "14d",
      "30d",
      "3mo",
      "everything",
    ])
  })

  it("maps each preset to a whole number of days", () => {
    expect(rangeToSinceDays("24h")).toBe(1)
    expect(rangeToSinceDays("3d")).toBe(3)
    expect(rangeToSinceDays("7d")).toBe(7)
    expect(rangeToSinceDays("14d")).toBe(14)
    expect(rangeToSinceDays("30d")).toBe(30)
    expect(rangeToSinceDays("3mo")).toBe(90)
  })

  it("maps everything to null, meaning no lower bound", () => {
    expect(rangeToSinceDays("everything")).toBeNull()
  })

  it("uses the custom day count when the custom range is selected", () => {
    expect(rangeToSinceDays("custom", 45)).toBe(45)
  })

  it("rejects a non-positive custom day count rather than defaulting to everything", () => {
    expect(() => rangeToSinceDays("custom", 0)).toThrow()
    expect(() => rangeToSinceDays("custom", -5)).toThrow()
  })

  it("rejects a non-integer custom day count", () => {
    expect(() => rangeToSinceDays("custom", 1.5)).toThrow()
  })

  it("rejects a missing custom day count", () => {
    expect(() => rangeToSinceDays("custom")).toThrow()
  })

  // NaN is what `Number("")` and `Number("abc")` produce, so it is the shape a
  // typo actually arrives in.
  it("rejects a custom day count that is not a number at all", () => {
    expect(() => rangeToSinceDays("custom", NaN)).toThrow()
    expect(() => rangeToSinceDays("custom", Infinity)).toThrow()
  })

  it("rejects an unknown range id rather than silently syncing everything", () => {
    expect(() => rangeToSinceDays("last-tuesday")).toThrow()
    expect(() => rangeToSinceDays("")).toThrow()
  })

  // Every preset is offered to the user by label, so a blank one is a dead row.
  it("labels every preset", () => {
    for (const range of SYNC_RANGES) {
      expect(range.label.length).toBeGreaterThan(0)
    }
  })

  // "Everything" is the only unbounded option; a second one would make the
  // distinct confirmation prompt miss a case.
  it("has exactly one unbounded range", () => {
    expect(SYNC_RANGES.filter((r) => r.days === null).map((r) => r.id)).toEqual(["everything"])
  })

  it("orders the bounded presets from narrowest to widest", () => {
    const days = SYNC_RANGES.filter((r) => r.days !== null).map((r) => r.days as number)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })

  it("resolves every offered preset without throwing", () => {
    for (const range of SYNC_RANGES) {
      expect(rangeToSinceDays(range.id)).toBe(range.days)
    }
  })
})
