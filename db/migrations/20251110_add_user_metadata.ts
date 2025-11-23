import { Kysely, sql } from "kysely";

/**
 * Migration: add_user_metadata
 * Created at: 2025-11-10
 * Description: Add metadata JSONB column to users table for storing user preferences and settings
 * Depends on: 20191125_initial_tables
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Add metadata column to users table
  await db.schema
    .alterTable("users")
    .addColumn("metadata", "jsonb", (col) => col.defaultTo(sql`'{}'::jsonb`))
    .execute();

  // Create index on metadata for faster queries (GIN index for JSONB)
  await db.schema
    .createIndex("idx_users_metadata")
    .on("users")
    .column("metadata")
    .using("gin")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop index first
  await db.schema.dropIndex("idx_users_metadata").execute();

  // Drop metadata column
  await db.schema.alterTable("users").dropColumn("metadata").execute();
}

