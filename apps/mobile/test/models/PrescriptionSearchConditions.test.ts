/**
 * `pickup_clinic_id` is nullable and SQL `IN` never matches NULL, so "apply no
 * clinic constraint" and "constrain to no clinic" must stay distinct: the first
 * keeps prescriptions with no pickup clinic, the second drops everything.
 */

import Prescription from "@/models/Prescription"

type Clause = ReturnType<typeof Prescription.DB.createSearchQueryConditions>[number]

const DATE = new Date("2026-08-13T09:00:00.000Z")

const build = (clinicIds: string[] | null): Clause[] =>
  Prescription.DB.createSearchQueryConditions("", clinicIds, [], DATE)

const clinicClause = (clauses: Clause[]) =>
  clauses.find(
    (clause) => (clause as { type?: string; left?: string }).left === "pickup_clinic_id",
  ) as { comparison: { operator: string; right: { values?: string[] } } } | undefined

describe("Prescription.DB.createSearchQueryConditions clinic constraint", () => {
  it("emits no pickup_clinic_id clause when the constraint is null", () => {
    expect(clinicClause(build(null))).toBeUndefined()
  })

  it("emits a clause matching nothing when the constraint is empty", () => {
    // Not the same as null: a selected region holding no clinics must show
    // nothing rather than falling back to showing everything.
    const clause = clinicClause(build([]))
    expect(clause?.comparison.operator).toBe("oneOf")
    expect(clause?.comparison.right.values).toEqual([])
  })

  it("constrains to the given clinics", () => {
    const clause = clinicClause(build(["clinic-a", "clinic-b"]))
    expect(clause?.comparison.operator).toBe("oneOf")
    expect(clause?.comparison.right.values).toEqual(["clinic-a", "clinic-b"])
  })

  it("keeps the other conditions intact either way", () => {
    // A null constraint must drop only the clinic clause, not shorten the query.
    expect(build(null)).toHaveLength(build(["clinic-a"]).length - 1)
  })
})
