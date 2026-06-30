import { useEffect, useState } from "react"
import { Logger } from "@hikmahealth/js-utils"
import { Q } from "@nozbe/watermelondb"
import { sortBy } from "es-toolkit/compat"

import database from "@/db"
import PatientModel from "@/db/model/Patient"
import { levenshtein } from "@/utils/levenshtein"
import { buildPrefilter, normalizeForSearch } from "@/utils/parsers"

/**
Hook fetches similar patients and returns them for display
@param givenName string
@param surname string
@returns {PatientModel[]}
*/
export function useSimilarPatientsSearch(givenName: string, surname: string): PatientModel[] {
  const [patients, setPatients] = useState<PatientModel[]>([])

  useEffect(() => {
    if (givenName.length < 2 || surname.length < 2) {
      setPatients([])
      return
    }

    // Normalize once so both the prefilter patterns and the Levenshtein distance
    // fold Arabic letter variants/diacritics consistently on either side.
    const normalizedGiven = normalizeForSearch(givenName)
    const normalizedSurname = normalizeForSearch(surname)

    database
      .get<PatientModel>("patients")
      .query(
        Q.or(
          Q.where("given_name", Q.like(buildPrefilter(normalizedGiven))),
          Q.where("surname", Q.like(buildPrefilter(normalizedSurname))),
        ),
        Q.take(10),
      )
      .fetch()
      .then(
        (results) => {
          // rank candidates by combined edit distance on the normalized names
          const sorted = sortBy(
            results.map((patient) => ({
              patient,
              distance:
                levenshtein(normalizeForSearch(patient.givenName), normalizedGiven) +
                levenshtein(normalizeForSearch(patient.surname), normalizedSurname),
            })),
            ["distance"],
          ).map((a) => a.patient)

          setPatients(sorted)
        },
        (error) => {
          Logger.error(error)
          setPatients([])
        },
      )
  }, [givenName, surname])

  return patients
}
