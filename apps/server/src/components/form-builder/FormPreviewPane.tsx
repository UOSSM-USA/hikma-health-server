import { Suspense, lazy, useCallback, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { MedicineInput } from "@/components/form-builder/MedicineInput";
import type { ICDEntry } from "@/components/form-builder/DiagnosisPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LucideInfo } from "lucide-react";
import { DatePickerInput } from "@/components/date-picker-input";
import { RadioInput, type RadioOption } from "@/components/radio-input";
import { SelectInput, type SelectOption } from "@/components/select-input";
import { MultiSelect } from "@/components/multi-select";
import { joinCheckboxValues, splitCheckboxValues } from "@/lib/utils";

import EventForm from "@/models/event-form";
import {
  compileRules,
  filterVisibleFields,
  formatComputedValue,
  getComputed,
  hasComputed,
  pruneRulesForLiveFields,
  stabilizeComputedValues,
  type fieldWithRules,
  type ruleEvaluation,
  type validationError,
} from "@hikmahealth/forms/Rules";

// Lazy: pulls in react-select/async + minisearch (the ICD-11 dataset
// itself is already lazy-loaded inside the picker's loadOptions).
const DiagnosisSelect = lazy(() =>
  import("@/components/form-builder/DiagnosisPicker").then((m) => ({
    default: m.DiagnosisSelect,
  })),
);

type FieldData = EventForm.FieldData;

export interface FormPreviewPaneProps {
  name: string;
  description: string;
  language: string;
  fields: ReadonlyArray<FieldData>;
}

/**
 * Live preview of an event-form's runtime behavior.
 *
 * Renders a working copy of the form authors can type into; the
 * evaluator drives visibility, required-asterisk, validator errors,
 * and computedValue read-only display in real time as the author
 * tweaks rules in the left pane and inputs in the right pane.
 *
 * Authoring shortcut: validator errors are NOT gated on touched/dirty
 * here (unlike the mobile screens). The preview's purpose is to show
 * the author when their rules fire — eager error display is the
 * feature, not a bug.
 *
 * List-ish fields:
 * - Diagnosis renders the real searchable ICD-11 picker; selections
 *   write `{code, desc}` entries straight into the rule scope, so
 *   rules referencing the field fire from genuine selections.
 * - Medicine renders the realistic input group for visual fidelity;
 *   it's inert (no writeback), so rules referencing the field stay
 *   at the seeded empty array in preview.
 * - File renders an inert file input; the scope value stays at the
 *   seeded null.
 * Medicine and diagnosis carry a visible tip steering authors to
 * the dedicated Prescriptions feature.
 */
export function FormPreviewPane({
  name,
  description,
  language,
  fields,
}: FormPreviewPaneProps) {
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>(
    {},
  );

  const setFieldValue = useCallback((fieldId: string, value: unknown) => {
    setPreviewValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  // Parse-once: compile the rule closure whenever the field list (or
  // any rule slot on it) changes. We can't easily diff the rule slot
  // contents alone, so the dep is the array reference — the store
  // already creates new arrays on edits.
  const evaluator = useMemo(() => {
    const ruleFields: fieldWithRules[] = fields.map((f) => ({
      id: f.id,
      required: (f as { required?: boolean }).required,
      ...EventForm.getRuleSlots(f),
    }));
    // Event-form fields are hard-deleted (removed from the array), so the
    // live set is every present id; this drops rule references to fields
    // that were removed.
    const liveFieldIds = ruleFields.map((f) => f.id);
    return compileRules(pruneRulesForLiveFields(ruleFields, liveFieldIds));
  }, [fields]);

  const ruleEvaluation: ruleEvaluation | null = useMemo(() => {
    // Seed list-ish field defaults so rules like
    // `{">": [{var: "form.<diag>.length"}, 0]}` see a sane shape
    // instead of `undefined`. Also normalize Date objects → "YYYY-MM-DD" strings
    // (matching what the rule-template `<input type="date">` emits) —
    // JsonLogic's comparison coercer treats JS Date instances as
    // non-coercible `Object`s, so an un-normalized Date would error
    // out and trigger the engine's fail-safe "skip validator" branch,
    // silently dropping the rule.
    const seededForm: Record<string, unknown> = { ...previewValues };
    for (const field of fields) {
      if (field._tag === "date") {
        const v = seededForm[field.id];
        if (v instanceof Date) seededForm[field.id] = formatDateYMD(v);
      }
      // Multi-selects reach rules as an array of option values, matching the
      // device (EventForm.buildRuleScope). The joined string each platform
      // persists is an internal storage detail — splitting here with the
      // separator this pane writes keeps the two in agreement at the rule
      // boundary even though the delimiters themselves differ. Without it,
      // `in` substring-matches the joined blob and `some`/`all` collapse it.
      if (field._tag === "options" && field.multi) {
        const v = seededForm[field.id];
        seededForm[field.id] = Array.isArray(v)
          ? v
          : typeof v === "string"
            ? splitCheckboxValues(v)
            : [];
        continue;
      }
      if (seededForm[field.id] !== undefined) continue;
      if (field._tag === "diagnosis" || field._tag === "medicine") {
        seededForm[field.id] = [];
      } else if (field._tag === "file") {
        seededForm[field.id] = null;
      }
    }

    // `now` is captured inside the memo, not in deps — refreshes only
    // when the evaluation reruns. Patient/provider intentionally
    // omitted; rules referencing them won't fire in preview.
    const scope = {
      form: seededForm,
      ctx: { now: new Date().toISOString(), language: language || "en" },
    };
    return stabilizeComputedValues(evaluator, scope).evaluation;
  }, [evaluator, previewValues, fields, language]);

  const errorsByFieldId = useMemo(() => {
    const map = new Map<string, validationError[]>();
    if (!ruleEvaluation) return map;
    for (const err of ruleEvaluation.validationErrors) {
      const bucket = map.get(err.fieldId);
      if (bucket) bucket.push(err);
      else map.set(err.fieldId, [err]);
    }
    return map;
  }, [ruleEvaluation]);

  // Mirror mobile's pattern: feed a getId callback because ReScript
  // can't express TS row-polymorphism. The TS-side `T` matches `FieldData`.
  const visibleFields = useMemo(
    () =>
      filterVisibleFields(fields as FieldData[], (f) => f.id, ruleEvaluation),
    [fields, ruleEvaluation],
  );

  return (
    <div
      className="space-y-4 overflow-y-auto p-4 h-full"
      data-testid="form-preview"
    >
      <div>
        <h3 className="text-2xl font-semibold">{name}</h3>
        {description && <p>{description}</p>}
      </div>

      {visibleFields.map((field) => {
        const errs = errorsByFieldId.get(field.id) ?? [];
        const required = ruleEvaluation
          ? ruleEvaluation.isRequired(field.id)
          : ((field as { required?: boolean }).required ?? false);

        // Computed read-only display takes precedence over the editable
        // branches (matches mobile decision #15). Display-only fields
        // bypass this — they don't have a computedValue slot.
        if (
          ruleEvaluation &&
          field._tag !== "text" &&
          field._tag !== "separator" &&
          hasComputed(ruleEvaluation, field.id)
        ) {
          const computed = getComputed(ruleEvaluation, field.id);
          return (
            <FieldFrame
              key={field.id}
              fieldId={field.id}
              fieldName={field.name ?? ""}
              fieldTag={field._tag}
              errors={errs}
            >
              <div className="space-y-1">
                <Label>
                  {field.name}
                  {required && <span className="text-destructive">*</span>}
                </Label>
                {field.description && (
                  <p className="text-sm text-muted-foreground">
                    {field.description}
                  </p>
                )}
                <p
                  className="text-sm rounded-md border border-input bg-muted/40 px-3 py-2"
                  data-testid="preview-computed-display"
                >
                  {formatComputedValue(computed)}
                </p>
              </div>
            </FieldFrame>
          );
        }

        return (
          <FieldFrame
            key={field.id}
            fieldId={field.id}
            fieldName={field.name ?? ""}
            fieldTag={field._tag}
            errors={errs}
          >
            {renderEditable(field, {
              value: previewValues[field.id],
              required,
              onChange: (v) => setFieldValue(field.id, v),
            })}
          </FieldFrame>
        );
      })}
    </div>
  );
}

function FieldFrame({
  children,
  errors,
  fieldId,
  fieldName,
  fieldTag,
}: {
  children: React.ReactNode;
  errors: ReadonlyArray<validationError>;
  fieldId: string;
  fieldName: string;
  fieldTag: string;
}) {
  return (
    <div
      data-testid="preview-field"
      data-field-id={fieldId}
      data-field-name={fieldName}
      data-field-tag={fieldTag}
    >
      {children}
      {errors.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {errors.map((e) => (
            <p key={e.validatorId} className="text-sm text-destructive">
              {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

type EditableRenderOpts = {
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
};

function renderEditable(field: FieldData, opts: EditableRenderOpts) {
  const { value, required, onChange } = opts;
  switch (field._tag) {
    case "free-text":
      return (
        <Input
          label={field.name}
          description={field.description}
          type={field.inputType}
          required={required}
          value={(value as string | number | undefined) ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            // Mirror the runtime: a numeric input emits a number to
            // the form scope so JSONLogic comparisons work without
            // string coercion. Empty → undefined so `isRequired` /
            // missing-value rules behave intuitively.
            if (raw === "") {
              onChange(undefined);
              return;
            }
            if (field.inputType === "number") {
              const n = Number(raw);
              onChange(Number.isNaN(n) ? raw : n);
            } else {
              onChange(raw);
            }
          }}
        />
      );
    case "binary":
      return (
        <Checkbox
          label={field.name}
          description={field.description}
          required={required}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case "date":
      return (
        <DatePickerInput
          label={field.name}
          description={field.description}
          withAsterisk={required}
          value={value instanceof Date ? value : undefined}
          onChange={(date) => onChange(date ?? undefined)}
        />
      );
    case "options": {
      const data = (field.options ?? []) as (
        | string
        | SelectOption
        | RadioOption
      )[];
      if (field.inputType === "radio") {
        return (
          <RadioInput
            label={field.name}
            description={field.description}
            withAsterisk={required}
            data={data as (string | RadioOption)[]}
            value={typeof value === "string" ? value : undefined}
            onChange={(v) => onChange(v)}
          />
        );
      }
      if (field.multi) {
        // Stored joined so the widget round-trips through the same string-typed
        // `value` every other field uses; the rule scope splits it back into an
        // array before evaluation (see `seededForm` above).
        const multiOptions = data.map((opt) =>
          typeof opt === "string"
            ? { label: opt, value: opt }
            : { label: opt.label, value: opt.value },
        );
        const selected =
          typeof value === "string" ? splitCheckboxValues(value) : [];
        return (
          <div className="space-y-1">
            <Label>
              {field.name}
              {required && <span className="text-destructive">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">
                {field.description}
              </p>
            )}
            <MultiSelect
              options={multiOptions}
              defaultValue={selected}
              onValueChange={(values) =>
                onChange(values.length ? joinCheckboxValues(values) : undefined)
              }
              placeholder="Select options"
              className="w-full"
            />
          </div>
        );
      }
      return (
        <SelectInput
          label={field.name}
          description={field.description}
          withAsterisk={required}
          data={data as (string | SelectOption)[]}
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v ?? undefined)}
          className="w-full"
        />
      );
    }
    case "medicine": {
      // Real input group for visual fidelity; inert — it doesn't write
      // prescription entries into the rule scope.
      return (
        <div className="space-y-2">
          <MedicineInput name={field.name} description={field.description} />
          <PrescriptionsTip />
        </div>
      );
    }
    case "diagnosis": {
      const entries = Array.isArray(value) ? (value as ICDEntry[]) : [];
      // Real searchable ICD-11 picker; selections write runtime-shaped
      // `{code, desc}` entries into the rule scope.
      return (
        <div className="space-y-2">
          <Suspense fallback={<div>Loading diagnoses…</div>}>
            <DiagnosisSelect
              name={field.name}
              description={field.description}
              withAsterisk={required}
              required={required}
              multi={(field as { multi?: boolean }).multi}
              value={entries}
              onChange={onChange}
            />
          </Suspense>
          <PrescriptionsTip />
        </div>
      );
    }
    case "file":
      // Inert file input — selections don't write into the rule scope.
      return (
        <Input
          label={field.name}
          description={field.description}
          type="file"
          multiple={(field as { multiple?: boolean }).multiple}
          withAsterisk={required}
        />
      );
    case "text":
      return (
        <p
          className={
            field.size === "xxl"
              ? "text-3xl font-bold"
              : field.size === "xl"
                ? "text-2xl font-semibold"
                : field.size === "lg"
                  ? "text-xl font-medium"
                  : field.size === "sm"
                    ? "text-sm"
                    : "text-base"
          }
        >
          {field.content || "Text Block (empty)"}
        </p>
      );
    case "separator":
      return <Separator className="my-4" />;
    default:
      return null;
  }
}

// Local-date YYYY-MM-DD. Matches what `<input type="date">` emits in
// the rule-template UI; using `toISOString().slice(0, 10)` would shift
// the day in non-UTC timezones (e.g. PST-midnight Jan 1 → UTC Dec 31).
function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Authoring guidance shown under the medicine / diagnosis previews —
 * a visible alert rather than fine print.
 */
function PrescriptionsTip() {
  return (
    <Alert>
      <LucideInfo className="h-4 w-4" />
      <AlertDescription>
        Consider using the dedicated Prescriptions feature for capturing this
        data instead of a form field.
      </AlertDescription>
    </Alert>
  );
}
