import { Kysely, sql } from "kysely";

/**
 * Migration: add_clinic_event_forms
 * Created at: 2025-12-22
 * Description: Add clinic_event_forms junction table to support many-to-many relationship between clinics and event forms
 * Depends on: 20250929_add_clinic_departments
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Create clinic_event_forms junction table
  await db.schema
    .createTable("clinic_event_forms")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("clinic_id", "uuid", (col) => col.notNull())
    .addColumn("event_form_id", "uuid", (col) => col.notNull())
    .addColumn("is_deleted", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("deleted_at", "timestamptz")

    // Foreign key constraints
    .addForeignKeyConstraint(
      "clinic_event_forms_clinic_id_fkey",
      ["clinic_id"],
      "clinics",
      ["id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "clinic_event_forms_event_form_id_fkey",
      ["event_form_id"],
      "event_forms",
      ["id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // Create unique index to prevent duplicate assignments
  await db.schema
    .createIndex("clinic_event_forms_unique_idx")
    .on("clinic_event_forms")
    .columns(["clinic_id", "event_form_id"])
    .where("is_deleted", "=", false)
    .execute();

  // Index on clinic_id for performance
  await db.schema
    .createIndex("clinic_event_forms_clinic_id_idx")
    .on("clinic_event_forms")
    .column("clinic_id")
    .execute();

  // Index on event_form_id for performance
  await db.schema
    .createIndex("clinic_event_forms_event_form_id_idx")
    .on("clinic_event_forms")
    .column("event_form_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes first
  await db.schema.dropIndex("clinic_event_forms_event_form_id_idx").execute();
  await db.schema.dropIndex("clinic_event_forms_clinic_id_idx").execute();
  await db.schema.dropIndex("clinic_event_forms_unique_idx").execute();

  // Drop the table and all its constraints
  await db.schema.dropTable("clinic_event_forms").execute();
}
