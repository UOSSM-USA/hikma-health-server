import Clinic from "../../app/models/Clinic"

type LocationFields = Clinic.LocationFields

const clinic = (id: string, country: string | null, city: string | null): LocationFields => ({
  id,
  country,
  city,
})

const CLINICS: LocationFields[] = [
  clinic("a", "Kenya", "Nairobi"),
  clinic("b", "Kenya", "Nairobi"),
  clinic("c", "Kenya", "Mombasa"),
  clinic("d", "Uganda", "Kampala"),
  clinic("e", null, null),
  clinic("f", "  ", "   "),
  clinic("g", "  Kenya  ", "  Nairobi  "),
]

describe("Clinic.countryOptions", () => {
  it("returns distinct, sorted, non-blank countries", () => {
    expect(Clinic.countryOptions(CLINICS)).toEqual(["Kenya", "Uganda"])
  })

  it("returns an empty list when no clinic has a country", () => {
    expect(Clinic.countryOptions([clinic("a", null, "Nairobi")])).toEqual([])
  })
})

describe("Clinic.cityOptions", () => {
  it("returns every city when no country is selected", () => {
    expect(Clinic.cityOptions(CLINICS, "")).toEqual(["Kampala", "Mombasa", "Nairobi"])
  })

  it("restricts cities to the selected country", () => {
    expect(Clinic.cityOptions(CLINICS, "Kenya")).toEqual(["Mombasa", "Nairobi"])
  })

  it("returns an empty list for a country with no clinics", () => {
    expect(Clinic.cityOptions(CLINICS, "Tanzania")).toEqual([])
  })
})

describe("Clinic.clinicsIn", () => {
  it("returns every clinic when nothing is selected", () => {
    expect(Clinic.clinicsIn(CLINICS, "", "").map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ])
  })

  it("filters by country alone", () => {
    expect(Clinic.clinicsIn(CLINICS, "Kenya", "").map((c) => c.id)).toEqual(["a", "b", "c", "g"])
  })

  it("filters by city alone", () => {
    expect(Clinic.clinicsIn(CLINICS, "", "Nairobi").map((c) => c.id)).toEqual(["a", "b", "g"])
  })

  it("filters by country and city together", () => {
    expect(Clinic.clinicsIn(CLINICS, "Kenya", "Mombasa").map((c) => c.id)).toEqual(["c"])
  })

  it("matches on the trimmed stored value", () => {
    expect(Clinic.clinicsIn(CLINICS, "Kenya", "Nairobi").map((c) => c.id)).toContain("g")
  })
})

describe("Clinic.resolveClinicIds", () => {
  it("returns every clinic id when nothing is selected", () => {
    const ids = Clinic.resolveClinicIds(CLINICS, { country: "", city: "", clinicId: "" })
    expect(ids).toEqual(["a", "b", "c", "d", "e", "f", "g"])
  })

  it("returns every clinic in the selected country", () => {
    const ids = Clinic.resolveClinicIds(CLINICS, { country: "Kenya", city: "", clinicId: "" })
    expect(ids).toEqual(["a", "b", "c", "g"])
  })

  it("returns every clinic in the selected city", () => {
    const ids = Clinic.resolveClinicIds(CLINICS, {
      country: "Kenya",
      city: "Nairobi",
      clinicId: "",
    })
    expect(ids).toEqual(["a", "b", "g"])
  })

  it("lets a specific clinic win over its region", () => {
    const ids = Clinic.resolveClinicIds(CLINICS, { country: "Kenya", city: "", clinicId: "c" })
    expect(ids).toEqual(["c"])
  })

  it("returns the selected clinic even when the clinic list has not loaded", () => {
    expect(Clinic.resolveClinicIds([], { country: "", city: "", clinicId: "a" })).toEqual(["a"])
  })

  it("returns an empty list when a region has no clinics", () => {
    const ids = Clinic.resolveClinicIds(CLINICS, { country: "Tanzania", city: "", clinicId: "" })
    expect(ids).toEqual([])
  })
})

describe("Clinic.resolveClinicIdConstraint", () => {
  it("applies no constraint when nothing is selected", () => {
    expect(
      Clinic.resolveClinicIdConstraint(CLINICS, { country: "", city: "", clinicId: "" }),
    ).toBeNull()
  })

  it("constrains to nothing when a region has no clinics", () => {
    // Distinct from the unselected case above: a nullable clinic column keeps
    // its NULL rows when unconstrained and drops them when constrained.
    expect(
      Clinic.resolveClinicIdConstraint(CLINICS, { country: "Tanzania", city: "", clinicId: "" }),
    ).toEqual([])
  })

  it("constrains to the clinics of the selected country", () => {
    expect(
      Clinic.resolveClinicIdConstraint(CLINICS, { country: "Kenya", city: "", clinicId: "" }),
    ).toEqual(["a", "b", "c", "g"])
  })

  it("constrains to the clinics of the selected city", () => {
    expect(
      Clinic.resolveClinicIdConstraint(CLINICS, { country: "", city: "Mombasa", clinicId: "" }),
    ).toEqual(["c"])
  })

  it("lets a specific clinic win over its region", () => {
    expect(
      Clinic.resolveClinicIdConstraint(CLINICS, { country: "Kenya", city: "", clinicId: "c" }),
    ).toEqual(["c"])
  })

  it("constrains to the selected clinic even when the clinic list has not loaded", () => {
    expect(Clinic.resolveClinicIdConstraint([], { country: "", city: "", clinicId: "a" })).toEqual([
      "a",
    ])
  })
})

describe("Clinic.pruneLocationSelection", () => {
  it("leaves a consistent selection alone", () => {
    const selection = { country: "Kenya", city: "Nairobi", clinicId: "a" }
    expect(Clinic.pruneLocationSelection(CLINICS, selection)).toEqual(selection)
  })

  it("clears a city that the new country does not contain", () => {
    const selection = { country: "Uganda", city: "Nairobi", clinicId: "" }
    expect(Clinic.pruneLocationSelection(CLINICS, selection)).toEqual({
      country: "Uganda",
      city: "",
      clinicId: "",
    })
  })

  it("clears a clinic that the new country does not contain", () => {
    const selection = { country: "Uganda", city: "", clinicId: "a" }
    expect(Clinic.pruneLocationSelection(CLINICS, selection)).toEqual({
      country: "Uganda",
      city: "",
      clinicId: "",
    })
  })

  it("clears a clinic that the new city does not contain", () => {
    const selection = { country: "Kenya", city: "Mombasa", clinicId: "a" }
    expect(Clinic.pruneLocationSelection(CLINICS, selection)).toEqual({
      country: "Kenya",
      city: "Mombasa",
      clinicId: "",
    })
  })

  it("clears a stale city before validating the clinic against it", () => {
    const selection = { country: "Uganda", city: "Nairobi", clinicId: "d" }
    expect(Clinic.pruneLocationSelection(CLINICS, selection)).toEqual({
      country: "Uganda",
      city: "",
      clinicId: "d",
    })
  })

  it("leaves the selection untouched while the clinic list is still loading", () => {
    const selection = { country: "Kenya", city: "Nairobi", clinicId: "a" }
    expect(Clinic.pruneLocationSelection([], selection)).toEqual(selection)
  })
})
