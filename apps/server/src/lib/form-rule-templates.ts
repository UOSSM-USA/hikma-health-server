/**
 * Authoring-time helpers for the FieldLogicPanel UI.
 *
 * This file is a thin re-exporter: the actual implementations live in
 * `packages/hh-forms/src/RuleTemplates.res` (compiled to
 * `@hikmahealth/forms/RuleTemplates`). Keeping the import path stable
 * means consumers don't all need to change in one go.
 *
 * Shape notes for consumers:
 *
 *   - `SimpleVisibilityTemplate` is the ReScript-emitted variant:
 *     `"Always"` for the no-rule case (bare string), and
 *     `{ TAG: "Comparison" | "Truthy" | "Falsy", ... }` for the rest.
 *
 *   - `decompileVisibilityTemplate` returns `undefined` (not `null`) when
 *     the rule doesn't match a template shape — that's the ReScript
 *     `option<...>` convention surfaced through genType.
 */

export {
  compileVisibilityTemplate,
  decompileVisibilityTemplate,
  ruleReferencesField,
  comparisonOps as COMPARISON_OPS,
  comparisonOpLabels as COMPARISON_OP_LABELS,
} from "@hikmahealth/forms/RuleTemplates";

export type {
  logicField as LogicField,
  logicFieldKind as LogicFieldKind,
  logicPrimitiveKind as LogicPrimitiveKind,
  comparisonOp as ComparisonOp,
  simpleVisibilityTemplate as SimpleVisibilityTemplate,
} from "@hikmahealth/forms/RuleTemplates";
