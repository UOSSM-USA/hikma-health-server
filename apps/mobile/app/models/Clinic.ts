import ClinicModel from "@/db/model/Clinic"
import ClinicDepartmentModel from "@/db/model/ClinicDepartment"
import { Option } from "effect"

namespace Clinic {
  export type T = {
    id: string
    name: string
    country: Option.Option<string>
    city: Option.Option<string>
    address: Option.Option<string>
    isDeleted: boolean
    createdAt: Date
    updatedAt: Date
    deletedAt: Option.Option<Date>
  }

  export type DBClinic = ClinicModel
  export type DBClinicDepartment = ClinicDepartmentModel

  /** Default empty Clinic Item */
  export const empty: T = {
    id: "",
    name: "",
    country: Option.none(),
    city: Option.none(),
    address: Option.none(),
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: Option.none(),
  }

  /**
   * `DBClinic` satisfies this structurally, so callers pass their WatermelonDB
   * models unchanged while the selectors stay free of storage types.
   */
  export type LocationFields = {
    id: string
    country: string | null
    city: string | null
  }

  /** A country/city/clinic filter selection. An empty string means "unset". */
  export type LocationSelection = {
    country: string
    city: string
    clinicId: string
  }

  const normalize = (value: string | null | undefined): string => value?.trim() ?? ""

  const distinctSorted = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort()

  /** Distinct, sorted, non-blank countries across the given clinics. */
  export const countryOptions = (clinics: readonly LocationFields[]): string[] =>
    distinctSorted(clinics.map((clinic) => normalize(clinic.country)))

  /** Distinct, sorted, non-blank cities. An unset country offers every city. */
  export const cityOptions = (clinics: readonly LocationFields[], country: string): string[] =>
    distinctSorted(
      clinics
        .filter((clinic) => !country || normalize(clinic.country) === country)
        .map((clinic) => normalize(clinic.city)),
    )

  /** Clinics matching the selected country and city. Unset values don't constrain. */
  export const clinicsIn = <T extends LocationFields>(
    clinics: readonly T[],
    country: string,
    city: string,
  ): T[] =>
    clinics.filter((clinic) => {
      if (country && normalize(clinic.country) !== country) return false
      if (city && normalize(clinic.city) !== city) return false
      return true
    })

  /**
   * A specific clinic wins over its region, so a selected clinic still resolves
   * correctly before the clinic list has loaded.
   *
   * An empty result means "no clinic matches" — callers narrow to it rather
   * than ignoring it. Where the filtered column is nullable, use
   * `resolveClinicIdConstraint` instead.
   */
  export const resolveClinicIds = (
    clinics: readonly LocationFields[],
    selection: LocationSelection,
  ): string[] => {
    if (selection.clinicId) return [selection.clinicId]
    return clinicsIn(clinics, selection.country, selection.city).map((clinic) => clinic.id)
  }

  /**
   * The same resolution as `resolveClinicIds`, but returns `null` when the
   * selection is entirely unset, meaning the caller should apply no clinic
   * constraint at all.
   *
   * The distinction matters for nullable clinic columns: `IN` never matches
   * NULL, so constraining to every known clinic id is not equivalent to not
   * constraining — it silently hides every row that has no clinic.
   */
  export const resolveClinicIdConstraint = (
    clinics: readonly LocationFields[],
    selection: LocationSelection,
  ): string[] | null => {
    if (!selection.clinicId && !selection.country && !selection.city) return null
    return resolveClinicIds(clinics, selection)
  }

  /**
   * Drops selections the current country/city no longer allow. Returns the
   * selection untouched when no clinics are known, rather than clearing
   * choices on the strength of an empty list.
   */
  export const pruneLocationSelection = (
    clinics: readonly LocationFields[],
    selection: LocationSelection,
  ): LocationSelection => {
    if (clinics.length === 0) return selection

    const city = cityOptions(clinics, selection.country).includes(selection.city)
      ? selection.city
      : ""
    const inScope = clinicsIn(clinics, selection.country, city)
    const clinicId = inScope.some((clinic) => clinic.id === selection.clinicId)
      ? selection.clinicId
      : ""

    return { country: selection.country, city, clinicId }
  }
}

export default Clinic
