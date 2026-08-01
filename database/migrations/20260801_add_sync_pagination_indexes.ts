import { type Kysely, sql } from "kysely";

/**
 * Migration: add_sync_pagination_indexes
 * Created at: 2026-08-01
 * Description: Composite indexes backing keyset pagination for manual sync.
 *   Each paged query sorts and filters on (sort_column, id) within one bucket:
 *     created bucket → server_created_at
 *     updated bucket → last_modified
 *     deleted bucket → deleted_at
 *   The created/updated indexes are partial, matching the live-rows predicate
 *   those queries always carry, which keeps them substantially smaller than a
 *   full index on a table where soft-deleted rows accumulate.
 *   Without these, every page is a sequential scan and a full backfill is
 *   quadratic in table size.
 *
 *   Built without CONCURRENTLY, deliberately. Plain CREATE INDEX takes a SHARE
 *   lock: reads continue, writes to the table pause until its index is built.
 *   CONCURRENTLY would avoid the pause but cannot be used from a migration —
 *   kysely-ctl runs every migration inside one transaction (Postgres reports
 *   supportsTransactionalDdl and `disableTransactions` is unset in
 *   database/kysely.config.ts) and Postgres rejects it there. Issuing it on a
 *   second connection is worse, not better: CONCURRENTLY waits for open
 *   transactions to finish, and the migrator's own transaction stays open for
 *   the length of this function, so it would hang rather than fail.
 *
 *   This deployment is self-hosted by many operators, so the migration has to
 *   be the whole story — no extra command, no ordering an operator can get
 *   wrong. Anyone running an instance large enough for the write pause to
 *   matter can pre-build these CONCURRENTLY by hand; every statement below is
 *   IF NOT EXISTS and will then find them and do nothing. See
 *   database/custom/sync_pagination_indexes_concurrent.sql, which is optional
 *   and not part of the deploy path.
 * Depends on: 20260723_add_resource_scope_columns
 */

/**
 * Tables paged by manual sync, largest/hottest first.
 *
 * Not the complete set. The paged pull walks whatever is in the shared entity
 * lists, and six reference tables — clinics, event_forms,
 * patient_registration_forms, and the hub-only users, devices,
 * device_pin_codes — are indexed by
 * 20260806_add_sync_pagination_indexes_remaining instead, because this
 * migration had already been applied by the time they were found.
 *
 * Adding a table to the entity lists means indexing it. Check both migrations.
 */
const TABLES = [
  "events",
  "patients",
  "visits",
  "prescriptions",
  "patient_vitals",
  "patient_problems",
  "appointments",
  "patient_additional_attributes",
  "prescription_items",
  "dispensing_records",
  "clinic_departments",
  "drug_catalogue",
  "clinic_inventory",
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
