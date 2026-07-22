/**
 * Tests for `PatientRegistrationForm.buildRuleScope`,
 * `PatientRegistrationForm.computeNewlyHidden`, and the rule-aware
 * contract on `PatientRegistrationForm.getMissingRequiredFields`.
 *
 * Mirrors `event-form-rule-scope.test.ts` but with the simpler
 * registration-form domain (no diagnosis / medicine / file side-state,
 * no display-only kinds — every field is an input-collecting primitive
 * keyed by id in `patientRecord.values`).
 */

import fc from "fast-check"

import PatientRegistrationForm from "../../app/models/PatientRegistrationForm"
import Language from "../../app/models/Language"
import { compileRules, type RuleEvaluation } from "../../app/lib/form-rules"
import { joinCheckboxValues } from "../../app/utils/parsers"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(
  overrides: Partial<PatientRegistrationForm.RegistrationFormField> &
    Pick<PatientRegistrationForm.RegistrationFormField, "id">,
): PatientRegistrationForm.RegistrationFormField {
  return {
    id: overrides.id,
    position: overrides.position ?? 0,
    column: overrides.column ?? ("given_name" as PatientRegistrationForm.BaseColumn),
    label: overrides.label ?? { en: overrides.id },
    fieldType: overrides.fieldType ?? "text",
    options: overrides.options ?? [],
    required: overrides.required ?? false,
    baseField: overrides.baseField ?? false,
    visible: overrides.visible ?? true,
    isSearchField: overrides.isSearchField ?? false,
    deleted: overrides.deleted ?? false,
    ...overrides,
  }
}

const defaultCtx = { now: "2026-05-19T00:00:00Z", language: "en" }

function evaluationStub(opts: {
  hidden?: ReadonlyArray<string>
  requiredOverride?: Record<string, boolean>
}): RuleEvaluation {
  const hidden = new Set(opts.hidden ?? [])
  return {
    isVisible: (id) => !hidden.has(id),
    isRequired: (id) =>
      opts.requiredOverride?.[id] !== undefined ? opts.requiredOverride[id] : false,
    validationErrors: [],
    diagnostics: [],
  }
}

// ---------------------------------------------------------------------------
// buildRuleScope — base shape
// ---------------------------------------------------------------------------

describe("PatientRegistrationForm.buildRuleScope", () => {
  it("returns an empty form map and the given ctx when there are no fields", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [],
      values: {},
      ctx: defaultCtx,
    })
    expect(scope.form).toEqual({})
    expect(scope.ctx).toEqual(defaultCtx)
  })

  it("keys form values by field id, reading them straight from values", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "f-uuid-1", column: "given_name" })],
      values: { "f-uuid-1": "Jane" },
      ctx: defaultCtx,
    })
    expect(scope.form["f-uuid-1"]).toBe("Jane")
  })

  it("maps a missing values key to undefined", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "f1" })],
      values: {},
      ctx: defaultCtx,
    })
    expect(scope.form).toHaveProperty("f1")
    expect(scope.form["f1"]).toBeUndefined()
  })

  it("drops orphan values whose fields no longer exist (bounded scope)", () => {
    // If a field was removed from the form schema but a stale value
    // lingers in patientRecord.values, the scope must not surface it —
    // rules should only reference declared fields.
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "kept" })],
      values: { kept: "yes", orphan: "should-not-leak" },
      ctx: defaultCtx,
    })
    expect(scope.form).toEqual({ kept: "yes" })
    expect(scope.form).not.toHaveProperty("orphan")
  })

  it("preserves falsy primitives (0, false, empty string) — they are not 'missing'", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [
        makeField({ id: "age", fieldType: "number" }),
        makeField({ id: "consent", fieldType: "boolean" }),
        makeField({ id: "notes", fieldType: "text" }),
      ],
      values: { age: 0, consent: false, notes: "" },
      ctx: defaultCtx,
    })
    expect(scope.form["age"]).toBe(0)
    expect(scope.form["consent"]).toBe(false)
    expect(scope.form["notes"]).toBe("")
  })

  it("normalizes Date values on date fields to local YYYY-MM-DD strings", () => {
    // JsonLogic comparisons silently fail on JS Date objects (the fail-safe
    // path drops the validator). Scope must hand it a string instead.
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "dob", column: "date_of_birth", fieldType: "date" })],
      // Local-date constructor so the assertion is timezone-independent.
      values: { dob: new Date(2024, 0, 1) },
      ctx: defaultCtx,
    })
    expect(scope.form["dob"]).toBe("2024-01-01")
  })

  it("leaves non-Date date-field values untouched", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "dob", column: "date_of_birth", fieldType: "date" })],
      values: { dob: "2024-06-15" },
      ctx: defaultCtx,
    })
    expect(scope.form["dob"]).toBe("2024-06-15")
  })

  it("only normalizes Date on fieldType=date — other fields holding Dates pass through", () => {
    // Defensive: keyed on fieldType, not value type.
    const stamp = new Date(2024, 5, 15)
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "raw", fieldType: "text" })],
      values: { raw: stamp },
      ctx: defaultCtx,
    })
    expect(scope.form["raw"]).toBe(stamp)
  })
})

// ---------------------------------------------------------------------------
// Option fields resolve stored labels to canonical option.en
// ---------------------------------------------------------------------------

const sexOptions = [
  { en: "male", ar: "ذكر" },
  { en: "female", ar: "أنثى" },
] as unknown as Language.TranslationObject[]

describe("buildRuleScope — option-field canonicalization", () => {
  it("splits a checkbox into an array of canonical en tokens", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "sex", fieldType: "checkbox", options: sexOptions })],
      values: { sex: joinCheckboxValues(["male", "female"]) },
      ctx: defaultCtx,
    })
    expect(scope.form["sex"]).toEqual(["male", "female"])
  })

  it("resolves current-language checkbox labels back to en", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "sex", fieldType: "checkbox", options: sexOptions })],
      values: { sex: joinCheckboxValues(["ذكر", "أنثى"]) },
      ctx: { now: defaultCtx.now, language: "ar" },
    })
    expect(scope.form["sex"]).toEqual(["male", "female"])
  })

  it("resolves a select label back to en", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "sex", fieldType: "select", options: sexOptions })],
      values: { sex: "ذكر" },
      ctx: { now: defaultCtx.now, language: "ar" },
    })
    expect(scope.form["sex"]).toBe("male")
  })

  it("keeps an unmatched label as the raw token", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [makeField({ id: "sex", fieldType: "select", options: sexOptions })],
      values: { sex: "unknown-option" },
      ctx: defaultCtx,
    })
    expect(scope.form["sex"]).toBe("unknown-option")
  })

  it("maps an empty checkbox to an empty array and undefined through", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [
        makeField({ id: "a", fieldType: "checkbox", options: sexOptions }),
        makeField({ id: "b", fieldType: "checkbox", options: sexOptions }),
      ],
      values: { a: "" },
      ctx: defaultCtx,
    })
    expect(scope.form["a"]).toEqual([])
    expect(scope.form["b"]).toBeUndefined()
  })

  it("feeds an `in` visibility rule that matches on a non-en device", () => {
    const evaluate = compileRules([
      makeField({ id: "sex", fieldType: "checkbox", options: sexOptions }),
      makeField({
        id: "pregnant",
        visibleIf: { in: ["female", { var: "form.sex" }] },
      }),
    ])
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [
        makeField({ id: "sex", fieldType: "checkbox", options: sexOptions }),
        makeField({ id: "pregnant" }),
      ],
      values: { sex: joinCheckboxValues(["أنثى"]) },
      ctx: { now: defaultCtx.now, language: "ar" },
    })
    expect(evaluate(scope).isVisible("pregnant")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// End-to-end: date validators actually fire after normalization
// ---------------------------------------------------------------------------

describe("buildRuleScope feeding date-comparison validators", () => {
  const field = makeField({
    id: "dob",
    column: "date_of_birth",
    fieldType: "date",
    validators: [
      {
        id: "after-2024",
        rule: { ">=": [{ var: "form.dob" }, "2024-01-01"] },
        message: "Date must be on or after 2024-01-01",
      },
    ],
  })
  const evaluator = compileRules([field])

  it("a Date BEFORE the threshold produces a validator error", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [field],
      values: { dob: new Date(2023, 5, 1) },
      ctx: defaultCtx,
    })
    const result = evaluator(scope)
    expect(result.validationErrors).toEqual([
      { fieldId: "dob", validatorId: "after-2024", message: "Date must be on or after 2024-01-01", code: undefined },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it("a Date AT the threshold produces no validator error", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [field],
      values: { dob: new Date(2024, 0, 1) },
      ctx: defaultCtx,
    })
    expect(evaluator(scope).validationErrors).toEqual([])
  })

  it("a Date AFTER the threshold produces no validator error", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [field],
      values: { dob: new Date(2026, 4, 23) },
      ctx: defaultCtx,
    })
    expect(evaluator(scope).validationErrors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// End-to-end: scope → compileRules → evaluation
// ---------------------------------------------------------------------------

describe("buildRuleScope feeding the compiled evaluator", () => {
  it("a visibility rule resolves against the value keyed by field id", () => {
    const trigger = makeField({ id: "t1", column: "sex" })
    const dependent = makeField({
      id: "d1",
      column: "phone",
      visibleIf: { "==": [{ var: "form.t1" }, "female"] },
    })

    const evaluator = compileRules([trigger, dependent])

    const off = PatientRegistrationForm.buildRuleScope({
      fields: [trigger, dependent],
      values: { t1: "male" },
      ctx: defaultCtx,
    })
    expect(evaluator(off).isVisible("d1")).toBe(false)

    const on = PatientRegistrationForm.buildRuleScope({
      fields: [trigger, dependent],
      values: { t1: "female" },
      ctx: defaultCtx,
    })
    expect(evaluator(on).isVisible("d1")).toBe(true)
  })

  it("a validator rule on the current field evaluates against its own value", () => {
    // "age must be positive" — a numeric comparison on the field's own value
    // resolved through `form.<fieldId>`.
    const field = makeField({
      id: "age",
      column: "given_name",
      fieldType: "number",
      validators: [
        {
          id: "age-positive",
          rule: { ">": [{ var: "form.age" }, 0] },
          message: "Age must be positive",
        },
      ],
    })
    const evaluator = compileRules([field])

    const bad = PatientRegistrationForm.buildRuleScope({
      fields: [field],
      values: { age: -1 },
      ctx: defaultCtx,
    })
    expect(evaluator(bad).validationErrors).toEqual([
      { fieldId: "age", validatorId: "age-positive", message: "Age must be positive", code: undefined },
    ])

    const good = PatientRegistrationForm.buildRuleScope({
      fields: [field],
      values: { age: 32 },
      ctx: defaultCtx,
    })
    expect(evaluator(good).validationErrors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getMissingRequiredFields — rule-aware contract
// ---------------------------------------------------------------------------

describe("PatientRegistrationForm.getMissingRequiredFields with RuleEvaluation", () => {
  it("falls back to static `required` when no evaluation is provided (backward compat)", () => {
    const field = makeField({ id: "f1", required: true, label: { en: "Phone" } })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
    })
    expect(result).toEqual(["Phone"])
  })

  it("a rule-hidden field is never missing, even if it is required", () => {
    const field = makeField({ id: "f1", required: true, label: { en: "Phone" } })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({ hidden: ["f1"] }),
    })
    expect(result).toEqual([])
  })

  it("evaluation.isRequired overrides the static flag (false → required)", () => {
    const field = makeField({ id: "f1", required: false, label: { en: "Phone" } })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({ requiredOverride: { f1: true } }),
    })
    expect(result).toEqual(["Phone"])
  })

  it("evaluation.isRequired overrides the static flag (true → optional)", () => {
    const field = makeField({ id: "f1", required: true, label: { en: "Phone" } })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({ requiredOverride: { f1: false } }),
    })
    expect(result).toEqual([])
  })

  it("hidden+required+missing is still skipped (hidden wins over required)", () => {
    const field = makeField({ id: "f1", required: false, label: { en: "Phone" } })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({
        hidden: ["f1"],
        requiredOverride: { f1: true },
      }),
    })
    expect(result).toEqual([])
  })

  it("admin-hidden (`field.visible === false`) fields are skipped regardless of evaluation", () => {
    // Admin visibility is a separate gate from rule visibility; the
    // helper must respect it even when evaluation says the field is
    // visible.
    const field = makeField({
      id: "f1",
      required: true,
      visible: false,
      label: { en: "Phone" },
    })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({ requiredOverride: { f1: true } }),
    })
    expect(result).toEqual([])
  })

  it("deleted fields are skipped regardless of evaluation", () => {
    const field = makeField({
      id: "f1",
      required: true,
      deleted: true,
      label: { en: "Phone" },
    })
    const result = PatientRegistrationForm.getMissingRequiredFields({
      fields: [field],
      values: {},
      evaluation: evaluationStub({ requiredOverride: { f1: true } }),
    })
    expect(result).toEqual([])
  })
})

describe("PatientRegistrationForm.computeNewlyHidden", () => {
  it("returns empty when no fields are hidden", () => {
    const f1 = makeField({ id: "f1" })
    const f2 = makeField({ id: "f2" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1, f2],
      evaluation: evaluationStub({}),
      previouslyHidden: new Set(),
    })
    expect(result.nowHidden.size).toBe(0)
    expect(result.newlyHidden).toEqual([])
  })

  it("a field that was visible and is now hidden appears in newlyHidden", () => {
    const f1 = makeField({ id: "f1" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1],
      evaluation: evaluationStub({ hidden: ["f1"] }),
      previouslyHidden: new Set(),
    })
    expect(result.nowHidden).toEqual(new Set(["f1"]))
    expect(result.newlyHidden).toHaveLength(1)
    expect(result.newlyHidden[0].id).toBe("f1")
  })

  it("a field that was already hidden does NOT appear in newlyHidden", () => {
    const f1 = makeField({ id: "f1" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1],
      evaluation: evaluationStub({ hidden: ["f1"] }),
      previouslyHidden: new Set(["f1"]),
    })
    expect(result.nowHidden).toEqual(new Set(["f1"]))
    expect(result.newlyHidden).toEqual([])
  })

  it("a re-shown field is removed from nowHidden", () => {
    const f1 = makeField({ id: "f1" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1],
      evaluation: evaluationStub({}),
      previouslyHidden: new Set(["f1"]),
    })
    expect(result.nowHidden.has("f1")).toBe(false)
    expect(result.newlyHidden).toEqual([])
  })

  it("handles mixed transitions in one pass (newly hidden, re-shown, still hidden)", () => {
    const stillHidden = makeField({ id: "still" })
    const reShown = makeField({ id: "shown" })
    const newlyHidden = makeField({ id: "new" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [stillHidden, reShown, newlyHidden],
      evaluation: evaluationStub({ hidden: ["still", "new"] }),
      previouslyHidden: new Set(["still", "shown"]),
    })
    expect(result.nowHidden).toEqual(new Set(["still", "new"]))
    expect(result.newlyHidden.map((f) => f.id)).toEqual(["new"])
  })

  it("preserves the RegistrationFormField reference so the caller has field metadata", () => {
    const field = makeField({ id: "phone", column: "phone", fieldType: "text" })
    const result = PatientRegistrationForm.computeNewlyHidden({
      fields: [field],
      evaluation: evaluationStub({ hidden: ["phone"] }),
      previouslyHidden: new Set(),
    })
    expect(result.newlyHidden[0]).toBe(field)
  })

  it("invariant: newlyHidden ⊆ nowHidden, and newlyHidden ∩ previouslyHidden = ∅", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const idArb = fc.constantFrom(...ids)

    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { maxLength: ids.length }),
        fc.uniqueArray(idArb, { maxLength: ids.length }),
        (hiddenNow, prevHidden) => {
          const fields = ids.map((id) => makeField({ id }))
          const result = PatientRegistrationForm.computeNewlyHidden({
            fields,
            evaluation: evaluationStub({ hidden: hiddenNow }),
            previouslyHidden: new Set(prevHidden),
          })
          for (const f of result.newlyHidden) {
            expect(result.nowHidden.has(f.id)).toBe(true)
          }
          for (const f of result.newlyHidden) {
            expect(prevHidden.includes(f.id)).toBe(false)
          }
          for (const id of result.nowHidden) {
            expect(hiddenNow.includes(id)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it("calling twice in a row with the same evaluation produces no further transitions", () => {
    const f1 = makeField({ id: "f1" })
    const evaluation = evaluationStub({ hidden: ["f1"] })

    const first = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1],
      evaluation,
      previouslyHidden: new Set(),
    })
    expect(first.newlyHidden).toHaveLength(1)

    const second = PatientRegistrationForm.computeNewlyHidden({
      fields: [f1],
      evaluation,
      previouslyHidden: first.nowHidden,
    })
    expect(second.newlyHidden).toEqual([])
    expect(second.nowHidden).toEqual(first.nowHidden)
  })
})

// ---------------------------------------------------------------------------
// buildRuleScope property — bounded scope under arbitrary value sets
// ---------------------------------------------------------------------------

describe("buildRuleScope — bounded-scope property", () => {
  it("scope.form keys are always exactly the set of field ids passed in", () => {
    const arbId = fc.uuid()
    const arbField = arbId.map((id) => makeField({ id }))
    const arbFields = fc.uniqueArray(arbField, {
      selector: (f) => f.id,
      minLength: 0,
      maxLength: 12,
    })

    fc.assert(
      fc.property(
        arbFields,
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.anything()),
        (fields, extraValues) => {
          // Values may include both field-id keys and unrelated noise.
          const values: Record<string, unknown> = { ...extraValues }
          for (const f of fields) values[f.id] = "v-" + f.id

          const scope = PatientRegistrationForm.buildRuleScope({
            fields,
            values,
            ctx: defaultCtx,
          })

          const expected = new Set(fields.map((f) => f.id))
          const actual = new Set(Object.keys(scope.form))
          expect(actual).toEqual(expected)
        },
      ),
      { numRuns: 100 },
    )
  })
})
