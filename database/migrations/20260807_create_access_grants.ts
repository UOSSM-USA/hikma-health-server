import { type Kysely, sql } from "kysely";

/**
 * Migration: create_access_grants
 * Created at: 2026-08-07
 * Description: Time-boxed, revocable capability tokens. First consumer is the
 *   expiring attachment links in patient data exports, where a spreadsheet is
 *   opened offline from any session and its links must carry a credential.
 *
 *   Rows rather than stateless signatures: a link carrying PHI will eventually
 *   reach the wrong inbox, and a row can be revoked. Invalidating a signature
 *   would mean rotating a secret and killing every other outstanding link.
 *
 *   Not syncable — no is_deleted/last_modified/server_created_at, and absent
 *   from every entity list in models/sync.ts. Grants must never reach a device.
 *
 * Depends on: 20260806_add_sync_pagination_indexes_remaining
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("access_grants")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    // SHA-256 hex of the token; unique doubles as the lookup index.
    .addColumn("token_hash", "varchar(64)", (col) => col.notNull().unique())
    // Values come from AccessGrant.SCOPES.
    .addColumn("scope", "varchar(64)", (col) => col.notNull())
    // Narrows the grant to one object. Null covers everything the scope allows.
    .addColumn("subject_id", "uuid", (col) => col.defaultTo(null))
    // The grant acts as this user; deleting them must delete their grants.
    .addColumn("created_by_user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("description", "varchar(255)", (col) => col.defaultTo(null))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("revoked_at", "timestamptz", (col) => col.defaultTo(null))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Listing a user's live grants, and sweeping expired ones.
  await db.schema
    .createIndex("idx_access_grants_user_expiry")
    .on("access_grants")
    .columns(["created_by_user_id", "expires_at"])
    .execute();

  // Bulk-revoking every grant of one kind.
  await db.schema
    .createIndex("idx_access_grants_scope_expiry")
    .on("access_grants")
    .columns(["scope", "expires_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("access_grants").ifExists().execute();
}
