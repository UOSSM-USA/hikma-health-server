import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  compileRules,
  computedValuesEqual,
  maxStabilizeIterations,
  stabilizeComputedValues,
  summarizeSubmitBlockers,
  type fieldWithRules,
  type ruleScope,
} from "../src/Rules.gen";
import {
  detectComputedValueCycles,
  extractReferencedFieldIds,
} from "../src/RuleCycles.gen";
import {
  ruleReferencesField,
} from "../src/RuleTemplates.gen";
import { validateRule } from "../src/RuleValidation.gen";

// =============================================================================
// Adversarial review: packages/hh-forms
//
// Each test below targets a specific finding. They are designed to FAIL when
// the bug exists and PASS once the implementation is fixed. The block comment
// above each suite states the finding, severity, mechanism, and the fix that
// would make it pass.
// =============================================================================

const ctx = { now: "2026-05-23T00:00:00Z", language: "en" };
const scope = (form: Record<string, unknown> = {}): ruleScope => ({ form, ctx });

// -----------------------------------------------------------------------------
// Finding A — MEDIUM
//
// RuleCycles.collectRefs and RuleTemplates.ruleReferencesField recurse on
// the raw JSON tree (pre-validation). The form-builder Save handlers call
// detectComputedValueCycles BEFORE the server's `assertFieldRulesValid`
// guard. An author who pastes deeply-nested JSON in advanced mode (the
// editor exposes the textarea verbatim) crashes the browser tab with
// `RangeError: Maximum call stack size exceeded`. Same hazard on rule
// load if any future path walks a raw rule before validating.
//
// Class: resource-exhaustion / unhandled recursion on untrusted input
// CWE: CWE-674 (uncontrolled recursion)
// Fix: convert collectRefs and walk to iterative traversal (explicit
//      worklist), OR call RuleValidation.validateRule (depth-bounded at
//      256 by the engine) before walking.
// -----------------------------------------------------------------------------

function buildDeeplyNestedRule(depth: number): unknown {
  let node: unknown = { var: "form.a" };
  for (let i = 0; i < depth; i++) {
    node = [node];
  }
  return node;
}

describe("Finding A — deep-nesting recursion on untrusted JSON", () => {
  it("extractReferencedFieldIds does not stack-overflow on 20000-deep arrays", () => {
    const rule = buildDeeplyNestedRule(20000);
    expect(() => extractReferencedFieldIds(rule as any)).not.toThrow();
  });

  it("ruleReferencesField does not stack-overflow on 20000-deep arrays", () => {
    const rule = buildDeeplyNestedRule(20000);
    expect(() => ruleReferencesField(rule as any, "a")).not.toThrow();
  });

  it("detectComputedValueCycles does not stack-overflow when a field carries a deeply-nested rule", () => {
    const rule = buildDeeplyNestedRule(20000);
    expect(() =>
      detectComputedValueCycles([{ id: "f", computedValue: rule as any }])
    ).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// Finding B — MEDIUM
//
// stabilizeComputedValues' maxStabilizeIterations cap is 16, but the loop
// counts the INITIAL evaluation as iter=1, then needs ONE confirming pass
// after the last value settles. A linear computedValue chain of N fields
// (root + N-1 dependents, each reading the previous via {"+": [{var}, 1]})
// requires N evals to propagate plus 1 to confirm no change — and the cap
// fires before that confirmation. The result is `convergence: "cycle"` and
// `computedValues: {}` (writeback suppressed) for a perfectly acyclic
// chain. Author sees no warning, screen blanks the read-only fields,
// Logger.warn fires "cycle detected" falsely.
//
// Class: off-by-one in iteration cap; logic flaw
// Fix: either raise the cap (cheap; each iter is O(N_fields)), evaluate
//      in topological order once instead of fixed-pointing, or only flag
//      a cycle when the SAME computedValues map repeats (true oscillation,
//      not slow propagation).
// -----------------------------------------------------------------------------

function buildLinearChain(n: number): fieldWithRules[] {
  const fields: fieldWithRules[] = [{ id: "f0" }];
  for (let i = 1; i < n; i++) {
    fields.push({
      id: `f${i}`,
      computedValue: { "+": [{ var: `form.f${i - 1}` }, 1] },
    });
  }
  return fields;
}

describe("Finding B — stabilize falsely flags long linear chains as cycles", () => {
  it("15-field linear chain stabilizes", () => {
    const fields = buildLinearChain(15);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
  });

  it("16-field linear chain stabilizes (currently flagged as cycle)", () => {
    const fields = buildLinearChain(16);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
    // The acyclic chain has well-defined computed values; suppressing them
    // is the user-visible part of the bug.
    expect(Object.keys(result.evaluation.computedValues).length).toBe(15);
  });

  it("20-field linear chain stabilizes", () => {
    const fields = buildLinearChain(20);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
  });

  it("documents the cap value used by stabilize (informational)", () => {
    // Not a bug assertion — pins the constant so any cap change here surfaces
    // alongside the Finding B fix.
    expect(maxStabilizeIterations).toBeGreaterThanOrEqual(32);
  });
});

// -----------------------------------------------------------------------------
// Finding C — LOW
//
// computedValuesEqual falls back to JSON.stringify equality. JSON.stringify
// maps NaN, Infinity, -Infinity, and null all to the string "null", so the
// helper reports four distinct float states as equal. When a computedValue
// rule transitions from a real number to NaN (or to null), the writeback
// short-circuit suppresses the update, and the read-only display shows the
// stale value. The JSONLogic evaluator's `finiteNum` guard prevents the
// engine itself from emitting NaN/Infinity for arithmetic ops, so reach
// requires a rule that constructs the value some other way (e.g. {merge:}
// of arrays containing JSON-non-finite values from `ctx`, or a TS caller
// hand-building JSON.t). Real but narrow.
//
// Class: type-confusion in equality / silent data masking
// Fix: short-circuit `computedValuesEqual(a, b)` on tag mismatch (e.g.,
//      typeof a !== typeof b → false) BEFORE stringify; or treat NaN as
//      unequal-to-anything per IEEE-754 semantics.
// -----------------------------------------------------------------------------

describe("Finding C — computedValuesEqual collapses NaN/Infinity to null", () => {
  it("NaN and null are NOT equal", () => {
    expect(computedValuesEqual(NaN as any, null as any)).toBe(false);
  });

  it("Infinity and null are NOT equal", () => {
    expect(computedValuesEqual(Infinity as any, null as any)).toBe(false);
  });

  it("Infinity and NaN are NOT equal", () => {
    expect(computedValuesEqual(Infinity as any, NaN as any)).toBe(false);
  });

  it("property: any two JSON.t values that stringify identically must agree on the equality result", () => {
    // Sanity: well-formed JSON.t inputs (no NaN/Infinity) follow stringify
    // equality — this is what makes the JSON-stringify fallback safe in
    // normal use. We assert the property explicitly so a future fix can
    // narrow without regressing the well-formed case.
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const same = computedValuesEqual(v as any, v as any);
        expect(same).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// -----------------------------------------------------------------------------
// Finding D — LOW
//
// RuleTemplates.isFormVar (used by decompileVisibilityTemplate) returns
// `Some("")` for a `var: "form."` path — i.e. an empty fieldId reference.
// The downstream comparison/truthy/falsy template that gets produced will
// reference a non-existent field; the runtime treats unknown ids as
// "default visible", so the rule silently becomes a no-op rather than
// surfacing the malformed authoring. Authors get no signal that they
// dropped the id.
//
// Class: lenient input handling / missing input validation
// Fix: reject empty fieldId in isFormVar (return None when slice is "").
// -----------------------------------------------------------------------------

describe("Finding D — empty fieldId references should not decompile to a template", () => {
  it("ruleReferencesField with empty fieldId target should NOT match `form.`", () => {
    // An author who saves `{var: "form."}` and then a separate validator
    // self-ref check tries to verify the rule references field "" — the
    // current code returns true (target === "form."), which is misleading.
    // After the fix it should return false (empty fieldId is malformed).
    expect(ruleReferencesField({ var: "form." } as any, "")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Finding E — INFO / property-based sanity
//
// summarizeSubmitBlockers prefixes dict keys with "k:" to guard against
// prototype-chain collisions (a validator message of "__proto__" or
// "constructor"). Property test to confirm: under arbitrary string
// messages — including attacker-shaped ones — the function never produces
// fewer deduped entries than the number of distinct messages. This is the
// secure-coding guarantee we want to lock in against future refactors.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Finding F — HIGH
//
// The vendored `@nd/jsonlogic` evaluator iterates over `map`/`filter`/
// `reduce`/`merge`/`all`/`some`/`none` argument arrays without a per-call
// cap. An author who embeds a multi-thousand-element literal array or
// chains many iteration ops can freeze the mobile UI per-keystroke
// (rules re-evaluate on every form change). We don't patch the vendored
// code; instead `RuleValidation.validateRule` runs a pre-flight that
// enforces a node-count budget and an iteration-op count budget, so the
// rule never reaches the evaluator. This test pins the closed surface:
// the previously-DoS-able shapes are rejected at authoring time.
//
// Class: algorithmic complexity / DoS via untrusted input
// CWE: CWE-1333 (inefficient algorithmic complexity)
// Fix (landed): RuleValidation pre-flight (checkComplexityBudget).
// -----------------------------------------------------------------------------

describe("Finding F — JsonLogic DoS rules are rejected at authoring time", () => {
  it("rule embedding a 2000-element literal array is rejected", () => {
    const huge: number[] = [];
    for (let i = 0; i < 2000; i++) huge.push(i);
    const r = validateRule({ "+": huge });
    expect(r.TAG).toBe("Error");
  });

  it("rule chaining 6 map operators is rejected", () => {
    let inner: unknown = { var: "" };
    for (let i = 0; i < 6; i++) {
      inner = { map: [{ var: "form.x" }, inner] };
    }
    const r = validateRule(inner);
    expect(r.TAG).toBe("Error");
  });
});

// -----------------------------------------------------------------------------
// Finding G — MEDIUM
//
// `RuleCycles.collectRefs` deliberately skips dynamic `var` paths
// (e.g. `{var: {cat: [...]}}`) — it can't statically resolve them. That
// design choice opens a cycle-escape: an author can chain two
// computed-value rules whose `var` lookup is constructed at eval time,
// bypass the SCC check at save, and burn the stabilize-iteration budget
// per-keystroke at runtime. Rather than make the cycle detector
// pessimistic (would break legitimate dynamic refs in non-cycle uses),
// we reject `{var: <non-string>}` shapes at authoring time in
// RuleValidation — downstream consumers then only see static refs.
//
// Class: authoring-time check bypass / runtime DoS
// Fix (landed): RuleValidation pre-flight (checkDynamicVarPaths).
// -----------------------------------------------------------------------------

describe("Finding G — dynamic var paths are rejected at authoring time", () => {
  it("rule with a computed-path var is rejected", () => {
    const r = validateRule({ var: { cat: ["form.", "a"] } });
    expect(r.TAG).toBe("Error");
  });

  it("rule with a dynamic var nested inside an if/then chain is rejected", () => {
    const r = validateRule({
      if: [
        true,
        { var: { cat: ["form.", { var: "form.target" }] } },
        null,
      ],
    });
    expect(r.TAG).toBe("Error");
  });
});

describe("Finding E — submit gate dedup is prototype-safe", () => {
  it("property: dedup count equals distinct-message count", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fieldId: fc.string(),
            validatorId: fc.string(),
            message: fc.oneof(
              fc.string(),
              fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"),
            ),
          }),
          { maxLength: 50 },
        ),
        (errors) => {
          const distinct = new Set(errors.map((e) => e.message)).size;
          const gate = summarizeSubmitBlockers([], errors);
          expect(gate.validatorErrors.length).toBe(distinct);
        },
      ),
      { numRuns: 200 },
    );
  });
});
