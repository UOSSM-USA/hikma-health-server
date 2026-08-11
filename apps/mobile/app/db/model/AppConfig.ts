import { Model } from "@nozbe/watermelondb"
import { text, date, json, readonly } from "@nozbe/watermelondb/decorators"

// import User from "./User" // Assuming you have a User model

/**
 * AppConfig Model
 *
 * NOTE: This is a one way sync - only comes from the server but any changes pushed to the server will be ignored.
 *
 * This model stores key-value configuration settings for the application.
 * It's a flexible way to manage settings that might need to be synced
 * from the server or modified by an administrator.
 */
export default class AppConfig extends Model {
  // The name of the table in the database schema
  static table = "app_config"

  // A namespace to group related keys (e.g., 'ui', 'sync', 'feature_flags')
  @text("namespace") namespace!: string
  @text("key") key!: string
  @text("value") value!: string
  // 'string' | 'number' | 'boolean' | 'json'
  @text("data_type") dataType!: string

  // An optional user-friendly name for the setting
  @text("display_name") displayName?: string

  /**
   * Which clinics this config row applies to.
   *
   *   null / absent -> ALL clinics
   *   []            -> NO clinics
   *   ["a"]         -> clinic "a" only
   *
   * Named `appliesToClinicIds` rather than `clinicIds` on purpose: the
   * identically-named column on event_forms has the OPPOSITE meaning, where an
   * empty array means "all clinics".
   */
  @json("clinic_ids", sanitizeAppConfigClinicIds) appliesToClinicIds!: string[] | null

  // The user who last modified this configuration entry (optional)
  // @relation("users", "last_modified_by") lastModifiedBy?: User

  @readonly @date("created_at") createdAt!: Date
  @readonly @date("updated_at") updatedAt!: Date
  @readonly @date("last_modified") lastModified!: Date
}

/**
 * Sanitize app_config.clinic_ids.
 *
 * Returns null for null/undefined/corrupt (row applies to all clinics) and an
 * array only when the stored value genuinely is one. Do NOT reuse
 * `sanitizeClinicIds` from EventForm — it collapses null to [], which here
 * means "applies to no clinic" and would disable every pre-existing row.
 */
export function sanitizeAppConfigClinicIds(data: unknown): string[] | null {
  if (data === null || data === undefined) return null
  if (!Array.isArray(data)) return null
  return data.filter((v): v is string => typeof v === "string")
}
