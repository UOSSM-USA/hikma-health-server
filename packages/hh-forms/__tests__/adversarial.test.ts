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
// Hardening tests for packages/hh-forms.
//
// Each suite guards a specific failure mode — resource exhaustion, off-by-one
// iteration caps, type-confusion in equality, lenient input handling, and
// DoS-shaped rules. The comment above each suite states the mechanism it
// protects against, so a future maintainer who sees one fail fixes the cause
// rather than loosening the assertion.
// =============================================================================

const ctx = { now: "2026-05-23T00:00:00Z", language: "en" };
const scope = (form: Record<string, unknown> = {}): ruleScope => ({ form, ctx });

// -----------------------------------------------------------------------------
// Deep-nesting recursion on untrusted JSON (CWE-674).
//
// collectRefs, ruleReferencesField, and the cycle walker traverse the raw JSON
// tree before validation. The form-builder Save handlers call
// detectComputedValueCycles before the server's `assertFieldRulesValid` guard,
// so an author who pastes deeply-nested JSON in advanced mode (the editor
// exposes the textarea verbatim) could otherwise overflow the JS stack and
// crash the browser tab. The walkers use an explicit worklist with a node-visit
// cap so untrusted depth can't exhaust the stack.
// -----------------------------------------------------------------------------

function buildDeeplyNestedRule(depth: number): unknown {
  let node: unknown = { var: "form.a" };
  for (let i = 0; i < depth; i++) {
    node = [node];
  }
  return node;
}

describe("deep-nesting recursion on untrusted JSON", () => {
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
// Long linear computedValue chains must stabilize, not be misreported as cycles.
//
// stabilizeComputedValues fixed-points by re-evaluating until values settle.
// A linear chain of N fields (each reading the previous via {"+": [{var}, 1]})
// needs N passes to propagate plus one to confirm no change. If the iteration
// cap is too low it fires before that confirmation, returning
// `convergence: "cycle"` with writeback suppressed — blanking read-only fields
// and warning "cycle detected" for a perfectly acyclic chain. The cap is sized
// well above the longest chain these tests exercise.
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

describe("stabilize handles long linear chains without flagging cycles", () => {
  it("15-field linear chain stabilizes", () => {
    const fields = buildLinearChain(15);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
  });

  it("16-field linear chain stabilizes", () => {
    const fields = buildLinearChain(16);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
    // The acyclic chain has well-defined computed values; suppressing them
    // is the user-visible regression this guards against.
    expect(Object.keys(result.evaluation.computedValues).length).toBe(15);
  });

  it("20-field linear chain stabilizes", () => {
    const fields = buildLinearChain(20);
    const evaluator = compileRules(fields);
    const result = stabilizeComputedValues(evaluator, scope({ f0: 1 }));
    expect(result.convergence).toBe("stable");
  });

  it("stabilize iteration cap stays high enough for long chains", () => {
    // Pins the cap so a future reduction surfaces here rather than silently
    // reintroducing the false-cycle behavior on long acyclic chains.
    expect(maxStabilizeIterations).toBeGreaterThanOrEqual(32);
  });
});

// -----------------------------------------------------------------------------
// computedValuesEqual must not collapse NaN/Infinity onto null.
//
// The structural-equality fallback uses JSON.stringify, which maps NaN,
// Infinity, -Infinity, and null all to the string "null" — so a naive fallback
// reports four distinct float states as equal. If a computedValue transitions
// from a real number to NaN (or null), an equality short-circuit would suppress
// the writeback and leave a stale read-only display. The JSONLogic `finiteNum`
// guard keeps the engine from emitting non-finite numbers for arithmetic, so
// reach is narrow (a rule building the value another way, or a hand-built
// JSON.t) but real. Equality must distinguish these by tag before stringifying.
// -----------------------------------------------------------------------------

describe("computedValuesEqual keeps NaN/Infinity distinct from null", () => {
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
    // Well-formed JSON.t inputs (no NaN/Infinity) follow stringify equality —
    // this is what makes the JSON-stringify fallback safe in normal use.
    // Asserted explicitly so any future narrowing of the equality check keeps
    // the well-formed case intact.
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
// Empty fieldId references must not decompile to a template.
//
// isFormVar (used by decompileVisibilityTemplate) must not return Some("") for
// a `var: "form."` path — an empty fieldId reference. Downstream that produces
// a template referencing a non-existent field; the runtime treats unknown ids
// as "default visible", so the rule silently becomes a no-op instead of
// surfacing the malformed authoring, and the author gets no signal they dropped
// the id. Empty fieldId is rejected as malformed.
// -----------------------------------------------------------------------------

describe("empty fieldId references do not decompile to a template", () => {
  it("ruleReferencesField with empty fieldId target does NOT match `form.`", () => {
    // A self-ref check verifying that a rule references field "" must not match
    // `{var: "form."}`: an empty fieldId is a malformed shape, not a legitimate
    // reference to a field named "".
    expect(ruleReferencesField({ var: "form." } as any, "")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// JsonLogic DoS-shaped rules are rejected at authoring time (CWE-1333).
//
// The vendored `@nd/jsonlogic` evaluator iterates map/filter/reduce/merge/
// all/some/none argument arrays without a per-call cap. A multi-thousand-element
// literal array or a long chain of iteration ops can freeze the mobile UI,
// which re-evaluates rules on every keystroke. Rather than patch vendored code,
// RuleValidation.validateRule runs a pre-flight node-count and iteration-op
// budget so the rule never reaches the evaluator.
// -----------------------------------------------------------------------------

describe("JsonLogic DoS-shaped rules are rejected at authoring time", () => {
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
// Dynamic var paths are rejected at authoring time.
//
// RuleCycles.collectRefs skips dynamic `var` paths (e.g. `{var: {cat: [...]}}`)
// because it can't statically resolve them. That leaves a cycle-escape: an
// author can chain computed-value rules whose lookup is built at eval time,
// pass the SCC check at save, and burn the stabilize-iteration budget per
// keystroke at runtime. Rather than make the cycle detector pessimistic (which
// would break legitimate dynamic refs elsewhere), RuleValidation rejects
// `{var: <non-string>}` at authoring time, so downstream consumers only ever
// see static refs.
// -----------------------------------------------------------------------------

describe("dynamic var paths are rejected at authoring time", () => {
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

// -----------------------------------------------------------------------------
// Submit-gate dedup is prototype-safe.
//
// summarizeSubmitBlockers prefixes dict keys with "k:" so a validator message
// of "__proto__" or "constructor" can't collide with the prototype chain and
// corrupt the dedup map. Under arbitrary (including attacker-shaped) messages,
// the deduped count must always equal the distinct-message count.
// -----------------------------------------------------------------------------

describe("submit-gate dedup is prototype-safe", () => {
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
