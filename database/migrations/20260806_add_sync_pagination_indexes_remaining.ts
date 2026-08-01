import { type Kysely, sql } from "kysely";

/**
 * Migration: add_sync_pagination_indexes_remaining
 * Created at: 2026-08-06
 * Description: The paged tables 20260801_add_sync_pagination_indexes missed.
 *   `getDeltaPage` iterates the shared entity lists, which include reference
 *   tables the earlier list left out —
 *     ENTITIES_TO_PUSH_TO_MOBILE → clinics, event_forms,
 *                                  patient_registration_forms
 *     ENTITIES_TO_PUSH_TO_HUB    → users, devices, device_pin_codes
 *   Each is walked with the same three keyset queries, so each wants the same
 *   three indexes.
 *
 *   A separate migration rather than an edit to the earlier one: kysely records
 *   migrations by name, so amending an applied migration would leave every
 *   database that already ran it without these indexes, silently.
 *
 *   These tables are small — tens of clinics and hundreds of users against
 *   millions of events — so this is about uniformity rather than speed. Uniform
 *   coverage is what makes "add a table to the entity list" safe instead of
 *   quietly costing a sequential scan per page.
 *
 *   Deliberately not covered: `user_clinic_permissions` and `app_config`.
 *   `getDeltaPage` delivers those whole on the final page rather than paging
 *   them — they have no server_created_at/last_modified to sort on — and they
 *   are configuration-sized.
 *
 *   Built without CONCURRENTLY for the same reason as 20260801 — kysely-ctl
 *   wraps every migration in one transaction and Postgres rejects CONCURRENTLY
 *   there. See that file's header, and database/custom/
 *   sync_pagination_indexes_concurrent.sql for the optional pre-build.
 * Depends on: 20260801_add_sync_pagination_indexes
 */

/**
 * Every paged table absent from 20260801's list.
 *
 * All six carry server_created_at, last_modified, deleted_at and is_deleted, so
 * the predicates below apply unchanged.
 */
const TABLES = [
  "clinics",
  "event_forms",
  "patient_registration_forms",
  "users",
  "devices",
  "device_pin_codes",
];

export async function up(db: Kysely<any>): Promise<void> {
  for (const table of TABLES) {
    await sql`
      CREATE INDEX IF NOT EXISTS ${sql.raw(`${table}_sync_created_idx`)}
      ON ${sql.table(table)} (server_created_at, id)
      WHERE deleted_at IS NULL AND is_deleted = false
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS ${sql.raw(`${table}_sync_modified_idx`)}
      ON ${sql.table(table)} (last_modified, id)
      WHERE deleted_at IS NULL AND is_deleted = false
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS ${sql.raw(`${table}_sync_deleted_idx`)}
      ON ${sql.table(table)} (deleted_at, id)
      WHERE is_deleted = true
    `.execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of TABLES) {
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_sync_created_idx`)}`.execute(db);
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_sync_modified_idx`)}`.execute(db);
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_sync_deleted_idx`)}`.execute(db);
  }
}
