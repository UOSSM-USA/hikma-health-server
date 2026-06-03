import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  comparisonOps,
  comparisonOpLabels,
  compileVisibilityTemplate,
  decompileVisibilityTemplate,
  ruleReferencesField,
  type simpleVisibilityTemplate,
  type visibilityCondition,
  type comparisonOp,
} from "../src/RuleTemplates.gen";

/**
 * Compile/decompile parity for the simple-visibility template model and
 * the ruleReferencesField walker. The ReScript-emitted variant shape:
 *
 *   - `Always` is a bare string.
 *   - otherwise `{ TAG: "Conditions", connector, conditions }`, where each
 *     condition is `{ TAG: "Comparison" | "Truthy" | "Falsy", ... }`.
 *
 * A single condition compiles to the bare leaf rule (backward compatible);
 * two or more compile to `{ and: [...] }` / `{ or: [...] }`. Decompile is
 * conservative: any non-leaf member, an `and`/`or` with <2 elements, or a
 * nested group falls back to `undefined` (advanced mode).
 */

const cmp = (
  fieldId: string,
  op: comparisonOp,
  value: unknown,
): visibilityCondition => ({ TAG: "Comparison", fieldId, op, value });
const truthy = (fieldId: string): visibilityCondition => ({ TAG: "Truthy", fieldId });
const falsy = (fieldId: string): visibilityCondition => ({ TAG: "Falsy", fieldId });

// Canonical single-condition template (connector is irrelevant with one
// condition; decompile always reports `and`).
const one = (c: visibilityCondition): simpleVisibilityTemplate => ({
  TAG: "Conditions",
  connector: "and",
  conditions: [c],
});

describe("comparisonOps and labels", () => {
  it("exposes all six operators in the legacy order", () => {
    expect(comparisonOps).toEqual(["==", "!=", ">", ">=", "<", "<="]);
  });

  it("labels every operator with a human-readable string", () => {
    for (const op of comparisonOps) {
      expect(typeof comparisonOpLabels[op]).toBe("string");
      expect(comparisonOpLabels[op]!.length).toBeGreaterThan(0);
    }
  });
});

describe("compileVisibilityTemplate", () => {
  it("compiles Always to undefined (no rule)", () => {
    expect(compileVisibilityTemplate("Always")).toBeUndefined();
  });

  it("compiles an empty condition list to undefined (defensive)", () => {
    expect(
      compileVisibilityTemplate({ TAG: "Conditions", connector: "and", conditions: [] }),
    ).toBeUndefined();
  });

  it("compiles a single == comparison to the bare comparison rule", () => {
    expect(compileVisibilityTemplate(one(cmp("f1", "==", "yes")))).toEqual({
      "==": [{ var: "form.f1" }, "yes"],
    });
  });

  it("compiles a single >= comparison with a numeric literal", () => {
    expect(compileVisibilityTemplate(one(cmp("age", ">=", 18)))).toEqual({
      ">=": [{ var: "form.age" }, 18],
    });
  });

  it("compiles a single Truthy to a bare !! unary form", () => {
    expect(compileVisibilityTemplate(one(truthy("x")))).toEqual({
      "!!": { var: "form.x" },
    });
  });

  it("compiles a single Falsy to a bare ! unary form", () => {
    expect(compileVisibilityTemplate(one(falsy("x")))).toEqual({
      "!": { var: "form.x" },
    });
  });

  it("compiles two AND-ed conditions to an `and` compound", () => {
    expect(
      compileVisibilityTemplate({
        TAG: "Conditions",
        connector: "and",
        conditions: [cmp("age", ">=", 18), cmp("consent", "==", true)],
      }),
    ).toEqual({
      and: [
        { ">=": [{ var: "form.age" }, 18] },
        { "==": [{ var: "form.consent" }, true] },
      ],
    });
  });

  it("compiles OR-ed conditions to an `or` compound", () => {
    expect(
      compileVisibilityTemplate({
        TAG: "Conditions",
        connector: "or",
        conditions: [truthy("a"), truthy("b")],
      }),
    ).toEqual({
      or: [{ "!!": { var: "form.a" } }, { "!!": { var: "form.b" } }],
    });
  });
});

describe("decompileVisibilityTemplate — round-trip across every template", () => {
  const cases: simpleVisibilityTemplate[] = [
    "Always",
    one(cmp("f1", "==", "yes")),
    one(cmp("age", ">=", 18)),
    one(cmp("alive", "!=", true)),
    one(cmp("score", "<", 0)),
    one(cmp("x", ">", null)),
    one(truthy("consent")),
    one(falsy("is_empty")),
    {
      TAG: "Conditions",
      connector: "and",
      conditions: [cmp("age", ">=", 18), cmp("consent", "==", true)],
    },
    {
      TAG: "Conditions",
      connector: "or",
      conditions: [truthy("a"), falsy("b"), cmp("c", "==", 1)],
    },
  ];

  for (const tpl of cases) {
    const label = typeof tpl === "string" ? tpl : JSON.stringify(tpl);
    it(`round-trips ${label}`, () => {
      const rule = compileVisibilityTemplate(tpl);
      const back = decompileVisibilityTemplate(rule);
      expect(back).toEqual(tpl);
    });
  }

  it("decompiles undefined to Always", () => {
    expect(decompileVisibilityTemplate(undefined)).toBe("Always");
  });

  it("decompiles null to Always", () => {
    expect(decompileVisibilityTemplate(null)).toBe("Always");
  });

  it("decompiles a single bare condition to a one-element `and` group", () => {
    expect(
      decompileVisibilityTemplate({ "==": [{ var: "form.age" }, 18] }),
    ).toEqual(one(cmp("age", "==", 18)));
  });

  it("decompiles the legacy single-element !! array form", () => {
    expect(decompileVisibilityTemplate({ "!!": [{ var: "form.x" }] })).toEqual(
      one(truthy("x")),
    );
  });

  it("decompiles an `and` compound of leaves to a group", () => {
    expect(
      decompileVisibilityTemplate({
        and: [
          { ">=": [{ var: "form.age" }, 18] },
          { "==": [{ var: "form.consent" }, true] },
        ],
      }),
    ).toEqual({
      TAG: "Conditions",
      connector: "and",
      conditions: [cmp("age", ">=", 18), cmp("consent", "==", true)],
    });
  });

  it("decompiles an `or` compound of leaves to a group", () => {
    expect(
      decompileVisibilityTemplate({
        or: [{ "!!": { var: "form.a" } }, { "!!": { var: "form.b" } }],
      }),
    ).toEqual({
      TAG: "Conditions",
      connector: "or",
      conditions: [truthy("a"), truthy("b")],
    });
  });

  it("covers every comparisonOps entry", () => {
    for (const op of comparisonOps) {
      const t = one(cmp("f", op, 1));
      expect(decompileVisibilityTemplate(compileVisibilityTemplate(t))).toEqual(t);
    }
  });
});

describe("decompileVisibilityTemplate — non-template rules return undefined", () => {
  it("returns undefined for an `and` with a single element", () => {
    expect(
      decompileVisibilityTemplate({ and: [{ ">=": [{ var: "form.age" }, 18] }] }),
    ).toBeUndefined();
  });

  it("returns undefined for an empty `and`", () => {
    expect(decompileVisibilityTemplate({ and: [] })).toBeUndefined();
  });

  it("returns undefined when an `and` member isn't a leaf", () => {
    expect(
      decompileVisibilityTemplate({
        and: [
          { ">=": [{ var: "form.age" }, 18] },
          { if: [{ "==": [{ var: "form.x" }, 1] }, true, false] },
        ],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for a nested `and` of `and`", () => {
    expect(
      decompileVisibilityTemplate({
        and: [
          { and: [{ "==": [{ var: "form.a" }, 1] }, { "==": [{ var: "form.b" }, 2] }] },
          { "==": [{ var: "form.c" }, 3] },
        ],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for nested if/else", () => {
    expect(
      decompileVisibilityTemplate({
        if: [{ ">=": [{ var: "form.age" }, 18] }, true, false],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when var doesn't carry the form. prefix", () => {
    expect(
      decompileVisibilityTemplate({ "==": [{ var: "patient.id" }, "x"] }),
    ).toBeUndefined();
  });

  it("returns undefined when RHS isn't a literal", () => {
    expect(
      decompileVisibilityTemplate({
        "==": [{ var: "form.a" }, { var: "form.b" }],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for a comparison with wrong arity", () => {
    expect(
      decompileVisibilityTemplate({ "==": [{ var: "form.a" }, 1, 2] }),
    ).toBeUndefined();
  });

  it("returns undefined when the object has multiple keys", () => {
    expect(
      decompileVisibilityTemplate({
        "==": [{ var: "form.a" }, 1],
        "!=": [{ var: "form.b" }, 2],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for an array at the top level", () => {
    expect(decompileVisibilityTemplate([1, 2, 3])).toBeUndefined();
  });

  it("returns undefined for a primitive at the top level", () => {
    expect(decompileVisibilityTemplate(42)).toBeUndefined();
    expect(decompileVisibilityTemplate("hello")).toBeUndefined();
    expect(decompileVisibilityTemplate(true)).toBeUndefined();
  });
});

describe("ruleReferencesField", () => {
  it("returns false for undefined/null/primitive rules", () => {
    expect(ruleReferencesField(undefined, "a")).toBe(false);
    expect(ruleReferencesField(null, "a")).toBe(false);
    expect(ruleReferencesField(42, "a")).toBe(false);
    expect(ruleReferencesField("a", "a")).toBe(false);
    expect(ruleReferencesField(true, "a")).toBe(false);
  });

  it("matches a direct {var: form.<id>} reference", () => {
    expect(ruleReferencesField({ var: "form.age" }, "age")).toBe(true);
  });

  it("doesn't match a different field id", () => {
    expect(ruleReferencesField({ var: "form.consent" }, "age")).toBe(false);
  });

  it("matches subpath access like form.<id>.foo", () => {
    expect(ruleReferencesField({ var: "form.address.street" }, "address")).toBe(true);
  });

  it("doesn't match field-id prefixes (address ≠ address_2)", () => {
    expect(ruleReferencesField({ var: "form.address_2" }, "address")).toBe(false);
  });

  it("walks into nested comparison rules", () => {
    const rule = { ">": [{ var: "form.age" }, 18] };
    expect(ruleReferencesField(rule, "age")).toBe(true);
    expect(ruleReferencesField(rule, "weight")).toBe(false);
  });

  it("walks into and/or trees", () => {
    const rule = {
      and: [
        { "==": [{ var: "form.consent" }, true] },
        { ">": [{ var: "form.age" }, 18] },
      ],
    };
    expect(ruleReferencesField(rule, "age")).toBe(true);
    expect(ruleReferencesField(rule, "consent")).toBe(true);
    expect(ruleReferencesField(rule, "weight")).toBe(false);
  });

  it("handles the array-form {var: [path, default]}", () => {
    expect(ruleReferencesField({ var: ["form.age", 0] }, "age")).toBe(true);
    expect(ruleReferencesField({ var: ["form.other", 0] }, "age")).toBe(false);
  });

  it("returns false for rules with no field references", () => {
    expect(ruleReferencesField({ ">": [3, 2] }, "age")).toBe(false);
    expect(ruleReferencesField({ "==": [true, true] }, "age")).toBe(false);
  });

  it("ignores computed var paths it can't statically resolve", () => {
    const rule = { var: { cat: ["form.", { var: "key" }] } };
    expect(ruleReferencesField(rule, "age")).toBe(false);
  });
});

describe("ruleReferencesField — property: compiled templates always reference their field", () => {
  it("for any single-field condition", () => {
    const fieldIdArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);
    const opArb: fc.Arbitrary<comparisonOp> = fc.constantFrom(...comparisonOps);
    const literalArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
    );
    const condArb: fc.Arbitrary<visibilityCondition> = fc.oneof(
      fieldIdArb.map((fieldId) => truthy(fieldId)),
      fieldIdArb.map((fieldId) => falsy(fieldId)),
      fc.tuple(fieldIdArb, opArb, literalArb).map(([fieldId, op, value]) =>
        cmp(fieldId, op, value),
      ),
    );
    fc.assert(
      fc.property(condArb, (c) => {
        const rule = compileVisibilityTemplate(one(c));
        return ruleReferencesField(rule, c.fieldId) === true;
      }),
      { numRuns: 100 },
    );
  });
});
