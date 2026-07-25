/**
 * Tests for `EventForm.buildRuleScope` and the rule-aware contract on
 * `EventForm.getMissingRequiredFields`.
 *
 * Why these helpers, why these tests: rules reference fields by **id**,
 * RHF's `watch()` keys by **sanitized name**, and `fileUploads` keys by
 * **raw name**. The scope builder is the one place that reconciles all
 * three; if it confuses any pair, every visible-if / required-if /
 * validator on the screen silently breaks for any field whose name
 * contains `.`, `[`, `]`, `|`, `'`, or `"`.
 */

import fc from "fast-check"

import EventForm from "../../app/models/EventForm"
import { compileRules, type RuleEvaluation } from "../../app/lib/form-rules"
import { sanitizeFieldName } from "../../app/utils/fieldNameSanitizer"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// `multi` / `options` are Effect Option<…> on FieldItem; none of these tests
// touch them, so we cast through `as` rather than pulling in Effect just to
// construct `Option.none()` (per project memory: no Effect.js in new code).
function makeField(
  overrides: Partial<EventForm.FieldItem> & Pick<EventForm.FieldItem, "name">,
): EventForm.FieldItem {
  return {
    id: overrides.id ?? overrides.name,
    name: overrides.name,
    fieldType: overrides.fieldType ?? "free-text",
    inputType: overrides.inputType ?? "text",
    required: overrides.required ?? false,
    ...overrides,
  } as EventForm.FieldItem
}

const defaultCtx = { now: "2026-05-19T00:00:00Z", language: "en" }

function emptyScopeInput(): EventForm.RuleScopeContext {
  return {
    formFields: [],
    watchedValues: {},
    diagnoses: [],
    medicines: [],
    fileUploads: {},
    ctx: defaultCtx,
  }
}

// ---------------------------------------------------------------------------
// buildRuleScope — base shape
// ---------------------------------------------------------------------------

describe("EventForm.buildRuleScope", () => {
  it("returns an empty form map and the given ctx when there are no fields", () => {
    const scope = EventForm.buildRuleScope(emptyScopeInput())
    expect(scope.form).toEqual({})
    expect(scope.ctx).toEqual(defaultCtx)
  })

  it("keys form values by field id, not field name", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [makeField({ id: "f-uuid-1", name: "Chief Complaint" })],
      watchedValues: { [sanitizeFieldName("Chief Complaint")]: "fever" },
    })
    expect(scope.form["f-uuid-1"]).toBe("fever")
    expect(scope.form["Chief Complaint"]).toBeUndefined()
  })

  it("looks values up by the sanitized name", () => {
    // The screen calls `setValue(sanitizeFieldName(field.name), ...)` so the
    // watched snapshot is keyed by the sanitized form, not the raw name.
    const field = makeField({ id: "f1", name: "weight.kg" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: {
        [sanitizeFieldName(field.name)]: 72,
        // Raw-name entry should be ignored.
        "weight.kg": 999,
      },
    })
    expect(scope.form["f1"]).toBe(72)
  })

  it("maps a missing watched key to undefined (not an empty string)", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [makeField({ id: "f1", name: "notes" })],
      watchedValues: {},
    })
    expect(scope.form).toHaveProperty("f1")
    expect(scope.form["f1"]).toBeUndefined()
  })

  it("display-only fields contribute nothing to the form map", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [
        makeField({ id: "txt", name: "header", fieldType: "text" }),
        makeField({ id: "sep", name: "spacer", fieldType: "separator" }),
        makeField({ id: "real", name: "real" }),
      ],
      watchedValues: { header: "ignored", spacer: "ignored", real: "kept" },
    })
    expect(scope.form).toEqual({ real: "kept" })
  })

  it("diagnosis fields receive the diagnoses array as their value", () => {
    const diagnoses = [{ code: "A00" }, { code: "B01" }]
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [makeField({ id: "dx", name: "diagnosis", fieldType: "diagnosis" })],
      diagnoses,
    })
    expect(scope.form["dx"]).toBe(diagnoses)
  })

  it("medicine fields receive the medicines array as their value", () => {
    const medicines = [{ id: "m1" }]
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [makeField({ id: "med", name: "medicines", fieldType: "medicine" })],
      medicines,
    })
    expect(scope.form["med"]).toBe(medicines)
  })

  it("file fields receive the uploaded resource ids (empty when nothing attached)", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [
        makeField({ id: "f1", name: "scan", inputType: "file" }),
        makeField({ id: "f2", name: "x-ray", inputType: "file" }),
        makeField({ id: "f3", name: "missing", inputType: "file" }),
      ],
      // fileUploads is keyed by **raw** name (matches the screen's setter).
      fileUploads: {
        scan: { files: [{ id: "file-123" }, { id: "file-456" }] },
        "x-ray": { files: [] },
      },
    })
    expect(scope.form["f1"]).toEqual(["file-123", "file-456"])
    expect(scope.form["f2"]).toEqual([])
    expect(scope.form["f3"]).toEqual([])
  })

  it("does not include display-only fields even when watched values exist for them", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [makeField({ id: "header", name: "header", fieldType: "text" })],
      watchedValues: { header: "Section A" },
    })
    expect(scope.form).not.toHaveProperty("header")
  })

  it("normalizes Date values on date fields to local YYYY-MM-DD strings", () => {
    // JsonLogic can't coerce JS Date objects for `>=` / `<=` etc. — they land
    // in the non-numeric `Object` arm and the evaluator's fail-safe path
    // silently drops the validator. Scope must hand it a string the rule
    // editor's `<input type="date">` literal can compare against.
    const field = makeField({ id: "dob", name: "dob", fieldType: "date" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      // Use a local-date constructor (year/month/day) so the assertion
      // doesn't depend on the test runner's timezone.
      watchedValues: { [sanitizeFieldName(field.name)]: new Date(2024, 0, 1) },
    })
    expect(scope.form["dob"]).toBe("2024-01-01")
  })

  it("leaves non-Date date-field values untouched", () => {
    // If a date field happens to hold a string already (e.g. authored via
    // a custom input), pass it through — the normalization shouldn't
    // double-format or coerce other shapes.
    const field = makeField({ id: "d", name: "d", fieldType: "date" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { d: "2024-06-15" },
    })
    expect(scope.form["d"]).toBe("2024-06-15")
  })

  it("only normalizes Date values on fieldType=date — other fields holding Dates pass through", () => {
    // Defensive: the normalization is keyed on fieldType, not on the value
    // type. A free-text field that somehow holds a Date should not be
    // YMD-stringified (the value-shape contract is the field's responsibility).
    const stamp = new Date(2024, 5, 15)
    const field = makeField({ id: "raw", name: "raw", fieldType: "free-text" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { raw: stamp },
    })
    expect(scope.form["raw"]).toBe(stamp)
  })
})

// ---------------------------------------------------------------------------
// buildRuleScope — multi-select normalization
// ---------------------------------------------------------------------------

// `multi` is an Effect Option<boolean> on FieldItem; construct it as a plain
// boolean and cast (the scope builder unwraps either shape). Keeps Effect out
// of the test per project convention.
function multiSelectField(
  overrides: Partial<EventForm.FieldItem> & Pick<EventForm.FieldItem, "name">,
): EventForm.FieldItem {
  return {
    id: overrides.id ?? overrides.name,
    name: overrides.name,
    fieldType: "options",
    inputType: "select",
    required: false,
    multi: true,
    ...overrides,
  } as unknown as EventForm.FieldItem
}

describe("EventForm.buildRuleScope — multi-select normalization", () => {
  it("splits a separator-joined multi-select value into an array of option values", () => {
    const field = multiSelectField({ id: "sx", name: "symptoms" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: "cough; fever; chills" },
    })
    expect(scope.form["sx"]).toEqual(["cough", "fever", "chills"])
  })

  it("normalizes a single selection to a one-element array", () => {
    const field = multiSelectField({ id: "sx", name: "symptoms" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: "fever" },
    })
    expect(scope.form["sx"]).toEqual(["fever"])
  })

  it("maps an empty or missing multi-select value to an empty array", () => {
    const field = multiSelectField({ id: "sx", name: "symptoms" })
    const emptyStr = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: "" },
    })
    expect(emptyStr.form["sx"]).toEqual([])

    const missing = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: {},
    })
    expect(missing.form["sx"]).toEqual([])
  })

  it("passes an already-array value through unchanged", () => {
    const field = multiSelectField({ id: "sx", name: "symptoms" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: ["a", "b"] },
    })
    expect(scope.form["sx"]).toEqual(["a", "b"])
  })

  it("does NOT split a non-multi field — a scalar value passes through untouched", () => {
    // A single-select options field (no `multi`) keeps its scalar string so
    // existing `==` rules against it are unaffected.
    const field = makeField({ id: "sex", name: "sex", fieldType: "options", inputType: "select" })
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: "male" },
    })
    expect(scope.form["sex"]).toBe("male")
  })
})

// ---------------------------------------------------------------------------
// End-to-end: an `includes` (in) visibility rule fires by exact membership,
// independent of how many options are selected.
// ---------------------------------------------------------------------------

describe("buildRuleScope feeding an `includes` (in) visibility rule", () => {
  // "Show the follow-up field when the symptoms multi-select includes 'fever'."
  const trigger = multiSelectField({ id: "sx", name: "symptoms" })
  const dependent = makeField({
    id: "fu",
    name: "fever_followup",
    visibleIf: { in: ["fever", { var: "form.sx" }] },
  })
  const evaluator = compileRules([trigger, dependent])

  const scopeWith = (selection: string) =>
    EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [trigger, dependent],
      watchedValues: { [sanitizeFieldName(trigger.name)]: selection },
    })

  it("is visible when 'fever' is the only selection", () => {
    expect(evaluator(scopeWith("fever")).isVisible("fu")).toBe(true)
  })

  it("is visible when 'fever' is among several selections, regardless of count/position", () => {
    expect(evaluator(scopeWith("cough; fever; chills")).isVisible("fu")).toBe(true)
    expect(evaluator(scopeWith("chills; fever")).isVisible("fu")).toBe(true)
  })

  it("is hidden when 'fever' is not among the selections", () => {
    expect(evaluator(scopeWith("cough; chills")).isVisible("fu")).toBe(false)
  })

  it("does not false-positive on a substring of an option value", () => {
    // The whole point of arraying: exact membership means 'cat' must NOT
    // match the option 'category' (a joined-string `in` would substring-match).
    const t2 = multiSelectField({ id: "c", name: "cats" })
    const d2 = makeField({ id: "d", name: "d", visibleIf: { in: ["cat", { var: "form.c" }] } })
    const ev = compileRules([t2, d2])
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [t2, d2],
      watchedValues: { [sanitizeFieldName(t2.name)]: "category; dog" },
    })
    expect(ev(scope).isVisible("d")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// End-to-end: date validators actually fire after normalization
// ---------------------------------------------------------------------------

describe("buildRuleScope feeding date-comparison validators", () => {
  // Authored validator: "must be on or after 2024-01-01". Before the
  // YMD-normalization fix this validator silently never fired because
  // the scope value was a Date instance which JsonLogic can't compare
  // against a string literal — Coerce.cmpNum returns None → NaNError →
  // evaluator skips the validator under the fail-safe policy.
  const field = makeField({
    id: "dob",
    name: "dob",
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
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: new Date(2023, 5, 1) },
    })
    const result = evaluator(scope)
    expect(result.validationErrors).toEqual([
      { fieldId: "dob", validatorId: "after-2024", message: "Date must be on or after 2024-01-01", code: undefined },
    ])
    // And no diagnostic emitted — the comparison must succeed cleanly,
    // not get swept under the fail-safe rug.
    expect(result.diagnostics).toEqual([])
  })

  it("a Date AT the threshold produces no validator error", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: new Date(2024, 0, 1) },
    })
    expect(evaluator(scope).validationErrors).toEqual([])
  })

  it("a Date AFTER the threshold produces no validator error", () => {
    const scope = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { [sanitizeFieldName(field.name)]: new Date(2026, 4, 23) },
    })
    expect(evaluator(scope).validationErrors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildRuleScope — property: sanitizer round-trip
// ---------------------------------------------------------------------------

describe("buildRuleScope — sanitizer round-trip property", () => {
  it("survives arbitrary names containing RHF path-special characters", () => {
    // Generates names with the exact characters the sanitizer guards against.
    const problematicChar = fc.constantFrom(".", "[", "]", "|", "'", '"')
    const safeChar = fc.constantFrom("a", "b", "c", "1", "2", " ", "_", "-")
    const nameArb = fc.array(fc.oneof(safeChar, problematicChar), {
      minLength: 1,
      maxLength: 12,
    }).map((chars) => chars.join(""))

    fc.assert(
      fc.property(nameArb, fc.string(), (rawName, value) => {
        const field = makeField({ id: "field-id", name: rawName })
        const scope = EventForm.buildRuleScope({
          ...emptyScopeInput(),
          formFields: [field],
          watchedValues: { [sanitizeFieldName(rawName)]: value },
        })
        expect(scope.form["field-id"]).toBe(value)
      }),
      { numRuns: 200 },
    )
  })
})

// ---------------------------------------------------------------------------
// End-to-end: scope → compileRules → evaluation
// ---------------------------------------------------------------------------

describe("buildRuleScope feeding the compiled evaluator", () => {
  it("a visibility rule resolves against a sanitized-name watched value", () => {
    const trigger = makeField({ id: "t1", name: "smoker?" }) // `?` is fine; not RHF-special
    const dependent = makeField({
      id: "d1",
      name: "packs_per_day",
      visibleIf: { "==": [{ var: "form.t1" }, "yes"] },
    })

    const evaluator = compileRules([trigger, dependent])

    const scopeOff = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [trigger, dependent],
      watchedValues: { [sanitizeFieldName(trigger.name)]: "no" },
    })
    expect(evaluator(scopeOff).isVisible("d1")).toBe(false)

    const scopeOn = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [trigger, dependent],
      watchedValues: { [sanitizeFieldName(trigger.name)]: "yes" },
    })
    expect(evaluator(scopeOn).isVisible("d1")).toBe(true)
  })

  it("a validator rule on the current field evaluates against its own value", () => {
    const field = makeField({
      id: "age",
      name: "age",
      inputType: "number",
      validators: [
        {
          id: "age-positive",
          rule: { ">": [{ var: "form.age" }, 0] },
          message: "Age must be positive",
        },
      ],
    })
    const evaluator = compileRules([field])

    const bad = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { age: -1 },
    })
    expect(evaluator(bad).validationErrors).toEqual([
      { fieldId: "age", validatorId: "age-positive", message: "Age must be positive", code: undefined },
    ])

    const good = EventForm.buildRuleScope({
      ...emptyScopeInput(),
      formFields: [field],
      watchedValues: { age: 32 },
    })
    expect(evaluator(good).validationErrors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getMissingRequiredFields — rule-aware contract
// ---------------------------------------------------------------------------

/** Stub a RuleEvaluation that only the helper's two methods touch. */
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

describe("EventForm.getMissingRequiredFields with RuleEvaluation", () => {
  const emptyCtx: EventForm.RequiredFieldContext = {
    formFields: [],
    data: {},
    diagnoses: [],
    medicines: [],
    fileUploads: {},
  }

  it("falls back to static `required` when no evaluation is provided (backward compat)", () => {
    const field = makeField({ id: "f1", name: "notes", required: true })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {},
    })
    expect(result).toEqual(["notes"])
  })

  it("a hidden field is never missing, even if it is required", () => {
    const field = makeField({ id: "f1", name: "notes", required: true })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {},
      evaluation: evaluationStub({ hidden: ["f1"] }),
    })
    expect(result).toEqual([])
  })

  it("evaluation.isRequired overrides the static `required` flag (false → required)", () => {
    const field = makeField({ id: "f1", name: "notes", required: false })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {}, // value missing
      evaluation: evaluationStub({ requiredOverride: { f1: true } }),
    })
    expect(result).toEqual(["notes"])
  })

  it("evaluation.isRequired overrides the static `required` flag (true → optional)", () => {
    const field = makeField({ id: "f1", name: "notes", required: true })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {},
      evaluation: evaluationStub({ requiredOverride: { f1: false } }),
    })
    expect(result).toEqual([])
  })

  it("hidden+required+missing is still skipped (hidden wins over required)", () => {
    const field = makeField({ id: "f1", name: "notes", required: false })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {},
      evaluation: evaluationStub({
        hidden: ["f1"],
        requiredOverride: { f1: true },
      }),
    })
    expect(result).toEqual([])
  })

  it("display-only fields are still skipped regardless of evaluation", () => {
    const field = makeField({
      id: "f1",
      name: "header",
      fieldType: "text",
      required: true,
    })
    const result = EventForm.getMissingRequiredFields({
      ...emptyCtx,
      formFields: [field],
      data: {},
      evaluation: evaluationStub({ requiredOverride: { f1: true } }),
    })
    expect(result).toEqual([])
  })
})

describe("EventForm.computeNewlyHidden", () => {
  it("returns empty when no fields are hidden", () => {
    const f1 = makeField({ id: "f1", name: "a" })
    const f2 = makeField({ id: "f2", name: "b" })
    const result = EventForm.computeNewlyHidden({
      formFields: [f1, f2],
      evaluation: evaluationStub({}),
      previouslyHidden: new Set(),
    })
    expect(result.nowHidden.size).toBe(0)
    expect(result.newlyHidden).toEqual([])
  })

  it("a field that was visible and is now hidden appears in newlyHidden", () => {
    const f1 = makeField({ id: "f1", name: "a" })
    const result = EventForm.computeNewlyHidden({
      formFields: [f1],
      evaluation: evaluationStub({ hidden: ["f1"] }),
      previouslyHidden: new Set(),
    })
    expect(result.nowHidden).toEqual(new Set(["f1"]))
    expect(result.newlyHidden).toHaveLength(1)
    expect(result.newlyHidden[0].id).toBe("f1")
  })

  it("a field that was already hidden does NOT appear in newlyHidden", () => {
    const f1 = makeField({ id: "f1", name: "a" })
    const result = EventForm.computeNewlyHidden({
      formFields: [f1],
      evaluation: evaluationStub({ hidden: ["f1"] }),
      previouslyHidden: new Set(["f1"]),
    })
    expect(result.nowHidden).toEqual(new Set(["f1"]))
    expect(result.newlyHidden).toEqual([])
  })

  it("a re-shown field is removed from nowHidden (so it can re-clear next time it hides)", () => {
    const f1 = makeField({ id: "f1", name: "a" })
    const result = EventForm.computeNewlyHidden({
      formFields: [f1],
      evaluation: evaluationStub({}), // f1 visible now
      previouslyHidden: new Set(["f1"]),
    })
    expect(result.nowHidden.has("f1")).toBe(false)
    expect(result.newlyHidden).toEqual([])
  })

  it("display-only fields are skipped (no input state to clear)", () => {
    const f1 = makeField({ id: "f1", name: "header", fieldType: "text" })
    const f2 = makeField({ id: "f2", name: "sep", fieldType: "separator" })
    const f3 = makeField({ id: "f3", name: "real" })
    const result = EventForm.computeNewlyHidden({
      formFields: [f1, f2, f3],
      // All three hidden — but only f3 should show up.
      evaluation: evaluationStub({ hidden: ["f1", "f2", "f3"] }),
      previouslyHidden: new Set(),
    })
    expect(result.nowHidden).toEqual(new Set(["f3"]))
    expect(result.newlyHidden.map((f) => f.id)).toEqual(["f3"])
  })

  it("handles mixed transitions in one pass (one newly hidden, one re-shown, one still hidden)", () => {
    const stillHidden = makeField({ id: "still", name: "a" })
    const reShown = makeField({ id: "shown", name: "b" })
    const newlyHidden = makeField({ id: "new", name: "c" })
    const result = EventForm.computeNewlyHidden({
      formFields: [stillHidden, reShown, newlyHidden],
      evaluation: evaluationStub({ hidden: ["still", "new"] }),
      previouslyHidden: new Set(["still", "shown"]),
    })
    expect(result.nowHidden).toEqual(new Set(["still", "new"]))
    expect(result.newlyHidden.map((f) => f.id)).toEqual(["new"])
  })

  it("preserves the FieldItem reference so the caller can dispatch by fieldType / inputType", () => {
    // The caller needs the actual field object (not just its id) to know
    // whether to call setValue / setDiagnoses / setMedicines / etc.
    const medField = makeField({ id: "m", name: "meds", fieldType: "medicine" })
    const fileField = makeField({ id: "u", name: "scan", inputType: "file" })
    const textField = makeField({ id: "t", name: "notes" })
    const result = EventForm.computeNewlyHidden({
      formFields: [medField, fileField, textField],
      evaluation: evaluationStub({ hidden: ["m", "u", "t"] }),
      previouslyHidden: new Set(),
    })
    expect(result.newlyHidden).toHaveLength(3)
    const byId = Object.fromEntries(result.newlyHidden.map((f) => [f.id, f]))
    expect(byId["m"].fieldType).toBe("medicine")
    expect(byId["u"].inputType).toBe("file")
    expect(byId["t"].fieldType).toBe("free-text")
  })

  // -------------------------------------------------------------------------
  // Property test — set algebra invariants
  // -------------------------------------------------------------------------

  it("invariant: newlyHidden ⊆ nowHidden, and newlyHidden ∩ previouslyHidden = ∅", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const idArb = fc.constantFrom(...ids)

    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { maxLength: ids.length }), // hiddenNow
        fc.uniqueArray(idArb, { maxLength: ids.length }), // previouslyHidden
        (hiddenNow, prevHidden) => {
          const formFields = ids.map((id) => makeField({ id, name: id }))
          const result = EventForm.computeNewlyHidden({
            formFields,
            evaluation: evaluationStub({ hidden: hiddenNow }),
            previouslyHidden: new Set(prevHidden),
          })
          // newlyHidden ⊆ nowHidden
          for (const f of result.newlyHidden) {
            expect(result.nowHidden.has(f.id)).toBe(true)
          }
          // newlyHidden ∩ previouslyHidden = ∅
          for (const f of result.newlyHidden) {
            expect(prevHidden.includes(f.id)).toBe(false)
          }
          // nowHidden ⊆ hiddenNow (sanity: we don't invent new hidden ids)
          for (const id of result.nowHidden) {
            expect(hiddenNow.includes(id)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  // -------------------------------------------------------------------------
  // Loop-termination scenario (the doc's stated concern)
  // -------------------------------------------------------------------------

  it("calling twice in a row with the same evaluation produces no further transitions", () => {
    const f1 = makeField({ id: "f1", name: "a" })
    const evaluation = evaluationStub({ hidden: ["f1"] })

    const first = EventForm.computeNewlyHidden({
      formFields: [f1],
      evaluation,
      previouslyHidden: new Set(),
    })
    expect(first.newlyHidden).toHaveLength(1)

    // Caller would assign first.nowHidden to its ref. Second pass:
    const second = EventForm.computeNewlyHidden({
      formFields: [f1],
      evaluation,
      previouslyHidden: first.nowHidden,
    })
    expect(second.newlyHidden).toEqual([])
    // And nowHidden stays the same, so the ref is stable.
    expect(second.nowHidden).toEqual(first.nowHidden)
  })
})
