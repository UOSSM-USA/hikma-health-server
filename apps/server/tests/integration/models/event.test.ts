import { describe, it, expect, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";
import Event from "@/models/event";

const createdIds: {
  patients: string[];
  visits: string[];
  events: string[];
  users: string[];
} = {
  patients: [],
  visits: [],
  events: [],
  users: [],
};

const insertTestUser = async () => {
  const id = uuidV1();
  createdIds.users.push(id);
  await testDb
    .insertInto("users")
    .values({
      id,
      name: "EventTest Provider",
      role: "provider",
      email: `event-test-${id}@example.test`,
      hashed_password: "not-a-real-hash",
      is_deleted: false,
    })
    .execute();
  return id;
};

const insertTestPatient = async () => {
  const id = uuidV1();
  createdIds.patients.push(id);
  await testDb
    .insertInto("patients")
    .values({
      id,
      given_name: "EventTest",
      surname: "Patient",
      date_of_birth: sql`'1985-06-15'::date`,
      sex: "female",
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      metadata: sql`'{}'::jsonb`,
    })
    .execute();
  return id;
};

const insertTestVisit = async (patientId: string) => {
  const id = uuidV1();
  createdIds.visits.push(id);
  await testDb
    .insertInto("visits")
    .values({
      id,
      patient_id: patientId,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      metadata: sql`'{}'::jsonb`,
    })
    .execute();
  return id;
};

const insertTestEvent = async (
  patientId: string,
  visitId: string,
  formData: unknown[] = [{ field: "test_value" }],
) => {
  const id = uuidV1();
  createdIds.events.push(id);
  await testDb
    .insertInto("events")
    .values({
      id,
      patient_id: patientId,
      visit_id: visitId,
      form_data: sql`${JSON.stringify(formData)}::jsonb`,
      metadata: sql`'{}'::jsonb`,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
    })
    .execute();
  return id;
};

afterEach(async () => {
  for (const id of createdIds.events)
    await testDb.deleteFrom("events").where("id", "=", id).execute();
  for (const id of createdIds.visits)
    await testDb.deleteFrom("visits").where("id", "=", id).execute();
  for (const id of createdIds.patients)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();
  for (const id of createdIds.users)
    await testDb.deleteFrom("users").where("id", "=", id).execute();
  createdIds.patients.length = 0;
  createdIds.visits.length = 0;
  createdIds.events.length = 0;
  createdIds.users.length = 0;
});

describe("Event model (integration)", () => {
  it("inserts an event and retrieves it", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);
    const eventId = await insertTestEvent(patientId, visitId);

    const result = await testDb
      .selectFrom("events")
      .selectAll()
      .where("id", "=", eventId)
      .executeTakeFirst();

    expect(result).toBeDefined();
    expect(result!.patient_id).toBe(patientId);
    expect(result!.visit_id).toBe(visitId);
    expect(result!.is_deleted).toBe(false);
  });

  it("retrieves all events for a visit", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);
    await insertTestEvent(patientId, visitId, [{ q: "a1" }]);
    await insertTestEvent(patientId, visitId, [{ q: "a2" }]);

    const results = await testDb
      .selectFrom("events")
      .selectAll()
      .where("visit_id", "=", visitId)
      .where("is_deleted", "=", false)
      .execute();

    expect(results).toHaveLength(2);
  });

  it("stores and retrieves JSONB form_data correctly", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);
    const formData = [
      { field_id: "bp", value: "120/80" },
      { field_id: "weight", value: "70" },
    ];
    const eventId = await insertTestEvent(patientId, visitId, formData);

    const result = await testDb
      .selectFrom("events")
      .select("form_data")
      .where("id", "=", eventId)
      .executeTakeFirst();

    expect(result!.form_data).toEqual(formData);
  });

  it("soft-deletes an event", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);
    const eventId = await insertTestEvent(patientId, visitId);

    await testDb
      .updateTable("events")
      .set({ is_deleted: true, updated_at: sql`now()`, last_modified: sql`now()` })
      .where("id", "=", eventId)
      .execute();

    const result = await testDb
      .selectFrom("events")
      .select(["id", "is_deleted"])
      .where("id", "=", eventId)
      .executeTakeFirst();

    expect(result!.is_deleted).toBe(true);
  });
});

describe("Event.API.save recorded_by_user_id (integration)", () => {
  const saveEvent = async (
    patientId: string,
    visitId: string,
    recordedByUserId: string | null,
  ) => {
    const id = uuidV1();
    createdIds.events.push(id);
    await Event.API.save(id, {
      id,
      patient_id: patientId,
      visit_id: visitId,
      form_id: null,
      event_type: "test",
      form_data: [],
      metadata: {},
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      last_modified: new Date(),
      server_created_at: new Date(),
      deleted_at: null,
      recorded_by_user_id: recordedByUserId,
    });
    return id;
  };

  const readRecordedBy = async (eventId: string) => {
    const row = await testDb
      .selectFrom("events")
      .select("recorded_by_user_id")
      .where("id", "=", eventId)
      .executeTakeFirst();
    return row!.recorded_by_user_id;
  };

  it("stores an empty-string recorded_by_user_id as null", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);

    const eventId = await saveEvent(patientId, visitId, "");

    expect(await readRecordedBy(eventId)).toBeNull();
  });

  it("stores a null recorded_by_user_id as null", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);

    const eventId = await saveEvent(patientId, visitId, null);

    expect(await readRecordedBy(eventId)).toBeNull();
  });

  it("preserves a real recorded_by_user_id", async () => {
    const patientId = await insertTestPatient();
    const visitId = await insertTestVisit(patientId);
    const userId = await insertTestUser();

    const eventId = await saveEvent(patientId, visitId, userId);

    expect(await readRecordedBy(eventId)).toBe(userId);
  });
});
