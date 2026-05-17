import fc from "fast-check";
import { describe, it, expect } from "vitest";

import PatientRegistrationForm from "@/models/patient-registration-form";
import { joinCheckboxValues } from "@/lib/utils";
import { compileRules, type fieldWithRules } from "@hikmahealth/forms/Rules";

/**
 * Server-side rule-scope helpers. Mirrors mobile's
 * `patient-registration-form-rule-scope.test.ts` (with the addition of
 * the number / checkbox coercions at the scope boundary).
 */

type Field = PatientRegistrationForm.Field;

const baseField = (overrides: Partial<Field> = {}): Field => ({
  id: "f",
  position: 1,
  column: "given_name",
  label: { en: "First name" },
  fieldType: "text",
  options: [],
  required: false,
  baseField: false,
  visible: true,
  deleted: false,
  showsInSummary: true,
  isSearchField: false,
  ...overrides,
});

const ctx = { now: "2026-05-23T00:00:00Z", language: "en" };

// ---------------------------------------------------------------------------
// buildRuleScope
// ---------------------------------------------------------------------------

describe("PatientRegistrationForm.buildRuleScope", () => {
  it("keys form scope by field id, not column", () => {
    const fields: Field[] = [
      baseField({ id: "id-given", column: "given_name" }),
      baseField({ id: "id-sur", column: "surname" }),
    ];
    const scope = PatientRegistrationForm.buildRuleScope({
      fields,
      values: { "id-given": "Ada", "id-sur": "Lovelace" },
      ctx,
    });
    expect(scope.form).toEqual({ "id-given": "Ada", "id-sur": "Lovelace" });
    expect(scope.ctx).toBe(ctx);
  });

  it("drops orphan value keys whose fields are absent", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "a" })],
      values: { a: "kept", b: "dropped" },
      ctx,
    });
    expect(scope.form).toEqual({ a: "kept" });
  });

  it("number: coerces non-empty string to number", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "age", fieldType: "number" })],
      values: { age: "42" },
      ctx,
    });
    expect(scope.form.age).toBe(42);
  });

  it("number: passes through actual numbers untouched", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "age", fieldType: "number" })],
      values: { age: 42 },
      ctx,
    });
    expect(scope.form.age).toBe(42);
  });

  it("number: empty string becomes undefined", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "age", fieldType: "number" })],
      values: { age: "" },
      ctx,
    });
    expect(scope.form.age).toBeUndefined();
  });

  it("number: non-numeric string falls through as the raw string", () => {
    // Author-facing intent: a string like "twelve" won't match a
    // numeric `>=`, but a `==` against the literal string still could.
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "age", fieldType: "number" })],
      values: { age: "twelve" },
      ctx,
    });
    expect(scope.form.age).toBe("twelve");
  });

  it("checkbox: joined string is split into an array", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "langs", fieldType: "checkbox" })],
      values: { langs: joinCheckboxValues(["en", "sw", "ar"]) },
      ctx,
    });
    expect(scope.form.langs).toEqual(["en", "sw", "ar"]);
  });

  it("checkbox: array passes through unchanged", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "langs", fieldType: "checkbox" })],
      values: { langs: ["en", "sw"] },
      ctx,
    });
    expect(scope.form.langs).toEqual(["en", "sw"]);
  });

  it("date: Date object normalizes to local YYYY-MM-DD", () => {
    const d = new Date(2025, 0, 15); // 2025-01-15 local time
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "dob", fieldType: "date" })],
      values: { dob: d },
      ctx,
    });
    expect(scope.form.dob).toBe("2025-01-15");
  });

  it("date: string passes through unchanged", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [baseField({ id: "dob", fieldType: "date" })],
      values: { dob: "2025-01-15" },
      ctx,
    });
    expect(scope.form.dob).toBe("2025-01-15");
  });

  it("null and undefined values pass through (don't fall into coercion arms)", () => {
    const scope = PatientRegistrationForm.buildRuleScope({
      fields: [
        baseField({ id: "n", fieldType: "number" }),
        baseField({ id: "c", fieldType: "checkbox" }),
        baseField({ id: "d", fieldType: "date" }),
      ],
      values: { n: null, c: undefined, d: null },
      ctx,
    });
    expect(scope.form.n).toBeNull();
    expect(scope.form.c).toBeUndefined();
    expect(scope.form.d).toBeNull();
  });

  it("end-to-end: a number-coerced rule fires against a string value from RHF", () => {
    // The exact bug the number-coercion exists to prevent: without it,
    // {">=": [{var: "form.age"}, 18]} against "20" would compare strings
    // — works for some pairs, fails surprisingly for others (e.g. "9" >= 18).
    const fields: Field[] = [
      baseField({ id: "age", fieldType: "number" }),
      baseField({
        id: "guardian",
        column: "guardian_name",
        fieldType: "text",
        visibleIf: { "<": [{ var: "form.age" }, 18] },
      }),
    ];
    const ruleFields: fieldWithRules[] = fields.map((f) => ({
      id: f.id,
      required: f.required,
      visibleIf: f.visibleIf,
    }));
    const evaluator = compileRules(ruleFields);

    const eval9 = evaluator(
      PatientRegistrationForm.buildRuleScope({
        fields,
        values: { age: "9" },
        ctx,
      }),
    );
    expect(eval9.isVisible("guardian")).toBe(true);

    const eval20 = evaluator(
      PatientRegistrationForm.buildRuleScope({
        fields,
        values: { age: "20" },
        ctx,
      }),
    );
    expect(eval20.isVisible("guardian")).toBe(false);
  });

  it("end-to-end: a checkbox `in` rule fires against an array value (proves the split coercion reaches the engine)", () => {
    // Authors testing a checkbox-driven rule write something like
    // `{"in": ["en", {var: "form.langs"}]}`. Without the split-coercion
    // at the scope boundary, `form.langs` would be the joined string
    // "en\x1Fsw" — `in` would treat it as a substring search and the
    // rule would fire only on whole-string membership, never on
    // individual selections.
    const fields: Field[] = [
      baseField({ id: "langs", fieldType: "checkbox" }),
      baseField({
        id: "askEn",
        column: "ask_en",
        fieldType: "text",
        visibleIf: { in: ["en", { var: "form.langs" }] },
      }),
    ];
    const evaluator = compileRules(
      fields.map((f) => ({ id: f.id, required: f.required, visibleIf: f.visibleIf })),
    );

    const evalNoEn = evaluator(
      PatientRegistrationForm.buildRuleScope({
        fields,
        values: { langs: joinCheckboxValues(["sw", "ar"]) },
        ctx,
      }),
    );
    expect(evalNoEn.isVisible("askEn")).toBe(false);

    const evalHasEn = evaluator(
      PatientRegistrationForm.buildRuleScope({
        fields,
        values: { langs: joinCheckboxValues(["en", "sw"]) },
        ctx,
      }),
    );
    expect(evalHasEn.isVisible("askEn")).toBe(true);
  });

  it("scope keys are bounded by declared fields (property)", () => {
    // Pumping arbitrary extra keys into `values` must never leak into
    // the scope — orphans are dropped at the boundary.
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string()),
        (extra) => {
          const fields = [baseField({ id: "kept" })];
          const scope = PatientRegistrationForm.buildRuleScope({
            fields,
            values: { kept: "x", ...extra },
            ctx,
          });
          const orphans = Object.keys(scope.form).filter((k) => k !== "kept");
          return orphans.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// getMissingRequiredFields
// ---------------------------------------------------------------------------

describe("PatientRegistrationForm.getMissingRequiredFields", () => {
  it("no evaluation: enforces static `required` flag", () => {
    const fields = [
      baseField({ id: "a", required: true, label: { en: "Alpha" } }),
      baseField({ id: "b", required: false, label: { en: "Bravo" } }),
    ];
    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: { a: "", b: "" },
    });
    expect(missing).toEqual(["Alpha"]);
  });

  it("treats undefined / null / whitespace-only strings as missing", () => {
    const fields = [
      baseField({ id: "a", required: true, label: { en: "A" } }),
      baseField({ id: "b", required: true, label: { en: "B" } }),
      baseField({ id: "c", required: true, label: { en: "C" } }),
      baseField({ id: "d", required: true, label: { en: "D" } }),
    ];
    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: { a: undefined, b: null, c: "   ", d: "filled" },
    });
    expect(missing).toEqual(["A", "B", "C"]);
  });

  it("treats 0 / false / Date as present", () => {
    const fields = [
      baseField({ id: "n", required: true, fieldType: "number", label: { en: "N" } }),
      baseField({ id: "b", required: true, fieldType: "boolean", label: { en: "B" } }),
      baseField({ id: "d", required: true, fieldType: "date", label: { en: "D" } }),
    ];
    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: { n: 0, b: false, d: new Date() },
    });
    expect(missing).toEqual([]);
  });

  it("skips invisible (admin-flag) and deleted fields", () => {
    const fields = [
      baseField({ id: "hidden", required: true, visible: false, label: { en: "Hidden" } }),
      baseField({ id: "del", required: true, deleted: true, label: { en: "Deleted" } }),
      baseField({ id: "kept", required: true, label: { en: "Kept" } }),
    ];
    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: {},
    });
    expect(missing).toEqual(["Kept"]);
  });

  it("with evaluation: rule-hidden fields are skipped before required check", () => {
    const fields = [
      baseField({
        id: "a",
        required: true,
        label: { en: "A" },
        visibleIf: { "==": [1, 0] }, // never visible
      }),
      baseField({ id: "b", required: true, label: { en: "B" } }),
    ];
    const evaluator = compileRules(
      fields.map((f) => ({
        id: f.id,
        required: f.required,
        visibleIf: f.visibleIf,
      })),
    );
    const evaluation = evaluator({ form: {}, ctx });

    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: {},
      evaluation,
    });
    expect(missing).toEqual(["B"]);
  });

  it("with evaluation: requiredIf overrides static required flag", () => {
    const fields = [
      baseField({
        id: "guardian",
        required: false, // static says not required
        label: { en: "Guardian" },
        requiredIf: { "<": [{ var: "form.age" }, 18] },
      }),
      baseField({ id: "age", required: false, fieldType: "number", label: { en: "Age" } }),
    ];
    const evaluator = compileRules(
      fields.map((f) => ({
        id: f.id,
        required: f.required,
        visibleIf: f.visibleIf,
        requiredIf: f.requiredIf,
      })),
    );

    const evalMinor = evaluator({ form: { age: 9 }, ctx });
    expect(
      PatientRegistrationForm.getMissingRequiredFields({
        fields,
        values: { age: 9 },
        evaluation: evalMinor,
      }),
    ).toEqual(["Guardian"]);

    const evalAdult = evaluator({ form: { age: 30 }, ctx });
    expect(
      PatientRegistrationForm.getMissingRequiredFields({
        fields,
        values: { age: 30 },
        evaluation: evalAdult,
      }),
    ).toEqual([]);
  });

  it("falls back to column when label.en is empty", () => {
    const fields = [
      baseField({
        id: "a",
        required: true,
        column: "fallback_col",
        label: { en: "" },
      }),
    ];
    const missing = PatientRegistrationForm.getMissingRequiredFields({
      fields,
      values: {},
    });
    expect(missing).toEqual(["fallback_col"]);
  });
});

// ---------------------------------------------------------------------------
// computeNewlyHidden
// ---------------------------------------------------------------------------

describe("PatientRegistrationForm.computeNewlyHidden", () => {
  const evalWithHidden = (hiddenIds: ReadonlyArray<string>, fields: Field[]) => {
    const evaluator = compileRules(
      fields.map((f) => ({
        id: f.id,
        required: f.required,
        visibleIf: hiddenIds.includes(f.id) ? { "==": [1, 0] } : undefined,
      })),
    );
    return evaluator({ form: {}, ctx });
  };

  it("empty case: no fields, no diff", () => {
    const evaluator = compileRules([]);
    const evaluation = evaluator({ form: {}, ctx });
    const r = PatientRegistrationForm.computeNewlyHidden({
      fields: [],
      evaluation,
      previouslyHidden: new Set(),
    });
    expect(r.nowHidden.size).toBe(0);
    expect(r.newlyHidden).toEqual([]);
  });

  it("visible→hidden transition surfaces in newlyHidden", () => {
    const fields = [baseField({ id: "a" })];
    const evaluation = evalWithHidden(["a"], fields);
    const r = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: new Set(),
    });
    expect(Array.from(r.nowHidden)).toEqual(["a"]);
    expect(r.newlyHidden.map((f) => f.id)).toEqual(["a"]);
  });

  it("already-hidden field does NOT re-surface", () => {
    const fields = [baseField({ id: "a" })];
    const evaluation = evalWithHidden(["a"], fields);
    const r = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: new Set(["a"]),
    });
    expect(Array.from(r.nowHidden)).toEqual(["a"]);
    expect(r.newlyHidden).toEqual([]);
  });

  it("hidden→visible removes from nowHidden (and not in newlyHidden)", () => {
    const fields = [baseField({ id: "a" })];
    const evaluation = evalWithHidden([], fields); // a is visible now
    const r = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: new Set(["a"]),
    });
    expect(r.nowHidden.size).toBe(0);
    expect(r.newlyHidden).toEqual([]);
  });

  it("loop-termination: applying nowHidden as the next previouslyHidden produces empty newlyHidden", () => {
    const fields = [baseField({ id: "a" }), baseField({ id: "b" })];
    const evaluation = evalWithHidden(["a", "b"], fields);

    const first = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: new Set(),
    });
    expect(first.newlyHidden.map((f) => f.id).sort()).toEqual(["a", "b"]);

    const second = PatientRegistrationForm.computeNewlyHidden({
      fields,
      evaluation,
      previouslyHidden: first.nowHidden,
    });
    expect(second.newlyHidden).toEqual([]);
  });
});
