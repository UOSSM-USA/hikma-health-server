import { type Kysely } from "kysely";

/**
 * Migration: add_clinic_country_city
 * Created at: 2026-06-02
 * Description: Add optional country and city columns to the clinics table.
 *   The address column already exists (added in 20250410).
 * Depends on: 20260417_create_uniqueness_hash
 */
// `any` is required here since migrations should be frozen in time.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("clinics")
    .addColumn("country", "text")
    .addColumn("city", "text")
    .execute();
}

// `any` is required here since migrations should be frozen in time.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("clinics")
    .dropColumn("country")
    .dropColumn("city")
    .execute();
}
