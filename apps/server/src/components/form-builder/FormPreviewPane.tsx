import { useCallback, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/date-picker-input";
import { RadioInput, type RadioOption } from "@/components/radio-input";
import { SelectInput, type SelectOption } from "@/components/select-input";
import { cn } from "@/lib/utils";

import EventForm from "@/models/event-form";
import {
  compileRules,
  filterVisibleFields,
  formatComputedValue,
  getComputed,
  hasComputed,
  stabilizeComputedValues,
  type fieldWithRules,
  type ruleEvaluation,
  type validationError,
} from "@hikmahealth/forms/Rules";

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
 * List-ish fields (medicine / diagnosis / file) render toggle
 * stubs — the author flips between "none / one / many" without us
 * dragging real ICD fetches or file pickers into authoring. The
 * writeback shapes match the rule scope's runtime contract: arrays
 * of entry-shaped objects for medicine / diagnosis, the file's
 * fileId string (or null) for file. Rules can reference `.length`,
 * indexed access, or truthy/null on the values just as they would
 * on device.
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
    return compileRules(ruleFields);
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
    () => filterVisibleFields(fields as FieldData[], (f) => f.id, ruleEvaluation),
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
      const data = (field.options ?? []) as (string | SelectOption | RadioOption)[];
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
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      const selectedKey =
        arr.length === 0 ? "off" : arr.length === 1 ? "one" : "many";
      return (
        <TogglePicker
          label={field.name}
          description={field.description}
          required={required}
          note="Preview stub — flip to drive rules referencing this field."
          options={MEDICINE_OPTIONS}
          selectedKey={selectedKey}
          onSelect={(opt) => onChange(opt.value)}
        />
      );
    }
    case "diagnosis": {
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      const selectedKey =
        arr.length === 0 ? "off" : arr.length === 1 ? "one" : "many";
      return (
        <TogglePicker
          label={field.name}
          description={field.description}
          required={required}
          note="Preview stub — flip to drive rules referencing this field."
          options={DIAGNOSIS_OPTIONS}
          selectedKey={selectedKey}
          onSelect={(opt) => onChange(opt.value)}
        />
      );
    }
    case "file": {
      const selectedKey =
        typeof value === "string" && value.length > 0 ? "on" : "off";
      return (
        <TogglePicker
          label={field.name}
          description={field.description}
          required={required}
          note="Preview stub — flip to drive rules referencing this field."
          options={FILE_OPTIONS}
          selectedKey={selectedKey}
          onSelect={(opt) => onChange(opt.value)}
        />
      );
    }
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

// Stub entries shaped like the runtime objects mobile passes through
// the rule scope (Prescription.MedicationEntry, ICDEntry.T). Authors
// who write rules referencing nested fields (e.g. `form.<med>.0.name`)
// see realistic data; rules that only check `.length` work equally
// well. The ids are stable strings so React keys / equality checks
// don't churn across renders.
const STUB_MED_1 = {
  id: "stub-med-1",
  name: "Amoxicillin",
  route: "oral",
  form: "capsule",
  frequency: 3,
  intervals: 8,
  dose: 500,
  doseUnits: "mg",
  duration: 7,
  durationUnits: "days",
};
const STUB_MED_2 = {
  ...STUB_MED_1,
  id: "stub-med-2",
  name: "Ibuprofen",
  form: "tablet",
  dose: 400,
  duration: 5,
};
const STUB_MED_3 = {
  ...STUB_MED_1,
  id: "stub-med-3",
  name: "Paracetamol",
  form: "tablet",
  dose: 1000,
  frequency: 4,
  intervals: 6,
};

const STUB_DIAG_1 = { code: "R69", desc: "Illness, unspecified" };
const STUB_DIAG_2 = {
  code: "J06.9",
  desc: "Acute upper respiratory infection, unspecified",
};

// File scope value at runtime is `fileUploads[name]?.fileId ?? null`
// — i.e. a bare string or null, not the wrapper object. Rules
// written against the preview will match what they see on device.
const STUB_FILE_ID = "stub-file-id";

type ToggleOption = { key: string; label: string; value: unknown };

const MEDICINE_OPTIONS: ReadonlyArray<ToggleOption> = [
  { key: "off", label: "None", value: [] },
  { key: "one", label: "1 selected", value: [STUB_MED_1] },
  {
    key: "many",
    label: "3 selected",
    value: [STUB_MED_1, STUB_MED_2, STUB_MED_3],
  },
];

const DIAGNOSIS_OPTIONS: ReadonlyArray<ToggleOption> = [
  { key: "off", label: "None", value: [] },
  { key: "one", label: "1 selected", value: [STUB_DIAG_1] },
  { key: "many", label: "2 selected", value: [STUB_DIAG_1, STUB_DIAG_2] },
];

const FILE_OPTIONS: ReadonlyArray<ToggleOption> = [
  { key: "off", label: "No file", value: null },
  { key: "on", label: "File attached", value: STUB_FILE_ID },
];

function TogglePicker({
  label,
  description,
  required,
  note,
  options,
  selectedKey,
  onSelect,
}: {
  label: string;
  description?: string;
  required: boolean;
  note: string;
  options: ReadonlyArray<ToggleOption>;
  selectedKey: string;
  onSelect: (option: ToggleOption) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = opt.key === selectedKey;
          return (
            <Button
              key={opt.key}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => onSelect(opt)}
              className={cn(active && "pointer-events-none")}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground italic">{note}</p>
    </div>
  );
}
