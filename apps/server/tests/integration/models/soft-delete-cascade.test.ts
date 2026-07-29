import { describe, it, expect, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";
import { cascadeSoftDelete, getDependencies } from "@/lib/soft-delete-registry";

/**
 * Regression coverage for the patient soft-delete cascade.
 *
 * The incident: cascadeSoftDelete set only `is_deleted = true` on child rows,
 * never `deleted_at`. The sync delta emits a deletion only when
 * `deleted_at > lastSync AND is_deleted = true`, so those children were
 * invisible to sync — they stayed live on devices while the parent patient
 * (which does set deleted_at) was destroyed, orphaning them. Separately,
 * dispensing_records was missing from the registry entirely.
 *
 * These tests run the real cascade against Postgres and assert every registered
 * child ends up with BOTH is_deleted=true AND a non-null deleted_at. The
 * unit test (tests/lib/soft-delete-registry.test.ts) checks only the static
 * dependency list, which passed while this bug was live in production.
 */

const ids = {
  clinic: uuidV1(),
  user: uuidV1(),
  drug: uuidV1(),
  patient: uuidV1(),
  visit: uuidV1(),
  prescription: uuidV1(),
  // one child row per registered dependent table
  patient_additional_attributes: uuidV1(),
  appointments: uuidV1(),
  prescription_items: uuidV1(),
  patient_vitals: uuidV1(),
  patient_problems: uuidV1(),
  patient_observations: uuidV1(),
  event: uuidV1(),
};

const seed = async () => {
  await testDb
    .insertInto("clinics")
    .values({ id: ids.clinic, is_deleted: false })
    .execute();

  await testDb
    .insertInto("users")
    .values({
      id: ids.user,
      name: "Cascade Test User",
      role: "provider",
      email: `cascade-test-${ids.user}@example.test`,
      hashed_password: "x",
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("drug_catalogue")
    .values({
      id: ids.drug,
      generic_name: "Test Drug",
      form: "tablet",
      route: "oral",
      dosage_quantity: 1,
      dosage_units: "mg",
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("patients")
    .values({
      id: ids.patient,
      given_name: "Cascade",
      surname: "Test",
      date_of_birth: sql`'1990-01-15'::date`,
      sex: "male",
      citizenship: "US",
      phone: "555-0100",
      is_deleted: false,
      metadata: sql`'{}'::jsonb`,
    })
    .execute();

  await testDb
    .insertInto("visits")
    .values({ id: ids.visit, patient_id: ids.patient, is_deleted: false })
    .execute();

  await testDb
    .insertInto("patient_additional_attributes")
    .values({
      id: ids.patient_additional_attributes,
      attribute_id: "test-attr",
      patient_id: ids.patient,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("appointments")
    .values({
      id: ids.appointments,
      clinic_id: ids.clinic,
      patient_id: ids.patient,
      user_id: ids.user,
      current_visit_id: ids.visit,
      timestamp: sql`now()`,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("prescriptions")
    .values({
      id: ids.prescription,
      patient_id: ids.patient,
      visit_id: ids.visit,
      provider_id: ids.user,
      pickup_clinic_id: ids.clinic,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("prescription_items")
    .values({
      id: ids.prescription_items,
      prescription_id: ids.prescription,
      patient_id: ids.patient,
      drug_id: ids.drug,
      clinic_id: ids.clinic,
      dosage_instructions: "one tablet daily",
      quantity_prescribed: 1,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("events")
    .values({
      id: ids.event,
      patient_id: ids.patient,
      visit_id: ids.visit,
      form_data: sql`'[]'::jsonb`,
      metadata: sql`'{}'::jsonb`,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("patient_vitals")
    .values({
      id: ids.patient_vitals,
      patient_id: ids.patient,
      timestamp: sql`now()`,
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("patient_problems")
    .values({
      id: ids.patient_problems,
      patient_id: ids.patient,
      visit_id: ids.visit,
      problem_code_system: "ICD10",
      problem_code: "A00",
      problem_label: "Cholera",
      clinical_status: "active",
      verification_status: "confirmed",
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("patient_observations")
    .values({
      id: ids.patient_observations,
      patient_id: ids.patient,
      timestamp: sql`now()`,
      observation_code: "OBS1",
      is_deleted: false,
    })
    .execute();

  await testDb
    .insertInto("dispensing_records")
    .values({
      id: ids.dispensing_records,
      clinic_id: ids.clinic,
      drug_id: ids.drug,
      patient_id: ids.patient,
      quantity_dispensed: 1,
      dispensed_by: ids.user,
      dispensed_at: sql`now()`,
      is_deleted: false,
    })
    .execute();
};

/**
 * FK-safe teardown as [table, column, value]. Children first, then the patient,
 * then the inventory rows the dispensing trigger auto-creates (drug_batches /
 * clinic_inventory / inventory_transactions all reference drug_catalogue), then
 * the supporting entities last.
 */
const CLEANUP: Array<[string, string, string]> = [
  ["dispensing_records", "patient_id", ids.patient],
  ["prescription_items", "patient_id", ids.patient],
  ["prescriptions", "patient_id", ids.patient],
  ["appointments", "patient_id", ids.patient],
  ["patient_observations", "patient_id", ids.patient],
  ["patient_problems", "patient_id", ids.patient],
  ["patient_vitals", "patient_id", ids.patient],
  ["events", "patient_id", ids.patient],
  ["visits", "patient_id", ids.patient],
  ["patient_additional_attributes", "patient_id", ids.patient],
  ["patients", "id", ids.patient],
  ["inventory_transactions", "drug_id", ids.drug],
  ["clinic_inventory", "drug_id", ids.drug],
  ["drug_batches", "drug_id", ids.drug],
  ["drug_catalogue", "id", ids.drug],
  ["users", "id", ids.user],
  ["clinics", "id", ids.clinic],
];

afterEach(async () => {
  for (const [table, column, value] of CLEANUP) {
    // @ts-ignore — dynamic table/column name
    await testDb.deleteFrom(table).where(column, "=", value).execute();
  }
});

/**
 * Every dependent row must come back soft-deleted with `deleted_at` set — the
 * sync delta keys its deleted bucket on `deleted_at`, so an `is_deleted`-only
 * row never reaches mobile.
 */
const expectCascaded = async (parentTable: string, parentId: string) => {
  const deps = getDependencies(parentTable)!;
  expect(deps.length).toBeGreaterThan(0);

  for (const dep of deps) {
    const rows = await testDb
      // @ts-ignore — dynamic table name
      .selectFrom(dep.table)
      .select(["is_deleted", "deleted_at"])
      // @ts-ignore — dynamic foreign-key column
      .where(dep.foreignKey, "=", parentId)
      .execute();

    expect(rows.length, `${dep.table} should have a seeded row`).toBeGreaterThan(
      0,
    );

    for (const row of rows as { is_deleted: boolean; deleted_at: unknown }[]) {
      expect(row.is_deleted, `${dep.table}.is_deleted`).toBe(true);
      expect(
        row.deleted_at,
        `${dep.table}.deleted_at must be populated so the sync delta emits it`,
      ).not.toBeNull();
    }
  }
};

describe("patient soft-delete cascade (integration)", () => {
  it("sets is_deleted AND deleted_at on every registered dependent table", async () => {
    await seed();

    await testDb.transaction().execute(async (trx) => {
      await cascadeSoftDelete(trx, "patients", ids.patient);
    });

    await expectCascaded("patients", ids.patient);
  });
});

describe("visit soft-delete cascade (integration)", () => {
  // A visit's events cascade, so the problems those events recorded have to go
  // with them — otherwise a deleted encounter leaves its diagnoses on the chart.
  it("sets is_deleted AND deleted_at on every registered dependent table", async () => {
    await seed();

    await testDb.transaction().execute(async (trx) => {
      await cascadeSoftDelete(trx, "visits", ids.visit);
    });

    await expectCascaded("visits", ids.visit);
  });
});
