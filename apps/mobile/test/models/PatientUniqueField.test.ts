/**
 * Tests for the unique-field guardrail: `Patient.DB.checkUniqueFieldValue`
 * and its pure coercion helpers.
 *
 * The DB tests seed patients through the real `Patient.DB.register` write
 * path (against a LokiJS test database) so the query under test is validated
 * against exactly the representation production writes — base columns on the
 * `patients` table and typed value columns on `patient_additional_attributes`.
 */

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"

// Mock the singleton database — models importing `@/db` get the test DB.
jest.mock("@/db", () => ({
  __esModule: true,
  get default() {
    return (global as any).__TEST_DB__
  },
  get database() {
    return (global as any).__TEST_DB__
  },
}))

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureEvent: jest.fn(),
}))

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

jest.mock("../../app/store/provider", () => {
  const { Option } = require("effect")
  return {
    providerStore: {
      getSnapshot: () => ({
        context: {
          role: Option.some("super_admin"),
          clinicId: Option.some("clinic-1"),
        },
      }),
    },
  }
})

import { Database } from "@nozbe/watermelondb"

import Patient from "../../app/models/Patient"
import type { RegistrationFormField } from "../../app/db/model/PatientRegistrationForm"
import PatientModel from "../../app/db/model/Patient"
import ClinicModel from "../../app/db/model/Clinic"
import UserModel from "../../app/db/model/User"
import UserClinicPermissionModel from "../../app/db/model/UserClinicPermissions"

// ---------------------------------------------------------------------------
// Pure helpers — no database needed
// ---------------------------------------------------------------------------

describe("isBlankUniqueValue", () => {
  it("treats undefined, null, and whitespace-only strings as blank", () => {
    expect(Patient.isBlankUniqueValue(undefined)).toBe(true)
    expect(Patient.isBlankUniqueValue(null)).toBe(true)
    expect(Patient.isBlankUniqueValue("")).toBe(true)
    expect(Patient.isBlankUniqueValue("   ")).toBe(true)
  })

  it("treats real values (including 0 and false) as present", () => {
    expect(Patient.isBlankUniqueValue("abc")).toBe(false)
    expect(Patient.isBlankUniqueValue(0)).toBe(false)
    expect(Patient.isBlankUniqueValue(false)).toBe(false)
    expect(Patient.isBlankUniqueValue(new Date())).toBe(false)
  })
})

describe("coerceAttributeUniqueQueryValue", () => {
  it("coerces to the representation each value column stores", () => {
    expect(Patient.coerceAttributeUniqueQueryValue("number_value", "42")).toBe(42)
    expect(Patient.coerceAttributeUniqueQueryValue("string_value", 7)).toBe("7")
    expect(Patient.coerceAttributeUniqueQueryValue("boolean_value", 1)).toBe(true)
    const d = new Date("2020-01-02T03:04:05Z")
    expect(Patient.coerceAttributeUniqueQueryValue("date_value", d)).toBe(d.getTime())
    expect(Patient.coerceAttributeUniqueQueryValue("date_value", 123)).toBe(123)
  })
})

describe("coerceBaseUniqueQueryValue", () => {
  it("formats Date-typed base fields as yyyy-MM-dd and stringifies others", () => {
    const dateField = { fieldType: "date" } as RegistrationFormField
    expect(
      Patient.coerceBaseUniqueQueryValue(dateField, new Date("1990-06-15T12:00:00")),
    ).toBe("1990-06-15")

    const textField = { fieldType: "text" } as RegistrationFormField
    expect(Patient.coerceBaseUniqueQueryValue(textField, "GOV-1")).toBe("GOV-1")
  })
})

describe("getAdditionalFieldColumnName", () => {
  const f = (id: string, fieldType: RegistrationFormField["fieldType"]): RegistrationFormField =>
    ({ id, fieldType }) as RegistrationFormField

  it("maps each fieldType to its typed value column", () => {
    const fields = [
      f("n", "number"),
      f("t", "text"),
      f("s", "select"),
      f("c", "checkbox"),
      f("d", "date"),
      f("b", "boolean"),
    ]
    expect(Patient.getAdditionalFieldColumnName(fields, "n")).toBe("number_value")
    expect(Patient.getAdditionalFieldColumnName(fields, "t")).toBe("string_value")
    expect(Patient.getAdditionalFieldColumnName(fields, "s")).toBe("string_value")
    expect(Patient.getAdditionalFieldColumnName(fields, "c")).toBe("string_value")
    expect(Patient.getAdditionalFieldColumnName(fields, "d")).toBe("date_value")
    expect(Patient.getAdditionalFieldColumnName(fields, "b")).toBe("boolean_value")
  })

  it("defaults to string_value when the attribute id is not in the form", () => {
    expect(Patient.getAdditionalFieldColumnName([f("x", "number")], "missing")).toBe("string_value")
  })

  // Characterization of a known bug (INV-5/6), pinned so it can't drift silently.
  // The value column is picked from the field's current fieldType, so once an
  // admin changes a field's type after data was written, reads target a different
  // column than the one the value went into — the value is stranded, because
  // nothing migrates it between slots.
  it("selects the column by CURRENT type — a post-write type change strands the value", () => {
    // "forty" was written when "age" was `text` → it lives in string_value.
    // Admin later changed "age" to `number`; the read now targets number_value.
    expect(Patient.getAdditionalFieldColumnName([f("age", "number")], "age")).toBe("number_value")
    // The pre-change form pointed at the string_value where "forty" actually is:
    expect(Patient.getAdditionalFieldColumnName([f("age", "text")], "age")).toBe("string_value")
    // → same attribute id, two different columns before/after the type change.
  })
})

// ---------------------------------------------------------------------------
// DB-backed checks
// ---------------------------------------------------------------------------

/** Registration form used across the DB tests: two base + two custom fields. */
function makeFields(): RegistrationFormField[] {
  const base = (
    id: string,
    column: string,
    fieldType: RegistrationFormField["fieldType"],
    unique: boolean,
  ): RegistrationFormField => ({
    id,
    column,
    position: 1,
    label: { en: column },
    fieldType,
    options: [],
    required: false,
    baseField: true,
    visible: true,
    unique,
    isSearchField: false,
    deleted: false,
  })

  const custom = (
    id: string,
    column: string,
    fieldType: RegistrationFormField["fieldType"],
    unique: boolean,
  ): RegistrationFormField => ({ ...base(id, column, fieldType, unique), baseField: false })

  return [
    base("given_name", "given_name", "text", false),
    base("surname", "surname", "text", false),
    base("sex", "sex", "text", false),
    base("date_of_birth", "date_of_birth", "date", false),
    base("government_id", "government_id", "text", true),
    custom("national_id", "national_id", "text", true),
    custom("lucky_number", "lucky_number", "number", true),
  ]
}

function makeValues(
  fields: RegistrationFormField[],
  overrides: Record<string, unknown>,
): Record<string, any> {
  const values: Record<string, any> = {}
  for (const f of fields) values[f.id] = ""
  values["date_of_birth"] = new Date("1990-01-01T12:00:00")
  return { ...values, ...overrides }
}

describe("Patient.DB.checkUniqueFieldValue", () => {
  let testDb: Database
  let clinic: ClinicModel
  let user: UserModel
  const fields = makeFields()
  const govtField = fields.find((f) => f.id === "government_id")!
  const nationalIdField = fields.find((f) => f.id === "national_id")!
  const luckyField = fields.find((f) => f.id === "lucky_number")!

  const provider = () => ({ id: user.id, name: user.name })
  const clinicRef = () => ({ id: clinic.id, name: clinic.name })

  async function seedPatient(overrides: Record<string, unknown>): Promise<string> {
    return Patient.DB.register(
      { fields, values: makeValues(fields, overrides) },
      provider(),
      clinicRef(),
    )
  }

  beforeEach(async () => {
    testDb = createTestDatabase()
    ;(global as any).__TEST_DB__ = testDb

    clinic = await testDb.write(() =>
      testDb.get<ClinicModel>("clinics").create((c) => {
        c.name = "Test Clinic"
        c.isDeleted = false
      }),
    )
    user = await testDb.write(() =>
      testDb.get<UserModel>("users").create((u) => {
        u.name = "Dr. Test"
        u.clinicId = clinic.id
        u.role = "provider"
        u.email = "dr.test@test.com"
        u.isDeleted = false
      }),
    )
    await testDb.write(() =>
      testDb.get<UserClinicPermissionModel>("user_clinic_permissions").create((p) => {
        p.userId = user.id
        p.clinicId = clinic.id
        p.canRegisterPatients = true
        p.canViewHistory = true
        p.canEditRecords = true
        p.canDeleteRecords = false
        p.isClinicAdmin = false
        p.canEditOtherProviderEvent = false
        p.canDownloadPatientReports = false
        p.canPrescribeMedications = false
        p.canDispenseMedications = false
        p.canDeletePatientVisits = false
        p.canDeletePatientRecords = false
      }),
    )
  })

  afterEach(async () => {
    await resetTestDatabase(testDb)
  })

  it("returns false when no other patient holds the value", async () => {
    await seedPatient({ government_id: "GOV-1" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: govtField,
      value: "GOV-2",
      fields,
    })
    expect(dup).toBe(false)
  })

  it("detects a duplicate base-column value", async () => {
    await seedPatient({ government_id: "GOV-1" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: govtField,
      value: "GOV-1",
      fields,
    })
    expect(dup).toBe(true)
  })

  it("detects a duplicate base value that differs only by surrounding whitespace", async () => {
    // @text trims on write, so this stores "GOV-1"; the check must trim its query
    // value too, otherwise a trailing space would slip a real duplicate past it.
    await seedPatient({ government_id: "GOV-1" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: govtField,
      value: "GOV-1 ",
      fields,
    })
    expect(dup).toBe(true)
  })

  it("detects a duplicate custom text value that differs only by surrounding whitespace", async () => {
    await seedPatient({ national_id: "NID-9" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: nationalIdField,
      value: " NID-9 ",
      fields,
    })
    expect(dup).toBe(true)
  })

  it("never flags a blank value as a duplicate", async () => {
    await seedPatient({ government_id: "" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: govtField,
      value: "   ",
      fields,
    })
    expect(dup).toBe(false)
  })

  it("excludes the patient being edited (self)", async () => {
    const patientId = await seedPatient({ government_id: "GOV-1" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: govtField,
      value: "GOV-1",
      fields,
      excludePatientId: patientId,
    })
    expect(dup).toBe(false)
  })

  it("detects a duplicate custom text attribute", async () => {
    await seedPatient({ national_id: "NID-9" })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: nationalIdField,
      value: "NID-9",
      fields,
    })
    expect(dup).toBe(true)
  })

  it("detects a duplicate custom number attribute", async () => {
    await seedPatient({ lucky_number: 7 })
    const dup = await Patient.DB.checkUniqueFieldValue({
      field: luckyField,
      value: 7,
      fields,
    })
    expect(dup).toBe(true)
  })

  it("ignores values held only by a soft-deleted patient", async () => {
    const patientId = await seedPatient({ national_id: "NID-DELETED" })
    await testDb.write(async () => {
      const patient = await testDb.get<PatientModel>("patients").find(patientId)
      await patient.update((p) => {
        p.isDeleted = true
      })
    })

    const dup = await Patient.DB.checkUniqueFieldValue({
      field: nationalIdField,
      value: "NID-DELETED",
      fields,
    })
    expect(dup).toBe(false)
  })
})
