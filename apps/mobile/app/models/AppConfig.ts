import { Option } from "effect"

import AppConfigModel from "@/db/model/AppConfig"
import database from "@/db"
import { Q } from "@nozbe/watermelondb"
import { appliesToClinic } from "@/utils/appConfigScope"

namespace AppConfig {
  export type T = {
    id: string
    namespace: string
    key: string
    value: string
    dataType: string
    displayName: Option.Option<string>
    lastModifiedBy: Option.Option<string>
    createdAt: Date
    updatedAt: Date
    lastModified: Date
  }

  export type EncodedT = {
    id: string
    namespace: string
    key: string
    value: string
    dataType: string
    displayName: string | null
    lastModifiedBy: string | null
    createdAt: Date
    updatedAt: Date
    lastModified: Date
  }

  /** Default empty AppConfig Item */
  export const empty: T = {
    id: "",
    namespace: "",
    key: "",
    value: "",
    dataType: "string",
    displayName: Option.none(),
    lastModifiedBy: Option.none(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastModified: new Date(),
  }

  /** Common data types for configuration values */
  export type DataType = "string" | "number" | "boolean" | "json" | "array"

  /** Common configuration namespaces */
  export const Namespaces = {
    UI: "ui",
    SYNC: "sync",
    FEATURE_FLAGS: "feature_flags",
    SYSTEM: "system",
    CLINIC: "clinic",
    ORGANIZATION: "organization",
    AUTH: "auth",
  } as const

  export type Namespace = (typeof Namespaces)[keyof typeof Namespaces]

  export namespace DB {
    export type T = AppConfigModel

    /**
     * Given a namespace and key, retrieve the configuration value that applies
     * to `clinicId`.
     *
     * `clinicId` is required rather than optional so a caller cannot silently
     * ignore a row's clinic scope. Pass `null` only where the device genuinely
     * has no clinic selected; a scoped row then will not apply, failing closed.
     *
     * Picks the first applicable row rather than taking one and testing it:
     * `app_config` is `PRIMARY KEY (namespace, key)` today, so there is at most
     * one, but this keeps working if that widens to allow per-clinic rows.
     *
     * @param {Namespace} namespace - The namespace of the configuration
     * @param {string} key - The key of the configuration
     * @param {string | null} clinicId - The device's current clinic
     * @returns {Promise<string | number | boolean | object | Array<any> | null>} - The configuration value
     */
    export const getValue = async (
      namespace: Namespace,
      key: string,
      clinicId: string | null,
    ): Promise<string | number | boolean | object | Array<any> | null> => {
      const rows = await database
        .get<AppConfigModel>("app_config")
        .query(Q.where("namespace", namespace), Q.where("key", key))
        .fetch()

      const config = rows.find((row) => appliesToClinic(row.appliesToClinicIds, clinicId))
      if (!config) {
        return null
      }
      return Utils.parseValue(config) || null
    }
  }

  /**
   * Utility functions for working with typed configuration values
   */
  export namespace Utils {
    /**
     * Parse a configuration value based on its data type
     * @param {AppConfig.EncodedT} config - The configuration entry
     * @returns {any} - The parsed value
     */
    export const parseValue = (config: Pick<AppConfig.EncodedT, "value" | "dataType">): any => {
      if (config.value === null) return null

      switch (config.dataType) {
        case "string":
          return String(config.value).replace(/"/g, "")
        case "number":
          return parseFloat(config.value)
        case "boolean":
          return config.value.toLowerCase() === "true"
        case "json":
          try {
            return JSON.parse(config.value)
          } catch {
            return null
          }
        case "array":
          try {
            const parsed = JSON.parse(config.value)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        default:
          return config.value
      }
    }

    /**
     * Serialize a value for storage
     * @param {any} value - The value to serialize
     * @param {AppConfig.DataType} dataType - The target data type
     * @returns {string | null} - The serialized value
     */
    export const serializeValue = (value: any, dataType: AppConfig.DataType): string | null => {
      if (value === null || value === undefined) return null

      switch (dataType) {
        case "string":
          return String(value)
        case "number":
          return String(value)
        case "boolean":
          return String(Boolean(value))
        case "json":
        case "array":
          return JSON.stringify(value)
        default:
          return String(value)
      }
    }

    /**
     * Given a Config object, and a key of interest, return the value or null
     * @param {AppConfig.EncodedT} config - The Config object
     * @param {AppConfig.Namespace} namespace - The namespace of interest
     * @param {string} key - The key of interest
     * @returns {T | null} - The value or null
     */
    export const getValue = <T>(
      config: AppConfig.EncodedT[],
      namespace: AppConfig.Namespace,
      key: string,
    ): T | null => {
      const item = config.find((item) => item.namespace === namespace && item.key === key)
      if (!item) return null

      return parseValue(item)
    }
  }
}

export default AppConfig
