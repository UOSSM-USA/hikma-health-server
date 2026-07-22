import { useEffect, useMemo, useRef } from "react"

import {
  compileRules,
  computedCount,
  computedEntries,
  computedValuesEqual,
  pruneRulesForLiveFields,
  stabilizeComputedValues,
  type RuleEvaluation,
  type ValidationError,
} from "@/lib/form-rules"
import PatientRegistrationForm from "@/models/PatientRegistrationForm"
import { Logger } from "@hikmahealth/js-utils"

/**
 * Rule evaluation for the patient record editor, derived from the
 * field-id-keyed values map owned by `usePatientRecordEditor`. Also owns the
 * two rule-driven writebacks (clear-on-hide, computedValue) — they call the
 * raw `updateField`, so they must NOT be the interaction-tracking setter.
 */
export type UsePatientRecordRulesInput = {
  /** Unfiltered registration fields carrying rule slots; the hook derives the live set itself. */
  fields: PatientRegistrationForm.RegistrationFormField[]
  /** Patient values keyed by field id (`patientRecord.values`). */
  values: Record<string, unknown>
  language: string
  /** Raw value setter — writebacks bypass interaction tracking. */
  updateField: (id: string, value: unknown) => void
  /** Changing the edited patient resets the clear-on-hide baseline. */
  patientId: string | undefined | null
  isLoading: boolean
}

export type UsePatientRecordRulesResult = {
  evaluation: RuleEvaluation
  errorsByFieldId: Map<string, ValidationError[]>
}

export function usePatientRecordRules({
  fields,
  values,
  language,
  updateField,
  patientId,
  isLoading,
}: UsePatientRecordRulesInput): UsePatientRecordRulesResult {
  // A hidden or soft-deleted field neither contributes rules nor can be referenced.
  const compiledRules = useMemo(() => {
    const liveFieldIds = fields.filter((f) => f.visible && !f.deleted).map((f) => f.id)
    return compileRules(pruneRulesForLiveFields(fields, liveFieldIds))
  }, [fields])

  const stabilization = useMemo(() => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields,
      values,
      ctx: { now: new Date().toISOString(), language },
    })
    return stabilizeComputedValues({ evaluator: compiledRules, initialScope: scope })
  }, [compiledRules, fields, values, language])

  const evaluation = stabilization.evaluation

  const errorsByFieldId = useMemo(() => {
    const map = new Map<string, ValidationError[]>()
    for (const err of evaluation.validationErrors) {
      const bucket = map.get(err.fieldId) ?? []
      bucket.push(err)
      map.set(err.fieldId, bucket)
    }
    return map
  }, [evaluation])

  useEffect(() => {
    if (evaluation.diagnostics.length === 0) return
    for (const d of evaluation.diagnostics) {
      Logger.warn({ msg: "[PatientEditor] rule diagnostic:", ...d })
    }
  }, [evaluation])

  useEffect(() => {
    if (stabilization.convergence !== "cycle") return
    Logger.warn({
      msg: "[PatientEditor] computedValue cycle detected — writebacks suppressed",
      iterations: stabilization.iterations,
    })
  }, [stabilization])

  // Clear-on-hide. The first evaluation only baselines the ref: patient values
  // are durable, and clearing a DB-loaded hidden field would let the submit
  // transformer overwrite it with "". Later visible→hidden transitions clear,
  // since the user's own edit fired the rule.
  const previouslyHiddenRef = useRef<Set<string> | null>(null)

  // React Navigation reuses this screen across patients; a stale hidden set
  // would clear a field hidden only for the previous patient.
  useEffect(() => {
    previouslyHiddenRef.current = null
  }, [patientId])

  useEffect(() => {
    if (isLoading) return
    if (fields.length === 0) return

    const { nowHidden, newlyHidden } = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: previouslyHiddenRef.current ?? new Set(),
    })

    if (previouslyHiddenRef.current === null) {
      previouslyHiddenRef.current = nowHidden
      return
    }

    for (const field of newlyHidden) {
      updateField(field.id, undefined)
    }
    previouslyHiddenRef.current = nowHidden
  }, [evaluation, fields, updateField, isLoading])

  // computedValue writeback. The structural-equality short-circuit guards the
  // setValue → re-eval → setValue cycle. No baseline skip: a computed field's
  // value is the rule's output, so syncing a drifted stored value is correct.
  useEffect(() => {
    if (isLoading) return
    if (computedCount(evaluation) === 0) return
    for (const [fieldId, computed] of computedEntries(evaluation)) {
      if (computedValuesEqual(values[fieldId], computed)) continue
      updateField(fieldId, computed)
    }
  }, [evaluation, values, updateField, isLoading])

  return { evaluation, errorsByFieldId }
}
