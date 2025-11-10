import type { Database } from "../src/db";
import { createMigrationProviderFromAlembic } from "./utils";
import { alembicMigrationIds } from "./alembic-mapping";
import * as path from "node:path";
import { Migrator, type Kysely } from "kysely";

// Following the spec for the migration as required by `defaultConfigProps.migrations.migrator` in
// `kysely.config.ts`.
export async function almebicBackcompatMigrator(db: Kysely<Database>) {
  const provider = await createMigrationProviderFromAlembic(
    db,
    alembicMigrationIds,
    {
      migrationFolder: path.join(__dirname, "migrations"),
      // importCheck: false,
    },
  );

  return new Migrator({ db, provider, allowUnorderedMigrations: false });
}
