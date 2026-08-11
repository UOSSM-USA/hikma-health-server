/**
 * Whether an app_config row applies to the device's current clinic.
 *
 *   clinicIds === null -> the row applies to ALL clinics. This is what every
 *                         row created before the clinic_ids column existed
 *                         looks like, so it is the backwards-compatible case.
 *   clinicIds === []   -> the row applies to NO clinic.
 *   otherwise          -> the row applies only to the listed clinics.
 *
 * Note this is the INVERSE of event_forms.clinic_ids, where an empty array
 * means "all clinics" (see useEventForms.ts).
 */
export function appliesToClinic(
  clinicIds: string[] | null,
  clinicId: string | null,
): boolean {
  if (clinicIds === null) return true
  return clinicId !== null && clinicIds.includes(clinicId)
}
