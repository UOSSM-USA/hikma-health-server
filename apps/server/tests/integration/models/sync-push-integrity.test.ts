import { describe, it, expect, vi, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import Sync from "@/models/sync";
import type { RequestCaller } from "@/types";

/**
 * Server-side integrity of the mobile→server push (`persistClientChanges`):
 *  - INV-30: registration forms are server-authoritative — a mobile push must
 *    never overwrite the server's form definition.
 *  - INV-31: the push applies entities in a fixed dependency order
 *    (patients → patient_additional_attributes → …), so a patient and its
 *    attribute pushed together both persist and link correctly.
 */

const createdIds: {
  attributes: string[];
  patients: string[];
  registrationForms: string[];
  users: string[];
  clinics: string[];
} = { attributes: [], patients: [], registrationForms: [], users: [], clinics: [] };

const insertClinic = async (): Promise<string> => {
  const id = uuidV1();
  createdIds.clinics.push(id);
  await testDb
    .insertInto("clinics")
    .values({
      id,
      name: "Push Integrity Clinic",
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

const insertUser = async (clinicId: string): Promise<string> => {
  const id = uuidV1();
  createdIds.users.push(id);
  await testDb
    .insertInto("users")
    .values({
      id,
      name: "Push Integrity User",
      role: "provider",
      email: `push-${id}@example.com`,
      hashed_password: "not-a-real-hash",
      instance_url: null,
      clinic_id: clinicId,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    })
    .execute();
  return id;
};

const makeMobileCaller = (userId: string, clinicId: string): RequestCaller =>
  ({
    user: {
      id: userId,
      name: "Push Integrity User",
      role: "provider",
      email: "push@test.com",
      clinic_id: clinicId,
    },
    clinic: { id: clinicId, name: "Push Integrity Clinic" },
    token: "test-token",
  }) as unknown as RequestCaller;

const insertRegistrationForm = async (
  clinicId: string,
  name: string,
): Promise<string> => {
  const id = uuidV1();
  createdIds.registrationForms.push(id);
  await testDb
    .insertInto("patient_registration_forms")
    .values({
      id,
      clinic_id: clinicId,
      name,
      fields: sql`'[]'::jsonb`,
      metadata: sql`'{}'::jsonb`,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    })
    .execute();
  return id;
};

afterEach(async () => {
  for (const id of createdIds.attributes)
    await testDb
      .deleteFrom("patient_additional_attributes")
      .where("id", "=", id)
      .execute();
  for (const id of createdIds.patients)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();
  for (const id of createdIds.registrationForms)
    await testDb
      .deleteFrom("patient_registration_forms")
      .where("id", "=", id)
      .execute();
  for (const id of createdIds.users)
    await testDb.deleteFrom("users").where("id", "=", id).execute();
  for (const id of createdIds.clinics)
    await testDb.deleteFrom("clinics").where("id", "=", id).execute();

  createdIds.attributes.length = 0;
  createdIds.patients.length = 0;
  createdIds.registrationForms.length = 0;
  createdIds.users.length = 0;
  createdIds.clinics.length = 0;
});

const patientPushRecord = (id: string, givenName: string) => {
  const now = new Date().toISOString();
  return {
    id,
    given_name: givenName,
    surname: "PushTest",
    date_of_birth: "1980-05-05",
    sex: "male",
    citizenship: null,
    hometown: null,
    phone: null,
    camp: null,
    additional_data: "{}",
    metadata: "{}",
    photo_url: null,
    government_id: null,
    external_patient_id: null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    last_modified: now,
    server_created_at: now,
    deleted_at: null,
    primary_clinic_id: null,
    last_modified_by: null,
  };
};

describe("Sync — registration forms are server-authoritative (INV-30)", () => {
  it("selectively ignores a registration_forms push while applying valid entities", async () => {
    const clinicId = await insertClinic();
    const userId = await insertUser(clinicId);
    const caller = makeMobileCaller(userId, clinicId);
    const formId = await insertRegistrationForm(clinicId, "Authoritative Form v1");

    const patientId = uuidV1();
    createdIds.patients.push(patientId);

    // A valid patient alongside an attempt to rewrite the server form under both
    // its server and mobile table names. Neither form key is in
    // ENTITIES_TO_PULL_FROM_MOBILE, so both get dropped while the patient lands.
    const pushData = {
      patients: {
        created: [patientPushRecord(patientId, "ValidPush")],
        updated: [],
        deleted: [],
      },
      patient_registration_forms: {
        created: [],
        updated: [{ id: formId, name: "HACKED FROM MOBILE" }],
        deleted: [],
      },
      registration_forms: {
        created: [],
        updated: [{ id: formId, name: "HACKED FROM MOBILE" }],
        deleted: [],
      },
    } as any;

    await Sync.persistClientChanges(pushData, "mobile", caller);

    // The valid entity landed — proving the push was processed, not no-op'd.
    const patient = await testDb
      .selectFrom("patients")
      .select("given_name")
      .where("id", "=", patientId)
      .executeTakeFirst();
    expect(patient!.given_name).toBe("ValidPush");

    // The server form definition is untouched.
    const form = await testDb
      .selectFrom("patient_registration_forms")
      .select("name")
      .where("id", "=", formId)
      .executeTakeFirst();
    expect(form!.name).toBe("Authoritative Form v1");
  });
});

describe("Sync — combined patient + attributes push order (INV-31)", () => {
  it("persists a patient and its attribute pushed together, correctly linked", async () => {
    const clinicId = await insertClinic();
    const userId = await insertUser(clinicId);
    const caller = makeMobileCaller(userId, clinicId);

    const patientId = uuidV1();
    const attributeRowId = uuidV1();
    const attributeId = uuidV1();
    createdIds.patients.push(patientId);
    createdIds.attributes.push(attributeRowId);

    const now = new Date().toISOString();

    // Keys intentionally reversed (attributes before patients). The server
    // applies its own dependency order (patients first, sync.ts:589) rather than
    // the client's key order, so both rows persist and link.
    //
    // There's no FK from patient_additional_attributes to patients, so that
    // ordering is the only thing stopping an orphaned attribute — a mis-order
    // would orphan silently instead of erroring. This guards the combined push.
    const pushData = {
      patient_additional_attributes: {
        created: [
          {
            id: attributeRowId,
            patient_id: patientId,
            attribute_id: attributeId,
            attribute: "blood_type",
            number_value: null,
            string_value: "AB+",
            date_value: null,
            boolean_value: null,
            metadata: "{}",
            is_deleted: false,
            created_at: now,
            updated_at: now,
            last_modified: now,
            server_created_at: now,
            deleted_at: null,
          },
        ],
        updated: [],
        deleted: [],
      },
      patients: {
        created: [patientPushRecord(patientId, "OrderedPush")],
        updated: [],
        deleted: [],
      },
    } as any;

    await Sync.persistClientChanges(pushData, "mobile", caller);

    const patient = await testDb
      .selectFrom("patients")
      .select("id")
      .where("id", "=", patientId)
      .executeTakeFirst();
    const attr = await testDb
      .selectFrom("patient_additional_attributes")
      .select(["patient_id", "string_value"])
      .where("id", "=", attributeRowId)
      .executeTakeFirst();

    expect(patient!.id).toBe(patientId);
    expect(attr!.patient_id).toBe(patientId);
    expect(attr!.string_value).toBe("AB+");
  });
});
