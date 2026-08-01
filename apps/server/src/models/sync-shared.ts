import { sql } from "kysely";
import { Logger } from "@hikmahealth/js-utils";
import Patient from "./patient";
import PatientAdditionalAttribute from "./patient-additional-attribute";
import Clinic from "./clinic";
import Visit from "./visit";
import Event from "./event";
import EventForm from "./event-form";
import PatientRegistrationForm from "./patient-registration-form";
import Appointment from "./appointment";
import Prescription from "./prescription";
import PatientVital from "./patient-vital";
import PatientProblem from "./patient-problem";
import ClinicDepartment from "./clinic-department";
import DrugCatalogue from "./drug-catalogue";
import ClinicInventory from "./clinic-inventory";
import DispensingRecord from "./dispensing-records";
import PrescriptionItem from "./prescription-items";
import User from "./user";
import Device from "./device";
import DevicePinCode from "./device-pin-code";

/**
 * These entities are synced to mobile. They should not contain information that is not needed for mobile use.
 * Do not sync users.
 * When adding new entities that need to be synced to mobile, add them to ENTITIES_TO_PUSH_TO_MOBILE
 *
 * Deliberately unannotated: `PostTableName` is derived from
 * `ENTITIES_TO_PULL_FROM_MOBILE[number]["Table"]["name"]`, so a `: SyncEntity[]`
 * annotation would widen every table name to `string` and silently strip
 * exhaustiveness from the `Record<PostTableName, …>` lookups. It would still
 * compile. Use `SyncEntity` for parameters and return types only.
 */
export const ENTITIES_TO_PUSH_TO_MOBILE = [
  Patient,
  PatientAdditionalAttribute,
  Clinic,
  Visit,
  Event,
  EventForm,
  PatientRegistrationForm,
  Appointment,
  Prescription,
  PatientVital,
  PatientProblem,
  ClinicDepartment,
  DrugCatalogue,
  ClinicInventory,
  DispensingRecord,
  PrescriptionItem,
  // Add more syncable entities here. Do not add any server defined entities here that do not track server_created_at or server_updated_at
];

/**
 * These entities are synced to the local sync hub. They contain a subset of the information available in the server for the respective clinics the sync hub is allowed to store data for.
 * Syncing users is allowed.
 *
 * When adding new entities that need to be synced to the hubs, add them to ENTITIES_TO_PUSH_TO_HUB
 */
export const ENTITIES_TO_PUSH_TO_HUB = [
  ...ENTITIES_TO_PUSH_TO_MOBILE,
  User,
  Device,
  DevicePinCode,
];

/**
 * These entities are synced from mobile.
 * When adding new entities that need to be synced from mobile, add them to ENTITIES_TO_PULL_FROM_MOBILE
 *
 * NOTE: Not going to sync the following from mobile, they will just be ignored
 * 1. DrugCatalogue
 * 2. ClinicInventory
 * 3. Clinic
 * 4. User
 * 5. PatientRegistrationForm
 * 6. EventForm
 */
export const ENTITIES_TO_PULL_FROM_MOBILE = [
  Patient,
  PatientAdditionalAttribute,
  Visit,
  Event,
  Appointment,
  Prescription,
  PatientVital,
  PatientProblem,
  PrescriptionItem,
  DispensingRecord,
];

/**
 * These entities are accepted from sync hubs. Hubs relay data from mobile
 * devices and may also manage clinic-level configuration locally, so they
 * can push a superset of what mobile pushes.
 */
export const ENTITIES_TO_PULL_FROM_HUB = [
  ...ENTITIES_TO_PULL_FROM_MOBILE,
  ClinicDepartment,
  DrugCatalogue,
  DevicePinCode,
];

/**
 * The subset of a model's `Table` namespace that sync depends on.
 *
 * `mobileName` is optional because `Device.Table` does not declare one; it is
 * reachable through ENTITIES_TO_PUSH_TO_HUB, so requiring it here would not
 * typecheck.
 */
export type SyncEntity = {
  Table: {
    name: string;
    mobileName?: string;
    ALWAYS_PUSH_TO_MOBILE?: boolean;
  };
};

/**
 * Which entities apply for a given peer, in a given direction.
 *
 * "push" = server → client (what we send them).
 * "pull" = client → server (what we accept from them), deliberately narrower:
 * a mobile device may not write reference data such as clinics or drug_catalogue.
 *
 * Any peer type other than sync_hub is treated as mobile, which is the safe
 * default — an unrecognised peer gets the smaller set in both directions.
 */
export function resolveEntitiesForPeer(
  peerType: Device.DeviceTypeT,
  direction: "push" | "pull",
): SyncEntity[] {
  const isHub = peerType === "sync_hub";
  if (direction === "push") {
    return isHub ? ENTITIES_TO_PUSH_TO_HUB : ENTITIES_TO_PUSH_TO_MOBILE;
  }
  return isHub ? ENTITIES_TO_PULL_FROM_HUB : ENTITIES_TO_PULL_FROM_MOBILE;
}

/** Configuration entities that should always sync full history (exempt from MAX_HISTORY_DAYS_SYNC) */
export const EXEMPT_FROM_HISTORY_LIMIT = [
  "clinics",
  // Patient registration forms have different names on mobile and on server, thus both are listed in the exemption list
  "patient_registration_forms",
  "registration_forms",
  "event_forms",
  "drug_catalogue",
  "clinic_departments",
  "clinic_inventory", // this should synced for just the signed in clinic??
];

/**
 * Validates and retrieves the MAX_HISTORY_DAYS_SYNC environment variable
 * @returns The number of days to limit history sync, or null if not set
 * @throws Error if the value is present but not a valid positive number
 */
export const getMaxHistoryDaysSync = (): number | null => {
  const envValue = process.env.MAX_HISTORY_DAYS_SYNC;

  if (!envValue) {
    return null;
  }

  const days = Number(envValue);

  if (isNaN(days) || days <= 0 || !Number.isInteger(days)) {
    Logger.error(
      `MAX_HISTORY_DAYS_SYNC must be a valid positive integer, got: ${envValue}. Ignoring and using no limit.`,
    );
    return null;
  }

  return days;
};

// Maps server table names to their clinic column for hub scoping.
// Tables not listed here have no direct clinic association and sync unfiltered.
export const CLINIC_COLUMN_BY_TABLE: Record<string, string> = {
  patients: "primary_clinic_id",
  visits: "clinic_id",
  appointments: "clinic_id",
  prescriptions: "pickup_clinic_id",
  clinic_departments: "clinic_id",
  clinic_inventory: "clinic_id",
  dispensing_records: "clinic_id",
  prescription_items: "clinic_id",
  patient_registration_forms: "clinic_id",
  users: "clinic_id",
  user_clinic_permissions: "clinic_id",
};

// Tables whose clinic association is stored as an array rather than a single column.
export const CLINIC_ARRAY_TABLES: Record<
  string,
  { column: string; type: "jsonb" | "pg_array" }
> = {
  event_forms: { column: "clinic_ids", type: "jsonb" },
  devices: { column: "clinic_ids", type: "pg_array" },
};

/**
 * Applies clinic-scoped filtering to a Kysely query builder for hub pulls.
 * Returns the query unchanged when clinicIds is null (non-hub peers).
 */
export function applyClinicScope<Q>(
  query: Q,
  tableName: string,
  clinicIds: string[] | null,
): Q {
  if (!clinicIds || clinicIds.length === 0) return query;

  // Clinics table: filter by id directly
  if (tableName === "clinics") {
    return (query as any).where("id", "in", clinicIds);
  }

  // Simple column filter (clinic_id, primary_clinic_id, etc.)
  const clinicColumn = CLINIC_COLUMN_BY_TABLE[tableName];
  if (clinicColumn) {
    return (query as any).where(clinicColumn, "in", clinicIds);
  }

  // Array-based clinic associations
  const arrayConfig = CLINIC_ARRAY_TABLES[tableName];
  if (arrayConfig) {
    const idsLiteral = `{${clinicIds.join(",")}}`;
    if (arrayConfig.type === "jsonb") {
      // JSONB array: include records with empty/null clinic_ids (available to all clinics)
      // or those whose clinic_ids overlap with the hub's clinics via ?| operator
      return (query as any).where(
        sql`(${sql.ref(arrayConfig.column)} IS NULL OR ${sql.ref(arrayConfig.column)} = '[]'::jsonb OR ${sql.ref(arrayConfig.column)} ?| ${idsLiteral}::text[])`,
      );
    }
    // PostgreSQL native uuid[] array: use && overlap operator
    return (query as any).where(
      sql`${sql.ref(arrayConfig.column)} && ${idsLiteral}::uuid[]`,
    );
  }

  // No clinic association (e.g. patient_additional_attributes, events, drug_catalogue) — no filtering
  return query;
}
