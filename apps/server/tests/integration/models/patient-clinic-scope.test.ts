import { describe, it, expect, vi, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import Patient from "@/models/patient";

/**
 * Clinic scoping of the patient list (INV-28a / INV-28b).
 *
 * getAllWithAttributes normally resolves the permitted clinic ids from the
 * request token. We skip that and call buildPatientAttributesBaseQuery with an
 * explicit list, so it's the scoping SQL under test and not the cookie plumbing.
 *
 * The WHERE clause is: primary_clinic_id IN (clinicIds) OR primary_clinic_id IS NULL.
 * Other clinics' patients are excluded (28a), but the IS NULL branch hands every
 * unassigned patient to anyone — the leak 28b pins.
 */

const createdIds: { patients: string[]; clinics: string[] } = {
  patients: [],
  clinics: [],
};

const insertClinic = async (): Promise<string> => {
  const id = uuidV1();
  createdIds.clinics.push(id);
  await testDb
    .insertInto("clinics")
    .values({
      id,
      name: "Scope Test Clinic",
      is_deleted: false,
      is_archived: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    })
    .execute();
  return id;
};

const insertPatient = async (
  primaryClinicId: string | null,
): Promise<string> => {
  const id = uuidV1();
  createdIds.patients.push(id);
  await testDb
    .insertInto("patients")
    .values({
      id,
      given_name: "Scope",
      surname: "TestPatient",
      sex: "female",
      is_deleted: false,
      primary_clinic_id: primaryClinicId,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      metadata: sql`'{}'::jsonb`,
    })
    .execute();
  return id;
};

/**
 * Run the scoping query, then bound the result to our seeded ids so the
 * assertion is deterministic on a shared database — the inner subquery still
 * applies the real clinic-scoping clause; the outer filter just limits which
 * of OUR patients survived it.
 */
const scopedSeededIds = async (
  clinicIds: string[],
  candidateIds: string[],
): Promise<string[]> => {
  const compiled = sql`
    SELECT scoped.id FROM (
      ${Patient.buildPatientAttributesBaseQuery(clinicIds)}
      GROUP BY p.id
    ) scoped
    WHERE scoped.id IN (${sql.join(candidateIds)})
  `.compile(testDb);
  const rows = await Patient.executePatientQuery(compiled);
  return rows.map((r) => r.id);
};

afterEach(async () => {
  for (const id of createdIds.patients)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();
  for (const id of createdIds.clinics)
    await testDb.deleteFrom("clinics").where("id", "=", id).execute();
  createdIds.patients.length = 0;
  createdIds.clinics.length = 0;
});

describe("buildPatientAttributesBaseQuery — clinic scoping (INV-28a / INV-28b)", () => {
  it("returns permitted-clinic patients, excludes other clinics — but leaks null-clinic patients", async () => {
    const clinic1 = await insertClinic();
    const clinic2 = await insertClinic();
    const pInClinic1 = await insertPatient(clinic1);
    const pInClinic2 = await insertPatient(clinic2);
    const pNullClinic = await insertPatient(null);

    const ids = await scopedSeededIds(
      [clinic1],
      [pInClinic1, pInClinic2, pNullClinic],
    );

    // INV-28a — proper isolation.
    expect(ids).toContain(pInClinic1);
    expect(ids).not.toContain(pInClinic2);

    // INV-28b: the leak, pinned. Whoever drops or gates the `OR ... IS NULL`
    // branch will flip this assertion — that's the intended signal, not a break.
    expect(ids).toContain(pNullClinic);
  });

  it("with an empty permitted-clinic list, still returns null-clinic patients (not empty)", async () => {
    const clinic1 = await insertClinic();
    const pInClinic1 = await insertPatient(clinic1);
    const pNullClinic = await insertPatient(null);

    const ids = await scopedSeededIds([], [pInClinic1, pNullClinic]);

    // With no permitted clinics the clause collapses to just `IS NULL`, so a
    // user authorized on nothing still sees every unassigned patient.
    expect(ids).not.toContain(pInClinic1);
    expect(ids).toContain(pNullClinic); // same leak as above
  });
});
