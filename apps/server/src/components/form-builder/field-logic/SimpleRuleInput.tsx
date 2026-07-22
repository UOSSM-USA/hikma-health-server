import { LucidePlus, LucideX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  COMPARISON_OP_LABELS,
  COMPARISON_OPS,
  type ComparisonOp,
  type Connector,
  type LogicField,
  type LogicOption,
  type SimpleVisibilityTemplate,
  type VisibilityCondition,
} from "@/lib/form-rule-templates";
import {
  type ConditionKind,
  conditionKindsFor,
  conditionsOf,
  defaultConditionFor,
  defaultConditionForKind,
  primitiveFieldsOf,
  templateFromConditions,
  type VisibilityKind,
} from "./rule-model";

// SimpleRuleInput — template-driven editor. Fully controlled: the owner
// holds the template and receives every change; no Save button here.

export type SimpleRuleInputProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  template: SimpleVisibilityTemplate;
  onTemplateChange: (t: SimpleVisibilityTemplate) => void;
  allowAlways: boolean;
  allowMultiple: boolean;
  kindLabels: Record<VisibilityKind, string>;
};

export function SimpleRuleInput({
  referenceableFields,
  template,
  onTemplateChange,
  allowAlways,
  allowMultiple,
  kindLabels,
}: SimpleRuleInputProps) {
  const primitiveFields = primitiveFieldsOf(referenceableFields);

  const conditions = conditionsOf(template);
  // Only AND is surfaced today; preserve whatever connector the template
  // carries so a future OR editor doesn't lose it.
  const connector: Connector = template === "Always" ? "and" : template.connector;

  const emit = (next: VisibilityCondition[]) =>
    onTemplateChange(templateFromConditions(next, connector, allowAlways));

  const updateCondition = (index: number, c: VisibilityCondition) =>
    emit(conditions.map((existing, i) => (i === index ? c : existing)));

  // Single-condition surfaces (validators) render exactly one row with no
  // add/remove affordances. The condition always exists via defaultTemplateFor.
  if (!allowMultiple) {
    const only = conditions[0] ?? defaultConditionFor(primitiveFields);
    return (
      <ConditionRow
        primitiveFields={primitiveFields}
        condition={only}
        kindLabels={kindLabels}
        onChange={(c) => updateCondition(0, c)}
      />
    );
  }

  const addCondition = () =>
    emit([...conditions, defaultConditionFor(primitiveFields)]);
  const removeCondition = (index: number) =>
    emit(conditions.filter((_, i) => i !== index));

  return (
    <div className="space-y-3" data-testid="condition-list">
      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {kindLabels.Always}. Add a condition to restrict when this applies.
        </p>
      )}

      {conditions.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ConditionRow is fully controlled by the template (no internal state), so a positional key stays correct across add/remove.
        <div key={i} className="space-y-2">
          {i > 0 && (
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              and
            </p>
          )}
          <div
            className="flex items-start justify-between gap-2 rounded-md border border-border bg-card p-3"
            data-testid={`condition-row-${i}`}
          >
            <div className="flex-1">
              <ConditionRow
                primitiveFields={primitiveFields}
                condition={c}
                kindLabels={kindLabels}
                onChange={(next) => updateCondition(i, next)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeCondition(i)}
              aria-label="Remove condition"
              data-testid="condition-remove"
            >
              <LucideX size="0.875rem" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCondition}
        data-testid="rule-add-condition"
      >
        <LucidePlus size="0.875rem" />
        Add condition
      </Button>
    </div>
  );
}

// One leaf condition: kind dropdown + field picker + (for comparisons) the
// operator/value inputs. Shared by the single-condition (validator) layout
// and each row of the multi-condition list.
function ConditionRow({
  primitiveFields,
  condition,
  kindLabels,
  onChange,
}: {
  primitiveFields: ReadonlyArray<LogicField>;
  condition: VisibilityCondition;
  kindLabels: Record<VisibilityKind, string>;
  onChange: (c: VisibilityCondition) => void;
}) {
  const field = primitiveFields.find((f) => f.id === condition.fieldId);
  const kinds = conditionKindsFor(field);

  const onKindChange = (kind: ConditionKind) => {
    // The model fills kind-specific defaults (comparison operator, first
    // option, etc.); the field id is preserved via `field`.
    onChange(defaultConditionForKind(kind, field));
  };

  // Changing the field can invalidate the current kind (scalar ⇄ multi) or
  // strand an option token from the old field. Keep the kind when the new
  // field still supports it; reset value inputs either way.
  const onFieldChange = (newFieldId: string) => {
    const newField = primitiveFields.find((f) => f.id === newFieldId);
    const nextKinds = conditionKindsFor(newField);
    if (!nextKinds.includes(condition.TAG)) {
      onChange(defaultConditionForKind(nextKinds[0], newField));
      return;
    }
    if (condition.TAG === "Comparison" || condition.TAG === "LengthCompare") {
      onChange({ ...condition, fieldId: newFieldId });
      return;
    }
    if (condition.TAG === "Truthy" || condition.TAG === "Falsy") {
      onChange({ TAG: condition.TAG, fieldId: newFieldId });
      return;
    }
    // Membership kinds carry field-specific option tokens — reset them.
    onChange(defaultConditionForKind(condition.TAG, newField));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">When</Label>
        <Select
          value={condition.TAG}
          onValueChange={(v) => onKindChange(v as ConditionKind)}
        >
          <SelectTrigger size="sm" data-testid="rule-when-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {kindLabels[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FieldPickerRow
        fields={primitiveFields}
        fieldId={condition.fieldId}
        onChange={onFieldChange}
      />

      {condition.TAG === "Comparison" && (
        <ComparisonInputs
          op={condition.op}
          value={condition.value as string | number | boolean | null}
          primitiveKind={field?.primitiveKind}
          onOpChange={(op) => onChange({ ...condition, op })}
          onValueChange={(value) => onChange({ ...condition, value })}
        />
      )}

      {condition.TAG === "LengthCompare" && (
        <LengthCompareInputs
          op={condition.op}
          value={condition.value}
          onOpChange={(op) => onChange({ ...condition, op })}
          onValueChange={(value) => onChange({ ...condition, value })}
        />
      )}

      {(condition.TAG === "IncludesOption" ||
        condition.TAG === "ExcludesOption") && (
        <OptionSelect
          options={field?.options ?? []}
          value={condition.value}
          onChange={(value) => onChange({ ...condition, value })}
        />
      )}

      {(condition.TAG === "IncludesAny" || condition.TAG === "IncludesAll") && (
        <MultiOptionSelect
          options={field?.options ?? []}
          values={condition.values}
          onChange={(values) => onChange({ ...condition, values })}
        />
      )}
    </div>
  );
}

function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<LogicOption>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This field has no options to choose from.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Option</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" data-testid="rule-option">
          <SelectValue placeholder="Pick an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MultiOptionSelect({
  options,
  values,
  onChange,
}: {
  options: ReadonlyArray<LogicOption>;
  values: ReadonlyArray<string>;
  onChange: (values: string[]) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This field has no options to choose from.
      </p>
    );
  }
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="space-y-1.5" data-testid="rule-options">
      <Label className="text-xs">Options</Label>
      <div className="space-y-1.5">
        {options.map((o) => (
          <Checkbox
            key={o.value}
            size="sm"
            label={o.label}
            checked={values.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            data-testid={`rule-option-${o.value}`}
          />
        ))}
      </div>
      <p className="text-[0.7rem] text-muted-foreground">Pick at least two.</p>
    </div>
  );
}

function FieldPickerRow({
  fields,
  fieldId,
  onChange,
}: {
  fields: ReadonlyArray<LogicField>;
  fieldId: string;
  onChange: (id: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No input fields available to reference yet.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Field</Label>
      <Select value={fieldId} onValueChange={onChange}>
        <SelectTrigger size="sm" data-testid="rule-field-picker">
          <SelectValue placeholder="Pick a field" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ComparisonInputs({
  op,
  value,
  primitiveKind,
  onOpChange,
  onValueChange,
}: {
  op: ComparisonOp;
  value: string | number | boolean | null;
  primitiveKind: LogicField["primitiveKind"];
  onOpChange: (op: ComparisonOp) => void;
  onValueChange: (value: string | number | boolean | null) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Operator</Label>
        <Select value={op} onValueChange={(v) => onOpChange(v as ComparisonOp)}>
          <SelectTrigger size="sm" data-testid="rule-operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_OPS.map((o) => (
              <SelectItem key={o} value={o}>
                {COMPARISON_OP_LABELS[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1.5">
        <Label className="text-xs">Value</Label>
        <ValueInput
          primitiveKind={primitiveKind}
          value={value}
          onChange={onValueChange}
        />
      </div>
    </div>
  );
}

// Character-length comparison row: operator + a whole-number character count.
// The count is always coerced to a non-negative integer, so the row stays
// valid; the model's conditionValid guards decompiled/hand-authored values.
function LengthCompareInputs({
  op,
  value,
  onOpChange,
  onValueChange,
}: {
  op: ComparisonOp;
  value: number;
  onOpChange: (op: ComparisonOp) => void;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Length is</Label>
        <Select value={op} onValueChange={(v) => onOpChange(v as ComparisonOp)}>
          <SelectTrigger size="sm" data-testid="rule-length-operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_OPS.map((o) => (
              <SelectItem key={o} value={o}>
                {COMPARISON_OP_LABELS[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1.5">
        <Label className="text-xs">Characters</Label>
        <Input
          type="number"
          min={0}
          step={1}
          size="sm"
          value={String(value)}
          onChange={(e) => {
            const n = Number.parseInt(e.currentTarget.value, 10);
            onValueChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
          data-testid="rule-length-value"
        />
      </div>
    </div>
  );
}

function ValueInput({
  primitiveKind,
  value,
  onChange,
}: {
  primitiveKind: LogicField["primitiveKind"];
  value: string | number | boolean | null;
  onChange: (v: string | number | boolean | null) => void;
}) {
  if (primitiveKind === "boolean") {
    return (
      <Select
        value={value === true ? "true" : value === false ? "false" : ""}
        onValueChange={(v) => onChange(v === "true")}
      >
        <SelectTrigger size="sm" data-testid="rule-value">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (primitiveKind === "number") {
    return (
      <Input
        type="number"
        size="sm"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : raw);
        }}
        data-testid="rule-value"
      />
    );
  }
  return (
    <Input
      type={primitiveKind === "date" ? "date" : "text"}
      size="sm"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.currentTarget.value)}
      data-testid="rule-value"
    />
  );
}
