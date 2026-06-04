import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  compileRules,
  computedCount,
  computedEntries,
  computedValuesEqual,
  filterVisibleFields,
  formatComputedValue,
  getComputed,
  hasComputed,
  maxStabilizeIterations,
  pruneRulesForLiveFields,
  stabilizeComputedValues,
  summarizeSubmitBlockers,
  type fieldWithRules,
  type ruleScope,
  type validationError,
} from "../src/Rules.gen";

/**
 * Tests for the Rules.res evaluator: visibleIf, requiredIf, validators,
 * computedValue, fail-safe (parse-failure) semantics, evaluator closure
 * purity, computed-value stabilization, and the screen-side helpers
 * (summarizeSubmitBlockers, filterVisibleFields). Mirrors the equivalent
 * cases in apps/mobile/test/lib/form-rules.test.ts.
 */

const emptyScope: ruleScope = {
  form: {},
  ctx: { now: "2026-01-01T00:00:00Z", language: "en" },
};

const withForm = (form: Record<string, unknown>): ruleScope => ({
  ...emptyScope,
  form,
});

const field = (
  id: string,
  overrides: Partial<fieldWithRules> = {},
): fieldWithRules => ({ id, ...overrides });

describe("compileRules — empty input", () => {
  it("returns a callable evaluator for an empty field list", () => {
    const evaluate = compileRules([]);
    const result = evaluate(emptyScope);
    expect(result.validationErrors).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("isVisible / isRequired default to (true / false) for unknown ids", () => {
    const evaluate = compileRules([]);
    const result = evaluate(emptyScope);
    expect(result.isVisible("never-declared")).toBe(true);
    expect(result.isRequired("never-declared")).toBe(false);
  });
});

describe("visibleIf", () => {
  it("returns true when there is no rule", () => {
    const evaluate = compileRules([field("f1")]);
    expect(evaluate(emptyScope).isVisible("f1")).toBe(true);
  });

  it("returns true for a constant `true` rule", () => {
    const evaluate = compileRules([field("f1", { visibleIf: true })]);
    expect(evaluate(emptyScope).isVisible("f1")).toBe(true);
  });

  it("returns false for a constant `false` rule", () => {
    const evaluate = compileRules([field("f1", { visibleIf: false })]);
    expect(evaluate(emptyScope).isVisible("f1")).toBe(false);
  });

  it("evaluates a field-reference rule against the scope", () => {
    const evaluate = compileRules([
      field("show_more", {
        visibleIf: { "==": [{ var: "form.consent" }, true] },
      }),
    ]);
    expect(evaluate(withForm({ consent: true })).isVisible("show_more")).toBe(true);
    expect(evaluate(withForm({ consent: false })).isVisible("show_more")).toBe(false);
    expect(evaluate(emptyScope).isVisible("show_more")).toBe(false);
  });

  it("hidden fields short-circuit requiredIf and validators", () => {
    const evaluate = compileRules([
      field("name", {
        required: true,
        visibleIf: false,
        validators: [
          {
            id: "v1",
            rule: { "!=": [{ var: "form.name" }, null] },
            message: "Name is required",
          },
        ],
      }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.isVisible("name")).toBe(false);
    expect(result.isRequired("name")).toBe(false);
    expect(result.validationErrors).toEqual([]);
  });
});

describe("requiredIf", () => {
  it("falls back to static `required` when there's no rule", () => {
    const evaluate = compileRules([
      field("a", { required: true }),
      field("b", { required: false }),
      field("c"),
    ]);
    const result = evaluate(emptyScope);
    expect(result.isRequired("a")).toBe(true);
    expect(result.isRequired("b")).toBe(false);
    expect(result.isRequired("c")).toBe(false);
  });

  it("overrides the static flag when the rule is present", () => {
    const evaluate = compileRules([
      field("dob", {
        required: true,
        requiredIf: { "==": [{ var: "form.gather_dob" }, true] },
      }),
    ]);
    expect(evaluate(withForm({ gather_dob: false })).isRequired("dob")).toBe(false);
    expect(evaluate(withForm({ gather_dob: true })).isRequired("dob")).toBe(true);
  });

  it("re-evaluates per scope (purity)", () => {
    const evaluate = compileRules([
      field("f", { requiredIf: { ">": [{ var: "form.x" }, 10] } }),
    ]);
    expect(evaluate(withForm({ x: 5 })).isRequired("f")).toBe(false);
    expect(evaluate(withForm({ x: 50 })).isRequired("f")).toBe(true);
  });
});

describe("validators", () => {
  it("returns no errors when every validator passes", () => {
    const evaluate = compileRules([
      field("age", {
        validators: [
          { id: "v1", rule: { ">=": [{ var: "form.age" }, 0] }, message: "non-neg" },
          { id: "v2", rule: { "<": [{ var: "form.age" }, 150] }, message: "plausible" },
        ],
      }),
    ]);
    expect(evaluate(withForm({ age: 40 })).validationErrors).toEqual([]);
  });

  it("emits one error per failing validator with stable identifiers", () => {
    const evaluate = compileRules([
      field("age", {
        validators: [
          { id: "non-neg", rule: { ">=": [{ var: "form.age" }, 0] }, message: "Must be non-negative" },
          { id: "lt-150", rule: { "<": [{ var: "form.age" }, 150] }, message: "Must be < 150", code: "age_max" },
        ],
      }),
    ]);
    const result = evaluate(withForm({ age: 200 }));
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0]).toEqual({
      fieldId: "age",
      validatorId: "lt-150",
      message: "Must be < 150",
      code: "age_max",
    });
  });

  it("emits errors across multiple fields in declared order", () => {
    const evaluate = compileRules([
      field("a", { validators: [{ id: "va", rule: false, message: "A failed" }] }),
      field("b", { validators: [{ id: "vb", rule: false, message: "B failed" }] }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.validationErrors.map((e) => e.fieldId)).toEqual(["a", "b"]);
  });

  it("treats JSONLogic empty-array result as falsy (defensive)", () => {
    const evaluate = compileRules([
      field("f", {
        validators: [
          {
            id: "v1",
            rule: { filter: [[1, 2, 3], { ">": [{ var: "" }, 100] }] },
            message: "expected at least one >100",
          },
        ],
      }),
    ]);
    expect(evaluate(emptyScope).validationErrors).toHaveLength(1);
  });
});

describe("fail-safe semantics", () => {
  it("invalid visibleIf parse → diagnostic + defaults to visible", () => {
    const evaluate = compileRules([
      field("f", { visibleIf: { not_a_real_op: [1, 2] } }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.isVisible("f")).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      fieldId: "f",
      slot: "visibleIf",
      phase: "parse",
    });
  });

  it("invalid requiredIf parse → diagnostic + falls back to static flag", () => {
    const evaluate = compileRules([
      field("f", { required: true, requiredIf: { not_a_real_op: [1, 2] } }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.isRequired("f")).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.slot).toBe("requiredIf");
  });

  it("invalid validator rule parse → diagnostic + validator skipped", () => {
    const evaluate = compileRules([
      field("f", {
        validators: [
          { id: "broken", rule: { not_a_real_op: [] }, message: "should not fire" },
        ],
      }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.validationErrors).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      fieldId: "f",
      slot: "validators",
      validatorId: "broken",
      phase: "parse",
    });
  });

  it("static parse-time diagnostics are re-emitted on every evaluate call", () => {
    const evaluate = compileRules([
      field("f", { visibleIf: { not_a_real_op: [1] } }),
    ]);
    expect(evaluate(emptyScope).diagnostics).toHaveLength(1);
    expect(evaluate(emptyScope).diagnostics).toHaveLength(1);
  });
});

describe("evaluator closure — purity", () => {
  it("same scope yields equal output", () => {
    const evaluate = compileRules([
      field("age", {
        required: true,
        validators: [
          { id: "v1", rule: { ">": [{ var: "form.age" }, 0] }, message: "positive" },
        ],
      }),
    ]);
    const a = evaluate(withForm({ age: 5 }));
    const b = evaluate(withForm({ age: 5 }));
    expect(b.validationErrors).toEqual(a.validationErrors);
    expect(b.isVisible("age")).toBe(a.isVisible("age"));
    expect(b.isRequired("age")).toBe(a.isRequired("age"));
  });

  it("does not leak state between calls", () => {
    const evaluate = compileRules([
      field("age", {
        validators: [
          { id: "v1", rule: { ">=": [{ var: "form.age" }, 0] }, message: "no negs" },
        ],
      }),
    ]);
    const first = evaluate(withForm({ age: -1 }));
    expect(first.validationErrors).toHaveLength(1);
    const second = evaluate(withForm({ age: 5 }));
    expect(second.validationErrors).toEqual([]);
  });
});

describe("property: constant-truthy visibleIf → always visible", () => {
  it("for any form scope", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.anything()),
        (form) => {
          const evaluate = compileRules([field("f", { visibleIf: true })]);
          expect(evaluate(withForm(form)).isVisible("f")).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("property: constant-falsy validator → exactly one error per validator", () => {
  it("regardless of scope contents", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.dictionary(fc.string(), fc.anything()),
        (validatorIds, form) => {
          const ids = Array.from(new Set(validatorIds));
          const evaluate = compileRules([
            field("f", {
              validators: ids.map((id) => ({
                id,
                rule: false,
                message: `msg-${id}`,
              })),
            }),
          ]);
          const result = evaluate(withForm(form));
          expect(result.validationErrors).toHaveLength(ids.length);
          expect(result.validationErrors.every((e) => e.fieldId === "f")).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("property: compile is parse-once — evaluating N times is safe", () => {
  it("runs many evaluations against the same compiled closure", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: -100, max: 100 }),
        (calls, age) => {
          const evaluate = compileRules([
            field("age", {
              validators: [
                {
                  id: "v1",
                  rule: { ">=": [{ var: "form.age" }, 0] },
                  message: "no negatives",
                },
              ],
            }),
          ]);
          let lastErrors = 0;
          for (let i = 0; i < calls; i++) {
            lastErrors = evaluate(withForm({ age })).validationErrors.length;
          }
          expect(lastErrors).toBe(age < 0 ? 1 : 0);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ----------------------------------------------------------------------------
// Screen-side helpers
// ----------------------------------------------------------------------------

const err = (id: string, message: string, fieldId = "f"): validationError => ({
  fieldId,
  validatorId: id,
  message,
});

describe("summarizeSubmitBlockers", () => {
  it("unblocked when both lists are empty", () => {
    expect(summarizeSubmitBlockers([], [])).toEqual({
      blocked: false,
      missingRequired: [],
      validatorErrors: [],
    });
  });

  it("blocked when only missing-required is non-empty", () => {
    const out = summarizeSubmitBlockers(["age"], []);
    expect(out.blocked).toBe(true);
    expect(out.missingRequired).toEqual(["age"]);
  });

  it("blocked when only validators are non-empty", () => {
    const out = summarizeSubmitBlockers([], [err("v1", "must be adult")]);
    expect(out.blocked).toBe(true);
    expect(out.validatorErrors).toHaveLength(1);
  });

  it("dedupes validator errors by message, preserving first occurrence", () => {
    const out = summarizeSubmitBlockers(
      [],
      [
        err("v1", "must be adult"),
        err("v2", "must be adult"),
        err("v3", "other"),
        err("v4", "must be adult"),
      ],
    );
    expect(out.validatorErrors.map((e) => e.validatorId)).toEqual(["v1", "v3"]);
  });

  it("property: blocked iff at least one input is non-empty after dedup", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.array(
          fc.record({
            fieldId: fc.constant("f"),
            validatorId: fc.string(),
            message: fc.string(),
          }),
        ),
        (missing, errs) => {
          const out = summarizeSubmitBlockers(missing, errs);
          const dedupedSize = new Set(errs.map((e) => e.message)).size;
          expect(out.validatorErrors.length).toBe(dedupedSize);
          expect(out.blocked).toBe(missing.length > 0 || dedupedSize > 0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: output messages set equals input messages set", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fieldId: fc.constant("f"),
            validatorId: fc.string(),
            message: fc.constantFrom("a", "b", "c", "d"),
          }),
        ),
        (errs) => {
          const out = summarizeSubmitBlockers([], errs);
          const inputMessages = new Set(errs.map((e) => e.message));
          const outputMessages = new Set(out.validatorErrors.map((e) => e.message));
          expect(outputMessages).toEqual(inputMessages);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// computedValue evaluation
// ----------------------------------------------------------------------------

describe("computedValue", () => {
  it("is absent when no rule is set", () => {
    const evaluate = compileRules([field("f1")]);
    const result = evaluate(emptyScope);
    expect(hasComputed(result, "f1")).toBe(false);
    expect(computedCount(result)).toBe(0);
  });

  it("returns a constant value for a constant rule", () => {
    const evaluate = compileRules([field("f1", { computedValue: 42 })]);
    const result = evaluate(emptyScope);
    expect(hasComputed(result, "f1")).toBe(true);
    expect(getComputed(result, "f1")).toBe(42);
  });

  it("evaluates against the scope on each call", () => {
    const evaluate = compileRules([
      field("total", {
        computedValue: { "+": [{ var: "form.a" }, { var: "form.b" }] },
      }),
    ]);
    expect(getComputed(evaluate(withForm({ a: 2, b: 3 })), "total")).toBe(5);
    expect(getComputed(evaluate(withForm({ a: 10, b: 1 })), "total")).toBe(11);
  });

  it("hidden fields short-circuit computedValue", () => {
    // Load-bearing: if computedValue fired for hidden fields, the next
    // render's writeback would re-populate the cleared value, defeating
    // the clear-on-hide policy.
    const evaluate = compileRules([
      field("f", { visibleIf: false, computedValue: 99 }),
    ]);
    const result = evaluate(emptyScope);
    expect(result.isVisible("f")).toBe(false);
    expect(hasComputed(result, "f")).toBe(false);
  });

  it("parse failure → diagnostic + absent (field stays editable)", () => {
    const evaluate = compileRules([
      field("f", { computedValue: { not_a_real_op: [1] } }),
    ]);
    const result = evaluate(emptyScope);
    expect(hasComputed(result, "f")).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      fieldId: "f",
      slot: "computedValue",
      phase: "parse",
    });
  });

  it("does not leak between calls (purity)", () => {
    const evaluate = compileRules([
      field("doubled", { computedValue: { "*": [{ var: "form.n" }, 2] } }),
    ]);
    expect(getComputed(evaluate(withForm({ n: 3 })), "doubled")).toBe(6);
    expect(getComputed(evaluate(withForm({ n: 5 })), "doubled")).toBe(10);
  });

  it("supports object / array shapes (renderer handles writeback)", () => {
    const evaluate = compileRules([
      field("pair", {
        computedValue: { merge: [[{ var: "form.a" }, { var: "form.b" }]] },
      }),
    ]);
    const result = evaluate(withForm({ a: 1, b: 2 }));
    expect(getComputed(result, "pair")).toEqual([1, 2]);
  });

  it("computedEntries iterates all visible-field computedValues", () => {
    const evaluate = compileRules([
      field("a", { computedValue: 1 }),
      field("b", { computedValue: 2 }),
    ]);
    const entries = computedEntries(evaluate(emptyScope));
    expect(entries.sort()).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("property: constant-literal computedValue is stable across scopes", () => {
  it("returns the constant for any scope contents", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer(), { maxLength: 3 }),
        ),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.anything()),
        (constant, form) => {
          const evaluate = compileRules([
            field("f", { computedValue: constant }),
          ]);
          const result = evaluate(withForm(form));
          expect(hasComputed(result, "f")).toBe(true);
          expect(getComputed(result, "f")).toEqual(constant);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ----------------------------------------------------------------------------
// computedValuesEqual + formatComputedValue
// ----------------------------------------------------------------------------

const jsonValueArb = fc.jsonValue();

describe("computedValuesEqual", () => {
  it("returns true for identity-equal primitives", () => {
    expect(computedValuesEqual("x", "x")).toBe(true);
    // 0 / -0: identity is false, but JSON.stringify of both is "0".
    expect(computedValuesEqual(0, -0)).toBe(true);
  });

  it("compares arrays/objects by structural (JSON) equality", () => {
    expect(computedValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(computedValuesEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(computedValuesEqual([1, 2], [2, 1])).toBe(false);
  });

  it("returns false rather than throwing on cyclic inputs", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(computedValuesEqual(cyclic, cyclic)).toBe(true); // identity fast path
    expect(computedValuesEqual(cyclic, { self: {} })).toBe(false);
  });

  it("property: reflexive for any JSON-serializable value", () => {
    fc.assert(
      fc.property(jsonValueArb, (v) => {
        expect(computedValuesEqual(v, v)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("property: symmetric for any JSON-serializable pair", () => {
    fc.assert(
      fc.property(jsonValueArb, jsonValueArb, (a, b) => {
        expect(computedValuesEqual(a, b)).toBe(computedValuesEqual(b, a));
      }),
      { numRuns: 100 },
    );
  });
});

describe("formatComputedValue", () => {
  it("renders null as empty string", () => {
    expect(formatComputedValue(null)).toBe("");
  });

  it("renders primitives without quotes", () => {
    expect(formatComputedValue("hello")).toBe("hello");
    expect(formatComputedValue(42)).toBe("42");
    expect(formatComputedValue(true)).toBe("true");
    expect(formatComputedValue(false)).toBe("false");
  });

  it("renders arrays/objects as JSON", () => {
    expect(formatComputedValue([1, 2])).toBe("[1,2]");
    expect(formatComputedValue({ a: 1 })).toBe('{"a":1}');
  });

  it("property: always returns a string and never throws", () => {
    fc.assert(
      fc.property(jsonValueArb, (v) => {
        const out = formatComputedValue(v);
        expect(typeof out).toBe("string");
      }),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// stabilizeComputedValues
// ----------------------------------------------------------------------------

describe("stabilizeComputedValues", () => {
  it("converges in one iteration when no computedValue rules are present", () => {
    const evaluator = compileRules([field("a"), field("b")]);
    const result = stabilizeComputedValues(evaluator, withForm({ a: 1, b: 2 }));
    expect(result.convergence).toBe("stable");
    expect(result.iterations).toBe(1);
    expect(computedCount(result.evaluation)).toBe(0);
  });

  it("settles a single-step computedValue in two passes (eval + confirm)", () => {
    const evaluator = compileRules([
      field("a"),
      field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
    ]);
    const result = stabilizeComputedValues(evaluator, withForm({ a: 5 }));
    expect(result.convergence).toBe("stable");
    expect(result.iterations).toBe(2);
    expect(getComputed(result.evaluation, "b")).toBe(6);
  });

  it("settles a 3-deep linear chain inside one call", () => {
    const evaluator = compileRules([
      field("a"),
      field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
      field("c", { computedValue: { "+": [{ var: "form.b" }, 1] } }),
      field("d", { computedValue: { "+": [{ var: "form.c" }, 1] } }),
    ]);
    const result = stabilizeComputedValues(evaluator, withForm({ a: 10 }));
    expect(result.convergence).toBe("stable");
    expect(getComputed(result.evaluation, "b")).toBe(11);
    expect(getComputed(result.evaluation, "c")).toBe(12);
    expect(getComputed(result.evaluation, "d")).toBe(13);
    expect(result.iterations).toBeLessThanOrEqual(4);
  });

  it("reports cycle and empties computedValues on A↔B oscillation", () => {
    const evaluator = compileRules([
      field("a", { computedValue: { "+": [{ var: "form.b" }, 1] } }),
      field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
    ]);
    const result = stabilizeComputedValues(evaluator, withForm({ a: 0, b: 1 }));
    expect(result.convergence).toBe("cycle");
    expect(result.iterations).toBe(maxStabilizeIterations);
    expect(computedCount(result.evaluation)).toBe(0);
  });

  it("preserves visibility / required on cycle", () => {
    const evaluator = compileRules([
      field("a", { computedValue: { "+": [{ var: "form.b" }, 1] } }),
      field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
      field("c", { visibleIf: { "==": [{ var: "form.show_c" }, true] } }),
    ]);
    const result = stabilizeComputedValues(
      evaluator,
      withForm({ a: 0, b: 1, show_c: true }),
    );
    expect(result.convergence).toBe("cycle");
    expect(result.evaluation.isVisible("c")).toBe(true);
  });

  it("does not mutate the caller's initialScope.form", () => {
    const evaluator = compileRules([
      field("a"),
      field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
    ]);
    const scope = withForm({ a: 5 });
    const originalForm = { ...scope.form };
    stabilizeComputedValues(evaluator, scope);
    expect(scope.form).toEqual(originalForm);
  });

  it("hidden field's computedValue does not participate in stabilization", () => {
    const evaluator = compileRules([
      field("a"),
      field("b", {
        visibleIf: { "==": [1, 2] }, // always hidden
        computedValue: { "+": [{ var: "form.a" }, 1] },
      }),
    ]);
    const result = stabilizeComputedValues(evaluator, withForm({ a: 5 }));
    expect(result.convergence).toBe("stable");
    expect(hasComputed(result.evaluation, "b")).toBe(false);
  });

  it("property: always terminates within maxStabilizeIterations", () => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.option(fc.integer({ min: -100, max: 100 })),
          b: fc.option(fc.integer({ min: -100, max: 100 })),
          c: fc.option(fc.integer({ min: -100, max: 100 })),
        }),
        (form) => {
          const evaluator = compileRules([
            field("a"),
            field("b", { computedValue: { "+": [{ var: "form.a" }, 1] } }),
            field("c", { computedValue: { "+": [{ var: "form.b" }, 1] } }),
          ]);
          const result = stabilizeComputedValues(
            evaluator,
            withForm(form as Record<string, unknown>),
          );
          expect(result.iterations).toBeLessThanOrEqual(maxStabilizeIterations);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("filterVisibleFields", () => {
  // Real evaluator (rather than mocked) so the filter exercises the same
  // evaluation contract the screens see at runtime.
  const evalWithVisibility = (
    fields: fieldWithRules[],
    scope: ruleScope = emptyScope,
  ) => compileRules(fields)(scope);

  const getId = (f: fieldWithRules) => f.id;

  it("pass-through when evaluation is null", () => {
    const fields = [field("a"), field("b")];
    // Generated TS uses `null` for the absent-evaluation case (ReScript's
    // Null.t<...>); see RuleEvaluation in Rules.gen.ts. Mobile screens
    // pass `null` explicitly.
    expect(filterVisibleFields(fields, getId, null)).toEqual(fields);
  });

  it("excludes fields whose visibleIf evaluates falsy", () => {
    const fields = [
      field("a"),
      field("b", { visibleIf: false }),
      field("c", { visibleIf: true }),
    ];
    const out = filterVisibleFields(fields, getId, evalWithVisibility(fields));
    expect(out.map((f) => f.id)).toEqual(["a", "c"]);
  });

  it("preserves order", () => {
    const fields = [field("a"), field("b"), field("c"), field("d")];
    const out = filterVisibleFields(fields, getId, evalWithVisibility(fields));
    expect(out.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("property: output is a subset of input that order-preserves", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            visibleIf: fc.option(fc.boolean(), { freq: 2 }),
          }),
          { minLength: 0, maxLength: 12 },
        ),
        (raw) => {
          const seen = new Set<string>();
          const fields: fieldWithRules[] = [];
          for (const r of raw) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            const f: fieldWithRules = { id: r.id };
            if (r.visibleIf !== null) (f as { visibleIf?: unknown }).visibleIf = r.visibleIf;
            fields.push(f);
          }
          const out = filterVisibleFields(fields, getId, evalWithVisibility(fields));
          const outIds = new Set(out.map((f) => f.id));
          for (const f of out) expect(fields.includes(f)).toBe(true);
          const inputOrder = fields.map((f) => f.id).filter((id) => outIds.has(id));
          expect(out.map((f) => f.id)).toEqual(inputOrder);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: every output field is reported visible", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            visibleIf: fc.option(fc.boolean(), { freq: 2 }),
          }),
          { minLength: 0, maxLength: 12 },
        ),
        (raw) => {
          const seen = new Set<string>();
          const fields: fieldWithRules[] = [];
          for (const r of raw) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            const f: fieldWithRules = { id: r.id };
            if (r.visibleIf !== null) (f as { visibleIf?: unknown }).visibleIf = r.visibleIf;
            fields.push(f);
          }
          const evaluation = evalWithVisibility(fields);
          const out = filterVisibleFields(fields, getId, evaluation);
          for (const f of out) expect(evaluation.isVisible(f.id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("pruneRulesForLiveFields", () => {
  const ref = (id: string) => ({ var: `form.${id}` });
  const gt0 = (id: string) => ({ ">": [ref(id), 0] });

  it("drops fields whose id is not in the live set", () => {
    const out = pruneRulesForLiveFields([field("a"), field("b")], ["a"]);
    expect(out.map((f) => f.id)).toEqual(["a"]);
  });

  it("keeps a live field whose rules reference only live fields", () => {
    const out = pruneRulesForLiveFields(
      [field("a", { visibleIf: gt0("b") })],
      ["a", "b"],
    );
    expect(out[0]?.visibleIf).toEqual(gt0("b"));
  });

  it("strips visibleIf / requiredIf / computedValue referencing a non-live field", () => {
    const out = pruneRulesForLiveFields(
      [
        field("a", {
          visibleIf: gt0("gone"),
          requiredIf: gt0("gone"),
          computedValue: ref("gone"),
        }),
      ],
      ["a"],
    );
    expect(out[0]?.visibleIf).toBeUndefined();
    expect(out[0]?.requiredIf).toBeUndefined();
    expect(out[0]?.computedValue).toBeUndefined();
  });

  it("keeps rules with no form references (constants / ctx-only)", () => {
    const ctxRule = { "==": [{ var: "ctx.language" }, "en"] };
    const out = pruneRulesForLiveFields(
      [field("a", { visibleIf: true, requiredIf: ctxRule })],
      ["a"],
    );
    expect(out[0]?.visibleIf).toBe(true);
    expect(out[0]?.requiredIf).toEqual(ctxRule);
  });

  it("removes only the validators that reference a non-live field", () => {
    const live = { id: "v-live", rule: gt0("b"), message: "live" };
    const dead = { id: "v-dead", rule: gt0("gone"), message: "dead" };
    const out = pruneRulesForLiveFields(
      [field("a", { validators: [live, dead] })],
      ["a", "b"],
    );
    expect(out[0]?.validators).toEqual([live]);
  });

  it("ignored visibleIf (referencing a removed field) leaves the field visible by default", () => {
    const fields = [field("a", { visibleIf: gt0("gone") })];
    const evaluate = compileRules(pruneRulesForLiveFields(fields, ["a"]));
    expect(evaluate(withForm({})).isVisible("a")).toBe(true);
  });

  it("a validator referencing a removed field no longer fires", () => {
    const v = { id: "v1", rule: gt0("gone"), message: "boom" };
    const fields = [field("a", { validators: [v] })];
    const evaluate = compileRules(pruneRulesForLiveFields(fields, ["a"]));
    expect(evaluate(withForm({ a: 1 })).validationErrors).toEqual([]);
  });

  it("a non-live field's own rules never fire (dropped from the evaluated set)", () => {
    // Soft-delete shape: the field stays in the array but isn't live.
    const v = { id: "v1", rule: gt0("a"), message: "boom" };
    const fields = [field("a", { required: true, validators: [v] })];
    const result = compileRules(pruneRulesForLiveFields(fields, []))(
      withForm({ a: -5 }),
    );
    expect(result.validationErrors).toEqual([]);
    expect(result.isRequired("a")).toBe(false);
  });
});

describe("pruneRulesForLiveFields — operand-level pruning of and/or", () => {
  const ref = (id: string) => ({ var: `form.${id}` });
  const eq = (id: string, val: unknown) => ({ "==": [ref(id), val] });

  it("drops only the dead conjunct of an `and`, keeping live siblings", () => {
    const out = pruneRulesForLiveFields(
      [field("target", { visibleIf: { and: [eq("hidden", "x"), eq("live", "y")] } })],
      ["target", "live"],
    );
    // single survivor is unwrapped
    expect(out[0]?.visibleIf).toEqual(eq("live", "y"));
  });

  it("keeps an `and` object when two or more conjuncts survive", () => {
    const out = pruneRulesForLiveFields(
      [
        field("target", {
          visibleIf: { and: [eq("a", 1), eq("hidden", 2), eq("b", 3)] },
        }),
      ],
      ["target", "a", "b"],
    );
    expect(out[0]?.visibleIf).toEqual({ and: [eq("a", 1), eq("b", 3)] });
  });

  it("drops only the dead disjunct of an `or`", () => {
    const out = pruneRulesForLiveFields(
      [field("target", { visibleIf: { or: [eq("hidden", "x"), eq("live", "y")] } })],
      ["target", "live"],
    );
    expect(out[0]?.visibleIf).toEqual(eq("live", "y"));
  });

  it("drops the whole slot when every operand references a non-live field", () => {
    const out = pruneRulesForLiveFields(
      [field("target", { visibleIf: { and: [eq("gone1", 1), eq("gone2", 2)] } })],
      ["target"],
    );
    expect(out[0]?.visibleIf).toBeUndefined();
  });

  it("prunes nested combinators recursively", () => {
    const out = pruneRulesForLiveFields(
      [
        field("target", {
          visibleIf: {
            and: [eq("a", 1), { or: [eq("hidden", 2), eq("b", 3)] }],
          },
        }),
      ],
      ["target", "a", "b"],
    );
    // inner or collapses to its single live disjunct, outer and keeps both
    expect(out[0]?.visibleIf).toEqual({ and: [eq("a", 1), eq("b", 3)] });
  });

  it("end-to-end: a hidden conjunct is ignored, the live conjunct still gates", () => {
    // Mirrors the production case: visibleIf = (hidden == "opt1") AND (name == "jack").
    const fields = [
      field("target", {
        visibleIf: { and: [eq("hidden", "opt1"), eq("name", "jack")] },
      }),
    ];
    const evaluate = compileRules(pruneRulesForLiveFields(fields, ["target", "name"]));
    expect(evaluate(withForm({ name: "jack" })).isVisible("target")).toBe(true);
    expect(evaluate(withForm({ name: "jill" })).isVisible("target")).toBe(false);
    expect(evaluate(withForm({})).isVisible("target")).toBe(false);
  });
});
