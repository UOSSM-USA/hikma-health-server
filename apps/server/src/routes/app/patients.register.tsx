import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import PatientRegistrationForm from "@/models/patient-registration-form";
import Language from "@/models/language";
import { createServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import { v1 as uuidv1 } from "uuid";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { Result } from "@/lib/result";
import { getCookie } from "@tanstack/react-start/server";
import { createServerCaller } from "@/integrations/trpc/router";
import { Logger } from "@hikmahealth/js-utils";
import {
  PatientRegistrationFields,
  buildRegistrationFieldView,
  type RegistrationFieldView,
} from "@/components/form-builder/PatientRegistrationFields";
import {
  compileRules,
  computedCount,
  computedEntries,
  computedValuesEqual,
  formatComputedValue,
  getComputed,
  hasComputed,
  pruneRulesForLiveFields,
  stabilizeComputedValues,
  type fieldWithRules,
  type validationError,
} from "@hikmahealth/forms/Rules";

type RegisterPatientInput = {
  patient: {
    id: string;
    given_name?: string | null;
    surname?: string | null;
    date_of_birth?: string | null;
    sex?: string | null;
    citizenship?: string | null;
    hometown?: string | null;
    phone?: string | null;
    camp?: string | null;
    government_id?: string | null;
    external_patient_id?: string | null;
    additional_data?: Record<string, any>;
    metadata?: Record<string, any>;
    photo_url?: string | null;
    primary_clinic_id?: string | null;
  };
  additional_attributes?: Array<{
    attribute_id: string;
    attribute: string;
    number_value?: number | null;
    string_value?: string | null;
    date_value?: string | null;
    boolean_value?: boolean | null;
    metadata?: Record<string, any>;
  }>;
};

export const createPatient = createServerFn({ method: "POST" })
  .inputValidator((data: RegisterPatientInput) => data)
  .handler(async ({ data }) => {
    const token = getCookie("token");
    if (!token) throw new Error("Unauthorized");

    const caller = createServerCaller({
      authHeader: `Bearer ${token}`,
    });

    const result = await caller.register_patient({
      patient: { ...data.patient },
      additional_attributes: data.additional_attributes,
    });

    return { patientId: result.patient_id };
  });

export const getAllPatientRegistrationForms = createServerFn({
  method: "GET",
}).handler(async () => {
  return PatientRegistrationForm.getAll();
});

export const Route = createFileRoute("/app/patients/register")({
  component: RouteComponent,
  loader: async () => {
    const patientRegistrationForm = await getAllPatientRegistrationForms();
    const clinicsList = Result.getOrElse(await getAllClinics(), []);
    return { patientRegistrationForm: patientRegistrationForm[0], clinicsList };
  },
});

function RouteComponent() {
  const { patientRegistrationForm, clinicsList } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  const [lang, setLang] = useState<string>("en");

  const {
    formState,
    handleSubmit,
    register,
    watch,
    setValue,
    getValues,
    control,
  } = useForm({
    mode: "onSubmit",
  });

  // Rules engine wiring: pre-filter by static admin flags; rule-driven
  // visibility layers on top.
  const fields = useMemo(
    () =>
      (patientRegistrationForm?.fields ?? []).filter(
        (f) => f.visible && f.deleted !== true,
      ),
    [patientRegistrationForm?.fields],
  );

  // RHF keys values by `field.column` (legacy); the engine references
  // fields by `field.id`. Translate at the scope boundary so the engine
  // contract stays uniform with mobile.
  const watchedValues = useWatch({ control }) as Record<string, unknown> | undefined;
  const valuesById = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      out[f.id] = watchedValues?.[f.column];
    }
    return out;
  }, [fields, watchedValues]);

  // Compile once per field-list reference. The store creates fresh
  // arrays on every form edit, so the closure re-parses when any rule
  // slot changes.
  const evaluator = useMemo(() => {
    const ruleFields: fieldWithRules[] = fields.map((f) => ({
      id: f.id,
      required: f.required,
      visibleIf: f.visibleIf,
      requiredIf: f.requiredIf,
      validators: f.validators,
      computedValue: f.computedValue,
    }));
    // `fields` is already pre-filtered to `visible && !deleted`, so the
    // live set is just its ids; this drops rule references pointing at
    // fields that were filtered out.
    const liveFieldIds = ruleFields.map((f) => f.id);
    return compileRules(pruneRulesForLiveFields(ruleFields, liveFieldIds));
  }, [fields]);

  const ruleStabilization = useMemo(() => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields,
      values: valuesById,
      ctx: { now: new Date().toISOString(), language: lang },
    });
    return stabilizeComputedValues(evaluator, scope);
  }, [evaluator, fields, valuesById, lang]);
  const ruleEvaluation = ruleStabilization.evaluation;

  useEffect(() => {
    if (ruleStabilization.convergence === "cycle") {
      Logger.warn({
        msg: "computedValue cycle detected in patient registration form — writebacks suppressed",
      });
    }
  }, [ruleStabilization]);

  const errorsByFieldId = useMemo(() => {
    const m = new Map<string, validationError[]>();
    for (const e of ruleEvaluation.validationErrors) {
      const bucket = m.get(e.fieldId);
      if (bucket) bucket.push(e);
      else m.set(e.fieldId, [e]);
    }
    return m;
  }, [ruleEvaluation]);

  // Clear-on-hide. Registration is a NEW patient — no DB record to
  // protect — so we use the simpler event-form policy: clear on every
  // visible→hidden transition (no first-render baseline skip like
  // PatientRecordEditorScreen needs).
  const previouslyHiddenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const { nowHidden, newlyHidden } =
      PatientRegistrationForm.computeNewlyHidden({
        fields,
        evaluation: ruleEvaluation,
        previouslyHidden: previouslyHiddenRef.current,
      });
    for (const f of newlyHidden) {
      setValue(f.column, undefined as never, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
    previouslyHiddenRef.current = nowHidden;
  }, [ruleEvaluation, fields, setValue]);

  // Computed-value writeback. Structural equality short-circuit so a
  // rule producing a fresh array/object every eval doesn't loop.
  useEffect(() => {
    if (computedCount(ruleEvaluation) === 0) return;
    for (const [fieldId, computed] of computedEntries(ruleEvaluation)) {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) continue;
      const current = getValues(field.column);
      if (!computedValuesEqual(current, computed)) {
        setValue(field.column, computed as never, { shouldValidate: false });
      }
    }
  }, [ruleEvaluation, fields, setValue, getValues]);

  const onSubmit = async (data: any) => {
    // Rule-driven submit gate. RHF's built-in `required` catches
    // statically-required-and-empty; this catches conditionally
    // required-and-empty (`requiredIf` rules) and validator-failed
    // fields, in one consolidated alert (two alerts in sequence
    // clobber each other on most browsers).
    const missingRequired =
      PatientRegistrationForm.getMissingRequiredFields({
        fields,
        values: valuesById,
        evaluation: ruleEvaluation,
      });
    const validatorErrors = ruleEvaluation.validationErrors;
    if (missingRequired.length > 0 || validatorErrors.length > 0) {
      const parts: string[] = [];
      if (missingRequired.length > 0) {
        parts.push(`Missing required: ${missingRequired.join(", ")}`);
      }
      if (validatorErrors.length > 0) {
        const messages = Array.from(
          new Set(validatorErrors.map((e) => e.message)),
        );
        parts.push(messages.join("\n"));
      }
      alert(parts.join("\n\n"));
      return;
    }

    const patientId = uuidv1();

    const patient: RegisterPatientInput["patient"] = {
      id: patientId,
      given_name: data.given_name ?? null,
      surname: data.surname ?? null,
      date_of_birth:
        data.date_of_birth instanceof Date
          ? data.date_of_birth.toISOString()
          : (data.date_of_birth ?? null),
      sex: data.sex ?? null,
      citizenship: data.citizenship ?? null,
      hometown: data.hometown ?? null,
      phone: data.phone ?? null,
      camp: data.camp ?? null,
      government_id: data.government_id ?? null,
      external_patient_id: data.external_patient_id ?? null,
      photo_url: data.photo_url ?? null,
      primary_clinic_id: data.primary_clinic_id ?? null,
      additional_data: data.additional_data || {},
      metadata: {},
    };

    const additional_attributes: NonNullable<
      RegisterPatientInput["additional_attributes"]
    > = [];

    patientRegistrationForm?.fields
      .filter((field) => field.deleted !== true && field.visible)
      // Defense-in-depth: skip rule-hidden fields. Clear-on-hide
      // should already have wiped their values, but the same-tick
      // race where the user submits in the frame a field hides
      // wouldn't fire the effect yet.
      .filter((field) => ruleEvaluation.isVisible(field.id))
      .forEach((field) => {
        if (!field.baseField) {
          additional_attributes.push({
            attribute_id: field.id,
            attribute: field.column,
            number_value:
              field.fieldType === "number" ? Number(data[field.column]) : null,
            string_value: ["text", "select", "checkbox"].includes(
              field.fieldType,
            )
              ? String(data[field.column] ?? "")
              : null,
            date_value:
              field.fieldType === "date" && data[field.column]
                ? data[field.column] instanceof Date
                  ? data[field.column].toISOString()
                  : String(data[field.column])
                : null,
            boolean_value:
              field.fieldType === "boolean"
                ? Boolean(data[field.column])
                : null,
            metadata: {},
          });
        }
      });

    try {
      const result = await createPatient({
        data: { patient, additional_attributes },
      });
      navigate({ to: `/app/patients/${result.patientId}` });
    } catch (error) {
      Logger.error({ msg: "Failed to register patient:", error });
      alert("Failed to register patient. Please try again.");
    }
  };

  if (!patientRegistrationForm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">
            No Registration Form Available
          </h2>
          <p className="text-gray-600">
            Please create a patient registration form first.
          </p>
          <Link to="/app/patients/customize-registration-form" className="mt-4">
            <Button className="primary">Create Registration Form</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleFieldChange = (field: RegistrationFieldView, value: unknown) => {
    setValue(field.column, value as never, { shouldValidate: true });
  };

  // Visible field set, pre-filtered the same way the rendered list is.
  // Computed fields stay in this array so `testIndex` keeps counting them
  // (the e2e fills inputs by positional `register-patient-N`).
  const visibleFields = (patientRegistrationForm?.fields ?? [])
    .filter((field) => field.visible && field.deleted !== true)
    .filter((field) => ruleEvaluation.isVisible(field.id));

  const fieldViews: RegistrationFieldView[] = visibleFields.map((field, idx) => {
    const isComputed = hasComputed(ruleEvaluation, field.id);
    const rhfError = formState.errors[field.column]?.message;
    return buildRegistrationFieldView(field, idx, lang, {
      value: watch(field.column),
      required: ruleEvaluation.isRequired(field.id),
      computedDisplay: isComputed
        ? formatComputedValue(getComputed(ruleEvaluation, field.id))
        : null,
      errorMessage: typeof rhfError === "string" ? rhfError : null,
      validatorErrors: Array.from(
        new Set((errorsByFieldId.get(field.id) ?? []).map((e) => e.message)),
      ),
      clinicOptions: clinicsList.map((clinic) => ({
        value: clinic.id,
        label: clinic.name,
      })),
    });
  });

  return (
    <div className="pb-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ maxWidth: 500 }} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Language.supportedLanguages.map((code) => (
                  <SelectItem key={code} value={code}>
                    {Language.friendlyLang(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PatientRegistrationFields
            fields={fieldViews}
            onValueChange={handleFieldChange}
          />

          {/* Hidden RHF-registered inputs hold required-validation and
              submit wiring inside the form, so the renderer above stays
              free of react-hook-form. Computed fields are excluded — they
              are read-only and their values arrive via writeback. */}
          {visibleFields
            .filter((field) => !hasComputed(ruleEvaluation, field.id))
            .map((field) => {
              const required = ruleEvaluation.isRequired(field.id);
              const fieldLabel = Language.getTranslation(field.label, lang);
              return (
                <input
                  key={field.id}
                  type="hidden"
                  {...register(field.column, {
                    required: required && `${fieldLabel} is required`,
                  })}
                />
              );
            })}

          <Button
            type="submit"
            data-testid={"submit-button"}
            className="primary"
          >
            {formState.isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
