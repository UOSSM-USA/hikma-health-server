/**
 * Shared rule-slot types for mobile EventForm and PatientRegistrationForm
 * fields. Mirrors `apps/server/src/models/form-rules.ts` so the same JSON
 * shape that ships from the web form-builder round-trips through sync.
 * Evaluator lives at `apps/mobile/app/lib/form-rules.ts`.
 *
 * Rule reference convention: rules read fields by `id` via
 * `{var: "form.<fieldId>"}`. Not name, not column — survives renames.
 */

/** Opaque JSON. Validated structurally at authoring time on web. */
export type JsonLogicRule = unknown

/**
 * A user-authored validator. `rule` must evaluate truthy for the field
 * to be considered valid; a falsy result shows `message` to the user.
 * `id` is stable across reorderings; `code` is an optional
 * machine-readable error code consumers may branch on.
 */
export type Validator = {
  id: string
  rule: JsonLogicRule
  message: string
  code?: string
}

/**
 * Rule slot every field type carries. Applies to input-collecting,
 * display-only, and bulk-input (medicine, diagnosis, file) fields alike.
 */
export type WithVisibility = {
  visibleIf?: JsonLogicRule
}

/**
 * Full rule slot for input-collecting fields. `requiredIf` overrides
 * the flat `required` flag when present; `computedValue` makes the
 * field read-only and its value the result of evaluating the rule;
 * `validators` is a list of custom rules contributing one error
 * message each on failure.
 */
export type WithInputRules = WithVisibility & {
  requiredIf?: JsonLogicRule
  validators?: Validator[]
  computedValue?: JsonLogicRule
}

/** All four rule slots, used by the evaluator to walk a field's rules. */
export type FieldRuleSlots = {
  visibleIf?: JsonLogicRule
  requiredIf?: JsonLogicRule
  computedValue?: JsonLogicRule
  validators?: ReadonlyArray<Validator>
}
