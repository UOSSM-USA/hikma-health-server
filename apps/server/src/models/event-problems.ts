import { createServerOnlyFn } from "@tanstack/react-start";
import * as Problems from "@hikmahealth/forms/Problems";

import EventForm from "@/models/event-form";
import PatientProblem from "@/models/patient-problem";
import { isValidUUID, safeJSONParse } from "@/lib/utils";

/**
 * Recording an event's diagnoses on the patient's chart.
 *
 * The rule for *which* diagnoses become problems lives in
 * `@hikmahealth/forms/Problems`, shared with the mobile client so an event
 * saved offline and one saved online record the same thing.
 */
namespace EventProblems {
  /** An event's `form_data`, as it comes off the wire or out of the column. */
  type FormData = ReadonlyArray<Record<string, unknown>>;

  const readString = (value: unknown): string =>
    typeof value === "string" ? value : "";

  const toFormDataItems = (formData: FormData): Problems.formDataItem[] =>
    formData.map((item) => ({
      fieldId: readString(item.fieldId),
      fieldType: readString(item.fieldType),
      value: item.value,
    }));

  /**
   * The authored fields of an event's form, which carry the per-field
   * `addToProblems` opt-in.
   *
   * A form that cannot be read yields no fields, so nothing is recorded.
   */
  const loadFormFields = async (
    formId: string,
  ): Promise<Problems.field[]> => {
    if (!isValidUUID(formId)) return [];

    const form = await EventForm.API.getById(formId);
    if (!form) return [];

    // Forms migrated from older versions store `form_fields` as a JSON string
    // rather than a jsonb array.
    const fields = safeJSONParse<Array<Record<string, unknown>>>(
      form.form_fields,
      [],
    );
    if (!Array.isArray(fields)) return [];

    return fields.map((field) => ({
      id: readString(field.id),
      fieldType: readString(field.fieldType),
      addToProblems: field.addToProblems === true,
    }));
  };

  /** Foreign keys are `uuid` columns; anything else is dropped rather than written. */
  const asUuid = (value: string | null | undefined): string | null =>
    typeof value === "string" && isValidUUID(value) ? value : null;

  /**
   * Bring the problems an event has on the chart in line with its diagnoses.
   *
   * Safe to call on every save: a no-op when nothing changed, it never
   * recreates a problem taken off the chart by hand, and it does nothing at
   * all unless a diagnosis field opted in.
   *
   * @param input.previousFormData The event's `form_data` before this save;
   *   empty for a newly created event.
   */
  export const reconcile = createServerOnlyFn(
    async (input: {
      eventId: string;
      patientId: string | null;
      visitId: string | null;
      formId: string | null;
      formData: FormData;
      previousFormData: FormData;
      recordedByUserId: string | null;
    }): Promise<void> => {
      // Both columns are nullable: an event with no patient has no chart.
      const patientId = asUuid(input.patientId);
      if (patientId === null) return;

      const fields = await loadFormFields(input.formId ?? "");

      const projection = Problems.problemsFromFormData(
        toFormDataItems(input.formData),
        fields,
      );
      if (!projection.recordsProblems) return;

      const alreadyRequested = Problems.problemsFromFormData(
        toFormDataItems(input.previousFormData),
        fields,
      ).problems;

      const existing = await PatientProblem.getByEventId(
        patientId,
        input.eventId,
      );

      const { toCreate, toRemoveIds } = Problems.diffProblems(
        existing.map((problem) => ({
          id: problem.id,
          code: problem.problem_code,
          label: problem.problem_label,
        })),
        projection.problems,
        alreadyRequested,
      );

      for (const problem of toCreate) {
        const row = Problems.toNewProblem(problem);
        await PatientProblem.create({
          patient_id: patientId,
          visit_id: asUuid(input.visitId),
          problem_code_system: row.codeSystem,
          problem_code: row.code,
          problem_label: row.label,
          clinical_status: row.clinicalStatus,
          verification_status: row.verificationStatus,
          severity_score: null,
          onset_date: null,
          end_date: null,
          recorded_by_user_id: asUuid(input.recordedByUserId),
          metadata: JSON.stringify({ eventId: input.eventId }),
          is_deleted: false,
          deleted_at: null,
        });
      }

      for (const id of toRemoveIds) {
        await PatientProblem.softDelete(id);
      }
    },
  );

  /**
   * Retire every problem an event put on the chart — a diagnosis has no
   * standing once the encounter that recorded it is gone.
   *
   * @param patientId - The patient whose chart to clear, or null to do nothing
   * @param eventId - The deleted event's ID
   */
  export const retire = createServerOnlyFn(
    async (patientId: string | null, eventId: string): Promise<void> => {
      const scopedPatientId = asUuid(patientId);
      if (scopedPatientId === null) return;

      const recorded = await PatientProblem.getByEventId(
        scopedPatientId,
        eventId,
      );
      for (const problem of recorded) {
        await PatientProblem.softDelete(problem.id);
      }
    },
  );
}

export default EventProblems;
