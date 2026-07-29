import ICDEntry from "../../app/models/ICDEntry"

describe("ICDEntry.freeTextCode", () => {
  it("marks the code as locally minted rather than from the catalogue", () => {
    expect(ICDEntry.freeTextCode().startsWith(ICDEntry.FREE_TEXT_CODE_PREFIX)).toBe(true)
  })

  // Two free-text diagnoses that collided would be one problem on the chart,
  // and removing either would remove both.
  it("never repeats a code", () => {
    const codes = new Set(Array.from({ length: 500 }, () => ICDEntry.freeTextCode()))

    expect(codes.size).toBe(500)
  })

  // `problem_code` is varchar(100) on the server.
  it("fits the problem_code column", () => {
    expect(ICDEntry.freeTextCode().length).toBeLessThanOrEqual(100)
  })
})
