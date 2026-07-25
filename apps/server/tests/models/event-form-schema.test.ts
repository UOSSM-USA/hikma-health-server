import { describe, it, expect } from "vitest";
import { Either, Schema } from "effect";
import EventForm from "@/models/event-form";

/**
 * Regression tests pinning current decode/encode contract for EventForm.FieldSchema.
 *
 * The intent of these tests is to act as a tripwire when the underlying
 * implementation is migrated off Effect Schema (to ReScript decoders in
 * @hikmahealth/forms). We pin POSITIVE shapes — i.e., that valid wire shapes
 * decode/encode to the expected canonical objects — rather than pinning
 * specific failure modes (which we intentionally plan to relax during the
 * migration, e.g., making `_tag` optional).
 *
 * Fixtures are inferred from the current TS types in event-form.ts. They
 * may not exhaustively cover legacy production shapes (especially shapes
 * predating the introduction of `_tag` and option `id`).
 */

const decode = Schema.decodeUnknownEither(EventForm.FieldSchema);

const baseShape = {
  id: "f-1",
  name: "Field",
  description: "",
  required: false,
};

describe("FieldSchema decode — happy path per variant", () => {
  it("decodes a binary checkbox field", () => {
    const result = decode({
      ...baseShape,
      _tag: "binary",
      fieldType: "binary",
      inputType: "checkbox",
      options: [{ id: "o1", label: "Yes", value: "yes" }],
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.fieldType).toBe("binary");
      expect(result.right._tag).toBe("binary");
    }
  });

  it("decodes a free-text short field with units", () => {
    const result = decode({
      ...baseShape,
      _tag: "free-text",
      fieldType: "free-text",
      inputType: "text",
      length: "short",
      units: ["mg", "mL"],
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.fieldType).toBe("free-text");
      if (result.right._tag === "free-text") {
        expect(result.right.length).toBe("short");
        expect(result.right.units).toEqual(["mg", "mL"]);
      }
    }
  });

  // Note: a "textarea" long free-text variant is allowed by the TS type but
  // not by the current Effect Schema (the schema's inputType union omits
  // "textarea"). Treating that as a bug to fix during migration rather than
  // a contract to preserve, so no test pins it here.

  it("decodes a diagnosis field", () => {
    const result = decode({
      ...baseShape,
      _tag: "diagnosis",
      fieldType: "diagnosis",
      inputType: "select",
      options: [{ label: "Malaria", value: "malaria" }],
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.fieldType).toBe("diagnosis");
    }
  });

  it("decodes a date field", () => {
    const result = decode({
      ...baseShape,
      _tag: "date",
      fieldType: "date",
      inputType: "date",
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes an options field (multi=true select)", () => {
    const result = decode({
      ...baseShape,
      _tag: "options",
      fieldType: "options",
      inputType: "select",
      multi: true,
      options: [
        { id: "a", label: "A", value: "a" },
        { id: "b", label: "B", value: "b" },
      ],
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      if (result.right._tag === "options") {
        expect(result.right.multi).toBe(true);
        expect(result.right.options).toHaveLength(2);
      }
    }
  });

  it("decodes a medicine field with full nested fields", () => {
    const result = decode({
      ...baseShape,
      _tag: "medicine",
      fieldType: "medicine",
      inputType: "input-group",
      options: [],
      fields: {
        name: "amoxicillin",
        route: ["oral"],
        form: ["tablet"],
        frequency: "1",
        intervals: "8",
        dose: "500",
        doseUnits: ["mg"],
        duration: "7",
        durationUnits: ["days"],
      },
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes a file field with mime restrictions", () => {
    const result = decode({
      ...baseShape,
      _tag: "file",
      fieldType: "file",
      inputType: "file",
      allowedMimeTypes: ["image/png", "application/pdf"],
      multiple: true,
      minItems: 0,
      maxItems: 5,
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes a file field with null allowedMimeTypes (any mime)", () => {
    const result = decode({
      ...baseShape,
      _tag: "file",
      fieldType: "file",
      inputType: "file",
      allowedMimeTypes: null,
      multiple: false,
      minItems: 1,
      maxItems: 1,
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes a text display field at all sizes", () => {
    for (const size of EventForm.textDisplaySizes) {
      const result = decode({
        ...baseShape,
        _tag: "text",
        fieldType: "text",
        content: "Heading",
        size,
      });
      expect(Either.isRight(result)).toBe(true);
    }
  });

  it("decodes a separator field", () => {
    const result = decode({
      ...baseShape,
      _tag: "separator",
      fieldType: "separator",
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts options entries without an id (legacy shape)", () => {
    const result = decode({
      ...baseShape,
      _tag: "binary",
      fieldType: "binary",
      inputType: "radio",
      options: [{ label: "X", value: "x" }],
    });
    expect(Either.isRight(result)).toBe(true);
  });
});

describe("toSchema — encode all FieldData TaggedClass variants", () => {
  it("encodes BinaryField2", () => {
    const field = new EventForm.BinaryField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "checkbox",
      options: [{ id: "o1", label: "Yes", value: "yes" }],
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right._tag).toBe("binary");
      expect(result.right.fieldType).toBe("binary");
    }
  });

  it("encodes TextField2 (free-text)", () => {
    const field = new EventForm.TextField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "text",
      length: "short",
      units: ["mg"],
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.fieldType).toBe("free-text");
    }
  });

  it("encodes DiagnosisField2", () => {
    const field = new EventForm.DiagnosisField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "select",
      options: [{ label: "Cough", value: "cough" }],
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
  });

  it("encodes DateField2", () => {
    const field = new EventForm.DateField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "date",
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
  });

  it("encodes OptionsField2", () => {
    const field = new EventForm.OptionsField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "radio",
      multi: false,
      options: [{ id: "a", label: "A", value: "a" }],
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
  });

  it("encodes MedicineField2", () => {
    const field = new EventForm.MedicineField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "input-group",
      options: [{ id: "o", label: "L", value: "v" }],
      fields: {
        name: "x",
        route: ["oral"],
        form: ["tablet"],
        frequency: "1",
        intervals: "8",
        dose: "500",
        doseUnits: ["mg"],
        duration: "7",
        durationUnits: ["days"],
      },
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
  });
});

// ==========================================================================
// TOMBSTONE — commented out 2026-07-26 · DELETE AFTER 2027-01-26
//
// Retired with `EventForm.Fields` and the plain `HHField` type in
// `models/event-form.ts`. These four were the only remaining references to
// either, in the whole repo — the functions had no production callers.
//
// Coverage is not lost, it moved: `packages/hh-forms`' `EventForm.getUnitsOpt`
// is the live replacement and `packages/hh-forms/__tests__/event-form.test.ts`
// tests the same behaviours, including the source-order dedup asserted below.
//
// Worth noting on the way out: the `freeTextWithUnits` fixture below is exactly
// the shape that would have caught the 2026-07-26 `fieldType` regression — a
// `fieldType: "free-text"` literal against the union member that lost its
// discriminant. It didn't, because vitest strips types rather than checking
// them. That is the gap, not this fixture.
// ==========================================================================
//
// describe("Fields.hasUnits / Fields.getUnits", () => {
//   const freeTextWithUnits: EventForm.HHField = {
//     id: "f",
//     name: "Dose",
//     description: "",
//     required: false,
//     fieldType: "free-text",
//     inputType: "text",
//     length: "short",
//     units: ["mg", "g", "mg"],
//   };
//
//   const dateField: EventForm.HHField = {
//     id: "d",
//     name: "DOB",
//     description: "",
//     required: true,
//     fieldType: "date",
//     inputType: "date",
//   };
//
//   it("hasUnits is true for fields carrying a units property", () => {
//     expect(EventForm.Fields.hasUnits(freeTextWithUnits)).toBe(true);
//   });
//
//   it("hasUnits is false for fields without a units property", () => {
//     expect(EventForm.Fields.hasUnits(dateField)).toBe(false);
//   });
//
//   it("getUnits deduplicates units in source order", () => {
//     expect(EventForm.Fields.getUnits(freeTextWithUnits)).toEqual(["mg", "g"]);
//   });
//
//   it("getUnits returns [] for fields without units", () => {
//     expect(EventForm.Fields.getUnits(dateField)).toEqual([]);
//   });
// });

describe("FieldOptionSchema id is optional", () => {
  const decodeOpt = Schema.decodeUnknownEither(EventForm.FieldOptionSchema);

  it("accepts an option with id", () => {
    const result = decodeOpt({ id: "a", label: "A", value: "a" });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts an option without id (legacy)", () => {
    const result = decodeOpt({ label: "A", value: "a" });
    expect(Either.isRight(result)).toBe(true);
  });
});

describe("RESERVED_FIELD_NAMES", () => {
  it("contains diagnosis and medicine", () => {
    expect(EventForm.RESERVED_FIELD_NAMES).toContain("diagnosis");
    expect(EventForm.RESERVED_FIELD_NAMES).toContain("medicine");
  });
});

describe("sentinel field IDs", () => {
  it("FORM_NAME_FIELD_ID is stable", () => {
    expect(EventForm.FORM_NAME_FIELD_ID).toBe("__form_name__");
  });

  it("FORM_DESCRIPTION_FIELD_ID is stable", () => {
    expect(EventForm.FORM_DESCRIPTION_FIELD_ID).toBe("__form_description__");
  });
});

describe("FieldSchema decode — JSONLogic rule slots (additive)", () => {
  it("legacy field without any rule slots still decodes", () => {
    const result = decode({
      ...baseShape,
      _tag: "binary",
      fieldType: "binary",
      inputType: "checkbox",
      options: [{ label: "Yes", value: "yes" }],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("input-collecting field with all four rule slots decodes (binary)", () => {
    const result = decode({
      ...baseShape,
      _tag: "binary",
      fieldType: "binary",
      inputType: "checkbox",
      options: [{ label: "Yes", value: "yes" }],
      visibleIf: { ">=": [{ var: "form.age" }, 18] },
      requiredIf: { "==": [{ var: "form.has_consent" }, true] },
      validators: [
        { id: "v1", rule: { "!=": [{ var: "form.dob" }, null] }, message: "x" },
      ],
      computedValue: { "+": [1, 1] },
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result) && result.right._tag === "binary") {
      expect(result.right.visibleIf).toEqual({
        ">=": [{ var: "form.age" }, 18],
      });
      expect(result.right.validators?.[0]?.message).toBe("x");
    }
  });

  it("visibility-only field with visibleIf decodes (diagnosis)", () => {
    const result = decode({
      ...baseShape,
      _tag: "diagnosis",
      fieldType: "diagnosis",
      inputType: "select",
      options: [{ label: "Malaria", value: "malaria" }],
      visibleIf: { "==": [{ var: "form.consult_type" }, "intake"] },
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result) && result.right._tag === "diagnosis") {
      expect(result.right.visibleIf).toEqual({
        "==": [{ var: "form.consult_type" }, "intake"],
      });
    }
  });

  it("visibility-only field with visibleIf decodes (medicine)", () => {
    const result = decode({
      ...baseShape,
      _tag: "medicine",
      fieldType: "medicine",
      inputType: "input-group",
      options: [],
      fields: {
        name: "Amoxicillin",
        route: ["oral"],
        form: ["tablet"],
        frequency: "1",
        intervals: "8",
        dose: "500",
        doseUnits: ["mg"],
        duration: "7",
        durationUnits: ["days"],
      },
      visibleIf: { "==": [{ var: "form.prescribe" }, true] },
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("display-only field with visibleIf decodes (separator)", () => {
    const result = decode({
      ...baseShape,
      _tag: "separator",
      fieldType: "separator",
      visibleIf: { ">": [{ var: "form.score" }, 5] },
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("toSchema preserves all rule slots end-to-end (encode round-trip)", () => {
    // Guards the upsert path: Effect's Schema can silently drop fields it
    // doesn't declare. This pins that rule slots survive the
    // TaggedClass → encoded-JSON conversion that ultimately hits the
    // `form_fields` JSONB column.
    const field = new EventForm.BinaryField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "checkbox",
      options: [{ id: "o1", label: "Yes", value: "yes" }],
      visibleIf: { ">=": [{ var: "form.age" }, 18] },
      requiredIf: true,
      validators: [
        {
          id: "v1",
          rule: { "!=": [{ var: "form.dob" }, null] },
          message: "DOB required",
          code: "dob_required",
        },
      ],
      computedValue: { "+": [1, 1] },
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const encoded = result.right as Record<string, unknown>;
      expect(encoded.visibleIf).toEqual({
        ">=": [{ var: "form.age" }, 18],
      });
      expect(encoded.requiredIf).toBe(true);
      expect(encoded.validators).toEqual([
        {
          id: "v1",
          rule: { "!=": [{ var: "form.dob" }, null] },
          message: "DOB required",
          code: "dob_required",
        },
      ]);
      expect(encoded.computedValue).toEqual({ "+": [1, 1] });
    }
  });

  it("toSchema preserves visibleIf on visibility-only fields (diagnosis)", () => {
    const field = new EventForm.DiagnosisField2({
      id: "id",
      name: "n",
      description: "",
      required: false,
      inputType: "select",
      options: [{ label: "Cough", value: "cough" }],
      visibleIf: { "==": [{ var: "form.consult_type" }, "intake"] },
    });
    const result = EventForm.toSchema(field);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const encoded = result.right as Record<string, unknown>;
      expect(encoded.visibleIf).toEqual({
        "==": [{ var: "form.consult_type" }, "intake"],
      });
    }
  });
});
