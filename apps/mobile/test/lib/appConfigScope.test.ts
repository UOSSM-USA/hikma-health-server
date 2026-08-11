import { appliesToClinic } from "@/utils/appConfigScope"

describe("appliesToClinic", () => {
  it("applies everywhere when clinicIds is null", () => {
    expect(appliesToClinic(null, "clinic-a")).toBe(true)
  })

  it("applies even with no current clinic when clinicIds is null", () => {
    expect(appliesToClinic(null, null)).toBe(true)
  })

  it("applies nowhere when clinicIds is an empty array", () => {
    expect(appliesToClinic([], "clinic-a")).toBe(false)
    expect(appliesToClinic([], null)).toBe(false)
  })

  it("applies to a listed clinic", () => {
    expect(appliesToClinic(["clinic-a", "clinic-b"], "clinic-b")).toBe(true)
  })

  it("does not apply to an unlisted clinic", () => {
    expect(appliesToClinic(["clinic-a"], "clinic-b")).toBe(false)
  })

  it("does not apply to a scoped row when the device has no clinic", () => {
    expect(appliesToClinic(["clinic-a"], null)).toBe(false)
  })
})
