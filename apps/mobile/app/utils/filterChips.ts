/**
 * Describes a screen's active filters as removable chips.
 *
 * A dimension is "active" only when it differs from that screen's default, so
 * that clearing every filter leaves no chips behind. The provider's own clinic
 * is the default scope rather than a filter; selecting "All clinics" is a
 * deliberate widening and does get a chip.
 *
 * Imports here are type-only on purpose — the filter types live alongside hooks
 * that import `@/db`, and pulling that in would make this module untestable.
 */

import { upperFirst } from "es-toolkit"

import type { AppointmentsFilters } from "@/hooks/useDBAppointmentsFilter"
import type { PrescriptionsFilters } from "@/hooks/useDBPrescriptionsFilter"

export type FilterChip<TFilters> = {
  /** Prefixed by dimension: a clinic and a city can share a display label. */
  key: string
  label: string
  /** Applied via `onFiltersChange` to clear this one filter. */
  clear: Partial<TFilters>
}

/** Anything with a display name, so callers pass their DB models unchanged. */
export type NamedRecord = {
  id: string
  name: string
}

const ALL_CLINICS_LABEL = "All clinics"

/** `checked_in` reads as `Checked in`. */
const humanize = (value: string): string => upperFirst(value.replaceAll("_", " "))

const nameOf = (records: readonly NamedRecord[], id: string): string | null =>
  records.find((record) => record.id === id)?.name ?? null

/**
 * The country, city and clinic dimensions, which both screens share.
 * `defaultClinicId` is the provider's own clinic — the scope the screen opens
 * with, and so not itself a filter.
 */
const locationChips = <TFilters extends { country: string; city: string; clinicId: string }>(
  filters: TFilters,
  clinics: readonly NamedRecord[],
  defaultClinicId: string,
): FilterChip<TFilters>[] => {
  const chips: FilterChip<TFilters>[] = []

  if (filters.country) {
    chips.push({
      key: `country:${filters.country}`,
      label: filters.country,
      clear: { country: "" } as Partial<TFilters>,
    })
  }

  if (filters.city) {
    chips.push({
      key: `city:${filters.city}`,
      label: filters.city,
      clear: { city: "" } as Partial<TFilters>,
    })
  }

  if (filters.clinicId !== defaultClinicId) {
    // Clearing restores the provider's clinic rather than emptying the field,
    // returning the screen to its default scope instead of widening it further.
    chips.push({
      key: `clinic:${filters.clinicId || "all"}`,
      label: filters.clinicId ? (nameOf(clinics, filters.clinicId) ?? "Clinic") : ALL_CLINICS_LABEL,
      clear: { clinicId: defaultClinicId } as Partial<TFilters>,
    })
  }

  return chips
}

export const DEFAULT_APPOINTMENT_STATUS = "pending"

export const DEFAULT_PRESCRIPTION_STATUSES = ["pending"]

export const describeAppointmentFilters = (
  filters: AppointmentsFilters,
  options: {
    clinics: readonly NamedRecord[]
    departments: readonly NamedRecord[]
    defaultClinicId: string
  },
): FilterChip<AppointmentsFilters>[] => {
  const chips = locationChips(filters, options.clinics, options.defaultClinicId)

  if (filters.status !== DEFAULT_APPOINTMENT_STATUS) {
    // "all" is the no-status-filter sentinel, so clearing resolves to it rather
    // than back to the default status.
    chips.push({
      key: `status:${filters.status}`,
      label: humanize(filters.status),
      clear: { status: "all" },
    })
  }

  for (const departmentId of filters.departmentIds) {
    chips.push({
      key: `department:${departmentId}`,
      label: nameOf(options.departments, departmentId) ?? "Department",
      clear: {
        departmentIds: filters.departmentIds.filter((id) => id !== departmentId),
      },
    })
  }

  return chips
}

export const describePrescriptionFilters = (
  filters: PrescriptionsFilters,
  options: {
    clinics: readonly NamedRecord[]
    defaultClinicId: string
  },
): FilterChip<PrescriptionsFilters>[] => {
  const chips = locationChips(filters, options.clinics, options.defaultClinicId)

  const isDefaultStatus =
    filters.status.length === DEFAULT_PRESCRIPTION_STATUSES.length &&
    filters.status.every((status) => DEFAULT_PRESCRIPTION_STATUSES.includes(status))

  if (!isDefaultStatus) {
    for (const status of filters.status) {
      chips.push({
        key: `status:${status}`,
        label: humanize(status),
        clear: { status: filters.status.filter((other) => other !== status) },
      })
    }
  }

  return chips
}
