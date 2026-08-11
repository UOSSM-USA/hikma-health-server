/**
 * A visit whose `clinic_id` points at a clinic that is not on the device must
 * still render.
 *
 * `Visit.clinic` is an `@immutableRelation`, so a dangling or absent id makes
 * its observable error, and `withObservables` re-throws that during render —
 * taking down the whole screen through the error boundary, not just the row.
 */

import { Database } from "@nozbe/watermelondb"

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"
import { render } from "../helpers/renderWithProviders"

import ClinicModel from "@/db/model/Clinic"
import VisitModel from "@/db/model/Visit"
import { PatientVisitItem } from "@/components/PatientVisitItem"

let db: Database

const CHECKED_IN_AT = new Date("2026-08-13T09:00:00.000Z").getTime()

/** Writes a visit row directly, as sync would leave it. */
async function seedVisit(clinicId: string | null): Promise<VisitModel> {
  return db.write(async () =>
    db.get<VisitModel>("visits").create((row) => {
      const raw = row._raw as any
      raw.clinic_id = clinicId
      raw.patient_id = "patient-1"
      raw.provider_id = "provider-1"
      raw.provider_name = "Dr. Ada"
      raw.check_in_timestamp = CHECKED_IN_AT
      raw.is_deleted = false
    }),
  )
}

async function seedClinic(name: string): Promise<ClinicModel> {
  return db.write(async () =>
    db.get<ClinicModel>("clinics").create((row) => {
      const raw = row._raw as any
      raw.name = name
      raw.is_deleted = false
      raw.is_archived = false
    }),
  )
}

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(async () => {
  await resetTestDatabase(db)
})

describe("PatientVisitItem with an unresolvable clinic", () => {
  it("renders a visit whose clinic is missing from the device", async () => {
    const visit = await seedVisit("12cec534-6dd4-11ef-bcb7-3d1c6bf6e95a")

    const { findByTestId } = render(
      <PatientVisitItem visit={visit} onPress={jest.fn()} onDelete={jest.fn()} />,
    )

    expect(await findByTestId("visitItem")).toBeTruthy()
  })

  it("renders a visit that has no clinic at all", async () => {
    const visit = await seedVisit(null)

    const { findByTestId } = render(
      <PatientVisitItem visit={visit} onPress={jest.fn()} onDelete={jest.fn()} />,
    )

    expect(await findByTestId("visitItem")).toBeTruthy()
  })

  it("still shows the clinic name when the clinic is present", async () => {
    const clinic = await seedClinic("Nairobi Central")
    const visit = await seedVisit(clinic.id)

    const { findByText } = render(
      <PatientVisitItem visit={visit} onPress={jest.fn()} onDelete={jest.fn()} />,
    )

    expect(await findByText(/Nairobi Central/)).toBeTruthy()
  })
})
