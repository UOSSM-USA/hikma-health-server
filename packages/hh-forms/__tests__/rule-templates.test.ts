import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  comparisonOps,
  comparisonOpLabels,
  compileVisibilityTemplate,
  decompileVisibilityTemplate,
  ruleReferencesField,
  type simpleVisibilityTemplate,
  type comparisonOp,
} from "../src/RuleTemplates.gen";

/**
 * Parity tests for the simple-visibility template compile/decompile and
 * the ruleReferencesField walker. Mirrors
 * apps/server/tests/lib/form-rule-templates.test.ts adapted to the
 * ReScript-emitted variant shape:
 *
 *   - `Always` is a bare string
 *   - other variants are `{TAG: "Comparison" | "Truthy" | "Falsy", ...}`
 *
 * Compile returns `undefined` for `Always` and the rule object otherwise.
 * Decompile takes `undefined` (missing rule) or a JSON value.
 */

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

  it("compiles a == comparison to a JSONLogic comparison rule", () => {
    const rule = compileVisibilityTemplate({
      TAG: "Comparison",
      fieldId: "f1",
      op: "==",
      value: "yes",
    });
    expect(rule).toEqual({ "==": [{ var: "form.f1" }, "yes"] });
  });

  it("compiles a >= comparison with a numeric literal", () => {
    const rule = compileVisibilityTemplate({
      TAG: "Comparison",
      fieldId: "age",
      op: ">=",
      value: 18,
    });
    expect(rule).toEqual({ ">=": [{ var: "form.age" }, 18] });
  });

  it("compiles Truthy to a !! unary form", () => {
    const rule = compileVisibilityTemplate({ TAG: "Truthy", fieldId: "x" });
    expect(rule).toEqual({ "!!": { var: "form.x" } });
  });

  it("compiles Falsy to a ! unary form", () => {
    const rule = compileVisibilityTemplate({ TAG: "Falsy", fieldId: "x" });
    expect(rule).toEqual({ "!": { var: "form.x" } });
  });
});

describe("decompileVisibilityTemplate — round-trip across every template", () => {
  const cases: simpleVisibilityTemplate[] = [
    "Always",
    { TAG: "Comparison", fieldId: "f1", op: "==", value: "yes" },
    { TAG: "Comparison", fieldId: "age", op: ">=", value: 18 },
    { TAG: "Comparison", fieldId: "alive", op: "!=", value: true },
    { TAG: "Comparison", fieldId: "score", op: "<", value: 0 },
    { TAG: "Comparison", fieldId: "x", op: ">", value: null },
    { TAG: "Truthy", fieldId: "consent" },
    { TAG: "Falsy", fieldId: "is_empty" },
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

  it("decompiles the legacy single-element !! array form", () => {
    expect(
      decompileVisibilityTemplate({ "!!": [{ var: "form.x" }] }),
    ).toEqual({ TAG: "Truthy", fieldId: "x" });
  });

  it("covers every comparisonOps entry", () => {
    for (const op of comparisonOps) {
      const t: simpleVisibilityTemplate = {
        TAG: "Comparison",
        fieldId: "f",
        op,
        value: 1,
      };
      expect(decompileVisibilityTemplate(compileVisibilityTemplate(t))).toEqual(t);
    }
  });
});

describe("decompileVisibilityTemplate — non-template rules return undefined", () => {
  it("returns undefined for an and compound", () => {
    expect(
      decompileVisibilityTemplate({
        and: [
          { ">=": [{ var: "form.age" }, 18] },
          { "==": [{ var: "form.consent" }, true] },
        ],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for an or compound", () => {
    expect(
      decompileVisibilityTemplate({
        or: [{ "!!": { var: "form.a" } }, { "!!": { var: "form.b" } }],
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
  it("for any single-field template", () => {
    const fieldIdArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);
    const opArb: fc.Arbitrary<comparisonOp> = fc.constantFrom(...comparisonOps);
    const literalArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
    );
    const tplArb: fc.Arbitrary<simpleVisibilityTemplate> = fc.oneof(
      fieldIdArb.map((fieldId) => ({ TAG: "Truthy" as const, fieldId })),
      fieldIdArb.map((fieldId) => ({ TAG: "Falsy" as const, fieldId })),
      fc.tuple(fieldIdArb, opArb, literalArb).map(([fieldId, op, value]) => ({
        TAG: "Comparison" as const,
        fieldId,
        op,
        value,
      })),
    );
    fc.assert(
      fc.property(tplArb, (tpl) => {
        const rule = compileVisibilityTemplate(tpl);
        const fieldId =
          typeof tpl === "string"
            ? null
            : (tpl as { fieldId: string }).fieldId;
        if (fieldId === null) return true;
        return ruleReferencesField(rule, fieldId) === true;
      }),
      { numRuns: 100 },
    );
  });
});
