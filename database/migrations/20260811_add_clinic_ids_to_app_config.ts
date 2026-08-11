import { Kysely } from "kysely";

/**
 * Migration: add_clinic_ids_to_app_config
 * Created at: 2026-08-11
 * Description: Add nullable clinic_ids scope column to app_config.
 *   NULL / absent  -> the row applies to ALL clinics (backwards compatible:
 *                     every pre-existing row keeps applying everywhere).
 *   []             -> the row applies to NO clinic.
 *   ["a","b"]      -> the row applies to those clinics only.
 *
 *   NOTE: this is the INVERSE of event_forms.clinic_ids, where an empty array
 *   means "all clinics". Do not share sanitizers between the two.
 * Depends on: 20260806_add_sync_pagination_indexes_remaining
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("app_config")
    .addColumn("clinic_ids", "jsonb")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("app_config").dropColumn("clinic_ids").execute();
}
