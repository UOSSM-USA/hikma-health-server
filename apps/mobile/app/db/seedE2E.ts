/**
 * Deterministic offline seed for e2e (Maestro) runs.
 *
 * Populates WatermelonDB with a fixed dataset and injects a provider
 * session into SecureStore so the app boots signed-in, in offline mode,
 * with no network dependency. Activated only when launched with
 * `seedE2E="true"` (see app/utils/e2e.ts) — it must never run in a
 * production build.
 *
 * Scope is intentionally narrow: a clinic, a provider, and a few patients —
 * enough to make the patient list and post-login navigation deterministic.
 * Event forms, registration forms, and the drug catalogue are not seeded yet;
 * the flows that need them stay out of the hermetic suite for now.
 */
import * as SecureStore from "expo-secure-store"

import database from "@/db"
import ClinicModel from "@/db/model/Clinic"
import PatientModel from "@/db/model/Patient"
import UserModel from "@/db/model/User"
import UserClinicPermissionModel from "@/db/model/UserClinicPermissions"
import { Logger } from "@hikmahealth/js-utils"

const CLINIC_ID = "e2e000000000000000000000000clinic"
const USER_ID = "e2e0000000000000000000000000user0"

const PROVIDER = {
  id: USER_ID,
  name: "E2E Tester",
  email: "e2e@hikmahealth.test",
  role: "admin",
  instance_url: null,
  clinic_id: CLINIC_ID,
  clinic_name: "E2E Test Clinic",
  permissions: null,
}

// Fixed roster so list assertions stay identical across runs.
const PATIENTS = [
  { givenName: "Ada", surname: "Lovelace", sex: "female", dateOfBirth: "1980-12-10" },
  { givenName: "Alan", surname: "Turing", sex: "male", dateOfBirth: "1975-06-23" },
  { givenName: "Grace", surname: "Hopper", sex: "female", dateOfBirth: "1986-12-09" },
]

async function alreadySeeded(): Promise<boolean> {
  const count = await database.get<PatientModel>("patients").query().fetchCount()
  return count > 0
}

async function seedRecords(): Promise<void> {
  const clinics = database.get<ClinicModel>("clinics")
  const users = database.get<UserModel>("users")
  const patients = database.get<PatientModel>("patients")
  const permissions = database.get<UserClinicPermissionModel>("user_clinic_permissions")

  await database.write(async () => {
    await database.batch(
      clinics.prepareCreate((clinic) => {
        clinic._raw.id = CLINIC_ID
        clinic.name = PROVIDER.clinic_name
        clinic.isDeleted = false
      }),
      users.prepareCreate((user) => {
        user._raw.id = USER_ID
        user.clinicId = CLINIC_ID
        user.name = PROVIDER.name
        user.role = PROVIDER.role
        user.email = PROVIDER.email
        user.isDeleted = false
      }),
      // Without this the provider has no clinic permissions, and the offline
      // patient list filters to clinics the user can view — hiding every seeded
      // patient. Grant all flags so the post-login flows are unblocked too.
      permissions.prepareCreate((perm) => {
        perm.userId = USER_ID
        perm.clinicId = CLINIC_ID
        perm.canRegisterPatients = true
        perm.canViewHistory = true
        perm.canEditRecords = true
        perm.canDeleteRecords = true
        perm.isClinicAdmin = true
        perm.canEditOtherProviderEvent = true
        perm.canDownloadPatientReports = true
        perm.canPrescribeMedications = true
        perm.canDispenseMedications = true
        perm.canDeletePatientVisits = true
        perm.canDeletePatientRecords = true
      }),
      ...PATIENTS.map((person) =>
        patients.prepareCreate((patient) => {
          patient.givenName = person.givenName
          patient.surname = person.surname
          patient.sex = person.sex
          patient.dateOfBirth = person.dateOfBirth
          patient.primaryClinicId = CLINIC_ID
          patient.lastModifiedBy = USER_ID
          patient.additionalData = {}
          patient.metadata = {}
          patient.isDeleted = false
        }),
      ),
    )
  })
}

/**
 * Inject the provider session into SecureStore using the same keys the
 * normal boot path (`app.tsx`) reads, so hydration treats the app as
 * signed-in without going through the login screen or the network.
 */
async function injectSession(): Promise<void> {
  await SecureStore.setItemAsync("providerStore", JSON.stringify(PROVIDER))
  await SecureStore.setItemAsync("provider_email", PROVIDER.email)
  await SecureStore.setItemAsync("provider_password", "e2e-password")
}

/**
 * Seed the offline database and inject a provider session.
 *
 * Idempotent: a no-op when patients already exist, which guards against an
 * effect firing twice within a single launch. Errors are logged and
 * swallowed so a seeding failure cannot wedge app startup mid-test.
 */
export async function seedE2EDatabase(): Promise<void> {
  try {
    if (await alreadySeeded()) return
    await seedRecords()
    await injectSession()
    Logger.log("[e2e] Seeded offline database and provider session")
  } catch (error) {
    Logger.error({ msg: "[e2e] Failed to seed database", error })
  }
}
