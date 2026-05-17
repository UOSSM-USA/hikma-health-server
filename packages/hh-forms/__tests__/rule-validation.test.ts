import { describe, it, expect } from "vitest";
import {
  validateRule,
  validateFieldRules,
  collectFieldRuleIssues,
  formatRuleError,
  formatFieldRuleIssues,
  type fieldRuleSlots,
  type fieldWithId,
  type ruleValidationError,
} from "../src/RuleValidation.gen";

/**
 * Parity tests for the structural rule validator. Mirrors
 * apps/server/tests/models/form-rules.test.ts but adapted to the
 * ReScript-emitted `result<unit, ruleValidationError>` shape:
 *
 *   - Ok: `{ TAG: "Ok", _0: undefined }`
 *   - Err with no payload: error is the bare string "MaxDepthExceeded"
 *   - Err with payload: `{ TAG: "<Variant>", _0: <payload>, ... }`
 */

const isOk = (r: ReturnType<typeof validateRule>): r is { TAG: "Ok"; _0: void } =>
  r.TAG === "Ok";

const errorOf = (r: ReturnType<typeof validateRule>): ruleValidationError => {
  if (r.TAG !== "Error") throw new Error("expected Error");
  return r._0;
};

const variantTag = (e: ruleValidationError): string =>
  typeof e === "string" ? e : e.TAG;

describe("validateRule — structurally valid rules", () => {
  it("accepts primitive literals", () => {
    expect(isOk(validateRule(42))).toBe(true);
    expect(isOk(validateRule(true))).toBe(true);
    expect(isOk(validateRule("hello"))).toBe(true);
    expect(isOk(validateRule(null))).toBe(true);
  });

  it("accepts a var lookup", () => {
    expect(isOk(validateRule({ var: "form.age" }))).toBe(true);
  });

  it("accepts a nested if/then/else", () => {
    expect(
      isOk(
        validateRule({
          if: [{ ">": [{ var: "form.age" }, 18] }, "adult", "minor"],
        }),
      ),
    ).toBe(true);
  });

  it("accepts an arithmetic expression", () => {
    expect(isOk(validateRule({ "+": [1, 2, 3] }))).toBe(true);
  });
});

describe("validateRule — structurally invalid rules", () => {
  it("rejects an unknown operator", () => {
    const r = validateRule({ definitely_not_an_op: [1, 2] });
    const e = errorOf(r);
    expect(variantTag(e)).toBe("UnknownOperator");
    if (typeof e !== "string" && e.TAG === "UnknownOperator") {
      expect(e._0).toBe("definitely_not_an_op");
    }
  });

  it("rejects an object with multiple operator keys", () => {
    const r = validateRule({ "+": [1, 2], "-": [3, 4] });
    const e = errorOf(r);
    expect(variantTag(e)).toBe("MultiKeyObject");
    if (typeof e !== "string" && e.TAG === "MultiKeyObject") {
      expect(e._0).toEqual(expect.arrayContaining(["+", "-"]));
    }
  });
});

// -----------------------------------------------------------------------------
// Pre-flight budget: a self-contained DoS rule (large embedded array,
// excessive iteration ops) is rejected before the vendored evaluator ever
// sees it. Threshold knobs live in RuleValidation.res (maxRuleNodes /
// maxIterationOps) and are intentionally generous — well-formed rules
// fit comfortably under them.
// -----------------------------------------------------------------------------

describe("validateRule — complexity budget", () => {
  it("accepts a small rule with a single iteration op", () => {
    expect(
      isOk(
        validateRule({
          map: [{ var: "form.items" }, { "+": [{ var: "" }, 1] }],
        }),
      ),
    ).toBe(true);
  });

  it("rejects a rule embedding a 2000-element literal array (node budget)", () => {
    const huge: number[] = [];
    for (let i = 0; i < 2000; i++) huge.push(i);
    const r = validateRule({ "+": huge });
    const e = errorOf(r);
    expect(variantTag(e)).toBe("ComplexityBudgetExceeded");
    if (typeof e !== "string" && e.TAG === "ComplexityBudgetExceeded") {
      expect(e.limit).toBe(1000);
      expect(e.nodes).toBeGreaterThan(1000);
    }
  });

  it("rejects a rule with 6 chained iteration operators (iteration budget)", () => {
    // Six nested map ops — each one counts as an iteration-op occurrence.
    let inner: unknown = { var: "" };
    for (let i = 0; i < 6; i++) {
      inner = { map: [{ var: "form.x" }, inner] };
    }
    const r = validateRule(inner);
    const e = errorOf(r);
    expect(variantTag(e)).toBe("IterationBudgetExceeded");
    if (typeof e !== "string" && e.TAG === "IterationBudgetExceeded") {
      expect(e.limit).toBe(5);
      expect(e.count).toBeGreaterThan(5);
      expect(["map", "filter", "reduce", "merge", "all", "some", "none"]).toContain(
        e.operator,
      );
    }
  });

  it("accepts exactly 5 chained iteration operators (boundary)", () => {
    let inner: unknown = { var: "" };
    for (let i = 0; i < 5; i++) {
      inner = { map: [{ var: "form.x" }, inner] };
    }
    expect(isOk(validateRule(inner))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Dynamic `var` rejection: `{var: <non-string>}` paths bypass static
// reference extraction in RuleCycles, so an authored cycle escapes the
// authoring-time graph check. Reject at the upsert boundary so downstream
// consumers (cycle detector, scope builder) only see static refs.
// -----------------------------------------------------------------------------

describe("validateRule — dynamic var paths", () => {
  it("accepts a static string var path", () => {
    expect(isOk(validateRule({ var: "form.a" }))).toBe(true);
  });

  it("accepts a subpath var", () => {
    expect(isOk(validateRule({ var: "form.a.sub" }))).toBe(true);
  });

  it("accepts the array-form var with static path + default", () => {
    expect(isOk(validateRule({ var: ["form.a", 0] }))).toBe(true);
  });

  it("rejects a rule using a computed-path var", () => {
    const r = validateRule({ var: { cat: ["form.", "a"] } });
    expect(variantTag(errorOf(r))).toBe("DynamicVarPath");
  });

  it("rejects a rule using the array-form var with a non-string path", () => {
    const r = validateRule({ var: [{ cat: ["form.", "a"] }, 0] });
    expect(variantTag(errorOf(r))).toBe("DynamicVarPath");
  });

  it("rejects a rule with a dynamic var nested deep inside another op", () => {
    const r = validateRule({
      if: [
        { ">": [{ var: "form.x" }, 0] },
        { var: { cat: ["form.", { var: "form.target" }] } },
        null,
      ],
    });
    expect(variantTag(errorOf(r))).toBe("DynamicVarPath");
  });
});

describe("validateFieldRules — per-slot aggregation", () => {
  it("returns no errors when every slot is valid or absent", () => {
    const slots: fieldRuleSlots = {
      visibleIf: { ">=": [{ var: "form.weight" }, 0] },
      requiredIf: true,
      validators: [
        { id: "v1", rule: { "!=": [{ var: "form.dob" }, null] }, message: "Required" },
      ],
      computedValue: { "*": [{ var: "form.h" }, { var: "form.h" }] },
    };
    expect(validateFieldRules(slots)).toEqual([]);
  });

  it("returns nothing for a field with no rule slots set", () => {
    expect(validateFieldRules({})).toEqual([]);
  });

  it("reports a bad visibleIf rule by slot name", () => {
    const errors = validateFieldRules({ visibleIf: { not_a_real_op: [] } });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.slot).toBe("visibleIf");
    expect(variantTag(errors[0]!.error)).toBe("UnknownOperator");
  });

  it("reports a bad validator rule by indexed path", () => {
    const errors = validateFieldRules({
      validators: [
        { id: "v1", rule: { ">=": [1, 2] }, message: "ok" },
        { id: "v2", rule: { not_a_real_op: [] }, message: "bad" },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.slot).toBe("validators[1].rule");
  });

  it("reports errors from multiple slots in one pass — preserving traversal order", () => {
    const errors = validateFieldRules({
      visibleIf: { unknown_v: [] },
      requiredIf: { unknown_r: [] },
      computedValue: 1, // primitive: valid
      validators: [{ id: "v1", rule: { unknown_x: [] }, message: "x" }],
    });
    expect(errors.map((e) => e.slot)).toEqual([
      "visibleIf",
      "requiredIf",
      "validators[0].rule",
    ]);
  });
});

describe("collectFieldRuleIssues — multi-field aggregation", () => {
  it("returns an empty list when every field validates", () => {
    expect(
      collectFieldRuleIssues([
        { id: "f1", visibleIf: { "==": [{ var: "form.x" }, 1] } },
        { id: "f2" },
        { id: "f3", validators: [{ id: "v", rule: true, message: "always" }] },
      ]),
    ).toEqual([]);
  });

  it("handles an empty field list", () => {
    expect(collectFieldRuleIssues([])).toEqual([]);
  });

  it("collects one issue per broken slot, keyed by field id", () => {
    const issues = collectFieldRuleIssues([
      { id: "f1", visibleIf: { unknown_v: [] } },
      { id: "f2", requiredIf: { unknown_r: [] } },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ fieldId: "f1", slot: "visibleIf" });
    expect(issues[1]).toMatchObject({ fieldId: "f2", slot: "requiredIf" });
  });

  it("aggregates multiple broken slots on one field", () => {
    const issues = collectFieldRuleIssues([
      {
        id: "f1",
        visibleIf: { unknown_v: [] },
        requiredIf: { unknown_r: [] },
        validators: [{ id: "v0", rule: { unknown_x: [] }, message: "x" }],
      },
    ]);
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.slot)).toEqual([
      "visibleIf",
      "requiredIf",
      "validators[0].rule",
    ]);
    expect(issues.every((i) => i.fieldId === "f1")).toBe(true);
  });

  it("uses '<unknown>' as fieldId when a field has no id", () => {
    const fields: fieldWithId[] = [{ visibleIf: { unknown_v: [] } }];
    const issues = collectFieldRuleIssues(fields);
    expect(issues[0]?.fieldId).toBe("<unknown>");
  });
});

describe("formatters", () => {
  it("formatRuleError covers each variant", () => {
    expect(formatRuleError("MaxDepthExceeded")).toBe("rule is nested too deep");
    expect(formatRuleError({ TAG: "UnknownOperator", _0: "foo" })).toContain("'foo'");
    expect(
      formatRuleError({ TAG: "MultiKeyObject", _0: ["a", "b"] }),
    ).toContain("a, b");
    expect(
      formatRuleError({
        TAG: "InvalidShape",
        operator: "if",
        message: "needs 3 args",
      }),
    ).toContain("invalid if");
  });

  it("formatFieldRuleIssues joins lines with newline", () => {
    const out = formatFieldRuleIssues([
      {
        fieldId: "f1",
        slot: "visibleIf",
        error: { TAG: "UnknownOperator", _0: "x" },
      },
      {
        fieldId: "f2",
        slot: "requiredIf",
        error: "MaxDepthExceeded",
      },
    ]);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("field f1 visibleIf:");
    expect(out).toContain("field f2 requiredIf:");
  });
});
