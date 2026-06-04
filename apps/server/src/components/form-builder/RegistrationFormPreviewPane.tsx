import { useMemo, useState } from "react";
import sortBy from "lodash/sortBy";

import type { Language } from "@/models/language";
import PatientRegistrationForm from "@/models/patient-registration-form";
import {
  PatientRegistrationFields,
  buildRegistrationFieldView,
  type RegistrationFieldOption,
} from "@/components/form-builder/PatientRegistrationFields";
import {
  compileRules,
  formatComputedValue,
  getComputed,
  hasComputed,
  pruneRulesForLiveFields,
  stabilizeComputedValues,
  type fieldWithRules,
  type validationError,
} from "@hikmahealth/forms/Rules";

export interface RegistrationFormPreviewPaneProps {
  fields: ReadonlyArray<PatientRegistrationForm.Field>;
  language: Language.LanguageKey;
  clinics?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * Interactive preview of the patient registration form as a clinician
 * sees it. Reads the builder's draft fields and renders a working copy
 * the author can fill in — typing, picking options, checking boxes — with
 * the rules engine evaluating visibility, required-asterisks, validators,
 * and computedValue read-only display in real time. Nothing is persisted;
 * the preview holds its own throwaway value state.
 *
 * Uses the same rule evaluator and `buildRuleScope` as
 * `patients.register.tsx`. One intentional gap: it does not clear a
 * field's value when a rule hides it, so a rule that reads a hidden
 * field's value can see stale input here that the live form would have
 * cleared on hide.
 */
export function RegistrationFormPreviewPane({
  fields,
  language,
  clinics = [],
}: RegistrationFormPreviewPaneProps) {
  // Throwaway form values, keyed by field id (the engine's key), so the
  // author can drive rules without touching the saved form.
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>(
    {},
  );

  const clinicOptions: RegistrationFieldOption[] = clinics.map((clinic) => ({
    value: clinic.id,
    label: clinic.name,
  }));

  // Static visibility flag pre-filters the candidate set; rule-driven
  // visibility layers on top (matches the register page).
  const candidateFields = useMemo(
    () => fields.filter((field) => field.visible && field.deleted !== true),
    [fields],
  );

  // Recompile whenever the field list (or any rule slot on it) changes.
  // The reducer hands us a fresh array on every edit, so the reference is
  // a sufficient dependency.
  const evaluator = useMemo(() => {
    const ruleFields: fieldWithRules[] = candidateFields.map((field) => ({
      id: field.id,
      required: field.required,
      visibleIf: field.visibleIf,
      requiredIf: field.requiredIf,
      validators: field.validators,
      computedValue: field.computedValue,
    }));
    const liveFieldIds = ruleFields.map((field) => field.id);
    return compileRules(pruneRulesForLiveFields(ruleFields, liveFieldIds));
  }, [candidateFields]);

  const ruleEvaluation = useMemo(() => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: candidateFields,
      values: previewValues,
      ctx: { now: new Date().toISOString(), language },
    });
    return stabilizeComputedValues(evaluator, scope).evaluation;
  }, [evaluator, candidateFields, previewValues, language]);

  const errorsByFieldId = useMemo(() => {
    const map = new Map<string, validationError[]>();
    for (const err of ruleEvaluation.validationErrors) {
      const bucket = map.get(err.fieldId);
      if (bucket) bucket.push(err);
      else map.set(err.fieldId, [err]);
    }
    return map;
  }, [ruleEvaluation]);

  const fieldViews = sortBy([...candidateFields], "position")
    .filter((field) => ruleEvaluation.isVisible(field.id))
    .map((field, index) => {
      const isComputed = hasComputed(ruleEvaluation, field.id);
      const validatorErrors = Array.from(
        new Set((errorsByFieldId.get(field.id) ?? []).map((e) => e.message)),
      );
      return buildRegistrationFieldView(field, index, language, {
        value: previewValues[field.id],
        required: ruleEvaluation.isRequired(field.id),
        computedDisplay: isComputed
          ? formatComputedValue(getComputed(ruleEvaluation, field.id))
          : null,
        errorMessage: null,
        validatorErrors,
        clinicOptions,
      });
    });

  return (
    <div
      className="space-y-4 overflow-y-auto p-4 pb-24 h-full"
      data-testid="registration-form-preview"
    >
      <div>
        <h3 className="text-lg font-semibold">Form preview</h3>
        <p className="text-sm text-muted-foreground">
          How the registration form appears to clinicians. <br />
          Fill it in to test your rules — nothing here is saved.
        </p>
      </div>

      <div className="max-w-md space-y-4">
        <PatientRegistrationFields
          fields={fieldViews}
          onValueChange={(field, value) =>
            setPreviewValues((prev) => ({ ...prev, [field.id]: value }))
          }
        />
      </div>
    </div>
  );
}
