import { useMemo, useState } from "react";
import { LucideAlertCircle, LucidePlus, LucideX } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  type JsonLogicRule,
  type Validator,
  validateRule,
} from "@/models/form-rules";
import {
  type LogicField,
  ruleReferencesField,
} from "@/lib/form-rule-templates";
import {
  advancedStatusToState,
  computeAdvancedStatus,
  isStuckInAdvanced,
  REQUIRED_KIND_LABELS,
  type RuleState,
  storedRuleState,
  VALIDATOR_KIND_LABELS,
  VISIBILITY_KIND_LABELS,
  type VisibilityKind,
} from "./rule-model";
import { AdvancedRuleInput } from "./AdvancedRuleInput";
import { RuleEditor } from "./RuleEditor";

// RULE SECTIONS
//
// Visibility and requiredIf share one editing surface — a RuleEditor
// plus a Save button gated on validity. Everything that differs between
// them is data, carried by a descriptor; the component itself is
// generic. Validators (a list of rules + messages) and computedValue
// (advanced-only) have their own shapes below.

export type RuleSectionDescriptor = {
  testId: string;
  description: string;
  saveLabel: string;
  kindLabels: Record<VisibilityKind, string>;
  /** See RuleEditorProps for the semantics of these two flags. */
  allowAlways: boolean;
  allowMultiple: boolean;
};

export const VISIBILITY_SECTION: RuleSectionDescriptor = {
  testId: "visibility-section",
  description:
    "Control when this field appears. Rules reference other fields by " +
    "their internal id and are evaluated against the current form " +
    "state on the device.",
  saveLabel: "Save visibility",
  kindLabels: VISIBILITY_KIND_LABELS,
  allowAlways: true,
  allowMultiple: true,
};

// An undefined requiredIf rule means "no conditional override; fall back
// to the static Required checkbox" (not "always required").
export const REQUIRED_IF_SECTION: RuleSectionDescriptor = {
  testId: "required-if-section",
  description:
    "Conditionally require this field based on other answers. When no " +
    "conditional rule is set, the field falls back to the Required " +
    "checkbox above.",
  saveLabel: "Save required rule",
  kindLabels: REQUIRED_KIND_LABELS,
  allowAlways: true,
  allowMultiple: true,
};

export type RuleSectionProps = {
  descriptor: RuleSectionDescriptor;
  referenceableFields: ReadonlyArray<LogicField>;
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

export function RuleSection({
  descriptor,
  referenceableFields,
  initialRule,
  onSave,
}: RuleSectionProps) {
  // A rule the simple editor can't represent lives in advanced mode;
  // surface that above the tabs.
  const stuckInAdvanced = useMemo(
    () =>
      isStuckInAdvanced(
        initialRule,
        descriptor.allowAlways,
        descriptor.allowMultiple,
      ),
    [initialRule, descriptor.allowAlways, descriptor.allowMultiple],
  );

  const [current, setCurrent] = useState<RuleState>(() =>
    storedRuleState(initialRule),
  );

  return (
    <section className="space-y-2" data-testid={descriptor.testId}>
      <p className="text-xs text-muted-foreground">{descriptor.description}</p>

      {stuckInAdvanced && <StuckInAdvancedAdvisory />}

      <RuleEditor
        referenceableFields={referenceableFields}
        initialRule={initialRule}
        allowAlways={descriptor.allowAlways}
        allowMultiple={descriptor.allowMultiple}
        kindLabels={descriptor.kindLabels}
        onChange={setCurrent}
      />

      <Button
        type="button"
        size="sm"
        disabled={!current.isValid}
        onClick={() => onSave(current.rule)}
        data-testid="rule-save"
      >
        {descriptor.saveLabel}
      </Button>
    </section>
  );
}

// COMPUTED VALUE
//
// Single rule, advanced-mode JSON only for v1. When set, the field
// becomes read-only on mobile and its value is the JSONLogic eval
// result, with a writeback short-circuit (no re-set if the value is
// structurally equal). An empty/undefined rule means "field is normal
// editable input".

export type ComputedValueSectionProps = {
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

export function ComputedValueSection({
  initialRule,
  onSave,
}: ComputedValueSectionProps) {
  const [text, setText] = useState<string>(() =>
    initialRule === undefined ? "" : JSON.stringify(initialRule, null, 2),
  );
  const status = useMemo(() => computeAdvancedStatus(text), [text]);
  // allowEmpty=true: clearing the textarea means "no computation",
  // which is a valid state (field becomes editable again).
  const state = useMemo(
    () => advancedStatusToState(status, /* allowEmpty */ true),
    [status],
  );

  return (
    <section className="space-y-2" data-testid="computed-value-section">
      <p className="text-xs text-muted-foreground">
        When set, the field is read-only on the device and its value
        is the JSONLogic rule's evaluation. Leave empty to keep the
        field as a normal editable input.
      </p>

      <AdvancedRuleInput
        text={text}
        onTextChange={setText}
        status={status}
        allowEmpty={true}
      />

      <Button
        type="button"
        size="sm"
        disabled={!state.isValid}
        onClick={() => onSave(state.rule)}
        data-testid="rule-save"
      >
        Save computed value
      </Button>
    </section>
  );
}

// VALIDATORS
//
// A list of {id, rule, message, code?} rows.

export type ValidatorsSectionProps = {
  /**
   * Id of the field whose validators these are. Threaded down to each
   * row so we can warn when a rule never references the field it claims
   * to validate (typically an authoring mistake).
   */
  currentFieldId: string;
  referenceableFields: ReadonlyArray<LogicField>;
  initialValidators: ReadonlyArray<Validator>;
  onSave: (validators: Validator[]) => void;
};

// Per-row draft. `rule` may be undefined while the user is mid-edit; the
// section-level Save guards against committing undefined rules.
type ValidatorDraft = {
  id: string;
  rule: JsonLogicRule | undefined;
  ruleIsValid: boolean;
  message: string;
  code: string;
};

function toDraft(v: Validator): ValidatorDraft {
  // Compute initial validity synchronously. Validators don't allow an
  // empty rule (allowAlways=false downstream), so an undefined rule is
  // invalid — but in practice we only construct drafts from existing
  // validators (which always have a rule), so this is mostly defensive.
  return {
    id: v.id,
    rule: v.rule,
    ruleIsValid:
      v.rule !== undefined && validateRule(v.rule).TAG === "Ok",
    message: v.message,
    code: v.code ?? "",
  };
}

export function ValidatorsSection({
  currentFieldId,
  referenceableFields,
  initialValidators,
  onSave,
}: ValidatorsSectionProps) {
  const [drafts, setDrafts] = useState<ValidatorDraft[]>(() =>
    initialValidators.map(toDraft),
  );

  const updateDraft = (id: string, patch: Partial<ValidatorDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  };

  const addValidator = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: nanoid(),
        rule: undefined,
        ruleIsValid: false,
        message: "",
        code: "",
      },
    ]);
  };

  const removeValidator = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  // Save eligible when every draft has: structurally valid rule AND
  // non-empty message. The semantic that `rule` truthy = valid is
  // documented on the Validator type — we just check structural
  // validity here.
  const canSave = drafts.every(
    (d) => d.ruleIsValid && d.rule !== undefined && d.message.trim() !== "",
  );

  const onSubmit = () => {
    const validators: Validator[] = drafts.map((d) => ({
      id: d.id,
      rule: d.rule,
      message: d.message.trim(),
      ...(d.code.trim() !== "" ? { code: d.code.trim() } : {}),
    }));
    onSave(validators);
  };

  return (
    <section className="space-y-3" data-testid="validators-section">
      <p className="text-xs text-muted-foreground">
        Each validator's rule must evaluate to a truthy value for the
        field to be considered valid; otherwise the message is shown to
        the user.
      </p>

      {drafts.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No validators yet.
        </p>
      )}

      {drafts.map((draft, idx) => (
        <ValidatorRow
          key={draft.id}
          draft={draft}
          index={idx}
          currentFieldId={currentFieldId}
          referenceableFields={referenceableFields}
          onChange={(patch) => updateDraft(draft.id, patch)}
          onRemove={() => removeValidator(draft.id)}
        />
      ))}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addValidator}
          data-testid="validators-add"
        >
          <LucidePlus size="0.875rem" />
          Add validator
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={onSubmit}
          data-testid="validators-save"
        >
          Save validators
        </Button>
      </div>
    </section>
  );
}

type ValidatorRowProps = {
  draft: ValidatorDraft;
  index: number;
  currentFieldId: string;
  referenceableFields: ReadonlyArray<LogicField>;
  onChange: (patch: Partial<ValidatorDraft>) => void;
  onRemove: () => void;
};

function ValidatorRow({
  draft,
  index,
  currentFieldId,
  referenceableFields,
  onChange,
  onRemove,
}: ValidatorRowProps) {
  // Soft guardrail: a validator on field A whose rule never reads
  // `form.A` is almost always an authoring mistake (likely placed on
  // the wrong field). Cross-field validation is sometimes legitimate
  // ("discharge > admission" on `discharge`), so this advises rather
  // than blocks Save.
  const referencesSelf = useMemo(
    () => ruleReferencesField(draft.rule, currentFieldId),
    [draft.rule, currentFieldId],
  );
  const showSelfRefWarning = draft.rule !== undefined && !referencesSelf;

  return (
    <div
      className="rounded-md border border-border bg-card p-3 space-y-3"
      data-testid={`validator-row-${index}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          Validator {index + 1}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="Remove validator"
          data-testid="validator-remove"
        >
          <LucideX size="0.875rem" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Error message <span className="text-destructive">*</span>
        </Label>
        <Input
          size="sm"
          value={draft.message}
          onChange={(e) => onChange({ message: e.currentTarget.value })}
          placeholder="Shown to the user when this validator fails"
          data-testid="validator-message"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Code (optional)</Label>
        <Input
          size="sm"
          value={draft.code}
          onChange={(e) => onChange({ code: e.currentTarget.value })}
          placeholder="machine-readable, e.g. dob_required"
          data-testid="validator-code"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Rule</Label>
        <RuleEditor
          referenceableFields={referenceableFields}
          initialRule={draft.rule}
          allowAlways={false}
          allowMultiple={false}
          kindLabels={VALIDATOR_KIND_LABELS}
          defaultFieldId={currentFieldId}
          onChange={(state) =>
            onChange({ rule: state.rule, ruleIsValid: state.isValid })
          }
        />
        {showSelfRefWarning && <SelfReferenceWarning />}
      </div>
    </div>
  );
}

function SelfReferenceWarning() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
    >
      <LucideAlertCircle size="0.875rem" className="mt-0.5 shrink-0" />
      <span>
        This rule doesn't reference the field being validated. Validators
        usually check the field's own value — double-check that's what you
        meant.
      </span>
    </div>
  );
}

function StuckInAdvancedAdvisory() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium">
        <LucideAlertCircle size="1rem" />
        This rule was authored in Advanced mode.
      </p>
      <p className="mt-1 text-xs">
        The Simple editor can't represent the current rule. Edit it in
        the Advanced tab below, or clear it there to start over in
        Simple mode.
      </p>
    </div>
  );
}
