/**
 * The action rows on PatientViewScreen, in their default order.
 *
 * The ids here MUST match those in apps/server/src/lib/patient-view-actions.ts.
 * The server's `tests/models/patient-view-actions-parity.test.ts` enforces that
 * by reading this file as text — keep the `id: "…"` literals on their own line.
 *
 * Icon, label and navigation target deliberately live in PatientViewScreen
 * rather than here, so this module stays free of React Native imports and the
 * resolver tests stay pure.
 */
export const PATIENT_VIEW_ACTIONS_NAMESPACE = "ui"
export const PATIENT_VIEW_ACTIONS_KEY = "patient_view.actions"

export type PatientViewActionId = "visit_history" | "prescriptions" | "vitals" | "diagnoses"

export type PatientViewActionDef = {
  id: PatientViewActionId
  /**
   * Optional. Where declared, a user lacking this permission never sees the
   * action regardless of its configured visibility — config can hide an action,
   * never reveal one. None of the four below declare one, and only names in
   * `UserPermissionsT` are valid here.
   */
  permission?: string
}

export const PATIENT_VIEW_ACTIONS: readonly PatientViewActionDef[] = [
  { id: "visit_history" },
  { id: "prescriptions" },
  { id: "vitals" },
  { id: "diagnoses" },
]
