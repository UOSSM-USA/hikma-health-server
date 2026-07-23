import { Kysely } from "kysely";

/**
 * Migration: add_resource_scope_columns
 * Created at: 2026-07-23
 * Description: Add clinic/uploader scope + source discriminator to resources so
 *   event-form file uploads can be guarded at the clinic level and
 *   distinguished from education uploads. The patient/event link lives in the
 *   referencing event's form_data (the read path traverses that), so it is not
 *   duplicated here. Existing rows are education content, hence the "education"
 *   default for `source`.
 * Depends on: 20250401_make_resources_syncable
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("resources")
    .addColumn("clinic_id", "uuid")
    .addColumn("created_by_user_id", "uuid")
    .addColumn("source", "varchar(42)", (col) =>
      col.notNull().defaultTo("education"),
    )
    .execute();

  await db.schema
    .createIndex("resources_clinic_id_index")
    .on("resources")
    .column("clinic_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("resources_clinic_id_index").execute();
  await db.schema
    .alterTable("resources")
    .dropColumn("source")
    .dropColumn("created_by_user_id")
    .dropColumn("clinic_id")
    .execute();
}
