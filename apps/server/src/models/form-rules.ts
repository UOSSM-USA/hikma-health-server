/**
 * Shared rule slots for event-form and patient-registration-form fields.
 *
 * A field can carry up to four optional JSONLogic rules:
 *
 *   - `visibleIf`     : evaluate against form-evaluation scope; hide the
 *                       field (and clear its value) when falsy.
 *   - `requiredIf`    : when present, overrides the flat `required` flag.
 *   - `validators`    : list of custom rules each contributing one error
 *                       message if the rule evaluates to a falsy value.
 *   - `computedValue` : when present, the field becomes read-only and its
 *                       value is the result of evaluating the rule.
 *
 * Rules are stored as opaque JSON (`JsonLogicRule = unknown`).
 *
 * Structural validity is checked at authoring time via
 * `validateRule` / `validateFieldRules` (imported from
 * `@hikmahealth/forms/RuleValidation`). This file keeps the local types
 * and the `FormFieldRulesValidationError` thrower; the validation logic
 * lives in ReScript inside `packages/hh-forms`.
 */

import {
  collectFieldRuleIssues,
  formatFieldRuleIssues,
  type fieldWithId,
  type formFieldRuleIssue,
  type ruleValidationError,
} from "@hikmahealth/forms/RuleValidation";

// Re-export the ReScript-side validators and types so existing
// `from "@/models/form-rules"` imports keep working.
export {
  validateRule,
  validateFieldRules,
  formatRuleError,
} from "@hikmahealth/forms/RuleValidation";
export type {
  ruleValidationError as RuleValidationError,
  formFieldRuleIssue as FormFieldRuleIssue,
  fieldRuleSlotError as FieldRuleSlotError,
} from "@hikmahealth/forms/RuleValidation";

export type JsonLogicRule = unknown;

/**
 * A user-authored validator. `rule` evaluates against the form scope;
 * a falsy result fails validation and `message` is shown to the user.
 * `id` is stable across reorderings; `code` is an optional
 * machine-readable error code consumers may branch on.
 */
export type Validator = {
  id: string;
  rule: JsonLogicRule;
  message: string;
  code?: string;
};

/**
 * Rule slot every field type carries — supports hide/show on
 * input-collecting, display-only, and bulk-input fields alike.
 */
export type WithVisibility = {
  visibleIf?: JsonLogicRule;
};

/**
 * Full rule slot for input-collecting fields (text, options, date,
 * binary). `requiredIf` overrides the flat `required` flag when present;
 * `computedValue` makes the field read-only; `validators` is a list of
 * custom rules each contributing one error message when failed.
 */
export type WithInputRules = WithVisibility & {
  requiredIf?: JsonLogicRule;
  validators?: Validator[];
  computedValue?: JsonLogicRule;
};

export type FieldRuleSlots = {
  visibleIf?: JsonLogicRule;
  requiredIf?: JsonLogicRule;
  computedValue?: JsonLogicRule;
  validators?: ReadonlyArray<Validator>;
};

// --------------------------------------------------------------------------
// Server-side upsert guard
//
// The thrower stays here (not in ReScript) because JS callers `instanceof`
// the class to distinguish "form contains broken rules" from other
// failure modes. ReScript exceptions are opaque to TS-side instanceof.
// --------------------------------------------------------------------------

export class FormFieldRulesValidationError extends Error {
  constructor(public readonly issues: ReadonlyArray<formFieldRuleIssue>) {
    super(
      `Form contains ${issues.length} invalid rule${
        issues.length === 1 ? "" : "s"
      }:\n${formatFieldRuleIssues([...issues])}`,
    );
    this.name = "FormFieldRulesValidationError";
  }
}

/**
 * Server-side defense-in-depth: throw if any field's rule slots contain
 * structurally invalid JSONLogic. The form-builder UI is the primary
 * authoring gate, but a future refactor (or a direct API call) could
 * bypass it; calling this at the upsert layer keeps broken rules out
 * of the DB.
 */
export function assertFieldRulesValid(
  fields: ReadonlyArray<{ id?: unknown } & FieldRuleSlots>,
): void {
  // ReScript's `fieldWithId` expects `id?: string` (no `unknown`). Massage
  // the input minimally — non-string ids become `undefined`, which ReScript
  // then renders as the sentinel `"<unknown>"`.
  const adapted: fieldWithId[] = fields.map((f) => ({
    id: typeof f.id === "string" ? f.id : undefined,
    visibleIf: f.visibleIf,
    requiredIf: f.requiredIf,
    computedValue: f.computedValue,
    validators: f.validators === undefined ? undefined : [...f.validators],
  }));
  const issues = collectFieldRuleIssues(adapted);
  if (issues.length > 0) {
    throw new FormFieldRulesValidationError(issues);
  }
}

// Re-exported for callers that walk a single error variant. Provides a
// stable spot for the variantTag helper used in unit tests and panels.
export function ruleValidationErrorTag(
  e: ruleValidationError,
): "MaxDepthExceeded" | "UnknownOperator" | "MultiKeyObject" | "InvalidShape" {
  return typeof e === "string" ? e : e.TAG;
}
