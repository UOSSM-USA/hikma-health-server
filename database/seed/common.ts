import type { Generated, Insertable } from "kysely";
import type { DB } from "../types/schema/hh.js";
import { type Rng, laterThan } from "./random.js";

// `hh_unique` postdates the checked-in kysely-codegen snapshot, so the seeder
// declares it rather than reaching for a cast at every use.
export type SeedDB = DB & {
  hh_unique: {
    tag: string | null;
    key: string;
    value: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
};

// A typed unit of work for the writer in `seed.ts`: rows destined for one
// table, built with that table's insert type.
export type WriteBatch = {
  readonly table: keyof SeedDB & string;
  readonly rows: readonly unknown[];
};

export const batch = <T extends keyof SeedDB & string>(
  table: T,
  rows: readonly Insertable<SeedDB[T]>[],
): WriteBatch => ({ table, rows });

// node-postgres renders a JS array parameter as a Postgres array literal
// (`{a,b}`), which a jsonb column rejects, so every jsonb value is handed to
// the driver pre-serialised. The cast is the one place that lie is told.
export const jsonb = <T>(value: unknown): T =>
  JSON.stringify(value) as unknown as T;

export type Stamps = {
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly last_modified: Date;
  readonly server_created_at: Date;
};

// `last_modified` drives sync paging, so it is deliberately spread away from
// `created_at` rather than mirroring it — a seeded database should exercise
// cursors, not a single timestamp cluster.
export const stamps = (rng: Rng, createdAt: Date, now: Date): Stamps => {
  const modified = laterThan(rng, createdAt, 45, now);
  return {
    created_at: createdAt,
    updated_at: modified,
    last_modified: modified,
    server_created_at: createdAt,
  };
};

// Stamped onto every seeded row's metadata so fixture data stays identifiable
// (and removable) after the fact.
export const seedMetadata = (
  runTag: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...extra,
  seed: { run: runTag, generator: "database/seed" },
});

export const SOFT_DELETE_RATE = 0.03;

export type Deletion = {
  readonly is_deleted: boolean;
  readonly deleted_at: Date | null;
};

export const notDeleted: Deletion = { is_deleted: false, deleted_at: null };

// Soft deletes are only visible to sync when `deleted_at` is set, so the two
// fields always move together.
export const deletedAt = (at: Date): Deletion => ({
  is_deleted: true,
  deleted_at: at,
});
