/**
 * Vitals input types for the DataProvider.
 * Aligns with PatientVitals.T in app/models/PatientVitals.ts.
 */

import type PatientVitals from "../app/models/PatientVitals"

/** Input for creating a new vitals record */
export type CreateVitalsInput = Omit<PatientVitals.T, "id" | "createdAt" | "updatedAt" | "deletedAt">

/**
 * Input for updating an existing vitals record.
 *
 * Limited to the measurement fields the server accepts on update; identity,
 * ownership and timestamp fields are fixed at creation. An omitted key leaves
 * the stored value untouched, while `Option.none()` clears it.
 */
export type UpdateVitalsInput = Partial<
  Pick<
    PatientVitals.T,
    | "systolicBp"
    | "diastolicBp"
    | "bpPosition"
    | "heightCm"
    | "weightKg"
    | "bmi"
    | "waistCircumferenceCm"
    | "heartRate"
    | "pulseRate"
    | "oxygenSaturation"
    | "respiratoryRate"
    | "temperatureCelsius"
    | "painLevel"
  >
>
