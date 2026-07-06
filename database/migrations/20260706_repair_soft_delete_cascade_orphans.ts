import { type Kysely, sql } from "kysely";

/**
 * Migration: repair_soft_delete_cascade_orphans
 * Created at: 2026-07-06
 *
 * One-time data repair for cascade soft-deletes that never reached mobile. The
 * sync delta only emits a deletion when deleted_at > lastSync AND is_deleted =
 * true. The old cascadeSoftDelete set is_deleted on child rows but not
 * deleted_at, so they matched no sync bucket — while the parent patient (which
 * did set deleted_at) synced as a delete, leaving orphans that crashed the app.
 * dispensing_records was missing from the cascade registry entirely, so those
 * rows were never deleted at all.
 *
 *   (a) backfill deleted_at on the zombie child rows (is_deleted = true,
 *       deleted_at IS NULL) so they finally sync as deletions — safe because
 *       every other soft-delete path already sets deleted_at.
 *   (b) soft-delete dispensing_records whose patient is already deleted.
 *
 * Uses now() so deleted_at > lastSync on every device; a device offline past
 * MAX_HISTORY_DAYS_SYNC won't pick them up.
 *
 * Depends on: 20260602_add_clinic_country_city
 */

/** Cascade child tables that could hold is_deleted=true / deleted_at=NULL zombies. */
const ZOMBIE_TABLES = [
  "patient_additional_attributes",
  "appointments",
  "prescriptions",
  "prescription_items",
  "events",
  "visits",
  "patient_vitals",
  "patient_problems",
  "patient_observations",
] as const;

// `any` is required here since migrations should be frozen in time.
export async function up(db: Kysely<any>): Promise<void> {
  // (a) Revive cascade zombies so the sync delta will emit them as deletions.
  for (const table of ZOMBIE_TABLES) {
    await db
      .updateTable(table)
      .set({
        deleted_at: sql`now()::timestamp with time zone`,
        updated_at: sql`now()::timestamp with time zone`,
        last_modified: sql`now()::timestamp with time zone`,
      })
      .where("is_deleted", "=", true)
      .where("deleted_at", "is", null)
      .execute();
  }

  // (b) Retroactively cascade the table that was never in the registry.
  await db
    .updateTable("dispensing_records")
    .set({
      is_deleted: true,
      deleted_at: sql`now()::timestamp with time zone`,
      updated_at: sql`now()::timestamp with time zone`,
      last_modified: sql`now()::timestamp with time zone`,
    })
    .where("is_deleted", "=", false)
    .where(
      "patient_id",
      "in",
      db.selectFrom("patients").select("id").where("is_deleted", "=", true),
    )
    .execute();
}

// `any` is required here since migrations should be frozen in time.
export async function down(): Promise<void> {
  // Intentional no-op. This is a data repair, not a schema change. Reverting
  // would blank deleted_at on already-deleted rows and re-create the orphan bug.
  // The original NULL/false state is not recoverable and should not be restored.
}
