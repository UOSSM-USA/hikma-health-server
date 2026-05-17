import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  detectComputedValueCycles,
  extractReferencedFieldIds,
  type fieldWithComputed,
} from "../src/RuleCycles.gen";

/**
 * Parity tests for cycle detection. Mirrors
 * apps/server/tests/lib/form-rule-cycles.test.ts. The TS port returned
 * `Set<string>` from `extractReferencedFieldIds`; the ReScript port
 * returns `string[]` (genType has no clean Set emission). Tests assert
 * sorted-array equality to match.
 */

describe("extractReferencedFieldIds", () => {
  it("returns empty array for null / undefined / primitives", () => {
    expect(extractReferencedFieldIds(undefined)).toEqual([]);
    expect(extractReferencedFieldIds(null)).toEqual([]);
    expect(extractReferencedFieldIds(5)).toEqual([]);
    expect(extractReferencedFieldIds("hi")).toEqual([]);
  });

  it("extracts a single id from a string-arg var", () => {
    expect(extractReferencedFieldIds({ var: "form.a" }).sort()).toEqual(["a"]);
  });

  it("extracts the id from a subpath var", () => {
    expect(extractReferencedFieldIds({ var: "form.a.x" })).toEqual(["a"]);
  });

  it("extracts from the array-form var (path + default)", () => {
    expect(extractReferencedFieldIds({ var: ["form.a", 0] })).toEqual(["a"]);
  });

  it("ignores var references to non-form scopes (ctx.now)", () => {
    expect(extractReferencedFieldIds({ var: "ctx.now" })).toEqual([]);
  });

  it("walks nested operators and collects every distinct id", () => {
    const rule = {
      if: [
        { "==": [{ var: "form.a" }, 1] },
        { "+": [{ var: "form.b" }, { var: "form.c" }] },
        { var: "form.a" },
      ],
    };
    expect(extractReferencedFieldIds(rule).sort()).toEqual(["a", "b", "c"]);
  });

  it("treats computed var arguments (object-valued) as non-references", () => {
    const ids = extractReferencedFieldIds({ var: { cat: ["form.", "a"] } });
    expect(ids).toEqual([]);
  });
});

describe("detectComputedValueCycles", () => {
  it("returns no cycles for an empty field list", () => {
    expect(detectComputedValueCycles([])).toEqual([]);
  });

  it("returns no cycles when no field has a computedValue", () => {
    const fields: fieldWithComputed[] = [{ id: "a" }, { id: "b" }];
    expect(detectComputedValueCycles(fields)).toEqual([]);
  });

  it("returns no cycles for a linear chain (A → B → C → D)", () => {
    const fields: fieldWithComputed[] = [
      { id: "a" },
      { id: "b", computedValue: { "+": [{ var: "form.a" }, 1] } },
      { id: "c", computedValue: { "+": [{ var: "form.b" }, 1] } },
      { id: "d", computedValue: { "+": [{ var: "form.c" }, 1] } },
    ];
    expect(detectComputedValueCycles(fields)).toEqual([]);
  });

  it("flags an A↔B oscillation", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { "+": [{ var: "form.b" }, 1] } },
      { id: "b", computedValue: { "+": [{ var: "form.a" }, 1] } },
    ];
    const cycles = detectComputedValueCycles(fields);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fieldIds].sort()).toEqual(["a", "b"]);
  });

  it("flags a self-loop", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { "+": [{ var: "form.a" }, 1] } },
    ];
    expect(detectComputedValueCycles(fields)).toEqual([{ fieldIds: ["a"] }]);
  });

  it("flags a 3-cycle (A → B → C → A)", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { var: "form.c" } },
      { id: "b", computedValue: { var: "form.a" } },
      { id: "c", computedValue: { var: "form.b" } },
    ];
    const cycles = detectComputedValueCycles(fields);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fieldIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("reports both cycles when two disjoint cycles exist", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { var: "form.b" } },
      { id: "b", computedValue: { var: "form.a" } },
      { id: "c", computedValue: { var: "form.d" } },
      { id: "d", computedValue: { var: "form.c" } },
    ];
    const cycles = detectComputedValueCycles(fields);
    expect(cycles).toHaveLength(2);
    const sortedCycles = cycles
      .map((c) => [...c.fieldIds].sort())
      .sort();
    expect(sortedCycles).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does NOT flag a cycle through visibleIf / requiredIf / validators", () => {
    const fields: fieldWithComputed[] = [{ id: "a" }, { id: "b" }];
    // No computedValue on either; visibleIf/etc. don't write so can't oscillate.
    expect(detectComputedValueCycles(fields)).toEqual([]);
  });

  it("does NOT flag a computedValue that references a non-computedValue field", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { "+": [{ var: "form.b" }, 1] } },
      { id: "b" },
    ];
    expect(detectComputedValueCycles(fields)).toEqual([]);
  });

  it("handles subpath references (form.a.x counts as a reference to a)", () => {
    const fields: fieldWithComputed[] = [
      { id: "a", computedValue: { var: "form.b.label" } },
      { id: "b", computedValue: { var: "form.a.value" } },
    ];
    const cycles = detectComputedValueCycles(fields);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fieldIds].sort()).toEqual(["a", "b"]);
  });

  it("handles a cycle nested inside a deep rule (if / and / or)", () => {
    const fields: fieldWithComputed[] = [
      {
        id: "a",
        computedValue: {
          if: [{ ">": [{ var: "form.b" }, 0] }, { var: "form.b" }, 0],
        },
      },
      {
        id: "b",
        computedValue: {
          if: [{ "==": [1, 1] }, { var: "form.a" }, 0],
        },
      },
    ];
    const cycles = detectComputedValueCycles(fields);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fieldIds].sort()).toEqual(["a", "b"]);
  });

  it("property: a field list with no computedValue rules never reports a cycle", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.string({ minLength: 1, maxLength: 6 }) }),
          { minLength: 0, maxLength: 8 },
        ),
        (fields) => {
          const seen = new Set<string>();
          const clean: fieldWithComputed[] = fields
            .filter((f) => {
              if (seen.has(f.id)) return false;
              seen.add(f.id);
              return true;
            })
            .map((f) => ({ id: f.id }));
          expect(detectComputedValueCycles(clean)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: a linear chain of any depth is never flagged", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), (depth) => {
        const fields: fieldWithComputed[] = [{ id: "f0" }];
        for (let i = 1; i < depth; i += 1) {
          fields.push({
            id: `f${i}`,
            computedValue: { "+": [{ var: `form.f${i - 1}` }, 1] },
          });
        }
        expect(detectComputedValueCycles(fields)).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});
