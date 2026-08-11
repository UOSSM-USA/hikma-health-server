import { useEffect, useMemo, useState } from "react"
import { isValid, startOfDay } from "date-fns"
import { useDebounceValue } from "usehooks-ts"

import database from "@/db"
import Appointment from "@/models/Appointment"
import Clinic from "@/models/Clinic"

export type AppointmentsFilters = {
  status: Appointment.Status | "all"
  date: Date
  clinicId: string
  country: string
  city: string
  searchQuery: string
  departmentIds: string[]
}

const initialFilters: AppointmentsFilters = {
  status: "pending",
  date: startOfDay(new Date()),
  clinicId: "",
  country: "",
  city: "",
  searchQuery: "",
  departmentIds: [],
}

const PAGE_SIZE = 150

type ISOStringDate = string

export function useDBAppointmentsFilter(
  clinicId: string,
  clinics: readonly Clinic.LocationFields[],
  date?: ISOStringDate,
): {
  filters: AppointmentsFilters
  handleFiltersChange: (newFilters: Partial<AppointmentsFilters>) => void
  clearFilters: () => void
  appointments: Appointment.T[]
  loadMore: () => Promise<void>
  isLoading: boolean
} {
  const [filters, setFilters] = useState<AppointmentsFilters>({
    ...initialFilters,
    clinicId,
    date: date && isValid(date) ? startOfDay(new Date(date)) : startOfDay(new Date()),
  })
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: PAGE_SIZE,
  })
  const [loading, setLoading] = useState(true)
  const [appointmentResults, setAppointmentResults] = useState<Appointment.T[]>([])
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useDebounceValue(filters.searchQuery, 500)
  useEffect(() => {
    setDebouncedSearchQuery(filters.searchQuery)
  }, [filters.searchQuery])

  const clinicIds = useMemo(
    () =>
      Clinic.resolveClinicIds(clinics, {
        country: filters.country,
        city: filters.city,
        clinicId: filters.clinicId,
      }),
    [clinics, filters.country, filters.city, filters.clinicId],
  )
  // A value the dependency array can compare; stands in for the clinic,
  // country and city filters together.
  const clinicIdsKey = clinicIds.join(",")

  useEffect(() => {
    const { status, date, searchQuery, departmentIds } = filters
    setLoading(true)

    // "all" is the no-status-filter sentinel; passing it through would become
    // Q.oneOf(["all"]) and match nothing.
    const statusFilter = status === "all" ? [] : [status]

    // build the conditions
    const conditions = Appointment.DB.createSearchQueryConditions(
      searchQuery,
      clinicIds,
      statusFilter,
      date,
      pagination,
    )

    // Execute query subscription
    const sub = database
      .get<Appointment.DBAppointment>("appointments")
      .query(...conditions)
      .observe()
      .subscribe((appointments) => {
        const results = (() => {
          const mappedAppointments = appointments.map(Appointment.DB.rawToT)
          // Filter by department IDs if provided (client-side filtering)
          if (departmentIds.length > 0) {
            return mappedAppointments.filter((appointment) =>
              appointment.departments.some((dept) => departmentIds.includes(dept.id)),
            )
          }
          return mappedAppointments
        })()
        setAppointmentResults(results)
        setLoading(false)
      })

    return () => {
      sub.unsubscribe()
    }
  }, [
    clinicIdsKey,
    filters.date.toISOString(),
    debouncedSearchQuery,
    filters.departmentIds,
    filters.status,
    pagination.limit,
  ])

  const handleFiltersChange = (newFilters: Partial<AppointmentsFilters>) => {
    // Prune only on a location change. On every change it would clear a clinic
    // the user never chose to clear: the provider's own clinic is absent from
    // `clinics` while archived or still syncing, so pruning would drop it and
    // widen the list from one clinic to every clinic.
    const touchesLocation =
      newFilters.country !== undefined ||
      newFilters.city !== undefined ||
      newFilters.clinicId !== undefined

    setFilters((prev) => {
      const next = { ...prev, ...newFilters }
      if (!touchesLocation) return next

      const location = Clinic.pruneLocationSelection(clinics, {
        country: next.country,
        city: next.city,
        clinicId: next.clinicId,
      })
      return { ...next, ...location }
    })
  }

  const clearFilters = () => {
    setFilters({ ...initialFilters, clinicId, date: startOfDay(new Date()) })
  }

  /**
   * This handles infinite scroll like, so we just increase the limit and re-run
   */
  const loadMore = async () => {
    // Check if we've received fewer results than requested
    // This indicates we've reached the end of available data
    if (appointmentResults.length < pagination.limit) {
      return
    }
    const nextPageLimit = pagination.limit + PAGE_SIZE
    setPagination((prev) => ({ ...prev, limit: nextPageLimit }))
  }

  return {
    filters,
    handleFiltersChange,
    clearFilters,
    appointments: appointmentResults,
    isLoading: loading,
    loadMore,
  }
}
