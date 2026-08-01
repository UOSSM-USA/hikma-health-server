// Test-data seeder: fills a HikmaHealth database with a realistic, connected
// dataset — thousands of patients plus the clinics, staff, forms, visits,
// events, clinical history, pharmacy records and audit trail that hang off
// them.
//
// Run it through the Justfile:
//
//   just seed-database <database-name> [patients]
//
// The database name is not optional and must match the database the resolved
// connection actually lands on. That is the whole safety story: this writes
// thousands of rows and there is no undo.
//
// Deliberately left alone:
//   - string_ids / string_content — excluded by request.
//   - inventory_transactions — written by the AFTER INSERT trigger on
//     dispensing_records; seeding it directly would double-count stock.
//   - kysely_migration / kysely_migration_lock — migration bookkeeping.

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { getDatabaseConfig } from "../config.js";
import { type SeedDB, type WriteBatch, jsonb } from "./common.js";
import {
  type AttributeFieldRef,
  type SeedContext,
  buildCustomRegistrationFields,
  buildFoundation,
} from "./foundation.js";
import { buildPatientChunk } from "./patients.js";
import { type Rng, createRng } from "./random.js";

type Options = {
  readonly allowDatabase: string;
  readonly patientCount: number;
  readonly clinicCount: number;
  readonly usersPerClinic: number;
  readonly drugCount: number;
  readonly chunkSize: number;
  readonly historyMonths: number;
  readonly seed: number;
  readonly dryRun: boolean;
};

// Every table this seeder writes to, in the order it reports them.
const REPORTED_TABLES: readonly (keyof SeedDB & string)[] = [
  "clinics",
  "users",
  "user_clinic_permissions",
  "clinic_departments",
  "event_forms",
  "patient_registration_forms",
  "drug_catalogue",
  "drug_batches",
  "clinic_inventory",
  "devices",
  "device_pin_codes",
  "resources",
  "education_content",
  "reports",
  "report_components",
  "app_config",
  "server_variables",
  "tokens",
  "patients",
  "visits",
  "events",
  "patient_vitals",
  "patient_problems",
  "patient_allergies",
  "patient_allergy_reactions",
  "patient_observations",
  "patient_tobacco_history",
  "patient_additional_attributes",
  "appointments",
  "prescriptions",
  "prescription_items",
  "dispensing_records",
  "inventory_transactions",
  "event_logs",
  "hh_unique",
];

// Postgres caps a statement at 65535 bind parameters; staying an order of
// magnitude below that keeps plans cheap and error messages readable.
const PARAMETERS_PER_STATEMENT = 5_000;

// stdout is this script's interface. The shared Logger lives in a package the
// database package does not depend on, so writes go straight to the stream.
const line = (text = ""): void => {
  process.stdout.write(`${text}\n`);
};

const parseNumber = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Expected a non-negative number, got "${raw}"`);
  }
  return Math.floor(value);
};

const parseOptions = (argv: readonly string[]): Options => {
  const flags = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argument);
    if (match === null) throw new Error(`Unrecognised argument "${argument}"`);
    flags.set(match[1] as string, match[2] ?? "true");
  }

  const allowDatabase =
    flags.get("allow-database") ?? process.env.HH_SEED_ALLOW_DATABASE ?? "";

  return {
    allowDatabase,
    patientCount: parseNumber(flags.get("patients"), 2_000),
    clinicCount: Math.max(1, parseNumber(flags.get("clinics"), 5)),
    usersPerClinic: Math.max(1, parseNumber(flags.get("users-per-clinic"), 5)),
    drugCount: Math.max(1, parseNumber(flags.get("drugs"), 30)),
    chunkSize: Math.max(1, parseNumber(flags.get("chunk"), 250)),
    historyMonths: Math.max(1, parseNumber(flags.get("months"), 18)),
    seed: parseNumber(
      flags.get("seed"),
      Math.floor(Math.random() * 0xffffffff),
    ),
    dryRun: flags.get("dry-run") === "true",
  };
};

const connect = (): { db: Kysely<SeedDB>; host: string } => {
  const config = getDatabaseConfig();
  const pool = new pg.Pool({ ...config, max: 4 });
  return {
    host: `${String(config.host)}:${String(config.port)}`,
    db: new Kysely<SeedDB>({ dialect: new PostgresDialect({ pool }) }),
  };
};

const currentDatabase = async (db: Kysely<SeedDB>): Promise<string> => {
  const result = await sql<{
    name: string;
  }>`select current_database() as name`.execute(db);
  const name = result.rows[0]?.name;
  if (name === undefined) throw new Error("Could not read current_database()");
  return name;
};

const countRows = async (
  db: Kysely<SeedDB>,
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  for (const table of REPORTED_TABLES) {
    const result = await sql<{ total: number }>`
      select count(*)::int as total from ${sql.table(table)}
    `.execute(db);
    counts.set(table, result.rows[0]?.total ?? 0);
  }
  return counts;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type ExistingForm = {
  readonly id: string;
  readonly fields: readonly unknown[];
  readonly attributeFields: readonly AttributeFieldRef[];
};

// The app reads every row of patient_registration_forms, so a second form would
// change which one it shows. When one already exists the seeder reuses it
// rather than adding another.
const readExistingForm = async (
  db: Kysely<SeedDB>,
): Promise<ExistingForm | null> => {
  const existing = await db
    .selectFrom("patient_registration_forms")
    .select(["id", "fields"])
    .where("is_deleted", "=", false)
    .limit(1)
    .executeTakeFirst();

  if (existing === undefined) return null;

  const fields: unknown[] = Array.isArray(existing.fields) ? existing.fields : [];
  return {
    id: existing.id,
    fields,
    attributeFields: readAttributeFields(fields),
  };
};

const readAttributeFields = (
  fields: readonly unknown[],
): AttributeFieldRef[] =>
  fields
    .filter(isJsonObject)
    .filter((field) => field.baseField !== true && field.deleted !== true)
    .map((field) => {
      const label = field.label as Record<string, string> | undefined;
      const fieldType = String(field.fieldType ?? "text");
      const valueKind =
        fieldType === "number"
          ? "number"
          : fieldType === "checkbox" || fieldType === "boolean"
            ? "boolean"
            : fieldType === "date"
              ? "date"
              : "string";
      return {
        id: String(field.id),
        label: label?.en ?? String(field.id),
        valueKind,
      } satisfies AttributeFieldRef;
    })
    .filter((field) => field.id !== "undefined");

// A form with base fields only leaves nothing for
// `patient_additional_attributes` to reference, so the seeder appends its own
// optional fields to it. Existing field definitions are preserved, but the
// row's timestamps do move, which re-syncs the form to every device.
//
// It draws from its own generator: whether this path runs depends on the state
// of the target database, and a `--seed` run must produce the same dataset
// either way.
const appendCustomFields = async (
  db: Kysely<SeedDB>,
  form: ExistingForm,
  seed: number,
  dryRun: boolean,
): Promise<readonly AttributeFieldRef[]> => {
  const custom = buildCustomRegistrationFields(createRng(seed ^ 0x5eed_0001));
  if (!dryRun) {
    await db
      .updateTable("patient_registration_forms")
      .set({
        fields: jsonb([...form.fields, ...custom.json]),
        last_modified: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", form.id)
      .execute();
  }
  return custom.refs;
};

const columnsOf = (rows: readonly unknown[]): number => {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row as Record<string, unknown>)) {
      columns.add(key);
    }
  }
  return Math.max(1, columns.size);
};

const writeBatches = async (
  db: Kysely<SeedDB>,
  batches: readonly WriteBatch[],
): Promise<number> => {
  let written = 0;
  await db.transaction().execute(async (trx) => {
    for (const item of batches) {
      if (item.rows.length === 0) continue;
      const rowsPerStatement = Math.max(
        1,
        Math.floor(PARAMETERS_PER_STATEMENT / columnsOf(item.rows)),
      );
      for (let start = 0; start < item.rows.length; start += rowsPerStatement) {
        const slice = item.rows.slice(start, start + rowsPerStatement);
        await trx
          .insertInto(item.table)
          .values(slice as never)
          .execute();
        written += slice.length;
      }
    }
  });
  return written;
};

const countBatchRows = (batches: readonly WriteBatch[]): number =>
  batches.reduce((total, item) => total + item.rows.length, 0);

const seedPatients = async (
  db: Kysely<SeedDB>,
  context: SeedContext,
  options: Options,
  rng: Rng,
): Promise<number> => {
  let remaining = options.patientCount;
  let written = 0;

  while (remaining > 0) {
    const size = Math.min(options.chunkSize, remaining);
    const batches = buildPatientChunk(rng, context, size);
    written += options.dryRun
      ? countBatchRows(batches)
      : await writeBatches(db, batches);
    remaining -= size;

    const done = options.patientCount - remaining;
    process.stdout.write(
      `  patients ${done}/${options.patientCount} (${written} rows)\r`,
    );
  }
  process.stdout.write("\n");

  return written;
};

// The before/after snapshot is a convenience, not a claim of exclusivity: it
// counts whole tables, so anything else writing to the database at the same
// time shows up in the deltas. The run tag is what identifies seeded rows.
const reportCounts = (
  before: Map<string, number>,
  after: Map<string, number>,
): void => {
  const width = Math.max(...REPORTED_TABLES.map((table) => table.length)) + 2;
  line(
    "\ntable".padEnd(width) +
      "before".padStart(10) +
      "after".padStart(12) +
      "added".padStart(12),
  );
  for (const table of REPORTED_TABLES) {
    const from = before.get(table) ?? 0;
    const to = after.get(table) ?? 0;
    line(
      table.padEnd(width) +
        String(from).padStart(10) +
        String(to).padStart(12) +
        String(to - from).padStart(12),
    );
  }
};

const assertSafeTarget = (actual: string, options: Options): void => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed with NODE_ENV=production.");
  }
  if (options.allowDatabase === "") {
    throw new Error(
      `Refusing to seed: name the target database explicitly.\n` +
        `  The resolved connection points at "${actual}".\n` +
        `  Re-run with --allow-database=${actual} (or HH_SEED_ALLOW_DATABASE=${actual}).`,
    );
  }
  if (options.allowDatabase !== actual) {
    throw new Error(
      `Refusing to seed: --allow-database=${options.allowDatabase} but the ` +
        `connection resolves to "${actual}". Check DATABASE_URL.`,
    );
  }
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const { db, host } = connect();

  try {
    const database = await currentDatabase(db);
    assertSafeTarget(database, options);

    const runTag = options.seed.toString(36).slice(-6).padStart(6, "0");
    const now = new Date();
    const historyStart = new Date(
      now.getTime() - options.historyMonths * 30 * 86_400_000,
    );
    const rng = createRng(options.seed);

    line(`target      ${host}/${database}`);
    line(`seed        ${options.seed} (run tag "${runTag}")`);
    line(`patients    ${options.patientCount}`);
    line(`history     ${options.historyMonths} months`);
    if (options.dryRun) line("mode        dry run — nothing is written");

    const before = await countRows(db);
    const existingForm = await readExistingForm(db);
    const existingAttributeFields =
      existingForm === null
        ? null
        : existingForm.attributeFields.length > 0
          ? existingForm.attributeFields
          : await appendCustomFields(
              db,
              existingForm,
              options.seed,
              options.dryRun,
            );

    const foundation = buildFoundation(rng, {
      runTag,
      now,
      historyStart,
      clinicCount: options.clinicCount,
      usersPerClinic: options.usersPerClinic,
      drugCount: options.drugCount,
      passwordHash: process.env.HH_SEED_USER_PASSWORD_HASH ?? null,
      existingAttributeFields,
    });

    line("\nwriting reference data…");
    const referenceRows = options.dryRun
      ? countBatchRows(foundation.batches)
      : await writeBatches(db, foundation.batches);
    line(`  ${referenceRows} rows`);

    line("writing patients…");
    const patientRows = await seedPatients(db, foundation.context, options, rng);

    const after = options.dryRun ? before : await countRows(db);
    reportCounts(before, after);

    line(
      `\n${referenceRows + patientRows} rows ${options.dryRun ? "planned" : "written"}.`,
    );
    line(
      `Seeded rows carry metadata->'seed'->>'run' = '${runTag}'; ` +
        `re-run with --seed=${options.seed} to reproduce this dataset.`,
    );
    if (existingForm !== null) {
      line(
        existingForm.attributeFields.length > 0
          ? "Reused the existing patient registration form."
          : "Appended custom fields to the existing patient registration form.",
      );
    }
  } finally {
    await db.destroy();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `\n${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
