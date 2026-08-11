/**
 * Integration tests that exercise the real domain model APIs (Patient.DB,
 * PatientVitals.DB, PatientProblems.DB, Peer.DB, Event.DB) against a real
 * WatermelonDB/LokiJS instance. The only mocks are external deps that are
 * unavailable in the test environment (Sentry, SecureStore, providerStore).
 */

// Mock the singleton database — every model that does `import database from
// "@/db"` will receive our test database instance instead.
//
// We use a shared module (testDatabase) and store the current DB reference
// there so the jest.mock factory can access it without out-of-scope variables.

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"

// We use a global variable to share the test DB with the mock factory,
// since jest.mock factories cannot reference out-of-scope variables.
// Mock using the @/ alias path so it matches what models import.
jest.mock("@/db", () => ({
  __esModule: true,
  get default() {
    return (global as any).__TEST_DB__
  },
  get database() {
    return (global as any).__TEST_DB__
  },
}))

// Stub external dependencies that models import
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureEvent: jest.fn(),
}))

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// providerStore is used by UserClinicPermissions.DB.getClinicIdsWithPermission
jest.mock("../../app/store/provider", () => {
  const { Option } = require("effect")
  return {
    providerStore: {
      getSnapshot: () => ({
        context: {
          role: Option.some("super_admin"),
          // snake_case, matching the real store. A camelCase key is silently
          // absent, and Option.getOrNull then throws instead of returning null.
          clinic_id: Option.some("clinic-1"),
        },
      }),
    },
  }
})

import { Database, Q } from "@nozbe/watermelondb"
import { Option } from "effect"
import fc from "fast-check"

// Now import the models — they'll pick up our mocked database
import Patient from "../../app/models/Patient"
import PatientVitals from "../../app/models/PatientVitals"
import PatientProblems from "../../app/models/PatientProblems"
import Peer from "../../app/models/Peer"
import Event from "../../app/models/Event"
import EventForm from "../../app/models/EventForm"

import PatientModel from "../../app/db/model/Patient"
import ClinicModel from "../../app/db/model/Clinic"
import UserModel from "../../app/db/model/User"
import UserClinicPermissionModel from "../../app/db/model/UserClinicPermissions"
import VisitModel from "../../app/db/model/Visit"
import EventModel from "../../app/db/model/Event"
import EventFormModel from "../../app/db/model/EventForm"
import PatientProblemModel from "../../app/db/model/PatientProblems"

// Lifecycle

let testDb: Database

beforeEach(() => {
  testDb = createTestDatabase()
  ;(global as any).__TEST_DB__ = testDb
})

afterEach(async () => {
  await resetTestDatabase(testDb)
})

// Seed helpers — create prerequisite records directly via testDb

async function seedClinic(name = "Test Clinic") {
  return testDb.write(() =>
    testDb.get<ClinicModel>("clinics").create((c) => {
      c.name = name
      c.isDeleted = false
    }),
  )
}

async function seedUser(name = "Dr. Test", clinicId = "clinic-1") {
  return testDb.write(() =>
    testDb.get<UserModel>("users").create((u) => {
      u.name = name
      u.clinicId = clinicId
      u.role = "provider"
      u.email = `${name.toLowerCase().replace(/\s/g, ".")}@test.com`
      u.isDeleted = false
    }),
  )
}

async function seedPermissions(
  userId: string,
  clinicId: string,
  overrides: Partial<{
    canRegisterPatients: boolean
    canViewHistory: boolean
    canEditRecords: boolean
    canDeleteRecords: boolean
    isClinicAdmin: boolean
  }> = {},
) {
  return testDb.write(() =>
    testDb.get<UserClinicPermissionModel>("user_clinic_permissions").create((p) => {
      p.userId = userId
      p.clinicId = clinicId
      p.canRegisterPatients = overrides.canRegisterPatients ?? true
      p.canViewHistory = overrides.canViewHistory ?? true
      p.canEditRecords = overrides.canEditRecords ?? true
      p.canDeleteRecords = overrides.canDeleteRecords ?? false
      p.isClinicAdmin = overrides.isClinicAdmin ?? false
      p.canEditOtherProviderEvent = false
      p.canDownloadPatientReports = false
      p.canPrescribeMedications = false
      p.canDispenseMedications = false
      p.canDeletePatientVisits = false
      p.canDeletePatientRecords = false
    }),
  )
}

/** Build a minimal PatientRecord that Patient.DB.register expects */
function makePatientRecord(
  fields: Record<string, any>,
): { fields: any[]; values: Record<string, any> } {
  const baseColumns = [
    "given_name",
    "surname",
    "sex",
    "date_of_birth",
    "phone",
    "citizenship",
    "hometown",
    "camp",
    "photo_url",
    "government_id",
    "external_patient_id",
  ]

  const formFields = baseColumns.map((col) => ({
    id: col,
    column: col,
    label: col,
    fieldType: "text",
    baseField: true,
    visible: true,
    required: false,
    isSearchField: false,
    options: [],
  }))

  const values: Record<string, any> = {}
  for (const col of baseColumns) {
    values[col] = fields[col] ?? ""
  }
  // register accepts date_of_birth as either a "YYYY-MM-DD" string or a Date;
  // this exercises the Date form.
  if (typeof values["date_of_birth"] === "string" && values["date_of_birth"]) {
    values["date_of_birth"] = new Date(values["date_of_birth"])
  } else if (!values["date_of_birth"]) {
    values["date_of_birth"] = new Date("1990-01-01")
  }

  return { fields: formFields, values }
}

// Patient.DB integration tests

describe("Patient.DB", () => {
  let clinic: ClinicModel
  let user: UserModel
  const provider = () => ({ id: user.id, name: user.name })
  const clinicRef = () => ({ id: clinic.id, name: clinic.name })

  beforeEach(async () => {
    clinic = await seedClinic()
    user = await seedUser("Dr. House", clinic.id)
    await seedPermissions(user.id, clinic.id)
  })

  describe("register", () => {
    it("creates a patient and returns its id", async () => {
      // Use a date string that won't shift with timezone (noon UTC)
      const dob = new Date("1985-06-15T12:00:00")
      const record = makePatientRecord({
        given_name: "Alice",
        surname: "Smith",
        sex: "F",
        date_of_birth: dob,
        phone: "555-0100",
        government_id: "GOV-001",
      })

      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      expect(patientId).toBeDefined()
      expect(typeof patientId).toBe("string")

      const dbPatient = await testDb.get<PatientModel>("patients").find(patientId)
      expect(dbPatient.givenName).toBe("Alice")
      expect(dbPatient.surname).toBe("Smith")
      expect(dbPatient.sex).toBe("F")
      expect(dbPatient.dateOfBirth).toBe("1985-06-15")
      expect(dbPatient.phone).toBe("555-0100")
      expect(dbPatient.governmentId).toBe("GOV-001")
      expect(dbPatient.primaryClinicId).toBe(clinic.id)
      expect(dbPatient.lastModifiedBy).toBe(user.id)
    })

    it("creates additional attribute records for non-base fields", async () => {
      const record = makePatientRecord({ given_name: "Bob", surname: "Jones" })
      record.fields.push({
        id: "custom_field_1",
        column: "blood_type",
        label: "Blood Type",
        fieldType: "text",
        baseField: false,
        visible: true,
        required: false,
        isSearchField: false,
        options: [],
      })
      record.values["custom_field_1"] = "O+"

      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      const attrs = await testDb
        .get("patient_additional_attributes")
        .query(Q.where("patient_id", patientId))
        .fetch()

      expect(attrs).toHaveLength(1)
    })
  })

  describe("checkUniqueFieldValue (government_id)", () => {
    it("returns true when another patient already has the value", async () => {
      const record = makePatientRecord({
        given_name: "Carol",
        surname: "White",
        government_id: "GOV-999",
      })
      await Patient.DB.register(record, provider(), clinicRef())

      const govtField = record.fields.find((f) => f.column === "government_id")
      const exists = await Patient.DB.checkUniqueFieldValue({
        field: govtField,
        value: "GOV-999",
        fields: record.fields,
      })
      expect(exists).toBe(true)
    })

    it("returns false when no patient has that value", async () => {
      const record = makePatientRecord({ government_id: "GOV-1" })
      const govtField = record.fields.find((f) => f.column === "government_id")
      const exists = await Patient.DB.checkUniqueFieldValue({
        field: govtField,
        value: "GOV-NONEXISTENT",
        fields: record.fields,
      })
      expect(exists).toBe(false)
    })
  })

  describe("getById", () => {
    it("retrieves a registered patient by id with base fields populated", async () => {
      const record = makePatientRecord({
        given_name: "Diana",
        surname: "Prince",
        sex: "F",
        phone: "555-0200",
      })
      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      const fetched = await Patient.DB.getById(patientId, record.fields)

      expect(fetched.values["given_name"]).toBe("Diana")
      expect(fetched.values["surname"]).toBe("Prince")
      expect(fetched.values["sex"]).toBe("F")
      expect(fetched.values["phone"]).toBe("555-0200")
    })
  })

  describe("updateById", () => {
    it("updates patient base fields", async () => {
      const record = makePatientRecord({
        given_name: "Eve",
        surname: "Original",
        phone: "111-0000",
      })
      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      const updatedRecord = makePatientRecord({
        given_name: "Eve",
        surname: "Updated",
        phone: "222-1111",
      })
      await Patient.DB.updateById(patientId, updatedRecord, provider(), clinicRef())

      const dbPatient = await testDb.get<PatientModel>("patients").find(patientId)
      expect(dbPatient.surname).toBe("Updated")
      expect(dbPatient.phone).toBe("222-1111")
    })
  })

  describe("deleteById", () => {
    it("marks the patient and related records as deleted", async () => {
      const record = makePatientRecord({ given_name: "Frank", surname: "Delete" })
      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      await testDb.write(async () => {
        const visit = testDb.get<VisitModel>("visits").prepareCreate((v) => {
          v.patientId = patientId
          v.clinicId = clinic.id
          v.providerId = user.id
          v.providerName = user.name
          v.checkInTimestamp = new Date()
          v.isDeleted = false
        })
        const event = testDb.get<EventModel>("events").prepareCreate((e) => {
          e.patientId = patientId
          e.visitId = visit.id
          e.formId = "form-1"
          e.eventType = "vitals"
          e.formData = []
          e.metadata = {}
          e.isDeleted = false
          e.recordedByUserId = user.id
        })
        await testDb.batch(visit, event)
      })

      await Patient.DB.deleteById(patientId)

      // Patient should be marked as deleted in WatermelonDB's internal state
      const patients = await testDb
        .get<PatientModel>("patients")
        .query(Q.where("is_deleted", false))
        .fetch()
      expect(patients).toHaveLength(0)
    })
  })

  describe("getReportData", () => {
    it("returns visits with their associated events", async () => {
      const record = makePatientRecord({ given_name: "Grace", surname: "Report" })
      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      await testDb.write(async () => {
        const visit = testDb.get<VisitModel>("visits").prepareCreate((v) => {
          v.patientId = patientId
          v.clinicId = clinic.id
          v.providerId = user.id
          v.providerName = user.name
          v.checkInTimestamp = new Date()
          v.isDeleted = false
        })
        const event = testDb.get<EventModel>("events").prepareCreate((e) => {
          e.patientId = patientId
          e.visitId = visit.id
          e.formId = "form-1"
          e.eventType = "vitals"
          e.formData = [{ inputType: "text", fieldType: "text", name: "BP", value: "120/80", fieldId: "bp" }]
          e.metadata = {}
          e.isDeleted = false
          e.recordedByUserId = user.id
        })
        await testDb.batch(visit, event)
      })

      const reportData = await Patient.DB.getReportData(patientId, false)
      expect(reportData).toHaveLength(1)
      expect(reportData[0].events).toHaveLength(1)
      expect(reportData[0].events[0].formData[0].name).toBe("BP")
    })

    it("filters empty visits when ignoreEmptyVisits is true", async () => {
      const record = makePatientRecord({ given_name: "Helen", surname: "Filter" })
      const patientId = await Patient.DB.register(record, provider(), clinicRef())

      await testDb.write(() =>
        testDb.get<VisitModel>("visits").create((v) => {
          v.patientId = patientId
          v.clinicId = clinic.id
          v.providerId = user.id
          v.providerName = user.name
          v.checkInTimestamp = new Date()
          v.isDeleted = false
        }),
      )

      const reportData = await Patient.DB.getReportData(patientId, true)
      expect(reportData).toHaveLength(0)
    })
  })
})

// PatientVitals.DB integration tests

describe("PatientVitals.DB", () => {
  let patientId: string

  beforeEach(async () => {
    const clinic = await seedClinic()
    const user = await seedUser("Dr. Vitals", clinic.id)
    await seedPermissions(user.id, clinic.id)

    const record = makePatientRecord({ given_name: "Vitals", surname: "Patient" })
    patientId = await Patient.DB.register(
      record,
      { id: user.id, name: user.name },
      { id: clinic.id, name: clinic.name },
    )
  })

  it("creates vitals and retrieves by patient", async () => {
    const vitalsId = await PatientVitals.DB.create({
      patientId,
      visitId: Option.none(),
      timestamp: new Date("2024-06-01T10:00:00Z"),
      systolicBp: Option.some(120),
      diastolicBp: Option.some(80),
      bpPosition: Option.some("sitting" as const),
      heightCm: Option.some(175),
      weightKg: Option.some(70),
      bmi: Option.some(22.9),
      waistCircumferenceCm: Option.none(),
      heartRate: Option.some(72),
      pulseRate: Option.none(),
      oxygenSaturation: Option.some(98),
      respiratoryRate: Option.some(16),
      temperatureCelsius: Option.some(36.6),
      painLevel: Option.none(),
      recordedByUserId: Option.some("user-1"),
      metadata: {},
      isDeleted: false,
    })

    expect(vitalsId).toBeDefined()

    const allVitals = await PatientVitals.DB.getAllForPatient(patientId)
    expect(allVitals).toHaveLength(1)
    expect(Option.getOrNull(allVitals[0].systolicBp)).toBe(120)
    expect(Option.getOrNull(allVitals[0].diastolicBp)).toBe(80)
    expect(Option.getOrNull(allVitals[0].heartRate)).toBe(72)
  })

  it("getLatestForPatient returns the most recent vitals", async () => {
    await PatientVitals.DB.create({
      patientId,
      visitId: Option.none(),
      timestamp: new Date("2024-01-01"),
      systolicBp: Option.some(110),
      diastolicBp: Option.some(70),
      bpPosition: Option.none(),
      heightCm: Option.none(),
      weightKg: Option.none(),
      bmi: Option.none(),
      waistCircumferenceCm: Option.none(),
      heartRate: Option.none(),
      pulseRate: Option.none(),
      oxygenSaturation: Option.none(),
      respiratoryRate: Option.none(),
      temperatureCelsius: Option.none(),
      painLevel: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })
    await PatientVitals.DB.create({
      patientId,
      visitId: Option.none(),
      timestamp: new Date("2024-06-15"),
      systolicBp: Option.some(130),
      diastolicBp: Option.some(85),
      bpPosition: Option.none(),
      heightCm: Option.none(),
      weightKg: Option.none(),
      bmi: Option.none(),
      waistCircumferenceCm: Option.none(),
      heartRate: Option.none(),
      pulseRate: Option.none(),
      oxygenSaturation: Option.none(),
      respiratoryRate: Option.none(),
      temperatureCelsius: Option.none(),
      painLevel: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })

    const latest = await PatientVitals.DB.getLatestForPatient(patientId)
    expect(Option.isSome(latest)).toBe(true)
    const vitals = Option.getOrThrow(latest)
    expect(Option.getOrNull(vitals.systolicBp)).toBe(130)
  })

  it("returns none when patient has no vitals", async () => {
    const latest = await PatientVitals.DB.getLatestForPatient("nonexistent-patient")
    expect(Option.isNone(latest)).toBe(true)
  })

  it("update changes provided fields, clears none values and leaves the rest alone", async () => {
    const vitalsId = await PatientVitals.DB.create({
      patientId,
      visitId: Option.none(),
      timestamp: new Date("2024-06-01T10:00:00Z"),
      systolicBp: Option.some(120),
      diastolicBp: Option.some(80),
      bpPosition: Option.some("sitting" as const),
      heightCm: Option.some(175),
      weightKg: Option.some(70),
      bmi: Option.some(22.9),
      waistCircumferenceCm: Option.none(),
      heartRate: Option.some(72),
      pulseRate: Option.none(),
      oxygenSaturation: Option.some(98),
      respiratoryRate: Option.some(16),
      temperatureCelsius: Option.some(36.6),
      painLevel: Option.some(4),
      recordedByUserId: Option.some("user-1"),
      metadata: { source: "mobile" },
      isDeleted: false,
    })

    await PatientVitals.DB.update(vitalsId, {
      systolicBp: Option.some(135),
      painLevel: Option.none(),
    })

    const [updated] = await PatientVitals.DB.getAllForPatient(patientId)
    expect(Option.getOrNull(updated.systolicBp)).toBe(135)
    expect(Option.isNone(updated.painLevel)).toBe(true)
    expect(Option.getOrNull(updated.diastolicBp)).toBe(80)
    expect(Option.getOrNull(updated.oxygenSaturation)).toBe(98)
    expect(Option.getOrNull(updated.heartRate)).toBe(72)
    expect(Option.getOrNull(updated.recordedByUserId)).toBe("user-1")
    expect(updated.metadata).toEqual({ source: "mobile" })
  })

  it("update advances updated_at so the edit survives the server's sync merge", async () => {
    // The server upserts a synced row only when its updated_at is newer, so an
    // edit that leaves the timestamp alone is silently discarded on push.
    const vitalsId = await createVitals(patientId, { systolicBp: Option.some(120) })
    const [before] = await PatientVitals.DB.getAllForPatient(patientId)

    await new Promise((resolve) => setTimeout(resolve, 5))
    await PatientVitals.DB.update(vitalsId, { systolicBp: Option.some(130) })

    const [after] = await PatientVitals.DB.getAllForPatient(patientId)
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })

  it("update leaves identity and lifecycle fields untouched", async () => {
    const timestamp = new Date("2024-06-01T10:00:00Z")
    const vitalsId = await createVitals(patientId, { timestamp })
    const [before] = await PatientVitals.DB.getAllForPatient(patientId)

    await PatientVitals.DB.update(vitalsId, { pulseRate: Option.some(88) })

    const [after] = await PatientVitals.DB.getAllForPatient(patientId)
    expect(after.id).toBe(before.id)
    expect(after.patientId).toBe(patientId)
    expect(after.timestamp.getTime()).toBe(timestamp.getTime())
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime())
    expect(after.isDeleted).toBe(false)
  })

  it("concurrent updates to disjoint fields both survive", async () => {
    // Holds only while update writes just the keys it was given.
    const vitalsId = await createVitals(patientId)

    await Promise.all([
      PatientVitals.DB.update(vitalsId, { systolicBp: Option.some(140) }),
      PatientVitals.DB.update(vitalsId, { pulseRate: Option.some(90) }),
    ])

    const [updated] = await PatientVitals.DB.getAllForPatient(patientId)
    expect(Option.getOrNull(updated.systolicBp)).toBe(140)
    expect(Option.getOrNull(updated.pulseRate)).toBe(90)
  })

  it("update rejects an unknown id rather than silently succeeding", async () => {
    await expect(
      PatientVitals.DB.update("no-such-vitals-id", { systolicBp: Option.some(120) }),
    ).rejects.toBeDefined()
  })

  it("update applies to a soft-deleted record, unlike the server command", async () => {
    // A real divergence: the server scopes its update to `is_deleted = false`,
    // the local one does not.
    const vitalsId = await createVitals(patientId, { isDeleted: true })

    await PatientVitals.DB.update(vitalsId, { systolicBp: Option.some(150) })

    const record = await testDb.get("patient_vitals").find(vitalsId)
    expect(Option.getOrNull(PatientVitals.DB.fromDB(record as never).systolicBp)).toBe(150)
  })
})

/** Minimal vitals record for update-focused tests */
async function createVitals(
  patientId: string,
  overrides: Partial<Parameters<typeof PatientVitals.DB.create>[0]> = {},
): Promise<string> {
  return PatientVitals.DB.create({
    patientId,
    visitId: Option.none(),
    timestamp: new Date("2024-06-01T10:00:00Z"),
    systolicBp: Option.none(),
    diastolicBp: Option.none(),
    bpPosition: Option.none(),
    heightCm: Option.none(),
    weightKg: Option.none(),
    bmi: Option.none(),
    waistCircumferenceCm: Option.none(),
    heartRate: Option.none(),
    pulseRate: Option.none(),
    oxygenSaturation: Option.none(),
    respiratoryRate: Option.none(),
    temperatureCelsius: Option.none(),
    painLevel: Option.none(),
    recordedByUserId: Option.none(),
    metadata: {},
    isDeleted: false,
    ...overrides,
  })
}

// PatientProblems.DB integration tests

describe("PatientProblems.DB", () => {
  let patientId: string

  beforeEach(async () => {
    const clinic = await seedClinic()
    const user = await seedUser("Dr. Diagnosis", clinic.id)
    await seedPermissions(user.id, clinic.id)

    const record = makePatientRecord({ given_name: "Problem", surname: "Patient" })
    patientId = await Patient.DB.register(
      record,
      { id: user.id, name: user.name },
      { id: clinic.id, name: clinic.name },
    )
  })

  it("creates a problem and retrieves it", async () => {
    const problemId = await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "I10",
      problemLabel: "Essential (primary) hypertension",
      clinicalStatus: "active",
      verificationStatus: "confirmed",
      severityScore: Option.some(5),
      onsetDate: Option.some(new Date("2024-01-15")),
      endDate: Option.none(),
      recordedByUserId: Option.some("user-1"),
      metadata: {},
      isDeleted: false,
    })

    expect(problemId).toBeDefined()

    const all = await PatientProblems.DB.getAllForPatient(patientId)
    expect(all).toHaveLength(1)
    expect(all[0].problemCode).toBe("I10")
    expect(all[0].problemLabel).toBe("Essential (primary) hypertension")
    expect(all[0].clinicalStatus).toBe("active")
    expect(all[0].verificationStatus).toBe("confirmed")
  })

  it("update advances updated_at so the live query re-emits the edit", async () => {
    // useDBPatientProblems watches updated_at rather than each field, so an edit
    // that leaves it alone would never reach the list on screen.
    const problemId = await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "I10",
      problemLabel: "Hypertension",
      clinicalStatus: "active",
      verificationStatus: "confirmed",
      severityScore: Option.none(),
      onsetDate: Option.none(),
      endDate: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })
    const [before] = await PatientProblems.DB.getAllForPatient(patientId)

    await new Promise((resolve) => setTimeout(resolve, 5))
    await PatientProblems.DB.update(problemId, { clinicalStatus: "resolved" })

    const [after] = await PatientProblems.DB.getAllForPatient(patientId)
    expect(after.clinicalStatus).toBe("resolved")
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })

  it("getActiveForPatient filters by active status", async () => {
    await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "I10",
      problemLabel: "Hypertension",
      clinicalStatus: "active",
      verificationStatus: "confirmed",
      severityScore: Option.none(),
      onsetDate: Option.none(),
      endDate: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })
    await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "J45.909",
      problemLabel: "Asthma",
      clinicalStatus: "resolved",
      verificationStatus: "confirmed",
      severityScore: Option.none(),
      onsetDate: Option.none(),
      endDate: Option.some(new Date("2024-06-01")),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })

    const active = await PatientProblems.DB.getActiveForPatient(patientId)
    expect(active).toHaveLength(1)
    expect(active[0].problemCode).toBe("I10")

    const all = await PatientProblems.DB.getAllForPatient(patientId)
    expect(all).toHaveLength(2)
  })

  it("updates a problem's clinical status and verification", async () => {
    const problemId = await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "E11.9",
      problemLabel: "Type 2 diabetes",
      clinicalStatus: "active",
      verificationStatus: "provisional",
      severityScore: Option.none(),
      onsetDate: Option.none(),
      endDate: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })

    await PatientProblems.DB.update(problemId, {
      verificationStatus: "confirmed",
      severityScore: Option.some(7),
    })

    const all = await PatientProblems.DB.getAllForPatient(patientId)
    expect(all[0].verificationStatus).toBe("confirmed")
    expect(Option.getOrNull(all[0].severityScore)).toBe(7)
  })

  it("resolve marks a problem as resolved with an end date", async () => {
    const problemId = await PatientProblems.DB.create({
      patientId,
      visitId: Option.none(),
      problemCodeSystem: "icd10",
      problemCode: "J18.9",
      problemLabel: "Pneumonia",
      clinicalStatus: "active",
      verificationStatus: "confirmed",
      severityScore: Option.none(),
      onsetDate: Option.some(new Date("2024-03-01")),
      endDate: Option.none(),
      recordedByUserId: Option.none(),
      metadata: {},
      isDeleted: false,
    })

    const endDate = new Date("2024-03-15")
    await PatientProblems.DB.resolve(problemId, endDate)

    const all = await PatientProblems.DB.getAllForPatient(patientId)
    expect(all[0].clinicalStatus).toBe("resolved")
    expect(Option.isSome(all[0].endDate)).toBe(true)
  })
})

// Peer.DB integration tests

describe("Peer.DB", () => {
  it("creates and retrieves a peer", async () => {
    const id = await Peer.DB.create({
      peerId: "hub-001",
      name: "Local Hub",
      ipAddress: "192.168.1.100",
      port: 8080,
      publicKey: "pk_test_123",
      lastSyncedAt: null,
      peerType: "sync_hub",
      isLeader: false,
      status: "active",
      protocolVersion: "1",
      metadata: { url: "http://192.168.1.100:8080" },
    })

    const peer = await Peer.DB.getById(id)
    expect(peer.peerId).toBe("hub-001")
    expect(peer.name).toBe("Local Hub")
    expect(peer.peerType).toBe("sync_hub")
    expect(peer.status).toBe("active")
  })

  it("getByPeerId finds a peer by its peer_id string", async () => {
    await Peer.DB.create({
      peerId: "cloud:https://api.example.com",
      name: "Cloud Server",
      ipAddress: null,
      port: null,
      publicKey: "",
      lastSyncedAt: null,
      peerType: "cloud_server",
      isLeader: false,
      status: "active",
      protocolVersion: "1",
      metadata: { url: "https://api.example.com" },
    })

    const peer = await Peer.DB.getByPeerId("cloud:https://api.example.com")
    expect(peer).not.toBeNull()
    expect(peer!.name).toBe("Cloud Server")
  })

  it("getByPeerId returns null for unknown peer_id", async () => {
    const peer = await Peer.DB.getByPeerId("nonexistent")
    expect(peer).toBeNull()
  })

  it("upsert creates on first call, updates on second", async () => {
    await Peer.DB.upsert({
      peerId: "hub-upsert",
      name: "Original Name",
      peerType: "sync_hub",
      publicKey: "pk1",
    })

    let peer = await Peer.DB.getByPeerId("hub-upsert")
    expect(peer!.name).toBe("Original Name")

    await Peer.DB.upsert({
      peerId: "hub-upsert",
      name: "Updated Name",
      peerType: "sync_hub",
      publicKey: "pk2",
    })

    peer = await Peer.DB.getByPeerId("hub-upsert")
    expect(peer!.name).toBe("Updated Name")
    expect(peer!.status).toBe("active")

    const all = await Peer.DB.getAll()
    expect(all).toHaveLength(1)
  })

  it("upsertCloud revokes existing cloud peers", async () => {
    await Peer.DB.upsertCloud("https://old-server.com")
    await Peer.DB.upsertCloud("https://new-server.com")

    const active = await Peer.DB.getActive()
    const activeCloud = active.filter((p) => p.peerType === "cloud_server")
    expect(activeCloud).toHaveLength(1)
    expect(activeCloud[0].metadata?.url).toBe("https://new-server.com")
  })

  it("resolveActive prefers hub over cloud", async () => {
    await Peer.DB.upsertCloud("https://cloud.example.com")
    await Peer.DB.upsertHub({
      hubId: "hub-priority",
      name: "Priority Hub",
      publicKey: "pk_hub",
    })

    const active = await Peer.DB.resolveActive()
    expect(active).not.toBeNull()
    expect(active!.peerType).toBe("sync_hub")
  })

  it("resolveActive falls back to cloud when no hub exists", async () => {
    await Peer.DB.upsertCloud("https://fallback-cloud.com")

    const active = await Peer.DB.resolveActive()
    expect(active).not.toBeNull()
    expect(active!.peerType).toBe("cloud_server")
  })

  it("resolveActive returns null when no peers exist", async () => {
    const active = await Peer.DB.resolveActive()
    expect(active).toBeNull()
  })

  it("updateLastSyncedAt records the sync timestamp", async () => {
    const id = await Peer.DB.create({
      peerId: "sync-ts-test",
      name: "Sync Peer",
      ipAddress: null,
      port: null,
      publicKey: "",
      lastSyncedAt: null,
      peerType: "sync_hub",
      isLeader: false,
      status: "active",
      protocolVersion: "1",
      metadata: {},
    })

    const syncTime = Date.now()
    await Peer.DB.updateLastSyncedAt(id, syncTime)

    const peer = await Peer.DB.getById(id)
    expect(peer.lastSyncedAt).toBe(syncTime)
  })
})

// Event.DB integration tests

describe("Event.DB", () => {
  let patientId: string
  let clinicId: string
  let userId: string
  let userName: string

  beforeEach(async () => {
    const clinic = await seedClinic()
    clinicId = clinic.id
    const user = await seedUser("Dr. Events", clinic.id)
    userId = user.id
    userName = user.name
    await seedPermissions(user.id, clinic.id)

    const record = makePatientRecord({ given_name: "Event", surname: "Patient" })
    patientId = await Patient.DB.register(
      record,
      { id: userId, name: userName },
      { id: clinicId, name: clinic.name },
    )
  })

  it("creates a new event and visit when no visitId is provided", async () => {
    const eventInput = {
      patientId,
      formId: "form-vitals",
      visitId: "",
      eventType: "vitals",
      formData: [
        { inputType: "text", fieldType: "text", name: "Temperature", value: "37.0", fieldId: "temp" },
      ],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const result = await Event.DB.create(
      eventInput,
      null, // no visitId — should create one
      clinicId,
      userId,
      userName,
      Date.now(),
    )

    expect(result.eventId).toBeDefined()
    expect(result.visitId).toBeDefined()

    const events = await testDb
      .get<EventModel>("events")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(events).toHaveLength(1)
    expect(events[0].formData[0].name).toBe("Temperature")

    const visits = await testDb
      .get<VisitModel>("visits")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(visits).toHaveLength(1)
  })

  it.each([
    ["an empty clinicId", ""],
    ["a non-uuid clinicId", "clinic-1"],
  ])("refuses to create an event with %s", async (_label, badClinicId) => {
    const eventInput = {
      patientId,
      formId: "form-vitals",
      visitId: "",
      eventType: "vitals",
      formData: [],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    await expect(
      Event.DB.create(eventInput, null, badClinicId, userId, userName, Date.now()),
    ).rejects.toThrow(/valid clinic_id/)

    const events = await testDb
      .get<EventModel>("events")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(events).toHaveLength(0)

    const visits = await testDb
      .get<VisitModel>("visits")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(visits).toHaveLength(0)
  })

  it("records a null recordedByUserId when there is no provider", async () => {
    const eventInput = {
      patientId,
      formId: "form-vitals",
      visitId: "",
      eventType: "vitals",
      formData: [],
      metadata: {},
      isDeleted: false,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const result = await Event.DB.create(eventInput, null, clinicId, "", "", Date.now())

    const event = await testDb.get<EventModel>("events").find(result.eventId)
    expect(event.recordedByUserId).toBeNull()
  })

  it("adds an event to an existing visit", async () => {
    const visit = await testDb.write(() =>
      testDb.get<VisitModel>("visits").create((v) => {
        v.patientId = patientId
        v.clinicId = clinicId
        v.providerId = userId
        v.providerName = userName
        v.checkInTimestamp = new Date()
        v.isDeleted = false
      }),
    )

    const eventInput = {
      patientId,
      formId: "form-exam",
      visitId: visit.id,
      eventType: "examination",
      formData: [],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const result = await Event.DB.create(
      eventInput,
      visit.id,
      clinicId,
      userId,
      userName,
      Date.now(),
    )

    expect(result.visitId).toBe(visit.id)

    const visits = await testDb
      .get<VisitModel>("visits")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(visits).toHaveLength(1)
  })

  it("updates an existing event when eventId is provided", async () => {
    const eventInput = {
      patientId,
      formId: "form-1",
      visitId: "",
      eventType: "vitals",
      formData: [{ inputType: "text", fieldType: "text", name: "BP", value: "120/80", fieldId: "bp" }],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const { eventId, visitId } = await Event.DB.create(
      eventInput,
      null,
      clinicId,
      userId,
      userName,
      Date.now(),
    )

    const updatedInput = {
      ...eventInput,
      formData: [{ inputType: "text", fieldType: "text", name: "BP", value: "130/85", fieldId: "bp" }],
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const result = await Event.DB.create(
      updatedInput,
      visitId,
      clinicId,
      userId,
      userName,
      Date.now(),
      eventId,
    )

    expect(result.eventId).toBe(eventId)

    const event = await testDb.get<EventModel>("events").find(eventId)
    expect(event.formData[0].value).toBe("130/85")
  })

  it("softDelete marks an event as deleted", async () => {
    const eventInput = {
      patientId,
      formId: "form-delete",
      visitId: "",
      eventType: "test",
      formData: [],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">

    const { eventId } = await Event.DB.create(
      eventInput,
      null,
      clinicId,
      userId,
      userName,
      Date.now(),
    )

    await Event.DB.softDelete(eventId)

    // After soft delete + markAsDeleted, the record should not appear in normal queries
    const events = await testDb
      .get<EventModel>("events")
      .query(Q.where("patient_id", patientId), Q.where("is_deleted", false))
      .fetch()
    expect(events).toHaveLength(0)
  })
})

// The rule itself is covered in packages/hh-forms; what these exercise is the
// wiring — that Event.DB writes, retires, and cascades what the rule decides.

describe("Event.DB diagnoses → patient problems", () => {
  const DIAGNOSIS_FIELD_ID = "field-diagnosis"
  const CHOLERA = { code: "1A00", desc: "Cholera" }
  const DIABETES = { code: "5A11", desc: "Type 2 diabetes" }

  let patientId: string
  let clinicId: string
  let userId: string
  let userName: string

  beforeEach(async () => {
    const clinic = await seedClinic()
    clinicId = clinic.id
    const user = await seedUser("Dr. Chart", clinic.id)
    userId = user.id
    userName = user.name
    await seedPermissions(user.id, clinic.id)

    const record = makePatientRecord({ given_name: "Chart", surname: "Patient" })
    patientId = await Patient.DB.register(
      record,
      { id: userId, name: userName },
      { id: clinicId, name: clinic.name },
    )
  })

  /** A form with one diagnosis field. Pass `null` to omit `addToProblems`
   * entirely, as a form authored before the flag existed would. */
  async function seedDiagnosisForm(addToProblems: boolean | null = true) {
    const form = await testDb.write(() =>
      testDb.get<EventFormModel>("event_forms").create((f) => {
        f.name = "Consultation"
        f.description = "Consultation form"
        f.language = "en"
        f.isEditable = true
        f.isSnapshotForm = false
        f.formFields = [
          {
            id: DIAGNOSIS_FIELD_ID,
            name: "Diagnosis",
            fieldType: "diagnosis",
            inputType: "diagnosis",
            ...(addToProblems === null ? {} : { addToProblems }),
          },
        ] as unknown as EventForm.FieldItem[]
        f.metadata = {}
        f.isDeleted = false
      }),
    )
    return form.id
  }

  function eventInput(formId: string, diagnoses: { code: string; desc: string }[]) {
    return {
      patientId,
      formId,
      visitId: "",
      eventType: "consultation",
      formData: [
        {
          inputType: "diagnosis",
          fieldType: "diagnosis",
          name: "Diagnosis",
          fieldId: DIAGNOSIS_FIELD_ID,
          value: diagnoses,
        },
      ],
      metadata: {},
      isDeleted: false,
      recordedByUserId: userId,
    } as unknown as Omit<EventModel, "id" | "createdAt" | "updatedAt">
  }

  const saveEvent = (
    formId: string,
    diagnoses: { code: string; desc: string }[],
    existing?: { eventId: string; visitId: string },
  ) =>
    Event.DB.create(
      eventInput(formId, diagnoses),
      existing?.visitId ?? null,
      clinicId,
      userId,
      userName,
      Date.now(),
      existing?.eventId,
    )

  const chartLabels = async () =>
    (await PatientProblems.DB.getAllForPatient(patientId))
      .map((problem) => problem.problemLabel)
      .sort()

  it("records a diagnosis on the patient's chart", async () => {
    const formId = await seedDiagnosisForm()

    const { eventId } = await saveEvent(formId, [CHOLERA])

    const problems = await PatientProblems.DB.getAllForPatient(patientId)
    expect(problems).toHaveLength(1)
    expect(problems[0].problemCode).toBe("1A00")
    expect(problems[0].problemLabel).toBe("Cholera")
    expect(problems[0].problemCodeSystem).toBe("icd11")
    expect(problems[0].clinicalStatus).toBe("active")
    expect(problems[0].verificationStatus).toBe("provisional")

    // The metadata link is the only way back to the event that recorded it.
    const [record] = await testDb
      .get<PatientProblemModel>("patient_problems")
      .query(Q.where("patient_id", patientId))
      .fetch()
    expect(record.metadata.eventId).toBe(eventId)

    // Singly-encoded, so it lands in the cloud as a jsonb object. Encoded twice
    // it arrives as a jsonb string and `metadata->>'eventId'` matches nothing.
    expect(JSON.parse(record._getRaw("metadata") as string)).toEqual({ eventId })
  })

  // Forms authored before the flag existed must not start writing to charts.
  it("records nothing when the field is not marked for the chart", async () => {
    const formId = await seedDiagnosisForm(null)

    await saveEvent(formId, [CHOLERA])

    expect(await chartLabels()).toEqual([])
  })

  it("retires a diagnosis dropped from the event", async () => {
    const formId = await seedDiagnosisForm()
    const saved = await saveEvent(formId, [CHOLERA, DIABETES])
    expect(await chartLabels()).toEqual(["Cholera", "Type 2 diabetes"])

    await saveEvent(formId, [DIABETES], saved)

    expect(await chartLabels()).toEqual(["Type 2 diabetes"])
  })

  it("does not resurrect a problem removed from the chart by hand", async () => {
    const formId = await seedDiagnosisForm()
    const saved = await saveEvent(formId, [CHOLERA])

    const recorded = await testDb
      .get<PatientProblemModel>("patient_problems")
      .query(Q.where("patient_id", patientId))
      .fetch()
    await testDb.write(() => PatientProblems.DB.softDelete(recorded))

    await saveEvent(formId, [CHOLERA], saved)

    expect(await chartLabels()).toEqual([])
  })

  it("takes the event's diagnoses off the chart when the event is deleted", async () => {
    const formId = await seedDiagnosisForm()
    const { eventId } = await saveEvent(formId, [CHOLERA])
    expect(await chartLabels()).toEqual(["Cholera"])

    await Event.DB.softDelete(eventId)

    expect(await chartLabels()).toEqual([])
  })

  it("leaves another event's diagnoses on the chart", async () => {
    const formId = await seedDiagnosisForm()
    const { eventId } = await saveEvent(formId, [CHOLERA])
    await saveEvent(formId, [DIABETES])

    await Event.DB.softDelete(eventId)

    expect(await chartLabels()).toEqual(["Type 2 diabetes"])
  })
})

// Property-based: patient registration round-trip

describe("Property-based: Patient.DB.register round-trip", () => {
  it("any valid name/phone survives register → getById round-trip", async () => {
    const clinic = await seedClinic()
    const user = await seedUser("Dr. PBT", clinic.id)
    await seedPermissions(user.id, clinic.id)

    const safeStr = fc
      .string({ minLength: 1, maxLength: 80 })
      .filter((s) => s.trim().length > 0 && !s.includes("\0"))

    await fc.assert(
      fc.asyncProperty(safeStr, safeStr, safeStr, async (given, surname, phone) => {
        const record = makePatientRecord({
          given_name: given,
          surname,
          phone,
        })
        const patientId = await Patient.DB.register(
          record,
          { id: user.id, name: user.name },
          { id: clinic.id, name: clinic.name },
        )

        const fetched = await Patient.DB.getById(patientId, record.fields)
        expect(fetched.values["given_name"]).toBe(given)
        expect(fetched.values["surname"]).toBe(surname)
        expect(fetched.values["phone"]).toBe(phone)
      }),
      { numRuns: 15 },
    )
  })
})
