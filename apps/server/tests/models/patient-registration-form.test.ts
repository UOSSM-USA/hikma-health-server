import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { Option } from "effect";
import PatientRegistrationForm from "@/models/patient-registration-form";

/**
 * Regression tests for PatientRegistrationForm.
 *
 * Acts as a tripwire when the underlying implementation is migrated to
 * ReScript decoders in @hikmahealth/forms. We pin positive behaviors
 * (round-trip shapes, value rendering across all input types) rather than
 * specific failure paths.
 */

const baseField = (
  overrides: Partial<PatientRegistrationForm.Field> = {},
): PatientRegistrationForm.Field => ({
  id: "f",
  position: 1,
  column: "given_name",
  label: { en: "First name" },
  fieldType: "text",
  options: [],
  required: true,
  baseField: true,
  visible: true,
  deleted: false,
  showsInSummary: true,
  isSearchField: false,
  ...overrides,
});

describe("inputTypes constant", () => {
  it("contains the five known input types in fixed order", () => {
    expect(PatientRegistrationForm.inputTypes).toEqual([
      "number",
      "text",
      "select",
      "checkbox",
      "date",
    ]);
  });
});

describe("fromDbEntry", () => {
  const now = new Date("2025-01-15T10:00:00Z");

  it("wraps nullable strings in Option", () => {
    const entry = {
      id: "abc",
      clinic_id: "c1",
      name: "My Form",
      fields: [],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    } as PatientRegistrationForm.Table.PatientRegistrationForms;

    const t = PatientRegistrationForm.fromDbEntry(entry);
    expect(Option.isSome(t.clinic_id)).toBe(true);
    if (Option.isSome(t.clinic_id)) {
      expect(t.clinic_id.value).toBe("c1");
    }
    expect(Option.isSome(t.name)).toBe(true);
    expect(Option.isNone(t.deleted_at)).toBe(true);
  });

  it("treats null clinic_id as None", () => {
    const entry = {
      id: "abc",
      clinic_id: null,
      name: "n",
      fields: [],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    } as PatientRegistrationForm.Table.PatientRegistrationForms;

    const t = PatientRegistrationForm.fromDbEntry(entry);
    expect(Option.isNone(t.clinic_id)).toBe(true);
  });

  it("decodeURI-decodes label, option, and column strings", () => {
    const encodedLabel = encodeURI("Date of birth");
    const encodedOption = encodeURI("Option A");
    const encodedColumn = encodeURI("given_name");

    const entry = {
      id: "abc",
      clinic_id: null,
      name: encodeURI("My Form"),
      fields: [
        {
          id: "f1",
          position: 1,
          column: encodedColumn,
          label: { en: encodedLabel } as any,
          fieldType: "select",
          options: [{ en: encodedOption } as any],
          required: true,
          baseField: true,
          visible: true,
          deleted: false,
          showsInSummary: true,
          isSearchField: false,
        },
      ],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    } as PatientRegistrationForm.Table.PatientRegistrationForms;

    const t = PatientRegistrationForm.fromDbEntry(entry);
    expect(t.fields[0].column).toBe("given_name");
    expect(t.fields[0].label.en).toBe("Date of birth");
    expect((t.fields[0].options[0] as any).en).toBe("Option A");
  });

  it("converts created/updated timestamps to Date instances", () => {
    const entry = {
      id: "abc",
      clinic_id: null,
      name: "n",
      fields: [],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    } as PatientRegistrationForm.Table.PatientRegistrationForms;

    const t = PatientRegistrationForm.fromDbEntry(entry);
    expect(t.created_at).toBeInstanceOf(Date);
    expect(t.updated_at).toBeInstanceOf(Date);
    expect(t.last_modified).toBeInstanceOf(Date);
    expect(t.server_created_at).toBeInstanceOf(Date);
  });
});

describe("renderFieldValue — baseField branch", () => {
  // Unit Separator used as the checkbox value delimiter (matches
  // CHECKBOX_SEPARATOR in apps/server/src/lib/utils.ts).
  const US = "\x1F";

  describe("number", () => {
    const f = baseField({ fieldType: "number" });

    it("returns the number unchanged when parseable", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, 42)).toBe(42);
      expect(PatientRegistrationForm.renderFieldValue(f, "42")).toBe(42);
      expect(PatientRegistrationForm.renderFieldValue(f, "42.5")).toBe(42.5);
    });

    it("returns String(value) when Number(value) is NaN", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, "abc")).toBe("abc");
    });

    it("treats null as 0 (Number(null) === 0)", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, null)).toBe(0);
    });

    it("treats undefined as 'undefined' (Number(undefined) is NaN)", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, undefined)).toBe(
        "undefined",
      );
    });

    it("treats empty string as 0", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, "")).toBe(0);
    });

    it("treats true as 1 and false as 0", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, true)).toBe(1);
      expect(PatientRegistrationForm.renderFieldValue(f, false)).toBe(0);
    });
  });

  describe("boolean", () => {
    const f = baseField({ fieldType: "boolean" });

    it("returns true for truthy, false for falsy (JS Boolean semantics)", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, true)).toBe(true);
      expect(PatientRegistrationForm.renderFieldValue(f, false)).toBe(false);
      expect(PatientRegistrationForm.renderFieldValue(f, 1)).toBe(true);
      expect(PatientRegistrationForm.renderFieldValue(f, 0)).toBe(false);
      expect(PatientRegistrationForm.renderFieldValue(f, "")).toBe(false);
      expect(PatientRegistrationForm.renderFieldValue(f, "x")).toBe(true);
      expect(PatientRegistrationForm.renderFieldValue(f, null)).toBe(false);
      expect(PatientRegistrationForm.renderFieldValue(f, undefined)).toBe(
        false,
      );
    });
  });

  describe("date", () => {
    const f = baseField({ fieldType: "date" });

    it("formats valid date string as yyyy-MM-dd", () => {
      expect(
        PatientRegistrationForm.renderFieldValue(f, "2025-01-15T10:00:00Z"),
      ).toBe("2025-01-15");
    });

    it("returns the raw string for an unparseable date", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, "not-a-date")).toBe(
        "not-a-date",
      );
    });

    it("treats null as epoch — output is local-tz yyyy-MM-dd of epoch UTC", () => {
      // new Date(null) === epoch UTC; date-fns.format uses local TZ. The
      // exact calendar date is TZ-dependent (UTC → 1970-01-01,
      // PST → 1969-12-31). Assert format only.
      expect(
        PatientRegistrationForm.renderFieldValue(f, null) as string,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("text and select", () => {
    it("text coerces with String()", () => {
      const f = baseField({ fieldType: "text" });
      expect(PatientRegistrationForm.renderFieldValue(f, "hello")).toBe(
        "hello",
      );
      expect(PatientRegistrationForm.renderFieldValue(f, 123)).toBe("123");
      expect(PatientRegistrationForm.renderFieldValue(f, null)).toBe("null");
      expect(PatientRegistrationForm.renderFieldValue(f, true)).toBe("true");
    });

    it("select coerces with String() identically to text", () => {
      const f = baseField({ fieldType: "select" });
      expect(PatientRegistrationForm.renderFieldValue(f, "opt-a")).toBe(
        "opt-a",
      );
      expect(PatientRegistrationForm.renderFieldValue(f, null)).toBe("null");
    });
  });

  describe("checkbox (Unit Separator delimited)", () => {
    const f = baseField({ fieldType: "checkbox" });

    it("splits on \\x1F and joins with comma-space", () => {
      expect(
        PatientRegistrationForm.renderFieldValue(f, `a${US}b${US}c`),
      ).toBe("a, b, c");
    });

    it("returns empty string for empty input", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, "")).toBe("");
    });

    it("filters out empty segments from adjacent separators", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, `a${US}${US}b`)).toBe(
        "a, b",
      );
    });

    it("does NOT split on commas — legacy comma-separated stays intact", () => {
      expect(PatientRegistrationForm.renderFieldValue(f, "a,b,c")).toBe(
        "a,b,c",
      );
    });
  });
});

describe("renderFieldValue — non-baseField (additional attribute) branch", () => {
  const additional = (
    overrides: Partial<PatientRegistrationForm.Field> = {},
  ): PatientRegistrationForm.Field => baseField({ baseField: false, ...overrides });

  it("reads number_value for number fields", () => {
    const f = additional({ fieldType: "number" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: 5,
        string_value: null,
        boolean_value: null,
        date_value: null,
      }),
    ).toBe(5);
  });

  it("reads boolean_value for boolean fields", () => {
    const f = additional({ fieldType: "boolean" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: null,
        boolean_value: true,
        date_value: null,
      }),
    ).toBe(true);
  });

  it("reads date_value and formats it", () => {
    const f = additional({ fieldType: "date" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: null,
        boolean_value: null,
        date_value: "2025-01-15T10:00:00Z",
      }),
    ).toBe("2025-01-15");
  });

  it("reads string_value for text fields", () => {
    const f = additional({ fieldType: "text" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: "hi",
        boolean_value: null,
        date_value: null,
      }),
    ).toBe("hi");
  });

  it("reads string_value for select fields", () => {
    const f = additional({ fieldType: "select" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: "opt",
        boolean_value: null,
        date_value: null,
      }),
    ).toBe("opt");
  });

  it("joins checkbox string_value on \\x1F", () => {
    const f = additional({ fieldType: "checkbox" });
    const out = PatientRegistrationForm.renderFieldValue(f, {
      number_value: null,
      string_value: `x\x1Fy\x1Fz`,
      boolean_value: null,
      date_value: null,
    });
    expect(out).toBe("x, y, z");
  });

  it("treats null number_value as 0 (Number(null) === 0)", () => {
    const f = additional({ fieldType: "number" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: null,
        boolean_value: null,
        date_value: null,
      }),
    ).toBe(0);
  });

  it("treats null boolean_value as false (Boolean(null))", () => {
    const f = additional({ fieldType: "boolean" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: null,
        boolean_value: null,
        date_value: null,
      }),
    ).toBe(false);
  });

  it("treats null date_value as epoch — local-tz yyyy-MM-dd", () => {
    const f = additional({ fieldType: "date" });
    expect(
      PatientRegistrationForm.renderFieldValue(f, {
        number_value: null,
        string_value: null,
        boolean_value: null,
        date_value: null,
      }) as string,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("renderFieldValue — error fallback", () => {
  it("returns JSON.stringify on unexpected fieldType in default branch", () => {
    const f = baseField({ fieldType: "unknown" as never });
    expect(PatientRegistrationForm.renderFieldValue(f, { a: 1 })).toBe(
      JSON.stringify({ a: 1 }),
    );
  });
});

describe("Table metadata", () => {
  it("exposes the server and mobile table names", () => {
    expect(PatientRegistrationForm.Table.name).toBe("patient_registration_forms");
    expect(PatientRegistrationForm.Table.mobileName).toBe("registration_forms");
  });

  it("ALWAYS_PUSH_TO_MOBILE remains false (registration is not always-pushed)", () => {
    expect(PatientRegistrationForm.Table.ALWAYS_PUSH_TO_MOBILE).toBe(false);
  });
});

describe("fromDbEntry — preserves rule slots end-to-end", () => {
  it("round-trips a stored field with all four rule slots intact", () => {
    const now = new Date("2025-01-15T10:00:00Z");
    const fieldWithRules: PatientRegistrationForm.Field = baseField({
      visibleIf: { ">=": [{ var: "form.age" }, 18] },
      requiredIf: { "==": [{ var: "form.has_consent" }, true] },
      validators: [
        {
          id: "v1",
          rule: { "!=": [{ var: "form.dob" }, null] },
          message: "DOB required",
          code: "dob_required",
        },
      ],
      computedValue: { "*": [{ var: "form.x" }, 2] },
    });
    const entry = {
      id: "abc",
      clinic_id: null,
      name: "Reg Form",
      fields: [fieldWithRules],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    };
    const decoded = PatientRegistrationForm.fromDbEntry(entry);
    const [first] = decoded.fields;
    expect(first?.visibleIf).toEqual({ ">=": [{ var: "form.age" }, 18] });
    expect(first?.requiredIf).toEqual({
      "==": [{ var: "form.has_consent" }, true],
    });
    expect(first?.validators).toHaveLength(1);
    expect(first?.validators?.[0]?.code).toBe("dob_required");
    expect(first?.computedValue).toEqual({ "*": [{ var: "form.x" }, 2] });
  });

  it("preserves rule slots across the full JSON.stringify → JSON.parse pipeline (mirrors JSONB write/read)", () => {
    // Production stores `fields` as `JSON.stringify(...)::jsonb`. The
    // pg driver auto-parses JSONB on read, so the practical pipeline
    // is `stringify` on insert and `parse`-equivalent on select. This
    // closes the gap left by `fromDbEntry` being tested only against
    // an already-parsed JS object.
    const now = new Date("2025-01-15T10:00:00Z");
    const slots: Pick<
      PatientRegistrationForm.Field,
      "visibleIf" | "requiredIf" | "validators" | "computedValue"
    > = {
      visibleIf: { ">=": [{ var: "form.age" }, 18] },
      requiredIf: { "==": [{ var: "form.has_consent" }, true] },
      validators: [
        {
          id: "v1",
          rule: { "!=": [{ var: "form.dob" }, null] },
          message: "DOB required",
          code: "dob_required",
        },
        // Validator without optional `code` — covers the absent-key
        // serialization edge case.
        {
          id: "v2",
          rule: { ">=": [{ var: "form.age" }, 0] },
          message: "no negative ages",
        },
      ],
      computedValue: { "+": [{ var: "form.x" }, 1] },
    };
    const entry = {
      id: "abc",
      clinic_id: null,
      name: "Reg Form",
      fields: [baseField(slots)],
      metadata: {},
      is_deleted: false,
      created_at: now,
      updated_at: now,
      last_modified: now,
      server_created_at: now,
      deleted_at: null,
    };

    // The write→read round-trip JSON.stringify/parse only touches
    // `fields` (other columns are timestamp/text/jsonb-of-metadata).
    const fieldsRoundTripped = JSON.parse(
      JSON.stringify(entry.fields),
    ) as typeof entry.fields;
    const decoded = PatientRegistrationForm.fromDbEntry({
      ...entry,
      fields: fieldsRoundTripped,
    });

    const [first] = decoded.fields;
    expect(first?.visibleIf).toEqual(slots.visibleIf);
    expect(first?.requiredIf).toEqual(slots.requiredIf);
    expect(first?.validators).toEqual(slots.validators);
    expect(first?.computedValue).toEqual(slots.computedValue);

    // `code` was absent on validator v2 — must not surface as
    // `code: undefined` post-roundtrip (would change deep-equality).
    expect("code" in (first?.validators?.[1] ?? {})).toBe(false);
  });

  it("property: arbitrary JSONLogic in rule slots survives JSON pass-through", () => {
    // Bounded-depth arbitrary mirroring operators authored via the
    // form-builder UI. Fast-check shrinks failures to the smallest
    // offending shape if anything regresses.
    const jsonLogicArb = fc.letrec((tie) => ({
      rule: fc.oneof(
        { maxDepth: 4 },
        fc.integer({ min: -100, max: 100 }),
        fc.boolean(),
        fc.constant(null),
        fc.string({ minLength: 0, maxLength: 6 }),
        fc.record({
          var: fc.constantFrom("form.a", "form.b", "form.c"),
        }),
        fc.record({ "==": fc.tuple(tie("rule"), tie("rule")) }),
        fc.record({ "!=": fc.tuple(tie("rule"), tie("rule")) }),
        fc.record({ ">=": fc.tuple(tie("rule"), tie("rule")) }),
        fc.record({ "+": fc.tuple(tie("rule"), tie("rule")) }),
        fc.record({
          and: fc.array(tie("rule"), { minLength: 2, maxLength: 3 }),
        }),
        fc.record({ "!": tie("rule") }),
      ),
    })).rule as fc.Arbitrary<unknown>;

    fc.assert(
      fc.property(jsonLogicArb, jsonLogicArb, (visibleIf, computedValue) => {
        const original = baseField({ visibleIf, computedValue });
        const roundTripped = JSON.parse(JSON.stringify([original]));
        const decoded = PatientRegistrationForm.fromDbEntry({
          id: "x",
          clinic_id: null,
          name: "n",
          fields: roundTripped,
          metadata: {},
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date(),
          server_created_at: new Date(),
          deleted_at: null,
        });
        expect(decoded.fields[0]?.visibleIf).toEqual(visibleIf);
        expect(decoded.fields[0]?.computedValue).toEqual(computedValue);
      }),
      { numRuns: 60 },
    );
  });
});

describe("Field — JSONLogic rule slots (additive)", () => {
  it("accepts a field without any rule slots (legacy shape)", () => {
    const f = baseField();
    expect(f.visibleIf).toBeUndefined();
    expect(f.requiredIf).toBeUndefined();
    expect(f.validators).toBeUndefined();
    expect(f.computedValue).toBeUndefined();
  });

  it("carries all four optional rule slots when populated", () => {
    const f = baseField({
      visibleIf: { ">=": [{ var: "form.age" }, 18] },
      requiredIf: { "==": [{ var: "form.has_consent" }, true] },
      validators: [
        {
          id: "v1",
          rule: { "!=": [{ var: "form.dob" }, null] },
          message: "Date of birth is required",
          code: "dob_required",
        },
      ],
      computedValue: { "*": [{ var: "form.height_m" }, { var: "form.height_m" }] },
    });
    expect(f.visibleIf).toEqual({ ">=": [{ var: "form.age" }, 18] });
    expect(f.requiredIf).toEqual({
      "==": [{ var: "form.has_consent" }, true],
    });
    expect(f.validators).toHaveLength(1);
    expect(f.validators?.[0]?.code).toBe("dob_required");
    expect(f.computedValue).toEqual({
      "*": [{ var: "form.height_m" }, { var: "form.height_m" }],
    });
  });
});
