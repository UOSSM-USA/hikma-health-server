/**
 * `AppConfig.DB.getValue` must honour a row's clinic scope.
 *
 * Reads real seeded rows back through the production accessor, so the `@json`
 * decorator's null/undefined handling is exercised rather than assumed.
 */

import { Database } from "@nozbe/watermelondb"

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"

jest.mock("@/db", () => ({
  __esModule: true,
  get default() {
    return (global as any).__TEST_DB__
  },
  get database() {
    return (global as any).__TEST_DB__
  },
}))

import AppConfig from "@/models/AppConfig"
import AppConfigModel from "@/db/model/AppConfig"

let db: Database

/**
 * Writes an app_config row, with `clinicIds` in the raw column exactly as sync
 * would leave it: `null` for an unscoped row, a JSON string otherwise.
 */
async function seedConfig(opts: {
  namespace: string
  key: string
  value: string
  dataType: string
  clinicIds: string | null
}): Promise<void> {
  await db.write(async () => {
    await db.get<AppConfigModel>("app_config").create((row) => {
      const raw = row._raw as any
      raw.namespace = opts.namespace
      raw.key = opts.key
      raw.value = opts.value
      raw.data_type = opts.dataType
      raw.clinic_ids = opts.clinicIds
    })
  })
}

beforeEach(() => {
  db = createTestDatabase()
  ;(global as any).__TEST_DB__ = db
})

afterEach(async () => {
  await resetTestDatabase(db)
})

describe("AppConfig.DB.getValue clinic scoping", () => {
  it("returns an unscoped row for any clinic", async () => {
    await seedConfig({
      namespace: "auth",
      key: "disable-mobile-permissions-checking",
      value: "true",
      dataType: "boolean",
      clinicIds: null,
    })

    await expect(
      AppConfig.DB.getValue("auth", "disable-mobile-permissions-checking", "clinic-a"),
    ).resolves.toBe(true)
    await expect(
      AppConfig.DB.getValue("auth", "disable-mobile-permissions-checking", "clinic-b"),
    ).resolves.toBe(true)
  })

  it("returns an unscoped row when the device has no clinic", async () => {
    // Every production row is unscoped today, and useOperationModeInit reads
    // with a null clinic at startup.
    await seedConfig({
      namespace: "system",
      key: "operation_mode",
      value: "user_choice",
      dataType: "string",
      clinicIds: null,
    })

    await expect(AppConfig.DB.getValue("system", "operation_mode", null)).resolves.toBe(
      "user_choice",
    )
  })

  it("returns a scoped row only to a listed clinic", async () => {
    await seedConfig({
      namespace: "auth",
      key: "disable-mobile-permissions-checking",
      value: "true",
      dataType: "boolean",
      clinicIds: JSON.stringify(["clinic-a"]),
    })

    await expect(
      AppConfig.DB.getValue("auth", "disable-mobile-permissions-checking", "clinic-a"),
    ).resolves.toBe(true)
  })

  it("hides a scoped row from an unlisted clinic", async () => {
    // Before scoping was honoured, a flag scoped to one clinic was returned to
    // every device.
    await seedConfig({
      namespace: "auth",
      key: "disable-mobile-permissions-checking",
      value: "true",
      dataType: "boolean",
      clinicIds: JSON.stringify(["clinic-a"]),
    })

    await expect(
      AppConfig.DB.getValue("auth", "disable-mobile-permissions-checking", "clinic-b"),
    ).resolves.toBeNull()
  })

  it("hides a scoped row when the device has no clinic, failing closed", async () => {
    await seedConfig({
      namespace: "auth",
      key: "disable-mobile-permissions-checking",
      value: "true",
      dataType: "boolean",
      clinicIds: JSON.stringify(["clinic-a"]),
    })

    await expect(
      AppConfig.DB.getValue("auth", "disable-mobile-permissions-checking", null),
    ).resolves.toBeNull()
  })

  it("hides a row scoped to the empty array from every clinic", async () => {
    await seedConfig({
      namespace: "ui",
      key: "patient_view.actions",
      value: "[]",
      dataType: "array",
      clinicIds: JSON.stringify([]),
    })

    await expect(AppConfig.DB.getValue("ui", "patient_view.actions", "clinic-a")).resolves.toBeNull()
  })

  it("treats a corrupt scope as unscoped, matching the sanitizer", async () => {
    await seedConfig({
      namespace: "system",
      key: "operation_mode",
      value: "offline",
      dataType: "string",
      clinicIds: "not-json-at-all",
    })

    await expect(AppConfig.DB.getValue("system", "operation_mode", "clinic-a")).resolves.toBe(
      "offline",
    )
  })

  it("returns null when no row exists", async () => {
    await expect(AppConfig.DB.getValue("ui", "missing.key", "clinic-a")).resolves.toBeNull()
  })
})
