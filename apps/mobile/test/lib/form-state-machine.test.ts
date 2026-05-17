/**
 * Tests for `apps/mobile/app/lib/form-state-machine.ts`. The machine
 * models per-form runtime behavior (value application, rule eval,
 * computed-value stabilization, clear-on-hide, baseline-skip,
 * visibility-filtered submit payload). Property tests target the
 * temporal / convergence behaviors the screens previously could only
 * smoke-test by hand.
 */

import fc from "fast-check"
import { createActor } from "xstate"

import {
  type FieldWithRules,
  type RuleScope,
} from "../../app/lib/form-rules"
import {
  MAX_STABILIZE_ITERATIONS,
  type FormEffect,
  type FormEvent,
  type FormInput,
  formStateMachine,
} from "../../app/lib/form-state-machine"

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const STATIC_CTX: RuleScope["ctx"] = {
  now: "2026-05-21T00:00:00Z",
  language: "en",
}

function start(input: Partial<FormInput> & Pick<FormInput, "fields">) {
  const actor = createActor(formStateMachine, {
    input: {
      ctxSupplier: () => STATIC_CTX,
      ...input,
    },
  })
  actor.start()
  return actor
}

function sendAll(
  input: Partial<FormInput> & Pick<FormInput, "fields">,
  events: FormEvent[],
) {
  const actor = start(input)
  for (const ev of events) actor.send(ev)
  return actor.getSnapshot().context
}

function effectsOfType<T extends FormEffect["type"]>(
  effects: readonly FormEffect[],
  type: T,
): Extract<FormEffect, { type: T }>[] {
  return effects.filter((e): e is Extract<FormEffect, { type: T }> => e.type === type)
}

// ---------------------------------------------------------------------------
// Initial context shape
// ---------------------------------------------------------------------------

describe("formStateMachine: initial context", () => {
  it("starts with empty values + interacted + null evaluation", () => {
    const ctx = start({ fields: [] }).getSnapshot().context
    expect(ctx.values).toEqual({})
    expect(ctx.interacted.size).toBe(0)
    expect(ctx.evaluation).toBeNull()
    expect(ctx.effects).toEqual([])
  })

  it("baselineHidden='clear-immediately' starts with empty Set; null=skip", () => {
    const clearMode = start({ fields: [], baselineHidden: "clear-immediately" })
    expect(clearMode.getSnapshot().context.previouslyHidden).toEqual(new Set())

    const skipMode = start({ fields: [], baselineHidden: "skip-first-render" })
    expect(skipMode.getSnapshot().context.previouslyHidden).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// LOAD: baseline behavior
// ---------------------------------------------------------------------------

describe("LOAD", () => {
  it("clear-immediately mode: initially-hidden field gets a clear effect on first LOAD", () => {
    const fields: FieldWithRules[] = [
      { id: "a" },
      { id: "b", visibleIf: false }, // hidden from the start
    ]
    const ctx = sendAll(
      { fields, baselineHidden: "clear-immediately" },
      [{ type: "LOAD", values: { a: 1, b: "stale" } }],
    )
    const clears = effectsOfType(ctx.effects, "clear")
    expect(clears.map((e) => e.fieldId)).toEqual(["b"])
  })

  it("skip-first-render mode: first LOAD emits NO clear effect even with hidden field", () => {
    const fields: FieldWithRules[] = [
      { id: "a" },
      { id: "b", visibleIf: false },
    ]
    const ctx = sendAll(
      { fields, baselineHidden: "skip-first-render" },
      [{ type: "LOAD", values: { a: 1, b: "stale" } }],
    )
    expect(effectsOfType(ctx.effects, "clear")).toHaveLength(0)
    // Baseline is established after the first transition
    expect(ctx.previouslyHidden).toEqual(new Set(["b"]))
  })

  it("skip-first-render: second event DOES clear newly-hidden fields", () => {
    const fields: FieldWithRules[] = [
      { id: "controller" },
      { id: "dependent", visibleIf: { "==": [{ var: "form.controller" }, "show"] } },
    ]
    const actor = start({ fields, baselineHidden: "skip-first-render" })
    // First LOAD: dependent is hidden (controller is undefined → eq false). Baseline.
    actor.send({ type: "LOAD", values: { controller: "show", dependent: "kept" } })
    expect(effectsOfType(actor.getSnapshot().context.effects, "clear")).toHaveLength(0)
    // Edit controller to hide dependent. Now we expect a clear.
    actor.send({ type: "EDIT_FIELD", fieldId: "controller", value: "hide" })
    const clears = effectsOfType(actor.getSnapshot().context.effects, "clear")
    expect(clears.map((e) => e.fieldId)).toEqual(["dependent"])
  })
})

// ---------------------------------------------------------------------------
// EDIT_FIELD: visibility cascade + clear-on-hide
// ---------------------------------------------------------------------------

describe("EDIT_FIELD: visibility cascade", () => {
  it("hiding the controller emits a clear for the dependent on the same transition", () => {
    const fields: FieldWithRules[] = [
      { id: "show_extra" },
      {
        id: "extra",
        visibleIf: { "==": [{ var: "form.show_extra" }, true] },
      },
    ]
    const actor = start({ fields, baselineHidden: "clear-immediately" })
    actor.send({ type: "EDIT_FIELD", fieldId: "show_extra", value: true })
    actor.send({ type: "EDIT_FIELD", fieldId: "extra", value: "value" })
    actor.send({ type: "EDIT_FIELD", fieldId: "show_extra", value: false })
    const clears = effectsOfType(actor.getSnapshot().context.effects, "clear")
    expect(clears.map((e) => e.fieldId)).toContain("extra")
  })

  it("re-showing a previously-hidden field stops emitting clears for it", () => {
    const fields: FieldWithRules[] = [
      { id: "show_extra" },
      {
        id: "extra",
        visibleIf: { "==": [{ var: "form.show_extra" }, true] },
      },
    ]
    const actor = start({ fields, baselineHidden: "clear-immediately" })
    // hide → show → expect no clears for `extra` on the show transition
    actor.send({ type: "EDIT_FIELD", fieldId: "show_extra", value: false })
    actor.send({ type: "EDIT_FIELD", fieldId: "show_extra", value: true })
    const ctx = actor.getSnapshot().context
    expect(effectsOfType(ctx.effects, "clear")).toHaveLength(0)
    expect(ctx.previouslyHidden?.has("extra")).toBe(false)
  })

  it("staying hidden across two events emits clear at most once total", () => {
    const fields: FieldWithRules[] = [
      { id: "ctrl" },
      { id: "dep", visibleIf: { "==": [{ var: "form.ctrl" }, "on"] } },
    ]
    const actor = start({ fields, baselineHidden: "clear-immediately" })
    // First edit hides dep (ctrl="off" → not "on" → false). dep already
    // in previouslyHidden (clear-immediately baseline was empty, so
    // first eval clears it).
    actor.send({ type: "EDIT_FIELD", fieldId: "ctrl", value: "off" })
    actor.send({ type: "EDIT_FIELD", fieldId: "ctrl", value: "still-off" })
    const clears2 = effectsOfType(actor.getSnapshot().context.effects, "clear")
    expect(clears2).toHaveLength(0) // dep was already hidden, no new clear
  })
})

// ---------------------------------------------------------------------------
// EDIT_FIELD: computedValue convergence + cycle detection
// ---------------------------------------------------------------------------

describe("EDIT_FIELD: computedValue stabilization", () => {
  it("writes computed value when controller changes", () => {
    const fields: FieldWithRules[] = [
      { id: "a" },
      { id: "b", computedValue: { "+": [{ var: "form.a" }, 1] } },
    ]
    const actor = start({ fields })
    actor.send({ type: "EDIT_FIELD", fieldId: "a", value: 5 })
    const ctx = actor.getSnapshot().context
    expect(ctx.values["b"]).toBe(6)
    expect(ctx.convergence).toBe("stable")
    const writes = effectsOfType(ctx.effects, "write-computed")
    expect(writes).toEqual([{ type: "write-computed", fieldId: "b", value: 6 }])
  })

  it("chains converge in O(depth) iterations: A → B → C", () => {
    const fields: FieldWithRules[] = [
      { id: "a" },
      { id: "b", computedValue: { "+": [{ var: "form.a" }, 1] } },
      { id: "c", computedValue: { "+": [{ var: "form.b" }, 1] } },
    ]
    const actor = start({ fields })
    actor.send({ type: "EDIT_FIELD", fieldId: "a", value: 10 })
    const ctx = actor.getSnapshot().context
    expect(ctx.values["b"]).toBe(11)
    expect(ctx.values["c"]).toBe(12)
    expect(ctx.convergence).toBe("stable")
    // 1st iter computes b; 2nd iter sees a stale c (uses new b); 3rd
    // iter no changes → stable. Allow some slack on exact count.
    expect(ctx.iterations).toBeLessThanOrEqual(5)
  })

  it("mutual A↔B computed dependency is reported as cycle", () => {
    const fields: FieldWithRules[] = [
      { id: "a", computedValue: { "+": [{ var: "form.b" }, 1] } },
      { id: "b", computedValue: { "+": [{ var: "form.a" }, 1] } },
    ]
    const actor = start({ fields })
    actor.send({ type: "EDIT_FIELD", fieldId: "a", value: 0 })
    const ctx = actor.getSnapshot().context
    expect(ctx.convergence).toBe("cycle")
    expect(ctx.iterations).toBe(MAX_STABILIZE_ITERATIONS)
  })

  it("computedValue short-circuited for hidden fields (no write effect)", () => {
    const fields: FieldWithRules[] = [
      { id: "gate" },
      {
        id: "computed_hidden",
        visibleIf: { "==": [{ var: "form.gate" }, "show"] },
        computedValue: 42,
      },
    ]
    const actor = start({ fields, baselineHidden: "clear-immediately" })
    actor.send({ type: "EDIT_FIELD", fieldId: "gate", value: "hide" })
    const ctx = actor.getSnapshot().context
    expect(ctx.values["computed_hidden"]).toBeUndefined()
    expect(effectsOfType(ctx.effects, "write-computed")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SUBMIT_ATTEMPT: visibility-filtered payload
// ---------------------------------------------------------------------------

describe("SUBMIT_ATTEMPT", () => {
  it("emits submit-payload with hidden fields stripped", () => {
    const fields: FieldWithRules[] = [
      { id: "kept" },
      { id: "stripped", visibleIf: false },
    ]
    const actor = start({ fields })
    actor.send({ type: "LOAD", values: { kept: "yes", stripped: "leak" } })
    actor.send({ type: "SUBMIT_ATTEMPT" })
    const payload = effectsOfType(
      actor.getSnapshot().context.effects,
      "submit-payload",
    )
    expect(payload).toHaveLength(1)
    expect(payload[0].values).toEqual({ kept: "yes" })
    expect(payload[0].values).not.toHaveProperty("stripped")
  })
})

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("diagnostics", () => {
  it("malformed visibleIf surfaces a diagnostic, field stays visible (fail-safe)", () => {
    const fields: FieldWithRules[] = [
      { id: "broken", visibleIf: { not_a_real_op: [1, 2] } },
    ]
    const actor = start({ fields })
    actor.send({ type: "LOAD", values: {} })
    const ctx = actor.getSnapshot().context
    const diags = effectsOfType(ctx.effects, "diagnostic")
    expect(diags.length).toBeGreaterThanOrEqual(1)
    // Fail-safe: broken field stays visible (decision in form-rules.ts)
    expect(ctx.previouslyHidden?.has("broken")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

/**
 * Generator for a small, well-formed schema: a "controller" field
 * (no rules) plus 0..3 dependent fields with `visibleIf` rules
 * referencing the controller. Bounded depth keeps runs tractable.
 */
const wellFormedSchemaArb = fc
  .record({
    dependents: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s !== "ctrl"),
        showWhen: fc.constantFrom("on", "off", "any"),
      }),
      { maxLength: 4 },
    ),
  })
  .map((spec) => {
    const seen = new Set<string>(["ctrl"])
    const fields: FieldWithRules[] = [{ id: "ctrl" }]
    for (const d of spec.dependents) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      const visibleIf =
        d.showWhen === "any"
          ? undefined
          : { "==": [{ var: "form.ctrl" }, d.showWhen] }
      fields.push(visibleIf ? { id: d.id, visibleIf } : { id: d.id })
    }
    return fields
  })

const editEventArb = fc.record({
  type: fc.constant("EDIT_FIELD" as const),
  fieldId: fc.constantFrom("ctrl"),
  value: fc.constantFrom("on", "off", "other"),
})

describe("property: state machine invariants", () => {
  it("previouslyHidden is always a subset of declared field ids (bounded scope)", () => {
    fc.assert(
      fc.property(
        wellFormedSchemaArb,
        fc.array(editEventArb, { maxLength: 6 }),
        (fields, events) => {
          const ctx = sendAll({ fields, baselineHidden: "clear-immediately" }, events)
          const declared = new Set(fields.map((f) => f.id))
          const hidden = ctx.previouslyHidden ?? new Set<string>()
          for (const id of hidden) expect(declared.has(id)).toBe(true)
        },
      ),
      { numRuns: 60 },
    )
  })

  it("submit-payload never contains a key for a currently-hidden field", () => {
    fc.assert(
      fc.property(
        wellFormedSchemaArb,
        fc.array(editEventArb, { maxLength: 6 }),
        (fields, events) => {
          const allEvents: FormEvent[] = [...events, { type: "SUBMIT_ATTEMPT" }]
          const ctx = sendAll({ fields, baselineHidden: "clear-immediately" }, allEvents)
          const payload = effectsOfType(ctx.effects, "submit-payload").at(-1)
          if (!payload) return
          const hidden = ctx.previouslyHidden ?? new Set<string>()
          for (const id of hidden) {
            expect(payload.values).not.toHaveProperty(id)
          }
        },
      ),
      { numRuns: 60 },
    )
  })

  it("well-formed schemas (no computedValue cycles) always converge", () => {
    fc.assert(
      fc.property(
        wellFormedSchemaArb,
        fc.array(editEventArb, { maxLength: 6 }),
        (fields, events) => {
          const ctx = sendAll({ fields }, events)
          expect(ctx.convergence).toBe("stable")
          expect(ctx.iterations).toBeLessThan(MAX_STABILIZE_ITERATIONS)
        },
      ),
      { numRuns: 60 },
    )
  })

  it("skip-first-render: first transition emits zero clear effects (any schema)", () => {
    fc.assert(
      fc.property(wellFormedSchemaArb, editEventArb, (fields, event) => {
        const ctx = sendAll(
          { fields, baselineHidden: "skip-first-render" },
          [event],
        )
        // No clear effects from the first transition's baseline pass.
        // (The event-emitted state above runs ONE transition for the
        // event itself, which is the baseline pass when no LOAD ran
        // before.)
        expect(effectsOfType(ctx.effects, "clear")).toHaveLength(0)
      }),
      { numRuns: 40 },
    )
  })
})
