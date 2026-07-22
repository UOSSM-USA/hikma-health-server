/**
 * Pure-logic XState machine modeling the per-form runtime: value
 * application, rule evaluation, computed-value convergence, clear-on-
 * hide diffing, and visibility-filtered submit projection.
 *
 * NOT wired into either screen yet — this exists primarily as a
 * property-testable surface for behaviors that previously lived inside
 * the screens' `useEffect`s (where they couldn't be exercised under
 * fast-check). Screens may consume it later via `@xstate/react`'s
 * `useActor`; for now they keep their existing state containers.
 *
 * Design notes (load-bearing decisions captured at design time):
 *
 *   - Effects are accumulated on `context.effects` (cleared at the
 *     start of each transition). Consumers read them off the snapshot.
 *     Chose context-queue over `emit` because property tests need
 *     synchronous, subscriber-free access; `emit` can be added on top
 *     when screens want a streaming surface.
 *
 *   - `previouslyHidden` encodes the first-render-baseline policy via
 *     its initial value: `null` means "first eval is baseline-only,
 *     no clears emitted" (patient form, decision #12 in the
 *     implementation doc). `new Set<string>()` means "diff against
 *     empty set on first eval = clear every initially-hidden field"
 *     (event form). No separate flag needed.
 *
 *   - The compiled evaluator lives on context so we pay the parse
 *     cost once per machine instance, not per event. Non-serializable
 *     but we don't persist actor state.
 *
 *   - Submit-gate logic (missing-required + validator dedup +
 *     consolidated message) stays in the screens; each form type has
 *     different field-name display semantics. The machine emits the
 *     visibility-filtered value snapshot via `submit-payload`; the
 *     screens decide whether to actually send it.
 */

import { assign, setup } from "xstate"

import {
  compileRules,
  computedEntries,
  computedValuesEqual,
  MAX_STABILIZE_ITERATIONS,
  pruneRulesForLiveFields,
  type CompiledEvaluator,
  type FieldWithRules,
  type RuleEvaluation,
  type RuleEvalDiagnostic,
  type RuleScope,
} from "./form-rules"

// Re-exported for the existing test suite + downstream consumers.
// Canonical definition lives in `form-rules.ts` (the lower-level module
// where `stabilizeComputedValues` reads it).
export { MAX_STABILIZE_ITERATIONS }

export type FormEvent =
  | { type: "LOAD"; values: Record<string, unknown> }
  | { type: "EDIT_FIELD"; fieldId: string; value: unknown }
  | { type: "SUBMIT_ATTEMPT" }

export type FormEffect =
  | { type: "clear"; fieldId: string }
  | { type: "write-computed"; fieldId: string; value: unknown }
  | { type: "diagnostic"; diagnostic: RuleEvalDiagnostic }
  // Visibility-filtered snapshot of values the screen would send.
  // The screen still owns the missing-required + validator gating.
  | { type: "submit-payload"; values: Record<string, unknown> }

export type FormContext = {
  fields: readonly FieldWithRules[]
  evaluator: CompiledEvaluator
  ctxSupplier: () => RuleScope["ctx"]
  values: Record<string, unknown>
  // null = first-render baseline pending (no clears on first eval);
  // Set<>  = baseline established (clear-immediately on visible→hidden).
  previouslyHidden: ReadonlySet<string> | null
  interacted: ReadonlySet<string>
  evaluation: RuleEvaluation | null
  effects: readonly FormEffect[]
  convergence: "stable" | "cycle"
  iterations: number
}

export type FormInput = {
  fields: readonly FieldWithRules[]
  ctxSupplier: () => RuleScope["ctx"]
  initialValues?: Record<string, unknown>
  // "skip-first-render" → previouslyHidden starts null (patient form);
  // "clear-immediately" → starts as empty Set (event form). Defaults
  // to "clear-immediately" since that's the simpler invariant; opt
  // into baseline-skip explicitly when patient-style durability
  // matters.
  baselineHidden?: "skip-first-render" | "clear-immediately"
}

type StabilizeResult = {
  values: Record<string, unknown>
  evaluation: RuleEvaluation
  effects: FormEffect[]
  convergence: "stable" | "cycle"
  iterations: number
}

/**
 * Apply the rule evaluator + computedValue writebacks until values
 * stop changing OR we hit MAX_STABILIZE_ITERATIONS. Returns the final
 * values, the last evaluation, and the effects produced (writes +
 * diagnostics).
 */
function stabilize(
  fields: readonly FieldWithRules[],
  evaluator: CompiledEvaluator,
  ctxSupplier: () => RuleScope["ctx"],
  startValues: Record<string, unknown>,
): StabilizeResult {
  // We mutate a local copy; the caller passes a fresh object so the
  // input is never aliased.
  const values: Record<string, unknown> = { ...startValues }
  const effects: FormEffect[] = []
  let evaluation = evaluator({ form: values, ctx: ctxSupplier() })

  // Emit first-pass diagnostics. Re-running rules with new computed
  // values doesn't add new parse errors (the AST is cached), so emit
  // once.
  for (const d of evaluation.diagnostics) {
    effects.push({ type: "diagnostic", diagnostic: d })
  }

  let iterations = 1
  while (iterations < MAX_STABILIZE_ITERATIONS) {
    let anyChanged = false
    for (const [fieldId, computed] of computedEntries(evaluation)) {
      const current = values[fieldId]
      if (computedValuesEqual(current, computed)) continue
      values[fieldId] = computed
      effects.push({ type: "write-computed", fieldId, value: computed })
      anyChanged = true
    }
    if (!anyChanged) {
      return { values, evaluation, effects, convergence: "stable", iterations }
    }
    iterations += 1
    evaluation = evaluator({ form: values, ctx: ctxSupplier() })
  }
  // Hit the iteration cap with values still changing → cycle.
  return { values, evaluation, effects, convergence: "cycle", iterations }
}

/**
 * Diff the current hidden set against the previous one. The "newly
 * hidden" set drives clear-on-hide; the "now hidden" set becomes the
 * next state's previouslyHidden.
 */
function diffHidden(
  fields: readonly FieldWithRules[],
  evaluation: RuleEvaluation,
  previouslyHidden: ReadonlySet<string>,
): { nowHidden: Set<string>; newlyHidden: string[] } {
  const nowHidden = new Set<string>()
  const newlyHidden: string[] = []
  for (const f of fields) {
    if (evaluation.isVisible(f.id)) continue
    nowHidden.add(f.id)
    if (!previouslyHidden.has(f.id)) newlyHidden.push(f.id)
  }
  return { nowHidden, newlyHidden }
}

/**
 * Run one transition: apply startValues + interacted update, stabilize,
 * diff hidden set, emit effects. submitAttempt=true additionally emits
 * the visibility-filtered submit payload.
 *
 * Returns a complete new context, ready to assign into the machine.
 */
function applyTransition(
  ctx: FormContext,
  startValues: Record<string, unknown>,
  newInteracted: ReadonlySet<string>,
  submitAttempt: boolean,
): FormContext {
  const stab = stabilize(ctx.fields, ctx.evaluator, ctx.ctxSupplier, startValues)
  const isBaselinePass = ctx.previouslyHidden === null
  const { nowHidden, newlyHidden } = diffHidden(
    ctx.fields,
    stab.evaluation,
    ctx.previouslyHidden ?? new Set(),
  )

  const effects: FormEffect[] = [...stab.effects]
  if (!isBaselinePass) {
    for (const id of newlyHidden) {
      effects.push({ type: "clear", fieldId: id })
    }
  }
  if (submitAttempt) {
    // Project visibility-filtered payload. Hidden fields drop from the
    // outbound values map; that's the defense-in-depth filter the
    // EventForm screen has today (see decision #12 carve-out for the
    // patient screen — its consumer can simply ignore submit-payload
    // and use its own DB-bound transformer).
    const payload: Record<string, unknown> = {}
    for (const key of Object.keys(stab.values)) {
      // A value with no corresponding field is preserved (we don't
      // know its visibility); only filter the declared fields.
      payload[key] = stab.values[key]
    }
    for (const id of nowHidden) {
      delete payload[id]
    }
    effects.push({ type: "submit-payload", values: payload })
  }

  return {
    ...ctx,
    values: stab.values,
    previouslyHidden: nowHidden,
    interacted: newInteracted,
    evaluation: stab.evaluation,
    effects,
    convergence: stab.convergence,
    iterations: stab.iterations,
  }
}


export const formStateMachine = setup({
  types: {
    context: {} as FormContext,
    events: {} as FormEvent,
    input: {} as FormInput,
  },
}).createMachine({
  id: "form-state",
  context: ({ input }) => {
    const evaluator = compileRules(
      pruneRulesForLiveFields(
        [...input.fields],
        input.fields.map((f) => f.id),
      ),
    )
    // Default to clear-immediately because it's the simpler invariant;
    // patient form opts into skip-first-render explicitly.
    const baselineMode = input.baselineHidden ?? "clear-immediately"
    return {
      fields: input.fields,
      evaluator,
      ctxSupplier: input.ctxSupplier,
      values: input.initialValues ? { ...input.initialValues } : {},
      previouslyHidden: baselineMode === "skip-first-render" ? null : new Set<string>(),
      interacted: new Set<string>(),
      evaluation: null,
      effects: [],
      convergence: "stable",
      iterations: 0,
    }
  },
  initial: "active",
  states: {
    active: {
      on: {
        LOAD: {
          actions: assign(({ context, event }) =>
            applyTransition(context, { ...event.values }, context.interacted, false),
          ),
        },
        EDIT_FIELD: {
          actions: assign(({ context, event }) => {
            const nextValues = { ...context.values, [event.fieldId]: event.value }
            const nextInteracted = context.interacted.has(event.fieldId)
              ? context.interacted
              : new Set([...context.interacted, event.fieldId])
            return applyTransition(context, nextValues, nextInteracted, false)
          }),
        },
        SUBMIT_ATTEMPT: {
          actions: assign(({ context }) =>
            applyTransition(context, { ...context.values }, context.interacted, true),
          ),
        },
      },
    },
  },
})
