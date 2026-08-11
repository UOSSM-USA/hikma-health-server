import { sanitizeAppConfigClinicIds } from "@/db/model/AppConfig"

describe("sanitizeAppConfigClinicIds", () => {
  it("maps null to null so the row applies to all clinics", () => {
    expect(sanitizeAppConfigClinicIds(null)).toBeNull()
  })

  it("maps undefined to null so the row applies to all clinics", () => {
    expect(sanitizeAppConfigClinicIds(undefined)).toBeNull()
  })

  it("preserves an empty array, which applies to NO clinic", () => {
    expect(sanitizeAppConfigClinicIds([])).toEqual([])
  })

  it("preserves a populated array", () => {
    expect(sanitizeAppConfigClinicIds(["a", "b"])).toEqual(["a", "b"])
  })

  it("drops non-string members", () => {
    expect(sanitizeAppConfigClinicIds(["a", 3, null, "b"])).toEqual(["a", "b"])
  })

  it("fails open on a corrupt value", () => {
    // WatermelonDB's @json getter calls sanitizer(null) when JSON.parse throws,
    // so corrupt is indistinguishable from absent. Failing open — applying
    // everywhere — matches today's behaviour.
    expect(sanitizeAppConfigClinicIds("not-an-array")).toBeNull()
    expect(sanitizeAppConfigClinicIds({ nope: true })).toBeNull()
  })

  it("does NOT collapse null to [] the way event_forms does", () => {
    // event_forms.clinic_ids means "empty = all clinics", so reusing its
    // sanitizer here would make every pre-existing row apply to ZERO clinics.
    expect(sanitizeAppConfigClinicIds(null)).not.toEqual([])
  })
})
