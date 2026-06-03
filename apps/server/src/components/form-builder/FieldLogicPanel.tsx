import { useEffect, useMemo, useState } from "react";
import {
  LucideAlertCircle,
  LucideCheck,
  LucideChevronDown,
  LucidePlus,
  LucideSlidersHorizontal,
  LucideX,
} from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  type FieldRuleSlots,
  type JsonLogicRule,
  type RuleValidationError,
  type Validator,
  validateRule,
} from "@/models/form-rules";
import {
  COMPARISON_OP_LABELS,
  COMPARISON_OPS,
  type ComparisonOp,
  compileVisibilityTemplate,
  type Connector,
  decompileVisibilityTemplate,
  type LogicField,
  ruleReferencesField,
  type SimpleVisibilityTemplate,
  type VisibilityCondition,
} from "@/lib/form-rule-templates";

// SimpleVisibilityTemplate is the ReScript-emitted variant: `"Always"` is
// a bare string; otherwise a `{TAG: "Conditions", connector, conditions}`
// group whose members are `VisibilityCondition` leaves. The slot-level
// "Always" state is an empty condition list, not a per-row kind.
type VisibilityKind = "Always" | "Comparison" | "Truthy" | "Falsy";

// Per-row leaf kinds — what a single condition can be.
type ConditionKind = "Comparison" | "Truthy" | "Falsy";
const CONDITION_KINDS: ConditionKind[] = ["Comparison", "Truthy", "Falsy"];

// The conditions a template carries; "Always" has none.
const conditionsOf = (t: SimpleVisibilityTemplate): VisibilityCondition[] =>
  t === "Always" ? [] : t.conditions;

// Build a template from a connector + condition list, collapsing an empty
// list to "Always" when the section permits a no-rule state.
function templateFromConditions(
  conditions: VisibilityCondition[],
  connector: Connector,
  allowAlways: boolean,
): SimpleVisibilityTemplate {
  if (conditions.length === 0 && allowAlways) return "Always";
  return { TAG: "Conditions", connector, conditions };
}

// A fresh comparison condition, defaulting to the preferred field when it's
// a primitive in the picker, otherwise the first primitive available.
function defaultConditionFor(
  fields: ReadonlyArray<LogicField>,
  preferredFieldId?: string,
): VisibilityCondition {
  const preferred = fields.find(
    (f) => f.id === preferredFieldId && f.kind === "primitive",
  );
  const firstId =
    preferred?.id ?? fields.find((f) => f.kind === "primitive")?.id ?? "";
  return { TAG: "Comparison", fieldId: firstId, op: "==", value: "" };
}

// Whether the simple editor can represent a decompiled template:
//   - "Always" only when the section allows a no-rule state
//   - a single condition always (one row)
//   - multiple conditions only when the section allows multiple AND the
//     connector is `and` (OR / mixed logic stays in advanced mode for now)
function isSimpleRepresentable(
  t: SimpleVisibilityTemplate,
  allowAlways: boolean,
  allowMultiple: boolean,
): boolean {
  if (t === "Always") return allowAlways;
  if (t.conditions.length <= 1) return true;
  return allowMultiple && t.connector === "and";
}

// A stored visibility/requiredIf rule is "stuck in advanced" when the
// simple editor can't represent it. Both sections allow a no-rule state
// and multiple AND-ed conditions, so OR, nesting, or unknown operators
// stick. Shared by both sections' advisories.
function isStuckInAdvanced(initialRule: JsonLogicRule | undefined): boolean {
  if (initialRule === undefined) return false;
  const t = decompileVisibilityTemplate(initialRule);
  return t === undefined || !isSimpleRepresentable(t, true, true);
}

// ============================================================================
// FieldLogicPanel
//
// Mirrors the collapse-toggle shape of FieldTranslationPanel. Shows four
// sections: visibleIf (functional), validators (functional), and
// placeholders for requiredIf / computedValue.
//
// Props:
//   - `form`     : immutable copy of every field in this form, in the
//                  abstracted LogicField shape. Used to populate the
//                  field-picker. Includes the current field.
//   - `fieldId`  : id of the field whose rule slots this panel edits.
//   - `initial`  : current rule slots on the field.
//   - `onSave`   : called when a section saves AND its rule(s) pass
//                  structural validation. Receives the full updated
//                  FieldRuleSlots object — the caller merges into the
//                  form state.
// ============================================================================

export type FieldLogicPanelProps = {
  form: ReadonlyArray<LogicField>;
  fieldId: string;
  initial: FieldRuleSlots;
  onSave: (slots: FieldRuleSlots) => void;
};

export function FieldLogicPanel({
  form,
  fieldId,
  initial,
  onSave,
}: FieldLogicPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Visibility and requiredIf rules can't reference the field being
  // edited (would be circular — its own visibility / required-ness
  // depending on its own value). Validators CAN reference the current
  // field — "this field must be > 0" is a common pattern.
  const visibilityFields = useMemo(
    () => form.filter((f) => f.id !== fieldId),
    [form, fieldId],
  );
  const validatorFields = useMemo(
    () => form.filter((f) => f.kind === "primitive"),
    [form],
  );

  const currentField = useMemo(
    () => form.find((f) => f.id === fieldId),
    [form, fieldId],
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="pt-2"
      data-testid="field-logic-panel"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid="field-logic-toggle"
          className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm font-semibold hover:bg-muted/40"
        >
          <span className="flex items-center gap-2">
            <LucideSlidersHorizontal size="1rem" />
            Logic & Validation
          </span>
          <LucideChevronDown
            size="1rem"
            className={`transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-3 ml-2 space-y-3 border-l-2 border-muted pl-4">
          <CollapsibleSection
            title="Visibility"
            defaultOpen={initial.visibleIf !== undefined}
            testId="visibility-section-toggle"
          >
            <VisibilitySection
              referenceableFields={visibilityFields}
              initialRule={initial.visibleIf}
              onSave={(rule) => onSave({ ...initial, visibleIf: rule })}
            />
          </CollapsibleSection>

          {currentField?.kind === "primitive" ? (
            <CollapsibleSection
              title="Required when…"
              defaultOpen={initial.requiredIf !== undefined}
              testId="required-if-section-toggle"
            >
              <RequiredIfSection
                referenceableFields={visibilityFields}
                initialRule={initial.requiredIf}
                onSave={(rule) => onSave({ ...initial, requiredIf: rule })}
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Required when…"
              supported={false}
              note=""
              testId="required-if-section-placeholder"
            />
          )}

          {currentField?.kind === "primitive" ? (
            <CollapsibleSection
              title="Validators"
              defaultOpen={(initial.validators ?? []).length > 0}
              testId="validators-section-toggle"
            >
              <ValidatorsSection
                currentFieldId={fieldId}
                referenceableFields={validatorFields}
                initialValidators={initial.validators ?? []}
                onSave={(validators) =>
                  onSave({
                    ...initial,
                    validators: validators.length > 0 ? validators : undefined,
                  })
                }
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Validators"
              supported={false}
              note=""
              testId="validators-section-placeholder"
            />
          )}

          {currentField?.kind === "primitive" ? (
            <CollapsibleSection
              title="Computed value"
              defaultOpen={initial.computedValue !== undefined}
              testId="computed-value-section-toggle"
            >
              <ComputedValueSection
                initialRule={initial.computedValue}
                onSave={(rule) => onSave({ ...initial, computedValue: rule })}
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Computed value"
              supported={false}
              note=""
              testId="computed-value-section-placeholder"
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// ComputedValue section — single rule. Advanced-mode JSON only for v1.
//
// When set, the field becomes read-only on mobile and its value is the
// JSONLogic eval result, with a writeback short-circuit (no re-set if
// the value is structurally equal). An empty/undefined rule means
// "field is normal editable input".
// ============================================================================

type ComputedValueSectionProps = {
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

function ComputedValueSection({
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

// ============================================================================
// Visibility section — single rule. Uses RuleEditor + its own Save button.
// ============================================================================

type VisibilitySectionProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

function VisibilitySection({
  referenceableFields,
  initialRule,
  onSave,
}: VisibilitySectionProps) {
  // Decide initial advisory state: a rule the simple editor can't
  // represent lives in advanced mode. We surface that above the tabs.
  const stuckInAdvanced = useMemo(
    () => isStuckInAdvanced(initialRule),
    [initialRule],
  );

  // Compute initial validity synchronously from `initialRule` so the
  // Save button isn't briefly enabled for a stored-but-invalid rule.
  // `allowAlways: true` here, so `undefined` is a valid (no-rule)
  // state.
  const [current, setCurrent] = useState<RuleState>(() => ({
    rule: initialRule,
    isValid:
      initialRule === undefined ? true : validateRule(initialRule).TAG === "Ok",
  }));

  return (
    <section className="space-y-2" data-testid="visibility-section">
      <p className="text-xs text-muted-foreground">
        Control when this field appears. Rules reference other fields by
        their internal id and are evaluated against the current form
        state on the device.
      </p>

      {stuckInAdvanced && <StuckInAdvancedAdvisory />}

      <RuleEditor
        referenceableFields={referenceableFields}
        initialRule={initialRule}
        allowAlways={true}
        allowMultiple={true}
        kindLabels={VISIBILITY_KIND_LABELS}
        onChange={setCurrent}
      />

      <Button
        type="button"
        size="sm"
        disabled={!current.isValid}
        onClick={() => onSave(current.rule)}
        data-testid="rule-save"
      >
        Save visibility
      </Button>
    </section>
  );
}

// ============================================================================
// RequiredIf section — single rule. Same UX shape as Visibility, with
// one twist: an undefined rule means "no conditional override; fall back
// to the static Required checkbox" (not "always required").
// ============================================================================

type RequiredIfSectionProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

function RequiredIfSection({
  referenceableFields,
  initialRule,
  onSave,
}: RequiredIfSectionProps) {
  const stuckInAdvanced = useMemo(
    () => isStuckInAdvanced(initialRule),
    [initialRule],
  );

  // Same synchronous-validity computation as VisibilitySection.
  const [current, setCurrent] = useState<RuleState>(() => ({
    rule: initialRule,
    isValid:
      initialRule === undefined ? true : validateRule(initialRule).TAG === "Ok",
  }));

  return (
    <section className="space-y-2" data-testid="required-if-section">
      <p className="text-xs text-muted-foreground">
        Conditionally require this field based on other answers. When no
        conditional rule is set, the field falls back to the Required
        checkbox above.
      </p>

      {stuckInAdvanced && <StuckInAdvancedAdvisory />}

      <RuleEditor
        referenceableFields={referenceableFields}
        initialRule={initialRule}
        allowAlways={true}
        allowMultiple={true}
        kindLabels={REQUIRED_KIND_LABELS}
        onChange={setCurrent}
      />

      <Button
        type="button"
        size="sm"
        disabled={!current.isValid}
        onClick={() => onSave(current.rule)}
        data-testid="rule-save"
      >
        Save required rule
      </Button>
    </section>
  );
}

// ============================================================================
// Validators section — list of {id, rule, message, code?} rows.
// ============================================================================

type ValidatorsSectionProps = {
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

function ValidatorsSection({
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

// ============================================================================
// RuleEditor — shared between visibility and validators. Tabs across a
// simple template + a raw-JSON editor. Emits {rule, isValid} on change.
// No Save button; callers add their own.
// ============================================================================

/** @internal — exported for unit testing of the sync helpers. */
export type RuleState = {
  rule: JsonLogicRule | undefined;
  isValid: boolean;
};

type RuleEditorProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  initialRule: JsonLogicRule | undefined;
  /**
   * Whether the simple-mode dropdown offers an "always" / no-rule kind.
   * Visibility allows it (no rule == "always visible"); validators don't
   * (every validator must carry a rule).
   */
  allowAlways: boolean;
  /**
   * Whether the section can combine several conditions (joined by AND).
   * Visibility / requiredIf do; validators don't — a validator carries a
   * single condition, and multiple validators are already AND-ed at the
   * section level.
   */
  allowMultiple: boolean;
  /**
   * Per-kind labels for the Simple "When" dropdown. Sections pass
   * context-appropriate verbs — visibility uses "Show when…", validators
   * use "Valid when…" — so the same template shape reads correctly in
   * each surface.
   */
  kindLabels: Record<VisibilityKind, string>;
  /**
   * Preferred default `fieldId` for a fresh comparison template
   * (`allowAlways=false`, no prior rule). When the validators section
   * passes the current field id here, "Add validator" opens with the
   * current field selected — which is the common case and silences the
   * self-reference warning by default.
   */
  defaultFieldId?: string;
  onChange: (state: RuleState) => void;
};

function RuleEditor({
  referenceableFields,
  initialRule,
  allowAlways,
  allowMultiple,
  kindLabels,
  defaultFieldId,
  onChange,
}: RuleEditorProps) {
  const initialTemplate = useMemo(
    () => decompileVisibilityTemplate(initialRule),
    [initialRule],
  );
  // A decompiled template only seeds Simple mode when this section can
  // actually represent it (see `isSimpleRepresentable`): otherwise the
  // editor opens in Advanced. Covers the no-rule "Always" case for
  // validators and OR/multi-condition rules the section can't render.
  const safeTemplate =
    initialTemplate !== undefined &&
    isSimpleRepresentable(initialTemplate, allowAlways, allowMultiple)
      ? initialTemplate
      : null;
  const initialMode: "simple" | "advanced" = safeTemplate ? "simple" : "advanced";
  const [mode, setMode] = useState<"simple" | "advanced">(initialMode);

  // Lifted draft state so switching tabs doesn't reset what the user
  // just typed. SimpleRuleInput and AdvancedRuleInput are now pure
  // controlled views; this component owns the source of truth.
  const [template, setTemplate] = useState<SimpleVisibilityTemplate>(
    () =>
      safeTemplate ??
      defaultTemplateFor(allowAlways, referenceableFields, defaultFieldId),
  );
  const [text, setText] = useState<string>(() =>
    initialRule === undefined ? "" : JSON.stringify(initialRule, null, 2),
  );

  const primitiveFields = useMemo(
    () => referenceableFields.filter((f) => f.kind === "primitive"),
    [referenceableFields],
  );

  // Per-mode evaluation. Computed in this component so tab-switch is
  // an O(1) re-emit (no remount, no lost drafts).
  const simpleState = useMemo(
    () => evaluateSimpleTemplate(template, primitiveFields),
    [template, primitiveFields],
  );
  const advancedStatus = useMemo(() => computeAdvancedStatus(text), [text]);
  const advancedState = useMemo(
    () => advancedStatusToState(advancedStatus, allowAlways),
    [advancedStatus, allowAlways],
  );

  const active = mode === "simple" ? simpleState : advancedState;

  // Re-emit whenever the active mode's evaluation changes — including
  // when the user flips between tabs (mode-as-dep), so the parent's
  // Save button reflects the *visible* editor's state.
  useEffect(() => {
    onChange(active);
    // `onChange` is unstable across renders (parent passes inline);
    // depend on the evaluation only, otherwise we'd thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.rule, active.isValid]);

  // Cross-sync the inactive tab from the active one at switch time so
  // an in-progress edit in Simple isn't silently dropped (and vice
  // versa) when the user clicks across. Skip the sync when the source
  // side is incomplete/invalid — that way a half-typed simple draft
  // doesn't clobber a known-good advanced JSON, and a malformed JSON
  // doesn't clobber the simple template.
  const handleModeChange = (next: typeof mode) => {
    if (next === mode) return;
    if (next === "advanced") {
      const synced = syncTextFromSimple(simpleState);
      if (synced !== null) setText(synced);
    } else {
      const synced = syncTemplateFromAdvanced(
        advancedStatus,
        allowAlways,
        allowMultiple,
      );
      if (synced !== null) setTemplate(synced);
    }
    setMode(next);
  };

  return (
    <Tabs value={mode} onValueChange={(v) => handleModeChange(v as typeof mode)}>
      <TabsList>
        <TabsTrigger value="simple" data-testid="rule-mode-simple">
          Simple
        </TabsTrigger>
        <TabsTrigger value="advanced" data-testid="rule-mode-advanced">
          Advanced (JSON)
        </TabsTrigger>
      </TabsList>

      <TabsContent value="simple" className="pt-3">
        <SimpleRuleInput
          referenceableFields={referenceableFields}
          template={template}
          onTemplateChange={setTemplate}
          allowAlways={allowAlways}
          allowMultiple={allowMultiple}
          kindLabels={kindLabels}
        />
      </TabsContent>

      <TabsContent value="advanced" className="pt-3">
        <AdvancedRuleInput
          text={text}
          onTextChange={setText}
          status={advancedStatus}
          allowEmpty={allowAlways}
        />
      </TabsContent>
    </Tabs>
  );
}

function defaultTemplateFor(
  allowAlways: boolean,
  fields: ReadonlyArray<LogicField>,
  preferredFieldId?: string,
): SimpleVisibilityTemplate {
  // Sections that allow a no-rule state open on "Always"; validators (which
  // must carry a rule) open on a single comparison row — preferring the
  // caller's `preferredFieldId` so "Add validator" opens with the current
  // field selected, the common case.
  if (allowAlways) return "Always";
  return {
    TAG: "Conditions",
    connector: "and",
    conditions: [defaultConditionFor(fields, preferredFieldId)],
  };
}

// ============================================================================
// SimpleRuleInput — template-driven editor. No Save; emits on every
// change.
// ============================================================================

type SimpleRuleInputProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  template: SimpleVisibilityTemplate;
  onTemplateChange: (t: SimpleVisibilityTemplate) => void;
  allowAlways: boolean;
  allowMultiple: boolean;
  kindLabels: Record<VisibilityKind, string>;
};

// Default labels — kept here as a sensible fallback (and what the
// AdvancedRuleEditor convenience export uses). Consuming sections should
// pass their own context-appropriate set.
export const VISIBILITY_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "Always visible",
  Comparison: "Show when a field matches a value",
  Truthy: "Show when a field has any value",
  Falsy: "Show when a field is empty",
};

export const VALIDATOR_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "Always valid",
  Comparison: "Valid when a field matches a value",
  Truthy: "Valid when a field has any value",
  Falsy: "Valid when a field is empty",
};

// Picking "No conditional rule" compiles to undefined, which the
// renderer treats as "fall back to the static Required checkbox" —
// NOT "always required". The label reflects that semantic, breaking
// from the "<verb> when…" pattern intentionally.
export const REQUIRED_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "No conditional rule (use Required setting)",
  Comparison: "Required when a field matches a value",
  Truthy: "Required when a field has any value",
  Falsy: "Required when a field is empty",
};

function SimpleRuleInput({
  referenceableFields,
  template,
  onTemplateChange,
  allowAlways,
  allowMultiple,
  kindLabels,
}: SimpleRuleInputProps) {
  const primitiveFields = referenceableFields.filter(
    (f) => f.kind === "primitive",
  );

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
  const onKindChange = (kind: ConditionKind) => {
    // Preserve the chosen field when switching condition kinds.
    const fieldId = condition.fieldId;
    if (kind === "Comparison") {
      onChange({ TAG: "Comparison", fieldId, op: "==", value: "" });
    } else {
      onChange({ TAG: kind, fieldId });
    }
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
            {CONDITION_KINDS.map((k) => (
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
        onChange={(fieldId) =>
          onChange(
            condition.TAG === "Comparison"
              ? { ...condition, fieldId }
              : { TAG: condition.TAG, fieldId },
          )
        }
      />

      {condition.TAG === "Comparison" && (
        <ComparisonInputs
          op={condition.op}
          value={condition.value as string | number | boolean | null}
          primitiveKind={
            primitiveFields.find((f) => f.id === condition.fieldId)
              ?.primitiveKind
          }
          onOpChange={(op) => onChange({ ...condition, op })}
          onValueChange={(value) => onChange({ ...condition, value })}
        />
      )}
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

// ============================================================================
// AdvancedRuleInput — pure JSON textarea + validation status. No Save.
// Emits {rule, isValid} on every change. `allowEmpty` controls whether
// the empty state is treated as "OK, no rule" (visibility) or invalid
// (validators).
// ============================================================================

type AdvancedRuleInputProps = {
  text: string;
  onTextChange: (text: string) => void;
  status: ValidationStatus;
  allowEmpty: boolean;
};

function AdvancedRuleInput({
  text,
  onTextChange,
  status,
  allowEmpty,
}: AdvancedRuleInputProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">JSONLogic rule</Label>
      <Textarea
        aria-label="JSONLogic rule"
        value={text}
        onChange={(e) => onTextChange(e.currentTarget.value)}
        placeholder='e.g. { ">=": [{"var": "form.age"}, 18] }'
        className="min-h-[140px] font-mono text-xs"
        data-testid="rule-advanced-textarea"
      />
      <ValidationBadge status={status} allowEmpty={allowEmpty} />
    </div>
  );
}

// ============================================================================
// Pure evaluators — extracted so RuleEditor can compute initial validity
// synchronously and share logic with the backwards-compat AdvancedRuleEditor.
// ============================================================================

/**
 * Whether a single condition is fully authored: a real field reference,
 * and for comparisons a non-empty value. ("is null"/"is empty" cases
 * belong to the `Falsy` kind, not a comparison-against-null.)
 */
function conditionValid(
  c: VisibilityCondition,
  primitiveFields: ReadonlyArray<LogicField>,
): boolean {
  const fieldRefValid =
    c.fieldId !== "" && primitiveFields.some((f) => f.id === c.fieldId);
  if (!fieldRefValid) return false;
  if (c.TAG === "Comparison") {
    return !(c.value === "" || c.value === null);
  }
  return true;
}

/**
 * Compile a simple-mode template + check whether the user has authored
 * everything we need across every condition. Returns the {rule, isValid}
 * the parent's Save button gates on.
 */
function evaluateSimpleTemplate(
  template: SimpleVisibilityTemplate,
  primitiveFields: ReadonlyArray<LogicField>,
): RuleState {
  const rule = compileVisibilityTemplate(template);
  if (template === "Always") return { rule, isValid: true };
  const isValid =
    template.conditions.length > 0 &&
    template.conditions.every((c) => conditionValid(c, primitiveFields));
  return { rule, isValid };
}

/**
 * Compile the simple-mode template into the JSON text the Advanced
 * tab should display when the user switches over. Returns `null`
 * (skip-sync) when the simple draft is incomplete/invalid, so an
 * unfinished simple edit doesn't overwrite a known-good advanced
 * draft. Exported for unit testing only — Radix `Tabs` doesn't
 * flip state under jsdom, so the integration test goes through the
 * pure helper instead.
 *
 * @internal
 */
export function syncTextFromSimple(simpleState: RuleState): string | null {
  if (!simpleState.isValid) return null;
  if (simpleState.rule === undefined) return "";
  return JSON.stringify(simpleState.rule, null, 2);
}

/**
 * Decompile the advanced-mode JSON into the template the Simple tab
 * should display when the user switches over. Returns `null`
 * (skip-sync) when:
 *  - the advanced JSON is malformed or fails structural validation
 *  - the parsed rule doesn't match any template shape (e.g. a deeply
 *    nested AND/OR — leaves the user's existing simple-mode draft
 *    untouched rather than snapping to a default)
 *  - the decompiled template can't be represented in this section (see
 *    `isSimpleRepresentable`): "Always" where the section requires a rule,
 *    or an OR / multi-condition group the section can't render — we keep
 *    the pre-existing simple draft rather than drop the user's work.
 *
 * @internal
 */
export function syncTemplateFromAdvanced(
  advancedStatus: ValidationStatus,
  allowAlways: boolean,
  allowMultiple: boolean,
): SimpleVisibilityTemplate | null {
  let parsed: JsonLogicRule | undefined;
  if (advancedStatus.kind === "empty") parsed = undefined;
  else if (advancedStatus.kind === "ok") parsed = advancedStatus.parsed as JsonLogicRule;
  else return null;
  const decompiled = decompileVisibilityTemplate(parsed);
  if (decompiled === undefined) return null;
  if (!isSimpleRepresentable(decompiled, allowAlways, allowMultiple)) return null;
  return decompiled;
}

function computeAdvancedStatus(text: string): ValidationStatus {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { kind: "parseError", message: (e as Error).message };
  }
  const r = validateRule(parsed);
  if (r.TAG === "Ok") return { kind: "ok", parsed };
  return { kind: "logicError", error: r._0 };
}

function advancedStatusToState(
  status: ValidationStatus,
  allowEmpty: boolean,
): RuleState {
  if (status.kind === "ok") {
    return { rule: status.parsed as JsonLogicRule, isValid: true };
  }
  if (status.kind === "empty") {
    return { rule: undefined, isValid: allowEmpty };
  }
  return { rule: undefined, isValid: false };
}

// ---- Backwards-compatible standalone advanced editor ----------------------
//
// Keeps the pre-refactor surface (input + Save button) so external
// consumers and existing tests still work. New code should prefer
// `RuleEditor` (or `AdvancedRuleInput` directly).

export type AdvancedRuleEditorProps = {
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

export function AdvancedRuleEditor({
  initialRule,
  onSave,
}: AdvancedRuleEditorProps) {
  const [text, setText] = useState<string>(() =>
    initialRule === undefined ? "" : JSON.stringify(initialRule, null, 2),
  );
  const status = useMemo(() => computeAdvancedStatus(text), [text]);
  const state = useMemo(
    () => advancedStatusToState(status, /* allowEmpty */ true),
    [status],
  );
  return (
    <div className="space-y-2">
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
        Save visibility
      </Button>
    </div>
  );
}

// ============================================================================
// Shared bits
// ============================================================================

/** @internal — exported for unit testing of the sync helpers. */
export type ValidationStatus =
  | { kind: "empty" }
  | { kind: "ok"; parsed: unknown }
  | { kind: "parseError"; message: string }
  | { kind: "logicError"; error: RuleValidationError };

function ValidationBadge({
  status,
  allowEmpty,
}: {
  status: ValidationStatus;
  allowEmpty: boolean;
}) {
  // `data-status` is the stable handle for tests — copy can drift, but
  // these four discriminants match the ValidationStatus variant exactly.
  // "empty" further splits into ok-when-allowed vs. required-error, so
  // assertions disambiguate via `data-allow-empty` on the empty branch.
  switch (status.kind) {
    case "empty":
      return allowEmpty ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="rule-validation-badge"
          data-status="empty"
          data-allow-empty="true"
        >
          Empty — saving will clear this rule.
        </p>
      ) : (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="empty"
          data-allow-empty="false"
        >
          <LucideAlertCircle size="0.875rem" /> Rule is required.
        </p>
      );
    case "ok":
      return (
        <p
          className="flex items-center gap-1 text-xs text-emerald-700"
          data-testid="rule-validation-badge"
          data-status="ok"
        >
          <LucideCheck size="0.875rem" /> Valid
        </p>
      );
    case "parseError":
      return (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="parse-error"
        >
          <LucideAlertCircle size="0.875rem" /> JSON: {status.message}
        </p>
      );
    case "logicError":
      return (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="logic-error"
        >
          <LucideAlertCircle size="0.875rem" />{" "}
          {formatRuleError(status.error)}
        </p>
      );
  }
}

function formatRuleError(e: RuleValidationError): string {
  // ReScript variants: MaxDepthExceeded is a bare string; the others are
  // tagged records carrying their payload directly.
  if (e === "MaxDepthExceeded") return "Rule is nested too deep.";
  switch (e.TAG) {
    case "UnknownOperator":
      return `Unknown operator: ${e._0}`;
    case "MultiKeyObject":
      return `Object has multiple operator keys: ${e._0.join(", ")}`;
    case "InvalidShape":
      return `Invalid ${e.operator}: ${e.message}`;
  }
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

// Visual match to CollapsibleSection's trigger row so the panel reads
// as a uniform stack of four section headers. No chevron and no click
// handler signals "this row is disabled" without an extra
// "Not supported" line (kept in a tooltip-style follow-up if asked).
function SectionPlaceholder({
  title,
  supported,
  note,
  testId,
}: {
  title: string;
  supported: boolean;
  note: string;
  testId?: string;
}) {
  return (
    <section className="opacity-60" data-testid={testId}>
      <div className="flex w-full items-center justify-between py-1 text-sm font-semibold">
        <span>{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {supported ? note : "Not supported for this field type."}
      </p>
    </section>
  );
}

// Click-to-collapse wrapper around each of the four functional rule
// sections. Defaults: open if the slot already has content (so the
// author sees what's configured on load), closed otherwise (so a fresh
// field doesn't dump four empty editors). Local open state is
// uncontrolled per-mount — collapsing/expanding doesn't unmount the
// inner section, so its draft state survives toggles.
function CollapsibleSection({
  title,
  defaultOpen,
  testId,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  // testId is applied verbatim to the section header button so tests
  // can click to expand/collapse. Callers pass strings like
  // "visibility-section-toggle".
  testId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-semibold hover:bg-muted/40"
        >
          <span>{title}</span>
          <LucideChevronDown
            size="1rem"
            className={
              "transition-transform " + (open ? "rotate-0" : "-rotate-90")
            }
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
