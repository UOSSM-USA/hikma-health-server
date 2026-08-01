# Test-data seeder

Fills a HikmaHealth database with a realistic, connected dataset: clinics,
staff and permissions, departments, event forms, a registration form, a drug
catalogue with batches and stock — and then thousands of patients with visits,
form submissions, vitals, problems, allergies and reactions, observations,
tobacco history, custom attributes, appointments, prescriptions, dispensing
records and an audit trail.

```sh
just seed-database <database-name> [patients] [flags...]

just seed-database hhdb_local                 # 2000 patients
just seed-database hhdb_local 10000           # 10000 patients
just seed-database hhdb_local 500 --dry-run   # build everything, write nothing
just seed-database hhdb_local 500 --seed=42   # reproducible dataset
```

The database name is required. The seeder reads `current_database()` from the
connection `DATABASE_URL` resolves to and refuses to write unless the two
match, so a stale `.env` cannot quietly redirect thousands of rows into the
wrong database. It also refuses outright when `NODE_ENV=production`. There is
no undo.

Run migrations first — the seeder writes to the current schema and does not
create it.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--patients=N` | `2000` | Patients to generate |
| `--clinics=N` | `5` | Clinics, each with departments and staff |
| `--users-per-clinic=N` | `5` | Staff per clinic |
| `--drugs=N` | `30` | Drug catalogue entries, 3 batches each |
| `--months=N` | `18` | How far back the generated history reaches |
| `--chunk=N` | `250` | Patients built and written per transaction |
| `--seed=N` | random | PRNG seed; the same seed reproduces the dataset |
| `--dry-run` | off | Build and count rows without writing |

`HH_SEED_ALLOW_DATABASE` works in place of `--allow-database` for automation.

## What it does not write

- `string_ids` / `string_content` — excluded by request.
- `inventory_transactions` — written by the `AFTER INSERT` trigger on
  `dispensing_records`; seeding it directly would double-count stock.
- `kysely_migration`, `kysely_migration_lock` — migration bookkeeping.

## Notes

- **Status values come from one block.** Every vocabulary the app constrains
  (prescription status and priority, problem clinical/verification status, code
  systems, device types, education visibility) is copied into the constant block
  at the top of `catalog.ts`, with the source module named against each list.
  Adding a field that has a vocabulary means copying it there too — a made-up
  value is not just odd data, it is unreachable by the filters and pickers the
  app builds from its own lists. Importing those modules directly is not an
  option: they live in `apps/server/src/models/`, which this package does not
  depend on and which pulls in Effect.
- **Seeded accounts cannot sign in.** Users get a well-formed bcrypt hash with
  no known preimage, and device PINs are random hashes. Set
  `HH_SEED_USER_PASSWORD_HASH` to a bcrypt hash you generated if you need
  seeded users to authenticate.
- **Most rows are tagged.** Rows in tables that have a `metadata` column carry
  `metadata->'seed'->>'run' = '<run tag>'`. The tables without one are
  identified by convention instead: seeded users by their
  `*.<tag>@seed.invalid` email, clinics and forms and reports by the tag in
  their name, drug batches by batch number, `server_variables` and `app_config`
  by key. `user_clinic_permissions`, `tokens` and `inventory_transactions`
  carry no marker of their own and are found through the user, or the
  dispensing record, they belong to.
- **Reruns are additive.** Each run mints a new tag, so running twice against
  one database doubles the data rather than colliding — except with an explicit
  `--seed`, which reproduces the same ids and unique keys and will conflict on a
  database that already holds that run.
- **Registration form.** If the database already has one, the seeder reuses it
  rather than adding a second (the app reads every row in that table). A form
  with no custom fields gets the seeder's optional fields appended so
  `patient_additional_attributes` has something real to reference — that is an
  `UPDATE`, so the form's `last_modified` moves and it re-syncs to every
  device. Existing field definitions are left alone.
- **`hh_unique`.** Seeded patients get a `patient_id` row shaped like the key
  the spreadsheet importer derives. One component of that key (`old_new`) has no
  observed value to copy, so a re-import may not actually dedupe against these
  rows — they are shaped like the real thing, not proven equivalent to it.
- Roughly 3% of patients are soft-deleted, along with all their child records,
  and `last_modified` is spread across the history window so sync paging has
  something to page through.
