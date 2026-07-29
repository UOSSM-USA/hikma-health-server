// `getByEventId` finds a problem with `metadata->>'eventId'`, which matches a
// jsonb object and nothing else. Clients differ in how they encode that column,
// so these pin that every shape one can push lands as an object.

import { describe, it, expect, vi, afterEach } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import PatientProblem from "@/models/patient-problem";

const createdPatients: string[] = [];
const createdProblems: string[] = [];

const insertPatient = async () => {
  const id = uuidV1();
  createdPatients.push(id);
  await testDb
    .insertInto("patients")
    .values({
      id,
      given_name: "ProblemSync",
      surname: "TestPatient",
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

/** Pushes one problem through the sync path, as a client's delta would. */
const pushProblem = async (patientId: string, metadata: unknown) => {
  const id = uuidV1();
  createdProblems.push(id);

  await PatientProblem.Sync.upsertFromDelta({
    id,
    patient_id: patientId,
    visit_id: null,
    problem_code_system: "icd11",
    problem_code: "1A00",
    problem_label: "Cholera",
    clinical_status: "active",
    verification_status: "provisional",
    severity_score: null,
    onset_date: null,
    end_date: null,
    recorded_by_user_id: null,
    metadata,
    is_deleted: false,
    deleted_at: null,
    // biome-ignore lint/suspicious/noExplicitAny: a delta is untyped client input
  } as any);

  return id;
};

const storedShape = async (problemId: string) => {
  const row = await testDb
    .selectFrom("patient_problems")
    .select(sql<string>`jsonb_typeof(metadata)`.as("shape"))
    .where("id", "=", problemId)
    .executeTakeFirstOrThrow();
  return row.shape;
};

afterEach(async () => {
  for (const id of createdProblems)
    await testDb.deleteFrom("patient_problems").where("id", "=", id).execute();
  for (const id of createdPatients)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();

  createdProblems.length = 0;
  createdPatients.length = 0;
});

describe("PatientProblem.Sync.upsertFromDelta metadata (integration)", () => {
  it("keeps a problem findable when the client sends metadata as an object", async () => {
    const patientId = await insertPatient();
    const eventId = uuidV1();

    const problemId = await pushProblem(patientId, { eventId });

    expect(await storedShape(problemId)).toBe("object");
    const found = await PatientProblem.getByEventId(patientId, eventId);
    expect(found.map((p) => p.id)).toEqual([problemId]);
  });

  // What a WatermelonDB `@json` column serialises to in a push payload.
  it("keeps a problem findable when the client sends metadata as JSON text", async () => {
    const patientId = await insertPatient();
    const eventId = uuidV1();

    const problemId = await pushProblem(patientId, JSON.stringify({ eventId }));

    expect(await storedShape(problemId)).toBe("object");
    const found = await PatientProblem.getByEventId(patientId, eventId);
    expect(found.map((p) => p.id)).toEqual([problemId]);
  });

  // The `eventId` is not recoverable here, but the column must still hold an
  // object: a jsonb string breaks `->>` for every reader of the row.
  it("stores an object even when the client double-encodes metadata", async () => {
    const patientId = await insertPatient();
    const eventId = uuidV1();

    const problemId = await pushProblem(
      patientId,
      JSON.stringify(JSON.stringify({ eventId })),
    );

    expect(await storedShape(problemId)).toBe("object");
  });
});
