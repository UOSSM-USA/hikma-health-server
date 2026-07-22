// Pure, React-free model behind the field-logic editors: template
// helpers, rule-state evaluation, advanced-JSON validation, and the
// simple/advanced editor state machine. UI components in this
// directory render this model; they don't own logic of their own.

import {
  type JsonLogicRule,
  type RuleValidationError,
  validateRule,
} from "@/models/form-rules";
import {
  compileVisibilityTemplate,
  type Connector,
  decompileVisibilityTemplate,
  type LogicField,
  type SimpleVisibilityTemplate,
  type VisibilityCondition,
} from "@/lib/form-rule-templates";

// SimpleVisibilityTemplate is the ReScript-emitted variant: `"Always"` is
// a bare string; otherwise a `{TAG: "Conditions", connector, conditions}`
// group whose members are `VisibilityCondition` leaves. The slot-level
// "Always" state is an empty condition list, not a per-row kind.
// Per-row leaf kinds. Scalar fields offer comparison + presence; multi-value
// fields offer membership (and presence, read as "any/none selected").
export type ConditionKind =
  | "Comparison"
  | "LengthCompare"
  | "Truthy"
  | "Falsy"
  | "IncludesOption"
  | "ExcludesOption"
  | "IncludesAny"
  | "IncludesAll";

// Slot-level kinds add the no-rule "Always" state.
export type VisibilityKind = "Always" | ConditionKind;

export const CONDITION_KINDS: ConditionKind[] = ["Comparison", "Truthy", "Falsy"];
// Free-text fields add a character-length comparison; Comparison stays first so
// it remains the default kind a fresh condition opens on.
const TEXT_CONDITION_KINDS: ConditionKind[] = [
  "Comparison",
  "LengthCompare",
  "Truthy",
  "Falsy",
];
const MULTI_CONDITION_KINDS: ConditionKind[] = [
  "IncludesOption",
  "ExcludesOption",
  "IncludesAny",
  "IncludesAll",
  "Truthy",
  "Falsy",
];

// The condition kinds a field supports: multi-value fields swap scalar
// comparison for membership kinds; free-text fields add length comparison
// (Truthy/Falsy stay throughout). A missing field falls back to the scalar set.
export function conditionKindsFor(field: LogicField | undefined): ConditionKind[] {
  if (field?.multiValue) return MULTI_CONDITION_KINDS;
  if (field?.freeText) return TEXT_CONDITION_KINDS;
  return CONDITION_KINDS;
}

export type RuleState = {
  rule: JsonLogicRule | undefined;
  isValid: boolean;
};

export type ValidationStatus =
  | { kind: "empty" }
  | { kind: "ok"; parsed: unknown }
  | { kind: "parseError"; message: string }
  | { kind: "logicError"; error: RuleValidationError };

// Rules reference fields by id; only primitive fields carry a value a
// rule can read.
export const primitiveFieldsOf = (
  fields: ReadonlyArray<LogicField>,
): LogicField[] => fields.filter((f) => f.kind === "primitive");

// The conditions a template carries; "Always" has none.
export const conditionsOf = (t: SimpleVisibilityTemplate): VisibilityCondition[] =>
  t === "Always" ? [] : t.conditions;

// Build a template from a connector + condition list, collapsing an empty
// list to "Always" when the section permits a no-rule state.
export function templateFromConditions(
  conditions: VisibilityCondition[],
  connector: Connector,
  allowAlways: boolean,
): SimpleVisibilityTemplate {
  if (conditions.length === 0 && allowAlways) return "Always";
  return { TAG: "Conditions", connector, conditions };
}

// A fresh condition of the given kind for the given field. Single-value kinds
// get sensible defaults so they're immediately valid; IncludesAny/All start
// empty — the author picks ≥2 options before Save enables.
export function defaultConditionForKind(
  kind: ConditionKind,
  field: LogicField | undefined,
): VisibilityCondition {
  const fieldId = field?.id ?? "";
  switch (kind) {
    case "Comparison":
      return { TAG: "Comparison", fieldId, op: "==", value: "" };
    case "LengthCompare":
      return { TAG: "LengthCompare", fieldId, op: ">", value: 0 };
    case "Truthy":
      return { TAG: "Truthy", fieldId };
    case "Falsy":
      return { TAG: "Falsy", fieldId };
    case "IncludesOption":
      return { TAG: "IncludesOption", fieldId, value: field?.options?.[0]?.value ?? "" };
    case "ExcludesOption":
      return { TAG: "ExcludesOption", fieldId, value: field?.options?.[0]?.value ?? "" };
    case "IncludesAny":
      return { TAG: "IncludesAny", fieldId, values: [] };
    case "IncludesAll":
      return { TAG: "IncludesAll", fieldId, values: [] };
  }
}

// A fresh condition, defaulting to the preferred field when it's a primitive
// in the picker, otherwise the first primitive available. The kind is the
// field's first supported one — comparison for scalars, includes for
// multi-value fields.
export function defaultConditionFor(
  fields: ReadonlyArray<LogicField>,
  preferredFieldId?: string,
): VisibilityCondition {
  const preferred = fields.find(
    (f) => f.id === preferredFieldId && f.kind === "primitive",
  );
  const field = preferred ?? fields.find((f) => f.kind === "primitive");
  return defaultConditionForKind(conditionKindsFor(field)[0], field);
}

export function defaultTemplateFor(
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

// Whether the simple editor can represent a decompiled template:
//   - "Always" only when the section allows a no-rule state
//   - a single condition always (one row)
//   - multiple conditions only when the section allows multiple AND the
//     connector is `and` (OR / mixed logic stays in advanced mode for now)
export function isSimpleRepresentable(
  t: SimpleVisibilityTemplate,
  allowAlways: boolean,
  allowMultiple: boolean,
): boolean {
  if (t === "Always") return allowAlways;
  if (t.conditions.length <= 1) return true;
  return allowMultiple && t.connector === "and";
}

// A stored rule is "stuck in advanced" when the simple editor can't
// represent it in the given section: OR, nesting, or unknown operators
// stick. Sections surface this as an advisory above the tabs.
export function isStuckInAdvanced(
  initialRule: JsonLogicRule | undefined,
  allowAlways: boolean,
  allowMultiple: boolean,
): boolean {
  if (initialRule === undefined) return false;
  const t = decompileVisibilityTemplate(initialRule);
  return t === undefined || !isSimpleRepresentable(t, allowAlways, allowMultiple);
}

/**
 * Whether a single condition is fully authored: a real field reference,
 * and for comparisons a non-empty value. ("is null"/"is empty" cases
 * belong to the `Falsy` kind, not a comparison-against-null.)
 */
export function conditionValid(
  c: VisibilityCondition,
  primitiveFields: ReadonlyArray<LogicField>,
): boolean {
  const fieldRefValid =
    c.fieldId !== "" && primitiveFields.some((f) => f.id === c.fieldId);
  if (!fieldRefValid) return false;
  switch (c.TAG) {
    case "Comparison":
      return !(c.value === "" || c.value === null);
    case "LengthCompare":
      // Character counts are non-negative integers.
      return (
        typeof c.value === "number" && Number.isInteger(c.value) && c.value >= 0
      );
    case "IncludesOption":
    case "ExcludesOption":
      return c.value !== "";
    case "IncludesAny":
    case "IncludesAll":
      return c.values.length >= 2;
    case "Truthy":
    case "Falsy":
      return true;
  }
}

/**
 * Compile a simple-mode template + check whether the user has authored
 * everything we need across every condition. Returns the {rule, isValid}
 * the section's Save button gates on.
 */
export function evaluateSimpleTemplate(
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

export function computeAdvancedStatus(text: string): ValidationStatus {
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

export function advancedStatusToState(
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

// Validity of a rule already stored on the field — sections seed their
// Save-button state from this synchronously, so a stored-but-invalid rule
// never shows a briefly-enabled Save.
export function storedRuleState(rule: JsonLogicRule | undefined): RuleState {
  return {
    rule,
    isValid: rule === undefined ? true : validateRule(rule).TAG === "Ok",
  };
}

/**
 * Compile the simple-mode template into the JSON text the Advanced
 * tab should display when the user switches over. Returns `null`
 * (skip-sync) when the simple draft is incomplete/invalid, so an
 * unfinished simple edit doesn't overwrite a known-good advanced
 * draft. Exported for unit testing — Radix `Tabs` doesn't flip state
 * under jsdom, so the integration test goes through the pure helper
 * instead.
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

// EDITOR STATE MACHINE
//
// RuleEditor holds one state value: which tab is active plus the draft
// each tab is editing. Drafts are kept independently so switching tabs
// never destroys what the user typed; the switch action cross-syncs the
// destination draft from the source one when — and only when — the
// source is complete and valid.

export type EditorMode = "simple" | "advanced";

export type EditorState = {
  mode: EditorMode;
  template: SimpleVisibilityTemplate;
  text: string;
};

export type EditorConfig = {
  allowAlways: boolean;
  allowMultiple: boolean;
  /** Fields the rule may reference (the section's referenceable set). */
  fields: ReadonlyArray<LogicField>;
};

export type EditorAction =
  | { kind: "editTemplate"; template: SimpleVisibilityTemplate }
  | { kind: "editText"; text: string }
  | { kind: "switchMode"; mode: EditorMode };

// A stored rule seeds Simple mode only when this section can represent
// it (see `isSimpleRepresentable`); otherwise the editor opens in
// Advanced. Covers the no-rule "Always" case for validators and
// OR/multi-condition rules the section can't render.
export function initEditorState(
  config: EditorConfig,
  initialRule: JsonLogicRule | undefined,
  defaultFieldId?: string,
): EditorState {
  const decompiled = decompileVisibilityTemplate(initialRule);
  const representable =
    decompiled !== undefined &&
    isSimpleRepresentable(decompiled, config.allowAlways, config.allowMultiple)
      ? decompiled
      : undefined;
  return {
    mode: representable !== undefined ? "simple" : "advanced",
    template:
      representable ??
      defaultTemplateFor(config.allowAlways, config.fields, defaultFieldId),
    text: initialRule === undefined ? "" : JSON.stringify(initialRule, null, 2),
  };
}

export function editorReduce(
  config: EditorConfig,
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.kind) {
    case "editTemplate":
      return { ...state, template: action.template };
    case "editText":
      return { ...state, text: action.text };
    case "switchMode": {
      if (action.mode === state.mode) return state;
      // Cross-sync the destination draft from the source at switch time
      // so an in-progress edit isn't silently dropped. Skip the sync
      // when the source side is incomplete/invalid — a half-typed simple
      // draft doesn't clobber a known-good advanced JSON, and malformed
      // JSON doesn't clobber the simple template.
      if (action.mode === "advanced") {
        const simple = evaluateSimpleTemplate(
          state.template,
          primitiveFieldsOf(config.fields),
        );
        const synced = syncTextFromSimple(simple);
        return { ...state, mode: "advanced", text: synced ?? state.text };
      }
      const synced = syncTemplateFromAdvanced(
        computeAdvancedStatus(state.text),
        config.allowAlways,
        config.allowMultiple,
      );
      return { ...state, mode: "simple", template: synced ?? state.template };
    }
  }
}

// The {rule, isValid} of whichever tab is active — what the section's
// Save button reflects.
export function editorRuleState(
  config: EditorConfig,
  state: EditorState,
): RuleState {
  if (state.mode === "simple") {
    return evaluateSimpleTemplate(state.template, primitiveFieldsOf(config.fields));
  }
  return advancedStatusToState(computeAdvancedStatus(state.text), config.allowAlways);
}

// KIND LABELS
//
// Per-kind copy for the Simple "When" dropdown. Sections pass
// context-appropriate verbs so the same template shape reads correctly
// in each surface.

export const VISIBILITY_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "Always visible",
  Comparison: "Show when a field matches a value",
  LengthCompare: "Show when a field's length compares to a number",
  Truthy: "Show when a field has any value",
  Falsy: "Show when a field is empty",
  IncludesOption: "Show when a field includes an option",
  ExcludesOption: "Show when a field excludes an option",
  IncludesAny: "Show when a field includes any of…",
  IncludesAll: "Show when a field includes all of…",
};

export const VALIDATOR_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "Always valid",
  Comparison: "Valid when a field matches a value",
  LengthCompare: "Valid when a field's length compares to a number",
  Truthy: "Valid when a field has any value",
  Falsy: "Valid when a field is empty",
  IncludesOption: "Valid when a field includes an option",
  ExcludesOption: "Valid when a field excludes an option",
  IncludesAny: "Valid when a field includes any of…",
  IncludesAll: "Valid when a field includes all of…",
};

// Picking "No conditional rule" compiles to undefined, which the
// renderer treats as "fall back to the static Required checkbox" —
// NOT "always required". The label reflects that semantic, breaking
// from the "<verb> when…" pattern intentionally.
export const REQUIRED_KIND_LABELS: Record<VisibilityKind, string> = {
  Always: "No conditional rule (use Required setting)",
  Comparison: "Required when a field matches a value",
  LengthCompare: "Required when a field's length compares to a number",
  Truthy: "Required when a field has any value",
  Falsy: "Required when a field is empty",
  IncludesOption: "Required when a field includes an option",
  ExcludesOption: "Required when a field excludes an option",
  IncludesAny: "Required when a field includes any of…",
  IncludesAll: "Required when a field includes all of…",
};
