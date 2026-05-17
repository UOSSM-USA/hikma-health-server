/**
 * Authoring-time cycle detection for `computedValue` rules.
 *
 * Thin re-exporter; the implementation lives in ReScript at
 * `packages/hh-forms/src/RuleCycles.res` (compiled to
 * `@hikmahealth/forms/RuleCycles`).
 *
 * Note on the `extractReferencedFieldIds` shape change: the legacy TS
 * version returned `Set<string>`; the ReScript port returns `string[]`
 * (genType has no clean `Set` emission). Callers were only inside the
 * cycle detector + its own tests, so the public surface stays
 * call-compatible for the form-builder Save handlers — they only read
 * `cycles[i].fieldIds`.
 */

export {
  detectComputedValueCycles,
  extractReferencedFieldIds,
} from "@hikmahealth/forms/RuleCycles";

export type {
  computedValueCycle as ComputedValueCycle,
  fieldWithComputed as FieldWithComputed,
} from "@hikmahealth/forms/RuleCycles";
