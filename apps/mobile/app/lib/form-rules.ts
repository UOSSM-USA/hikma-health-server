/**
 * Mobile re-exporter for the form-rules evaluator + helpers.
 *
 * The canonical implementation lives in ReScript at
 * `packages/hh-forms/src/Rules.res` (compiled to
 * `@hikmahealth/forms/Rules`). This file:
 *
 *   - Re-exports types with mobile-side naming conventions
 *     (`RuleScope` rather than `ruleScope`, etc.).
 *   - Re-exports the canonical functions.
 *   - Wraps a few of them with TS-ergonomic signatures so existing
 *     screen call sites stay stable (object-arg shape for
 *     `summarizeSubmitBlockers` and `stabilizeComputedValues`, the
 *     `<T extends {id}>` generic for `filterVisibleFields`).
 */

import * as RsRules from "@hikmahealth/forms/Rules"

// ---------------------------------------------------------------------------
// Types — re-exported with mobile-side capitalized names.
// ---------------------------------------------------------------------------

export type RuleScope = RsRules.ruleScope
export type ValidationError = RsRules.validationError
export type RuleEvalDiagnostic = RsRules.ruleEvalDiagnostic
export type RuleEvaluation = RsRules.ruleEvaluation
export type FieldWithRules = RsRules.fieldWithRules
export type CompiledEvaluator = RsRules.compiledEvaluator
export type SubmitGate = RsRules.submitGate
export type StabilizeResult = RsRules.stabilizeResult

// ---------------------------------------------------------------------------
// Functions — direct re-exports where signatures match.
// ---------------------------------------------------------------------------

export const compileRules = RsRules.compileRules
export const pruneRulesForLiveFields = RsRules.pruneRulesForLiveFields
export const computedValuesEqual = RsRules.computedValuesEqual
export const formatComputedValue = RsRules.formatComputedValue

// computedValues is exposed via accessor helpers to keep the underlying
// dict storage private; screens iterate via `computedEntries`, look up
// via `getComputed`/`hasComputed`, and size-check via `computedCount`.
export const hasComputed = RsRules.hasComputed
export const getComputed = RsRules.getComputed
export const computedCount = RsRules.computedCount
export const computedEntries = RsRules.computedEntries

// Existing name; mobile screens + form-state-machine import this constant.
// ReScript-side it's `maxStabilizeIterations`.
export const MAX_STABILIZE_ITERATIONS = RsRules.maxStabilizeIterations

// ---------------------------------------------------------------------------
// Adapter wrappers — preserve the pre-flip TS-ergonomic signatures so
// screens / form-state-machine call sites stay stable.
// ---------------------------------------------------------------------------

/**
 * Bundles the two submit-blocker sources into a single decision +
 * deduped lists. Wraps the ReScript positional-arg surface.
 */
export function summarizeSubmitBlockers(input: {
  missingFieldNames: ReadonlyArray<string>
  validatorErrors: ReadonlyArray<ValidationError>
}): SubmitGate {
  return RsRules.summarizeSubmitBlockers(
    [...input.missingFieldNames],
    [...input.validatorErrors],
  )
}

/**
 * Filter a field list to those currently visible. Pass-through when
 * evaluation is null/undefined, preserving the input reference so
 * callers can `===` check downstream.
 */
export function filterVisibleFields<T extends { id: string }>(
  fields: ReadonlyArray<T>,
  evaluation: RuleEvaluation | null | undefined,
): ReadonlyArray<T> {
  if (!evaluation) return fields
  return RsRules.filterVisibleFields(
    [...fields],
    (f) => f.id,
    evaluation as unknown as RsRules.ruleEvaluation,
  )
}

/**
 * Iterate the evaluator until `computedValues` reach a fixed point. On
 * cycle, returns the last evaluation with computedValues emptied so the
 * caller's writeback no-ops. Object-arg signature wraps ReScript's
 * positional surface.
 */
export function stabilizeComputedValues(args: {
  evaluator: CompiledEvaluator
  initialScope: RuleScope
}): StabilizeResult {
  return RsRules.stabilizeComputedValues(args.evaluator, args.initialScope)
}
