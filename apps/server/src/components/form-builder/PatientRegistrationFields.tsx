import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/date-picker-input";
import { SelectInput } from "@/components/select-input";
import { joinCheckboxValues, splitCheckboxValues } from "@/lib/utils";
import { Language } from "@/models/language";
import type PatientRegistrationForm from "@/models/patient-registration-form";
import upperFirst from "lodash/upperFirst";

export type RegistrationFieldOption = { value: string; label: string };

/**
 * View model for a single registration field, fully resolved: label
 * translated, options/required/computed already evaluated. Deliberately
 * carries no react-hook-form or rules-engine types, so the renderer below
 * can be driven live (the registration page) or with static views and a
 * no-op `onValueChange` (the form-builder preview).
 */
export type RegistrationFieldView = {
  id: string;
  column: string;
  fieldType: PatientRegistrationForm.InputType;
  label: string;
  required: boolean;
  options: RegistrationFieldOption[];
  /** Non-null marks a read-only computed field showing this text. */
  computedDisplay: string | null;
  value: unknown;
  /** Required-validation message (empty unless a submit attempt failed). */
  errorMessage: string | null;
  /** Rule validator messages. */
  validatorErrors: string[];
  /** Index into the visible-field list; drives `register-patient-N` test ids. */
  testIndex: number;
};

/**
 * The per-field data a caller resolves from its own runtime (form values,
 * rule evaluation, errors, clinic list) and feeds to the builder. Keeping
 * it explicit is what lets the builder stay pure and shared.
 */
type RegistrationFieldDynamicData = {
  value: unknown;
  required: boolean;
  computedDisplay: string | null;
  errorMessage: string | null;
  validatorErrors: string[];
  clinicOptions: RegistrationFieldOption[];
};

/** Resolve the option list for a field (clinic list, or translated field options). */
function resolveFieldOptions(
  field: PatientRegistrationForm.Field,
  language: string,
  clinicOptions: RegistrationFieldOption[],
): RegistrationFieldOption[] {
  if (field.column === "primary_clinic_id") return clinicOptions;
  if (field.fieldType === "select" || field.fieldType === "checkbox") {
    // Drop options the author hasn't filled in yet: an empty value would
    // throw a Radix `<SelectItem value="">`. Saved forms never carry empty
    // options (enforced on save), so this is a no-op for live registration.
    return field.options
      .map((opt) => ({
        value: Language.getTranslation(opt, "en"),
        label: upperFirst(Language.getTranslation(opt, language)),
      }))
      .filter((opt) => opt.value !== "");
  }
  return [];
}

/**
 * Assemble a `RegistrationFieldView` from a field definition and the
 * caller's resolved dynamic data. The label/options resolution is shared;
 * only the value/required/computed/error sources differ per caller.
 */
export function buildRegistrationFieldView(
  field: PatientRegistrationForm.Field,
  index: number,
  language: string,
  dynamic: RegistrationFieldDynamicData,
): RegistrationFieldView {
  return {
    id: field.id,
    column: field.column,
    fieldType: field.fieldType,
    label: Language.getTranslation(field.label, language),
    required: dynamic.required,
    options: resolveFieldOptions(field, language, dynamic.clinicOptions),
    computedDisplay: dynamic.computedDisplay,
    value: dynamic.value,
    errorMessage: dynamic.errorMessage,
    validatorErrors: dynamic.validatorErrors,
    testIndex: index,
  };
}

type PatientRegistrationFieldsProps = {
  fields: RegistrationFieldView[];
  onValueChange: (field: RegistrationFieldView, value: unknown) => void;
};

/**
 * Presentational renderer for the patient registration fields. Owns no
 * form state: every input is controlled via `field.value` /
 * `onValueChange`. The host wires those to react-hook-form (live
 * registration) or to no-ops (form-builder preview).
 */
export function PatientRegistrationFields({
  fields,
  onValueChange,
}: PatientRegistrationFieldsProps) {
  return (
    <>
      {fields.map((field) => {
        const requiredMark = field.required ? (
          <span className="text-destructive"> *</span>
        ) : null;

        if (field.computedDisplay !== null) {
          return (
            <div key={field.id} className="space-y-2">
              <Label className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <p className="text-sm rounded-md border border-input bg-muted/40 px-3 py-2">
                {field.computedDisplay}
              </p>
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.fieldType === "text" && field.column !== "primary_clinic_id") {
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.column} className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <Input
                data-testid={"register-patient-" + field.testIndex}
                data-inputtype={"text"}
                data-column={field.column}
                value={(field.value as string | undefined) ?? ""}
                onChange={(e) => onValueChange(field, e.target.value)}
              />
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.column === "primary_clinic_id") {
          return (
            <div key={field.id} className="space-y-2">
              <SelectInput
                className="w-full"
                data-testid={"register-patient-" + field.testIndex}
                data-inputtype={"select"}
                label={field.required ? `${field.label} *` : field.label}
                data={field.options}
                value={field.value as string | undefined}
                onChange={(v) => onValueChange(field, v)}
              />
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.fieldType === "number") {
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.column} className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <Input
                data-inputtype={"number"}
                data-testid={"register-patient-" + field.testIndex}
                value={(field.value as string | undefined) ?? ""}
                onChange={(e) => onValueChange(field, e.target.value)}
              />
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.fieldType === "select") {
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.column} className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <Select
                value={field.value as string | undefined}
                data-inputtype="select"
                data-testid={"register-patient-" + field.testIndex}
                onValueChange={(value) => onValueChange(field, value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Select ${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{field.label}</SelectLabel>
                    {field.options.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        data-testid={opt.value}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.fieldType === "checkbox") {
          const selectedValues = splitCheckboxValues(
            (field.value as string | undefined) || "",
          );
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.column} className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <div className="space-y-1">
                {field.options.map((opt) => {
                  const isChecked = selectedValues.includes(opt.value);
                  return (
                    <div key={opt.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`${field.column}-${opt.value}`}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={isChecked}
                        data-testid={`register-patient-${field.testIndex}-${opt.value}`}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedValues, opt.value]
                            : selectedValues.filter((v) => v !== opt.value);
                          onValueChange(field, joinCheckboxValues(next));
                        }}
                      />
                      <label
                        htmlFor={`${field.column}-${opt.value}`}
                        className="text-sm"
                      >
                        {opt.label}
                      </label>
                    </div>
                  );
                })}
              </div>
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        if (field.fieldType === "date") {
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.column} className="text-muted-foreground">
                {field.label}
                {requiredMark}
              </Label>
              <DatePickerInput
                required={field.required}
                placeholder="Pick date"
                data-testid={"register-patient-" + field.testIndex}
                data-inputtype="date"
                value={field.value as Date | undefined}
                onChange={(date) => onValueChange(field, date)}
              />
              {field.errorMessage && (
                <p className="text-sm text-destructive">{field.errorMessage}</p>
              )}
              <FieldErrors messages={field.validatorErrors} />
            </div>
          );
        }

        return <div key={field.id}></div>;
      })}
    </>
  );
}

function FieldErrors({ messages }: { messages: ReadonlyArray<string> }) {
  if (messages.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {messages.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
