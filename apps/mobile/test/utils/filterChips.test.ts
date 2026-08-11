/**
 * Chips drive the count badge and whether "Clear all" is offered, so the
 * activation rule matters: a dimension is a filter only when it differs from
 * the screen's default, and clearing everything must leave no chips.
 */

import { startOfDay } from "date-fns"

import type { AppointmentsFilters } from "@/hooks/useDBAppointmentsFilter"
import type { PrescriptionsFilters } from "@/hooks/useDBPrescriptionsFilter"
import {
  describeAppointmentFilters,
  describePrescriptionFilters,
  type NamedRecord,
} from "@/utils/filterChips"

const CLINICS: NamedRecord[] = [
  { id: "clinic-a", name: "Nairobi Central" },
  { id: "clinic-b", name: "Mombasa West" },
]

const DEPARTMENTS: NamedRecord[] = [
  { id: "dept-1", name: "Pediatrics" },
  { id: "dept-2", name: "Maternity" },
]

const DEFAULT_CLINIC = "clinic-a"

const appointmentFilters = (overrides: Partial<AppointmentsFilters> = {}): AppointmentsFilters => ({
  status: "pending",
  date: startOfDay(new Date("2026-08-13T00:00:00.000Z")),
  clinicId: DEFAULT_CLINIC,
  country: "",
  city: "",
  searchQuery: "",
  departmentIds: [],
  ...overrides,
})

const prescriptionFilters = (
  overrides: Partial<PrescriptionsFilters> = {},
): PrescriptionsFilters => ({
  status: ["pending"],
  date: startOfDay(new Date("2026-08-13T00:00:00.000Z")),
  clinicId: DEFAULT_CLINIC,
  country: "",
  city: "",
  searchQuery: "",
  ...overrides,
})

const describeAppointments = (overrides: Partial<AppointmentsFilters> = {}) =>
  describeAppointmentFilters(appointmentFilters(overrides), {
    clinics: CLINICS,
    departments: DEPARTMENTS,
    defaultClinicId: DEFAULT_CLINIC,
  })

const describePrescriptions = (overrides: Partial<PrescriptionsFilters> = {}) =>
  describePrescriptionFilters(prescriptionFilters(overrides), {
    clinics: CLINICS,
    defaultClinicId: DEFAULT_CLINIC,
  })

describe("describeAppointmentFilters", () => {
  it("returns no chips for the screen's defaults", () => {
    expect(describeAppointments()).toEqual([])
  })

  it("does not chip the provider's own clinic", () => {
    expect(describeAppointments({ clinicId: DEFAULT_CLINIC })).toEqual([])
  })

  it("chips a different clinic, by name", () => {
    const chips = describeAppointments({ clinicId: "clinic-b" })
    expect(chips.map((chip) => chip.label)).toEqual(["Mombasa West"])
    expect(chips[0].clear).toEqual({ clinicId: DEFAULT_CLINIC })
  })

  it("chips 'All clinics' as a deliberate widening", () => {
    const chips = describeAppointments({ clinicId: "" })
    expect(chips.map((chip) => chip.label)).toEqual(["All clinics"])
  })

  it("chips country and city", () => {
    const chips = describeAppointments({ country: "Kenya", city: "Nairobi" })
    expect(chips.map((chip) => chip.label)).toEqual(["Kenya", "Nairobi"])
    expect(chips.map((chip) => chip.clear)).toEqual([{ country: "" }, { city: "" }])
  })

  it("chips a non-default status and clears it to the no-filter sentinel", () => {
    const chips = describeAppointments({ status: "checked_in" })
    expect(chips.map((chip) => chip.label)).toEqual(["Checked in"])
    // Not back to "pending" — clearing a filter must not apply a different one.
    expect(chips[0].clear).toEqual({ status: "all" })
  })

  it("chips each department, clearing only that one", () => {
    const chips = describeAppointments({ departmentIds: ["dept-1", "dept-2"] })
    expect(chips.map((chip) => chip.label)).toEqual(["Pediatrics", "Maternity"])
    expect(chips[0].clear).toEqual({ departmentIds: ["dept-2"] })
    expect(chips[1].clear).toEqual({ departmentIds: ["dept-1"] })
  })

  it("keys chips by dimension so colliding labels stay unique", () => {
    // A clinic named after its own city would otherwise duplicate React keys.
    const chips = describeAppointmentFilters(
      appointmentFilters({ city: "Nairobi", clinicId: "clinic-x" }),
      {
        clinics: [{ id: "clinic-x", name: "Nairobi" }],
        departments: [],
        defaultClinicId: DEFAULT_CLINIC,
      },
    )
    expect(chips.map((chip) => chip.label)).toEqual(["Nairobi", "Nairobi"])
    expect(new Set(chips.map((chip) => chip.key)).size).toBe(2)
  })

  it("falls back to a generic label for an unknown clinic or department", () => {
    const chips = describeAppointments({ clinicId: "gone", departmentIds: ["missing"] })
    expect(chips.map((chip) => chip.label)).toEqual(["Clinic", "Department"])
  })
})

describe("describePrescriptionFilters", () => {
  it("returns no chips for the screen's defaults", () => {
    expect(describePrescriptions()).toEqual([])
  })

  it("chips each selected status once the selection differs from the default", () => {
    const chips = describePrescriptions({ status: ["pending", "picked_up"] })
    expect(chips.map((chip) => chip.label)).toEqual(["Pending", "Picked up"])
    expect(chips[0].clear).toEqual({ status: ["picked_up"] })
  })

  it("chips an empty status selection as no chips, since it filters nothing", () => {
    // An empty array means "every status" in the query builder, so it is not an
    // active filter.
    expect(describePrescriptions({ status: [] })).toEqual([])
  })

  it("chips location dimensions the same way as appointments", () => {
    const chips = describePrescriptions({ country: "Kenya", clinicId: "" })
    expect(chips.map((chip) => chip.label)).toEqual(["Kenya", "All clinics"])
  })
})
