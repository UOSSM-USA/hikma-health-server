import { useEffect, useState } from "react"
import { Q } from "@nozbe/watermelondb"

import database from "@/db"
import PatientProblem from "@/db/model/PatientProblems"

// A plain observe() only fires when rows enter or leave the result set, so an
// edit in place would never reach the UI. WatermelonDB maintains both columns on
// every write, so this catches any field change without listing them all.
const OBSERVED_COLUMNS = ["created_at", "updated_at"]

/**
 * Get all patient problem/diagnosis entries sorted by created_at
 * @param {string} patientId
 * @returns {PatientProblem[]}
 */
export function useDBPatientProblems(patientId: string): PatientProblem[] {
  const [problems, setProblems] = useState<PatientProblem[]>([])

  useEffect(() => {
    if (!patientId || typeof patientId !== "string" || patientId.length === 0) {
      setProblems([])
      return
    }

    const sub = database
      .get<PatientProblem>("patient_problems")
      .query(
        Q.where("patient_id", patientId),
        Q.where("is_deleted", false),
        Q.sortBy("updated_at", Q.desc),
      )
      .observeWithColumns(OBSERVED_COLUMNS)
      .subscribe((entries) => {
        setProblems(entries)
      })
    return () => {
      return sub?.unsubscribe()
    }
  }, [patientId])

  return problems
}
