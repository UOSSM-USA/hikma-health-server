import { useMemo } from "react"

import { useDBVitals } from "./useDBVitals"
import { useProviderVitals } from "./useProviderVitals"
import { useDataAccess } from "@/providers/DataAccessProvider"
import PatientVitals from "@/models/PatientVitals"

/**
 * A patient's vitals, most recent first, from whichever data access mode is
 * active. Pass an empty patientId to skip loading entirely.
 */
export function usePatientVitals(patientId: string): PatientVitals.T[] {
  const { isOnline } = useDataAccess()
  const offlineRecords = useDBVitals(isOnline ? "" : patientId)
  const onlineQuery = useProviderVitals(isOnline ? patientId : null)

  const offlineVitals = useMemo(() => offlineRecords.map(PatientVitals.DB.fromDB), [offlineRecords])

  return isOnline ? (onlineQuery.data ?? []) : offlineVitals
}
