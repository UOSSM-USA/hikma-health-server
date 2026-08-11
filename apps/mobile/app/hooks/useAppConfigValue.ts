/**
 * Reactively read a single app_config value, scoped to the device's clinic.
 *
 * Unlike `AppConfig.DB.getValue`, this subscribes to the WatermelonDB query, so
 * an admin's change appears on the next sync rather than on the next app
 * restart.
 *
 * `observeWithColumns` rather than `observe`: an admin edit lands in the sync
 * delta's `updated` bucket, changing the row's columns in place without
 * changing which rows match the query, and plain `observe()` only re-emits on
 * membership changes — it would never see those edits for the life of a mounted
 * screen. The watched columns are raw snake_case names, not model properties.
 *
 * `clinicId` is passed in rather than read from providerStore so this module
 * stays free of the Effect `Option` the store uses.
 */
import { useEffect, useState } from "react"
import { Q } from "@nozbe/watermelondb"

import database from "@/db"
import AppConfigModel from "@/db/model/AppConfig"
import AppConfig from "@/models/AppConfig"
import { appliesToClinic } from "@/utils/appConfigScope"

export function useAppConfigValue(
  namespace: string,
  key: string,
  clinicId: string | null,
): { value: unknown; isLoading: boolean } {
  const [value, setValue] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sub = database
      .get<AppConfigModel>("app_config")
      .query(Q.where("namespace", namespace), Q.where("key", key))
      .observeWithColumns(["value", "data_type", "clinic_ids"])
      .subscribe({
        next: (rows) => {
          const applicable = rows.find((row) =>
            appliesToClinic(row.appliesToClinicIds, clinicId),
          )
          setValue(
            applicable
              ? AppConfig.Utils.parseValue({
                  value: applicable.value,
                  dataType: applicable.dataType,
                })
              : null,
          )
          setIsLoading(false)
        },
        error: () => {
          // Any failure resolves to "no config", which every consumer already
          // treats as "use the defaults".
          setValue(null)
          setIsLoading(false)
        },
      })

    return () => sub.unsubscribe()
  }, [namespace, key, clinicId])

  return { value, isLoading }
}
