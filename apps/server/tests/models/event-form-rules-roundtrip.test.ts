/**
 * Round-trip tests for the EventForm rule slots, mirroring the
 * production storage pipeline:
 *
 *    TaggedClass instance
 *      → EventForm.toSchema (Effect Schema encode)
 *      → JSON.stringify    (the actual JSONB serialization)
 *      → JSON.parse        (driver auto-parses JSONB; same effect)
 *      → Schema.decodeUnknown (read path)
 *      → TaggedClass instance'
 *
 * The existing event-form-schema.test.ts exercises encode only, in one
 * direction, on a single variant. This file closes the gap: every input-
 * collecting variant carrying all four rule slots; every visibility-only
 * variant carrying `visibleIf`; arbitrary JSONLogic shapes inside slots
 * via fast-check. Catches the silent-data-corruption class of bugs that
 * the implementation doc's carry-forward #5 flagged as "trusted by
 * inspection."
 *
 * NOT exercised here: the actual `${JSON.stringify(...)}::jsonb` SQL
 * fragment (covered by the integration tests against a real Postgres
 * in `tests/integration/`). The semantic of JSONB storage is identical
 * to JSON.stringify + JSON.parse for our value space, so the JS-level
 * round-trip is sufficient to find encoding bugs.
 */

import fc from "fast-check"
import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import EventForm from "@/models/event-form"

const decode = Schema.decodeUnknownEither(EventForm.FieldSchema)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SlotValues = {
  visibleIf?: unknown
  requiredIf?: unknown
  validators?: ReadonlyArray<{
    id: string
    rule: unknown
    message: string
    code?: string
  }>
  computedValue?: unknown
}

/**
 * Pipeline: TaggedClass → encode → JSON.stringify → JSON.parse →
 * decode → TaggedClass'. Returns the round-tripped instance OR
 * surfaces an Error so the test can fail with a clear message.
 */
function roundTrip(field: EventForm.FieldData): EventForm.Field {
  const encoded = EventForm.toSchema(field)
  if (Either.isLeft(encoded)) {
    throw new Error(`encode failed: ${encoded.left.message}`)
  }
  const jsonString = JSON.stringify(encoded.right)
  const parsed = JSON.parse(jsonString)
  const decoded = decode(parsed)
  if (Either.isLeft(decoded)) {
    throw new Error(`decode failed: ${String(decoded.left)}`)
  }
  return decoded.right
}

/**
 * Pull just the four rule slots off any field. Comparing whole instances
 * is brittle (class identity / extra runtime properties), so we narrow
 * the assertion to the contract under test.
 */
function pickSlots(field: { [k: string]: unknown }): SlotValues {
  const out: SlotValues = {}
  if (field.visibleIf !== undefined) out.visibleIf = field.visibleIf
  if (field.requiredIf !== undefined) out.requiredIf = field.requiredIf
  if (field.validators !== undefined)
    out.validators = field.validators as SlotValues["validators"]
  if (field.computedValue !== undefined) out.computedValue = field.computedValue
  return out
}

const baseProps = {
  id: "f-1",
  name: "field-name",
  description: "",
  required: false,
}

const sampleRules: Required<SlotValues> = {
  visibleIf: { ">=": [{ var: "form.age" }, 18] },
  requiredIf: { "==": [{ var: "form.kind" }, "adult"] },
  validators: [
    {
      id: "v1",
      rule: { "!=": [{ var: "form.dob" }, null] },
      message: "DOB required",
      code: "dob_required",
    },
    {
      id: "v2",
      rule: { ">=": [{ var: "form.age" }, 0] },
      message: "no negative ages",
    },
  ],
  computedValue: { "+": [{ var: "form.a" }, 1] },
}

// ---------------------------------------------------------------------------
// Input-collecting variants: full 4-slot round-trip
// ---------------------------------------------------------------------------

describe("EventForm rule-slot round-trip: input-collecting variants", () => {
  it("BinaryField round-trips all four rule slots", () => {
    const original = new EventForm.BinaryField2({
      ...baseProps,
      inputType: "checkbox",
      options: [{ id: "o1", label: "Yes", value: "yes" }],
      ...sampleRules,
    })
    const result = roundTrip(original)
    expect(pickSlots(result as unknown as Record<string, unknown>)).toEqual(
      sampleRules,
    )
  })

  it("TextField (free-text) round-trips all four rule slots", () => {
    const original = new EventForm.TextField2({
      ...baseProps,
      inputType: "text",
      length: "short",
      units: [],
      ...sampleRules,
    })
    const result = roundTrip(original)
    expect(pickSlots(result as unknown as Record<string, unknown>)).toEqual(
      sampleRules,
    )
  })

  it("DateField round-trips all four rule slots", () => {
    const original = new EventForm.DateField2({
      ...baseProps,
      inputType: "date",
      ...sampleRules,
    })
    const result = roundTrip(original)
    expect(pickSlots(result as unknown as Record<string, unknown>)).toEqual(
      sampleRules,
    )
  })

  it("OptionsField round-trips all four rule slots", () => {
    const original = new EventForm.OptionsField2({
      ...baseProps,
      inputType: "select",
      multi: false,
      options: [{ id: "o1", label: "One", value: "1" }],
      ...sampleRules,
    })
    const result = roundTrip(original)
    expect(pickSlots(result as unknown as Record<string, unknown>)).toEqual(
      sampleRules,
    )
  })
})

// ---------------------------------------------------------------------------
// Visibility-only variants: visibleIf only
// ---------------------------------------------------------------------------

describe("EventForm rule-slot round-trip: visibility-only variants", () => {
  const visibleIfOnly = { visibleIf: sampleRules.visibleIf }

  it("DiagnosisField round-trips visibleIf", () => {
    const original = new EventForm.DiagnosisField2({
      ...baseProps,
      inputType: "select",
      options: [],
      ...visibleIfOnly,
    })
    const result = roundTrip(original)
    expect((result as unknown as Record<string, unknown>).visibleIf).toEqual(
      sampleRules.visibleIf,
    )
  })

  it("SeparatorField round-trips visibleIf (display-only)", () => {
    const original = new EventForm.SeparatorField2({
      ...baseProps,
      ...visibleIfOnly,
    } as never)
    const result = roundTrip(original)
    expect((result as unknown as Record<string, unknown>).visibleIf).toEqual(
      sampleRules.visibleIf,
    )
  })
})

// ---------------------------------------------------------------------------
// Edge cases — the boring inputs where JSON serialization most often
// drops data.
// ---------------------------------------------------------------------------

describe("EventForm rule-slot round-trip: edge cases", () => {
  it("literal truthy / falsy values in rule slots survive", () => {
    const original = new EventForm.BinaryField2({
      ...baseProps,
      inputType: "checkbox",
      options: [],
      visibleIf: true,
      requiredIf: false,
      computedValue: 0,
      validators: [],
    })
    const result = roundTrip(original) as unknown as Record<string, unknown>
    expect(result.visibleIf).toBe(true)
    expect(result.requiredIf).toBe(false)
    expect(result.computedValue).toBe(0)
    expect(result.validators).toEqual([])
  })

  it("validator without optional `code` round-trips without it appearing", () => {
    const original = new EventForm.BinaryField2({
      ...baseProps,
      inputType: "checkbox",
      options: [],
      validators: [{ id: "v1", rule: true, message: "msg" }],
    })
    const result = roundTrip(original) as unknown as Record<string, unknown>
    const validators = result.validators as Array<Record<string, unknown>>
    expect(validators).toHaveLength(1)
    expect(validators[0].id).toBe("v1")
    expect(validators[0].message).toBe("msg")
    // `code` should NOT round-trip as undefined-property; JSON would drop
    // it. Confirms we don't accidentally surface it as `{code: undefined}`.
    expect("code" in validators[0]).toBe(false)
  })

  it("absent rule slots round-trip absent (backward compat with legacy fields)", () => {
    const original = new EventForm.BinaryField2({
      ...baseProps,
      inputType: "checkbox",
      options: [],
    })
    const result = roundTrip(original) as unknown as Record<string, unknown>
    expect(result.visibleIf).toBeUndefined()
    expect(result.requiredIf).toBeUndefined()
    expect(result.validators).toBeUndefined()
    expect(result.computedValue).toBeUndefined()
  })

  it("deeply nested JSONLogic survives round-trip", () => {
    const deepRule = {
      and: [
        { ">=": [{ var: "form.age" }, 18] },
        { "or": [
          { "==": [{ var: "form.status" }, "active"] },
          { "!=": [{ var: "form.override" }, null] },
        ]},
        { "!": { "==": [{ var: "form.banned" }, true] } },
      ],
    }
    const original = new EventForm.BinaryField2({
      ...baseProps,
      inputType: "checkbox",
      options: [],
      visibleIf: deepRule,
    })
    const result = roundTrip(original) as unknown as Record<string, unknown>
    expect(result.visibleIf).toEqual(deepRule)
  })
})

// ---------------------------------------------------------------------------
// Property tests — arbitrary JSONLogic shapes
// ---------------------------------------------------------------------------

/**
 * Recursive arbitrary for JSONLogic-shaped values. Bounded depth keeps
 * runs tractable; uses a fixed vocabulary that mirrors operators the
 * form-builder UI emits today.
 */
const jsonLogicArb = fc.letrec((tie) => ({
  rule: fc.oneof(
    { maxDepth: 4 },
    // Atoms
    fc.integer({ min: -100, max: 100 }),
    fc.boolean(),
    fc.constant(null),
    fc.string({ minLength: 0, maxLength: 8 }),
    fc.record({ var: fc.constantFrom("form.a", "form.b", "form.c", "ctx.now") }),
    // Binary ops
    fc.record({ "==": fc.tuple(tie("rule"), tie("rule")) }),
    fc.record({ "!=": fc.tuple(tie("rule"), tie("rule")) }),
    fc.record({ ">": fc.tuple(tie("rule"), tie("rule")) }),
    fc.record({ ">=": fc.tuple(tie("rule"), tie("rule")) }),
    fc.record({ "+": fc.tuple(tie("rule"), tie("rule")) }),
    // Variadic
    fc.record({ and: fc.array(tie("rule"), { minLength: 2, maxLength: 4 }) }),
    fc.record({ or: fc.array(tie("rule"), { minLength: 2, maxLength: 4 }) }),
    // Unary
    fc.record({ "!": tie("rule") }),
    fc.record({ "!!": tie("rule") }),
  ),
})).rule as fc.Arbitrary<unknown>

describe("EventForm rule-slot round-trip: property tests", () => {
  it("arbitrary visibleIf rule survives encode → JSON → decode unchanged", () => {
    fc.assert(
      fc.property(jsonLogicArb, (visibleIf) => {
        const original = new EventForm.BinaryField2({
          ...baseProps,
          inputType: "checkbox",
          options: [],
          visibleIf,
        })
        const result = roundTrip(original) as unknown as Record<string, unknown>
        expect(result.visibleIf).toEqual(visibleIf)
      }),
      { numRuns: 80 },
    )
  })

  it("arbitrary validator rules survive round-trip and preserve order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 8 }),
            rule: jsonLogicArb,
            message: fc.string({ minLength: 0, maxLength: 32 }),
          }),
          { minLength: 0, maxLength: 4 },
        ),
        (validators) => {
          const original = new EventForm.BinaryField2({
            ...baseProps,
            inputType: "checkbox",
            options: [],
            validators,
          })
          const result = roundTrip(original) as unknown as Record<string, unknown>
          const roundTripped = result.validators as Array<{
            id: string
            rule: unknown
            message: string
          }>
          expect(roundTripped).toEqual(validators)
        },
      ),
      { numRuns: 60 },
    )
  })

  it("all four slots populated simultaneously survive round-trip", () => {
    fc.assert(
      fc.property(
        fc.record({
          visibleIf: jsonLogicArb,
          requiredIf: jsonLogicArb,
          computedValue: jsonLogicArb,
          validators: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 8 }),
              rule: jsonLogicArb,
              message: fc.string({ minLength: 0, maxLength: 32 }),
            }),
            { maxLength: 3 },
          ),
        }),
        (slots) => {
          const original = new EventForm.BinaryField2({
            ...baseProps,
            inputType: "checkbox",
            options: [],
            ...slots,
          })
          const result = roundTrip(original) as unknown as Record<string, unknown>
          expect(result.visibleIf).toEqual(slots.visibleIf)
          expect(result.requiredIf).toEqual(slots.requiredIf)
          expect(result.computedValue).toEqual(slots.computedValue)
          expect(result.validators).toEqual(slots.validators)
        },
      ),
      { numRuns: 60 },
    )
  })
})
