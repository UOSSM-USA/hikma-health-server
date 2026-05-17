import { describe, it, expect } from "vitest";
import {
  decode,
  decodeMany,
  encode,
  getFieldTag,
  getUnitsOpt,
  type field,
} from "../src/EventForm.gen";

/**
 * Parity tests against the generated TypeScript surface of EventForm.res.
 *
 * Goal: assert that the same wire shapes the server's Effect Schema
 * tolerates also decode through the ReScript module to objects with the
 * expected structure. Without these, a future swap on the server can drift
 * silently.
 */

const baseShape = {
  id: "f-1",
  name: "Field",
  description: "",
  required: false,
};

describe("EventForm.decode — happy path per variant", () => {
  it("decodes a binary checkbox field", () => {
    const r = decode({
      ...baseShape,
      fieldType: "binary",
      inputType: "checkbox",
      options: [{ id: "o1", label: "Yes", value: "yes" }],
    });
    expect(r.TAG).toBe("Ok");
    if (r.TAG === "Ok" && r._0.fieldType === "binary") {
      expect(r._0.inputType).toBe("checkbox");
      expect(r._0.options).toHaveLength(1);
    }
  });

  it("decodes a free-text short text field with units", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "short",
      units: ["mg", "mL"],
    });
    expect(r.TAG).toBe("Ok");
    if (r.TAG === "Ok" && r._0.fieldType === "free-text") {
      expect(r._0.length).toBe("short");
      expect(r._0.units).toEqual(["mg", "mL"]);
    }
  });

  it("decodes a free-text long textarea field (textarea bug fixed)", () => {
    // The current Effect Schema rejects this shape; the ReScript decoder
    // accepts it because the TS type promises textarea+long is valid.
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "textarea",
      length: "long",
      units: [],
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes a diagnosis field", () => {
    const r = decode({
      ...baseShape,
      fieldType: "diagnosis",
      inputType: "select",
      options: [{ label: "Malaria", value: "malaria" }],
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes a date field", () => {
    const r = decode({
      ...baseShape,
      fieldType: "date",
      inputType: "date",
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes an options multi-select field", () => {
    const r = decode({
      ...baseShape,
      fieldType: "options",
      inputType: "select",
      multi: true,
      options: [
        { id: "a", label: "A", value: "a" },
        { id: "b", label: "B", value: "b" },
      ],
    });
    expect(r.TAG).toBe("Ok");
    if (r.TAG === "Ok" && r._0.fieldType === "options") {
      expect(r._0.multi).toBe(true);
      expect(r._0.options).toHaveLength(2);
    }
  });

  it("decodes a medicine field with nested sub-fields", () => {
    const r = decode({
      ...baseShape,
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
    expect(r.TAG).toBe("Ok");
  });

  it("decodes a file field with mime restrictions and bounds", () => {
    const r = decode({
      ...baseShape,
      fieldType: "file",
      inputType: "file",
      allowedMimeTypes: ["image/png", "application/pdf"],
      multiple: true,
      minItems: 0,
      maxItems: 5,
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes a file field with null allowedMimeTypes (any)", () => {
    const r = decode({
      ...baseShape,
      fieldType: "file",
      inputType: "file",
      allowedMimeTypes: null,
      multiple: false,
      minItems: 1,
      maxItems: 1,
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes text display field at all sizes", () => {
    for (const size of ["xxl", "xl", "lg", "md", "sm"] as const) {
      const r = decode({
        ...baseShape,
        fieldType: "text",
        content: "Heading",
        size,
      });
      expect(r.TAG).toBe("Ok");
    }
  });

  it("decodes a separator field", () => {
    const r = decode({
      ...baseShape,
      fieldType: "separator",
    });
    expect(r.TAG).toBe("Ok");
  });

  it("decodes options entries without an id (legacy)", () => {
    const r = decode({
      ...baseShape,
      fieldType: "binary",
      inputType: "radio",
      options: [{ label: "X", value: "x" }],
    });
    expect(r.TAG).toBe("Ok");
  });

  it("tolerates a legacy `_tag` field (ignored)", () => {
    const r = decode({
      ...baseShape,
      _tag: "binary",
      fieldType: "binary",
      inputType: "checkbox",
      options: [],
    });
    expect(r.TAG).toBe("Ok");
  });
});

describe("EventForm.decode — error cases", () => {
  it("rejects an unknown fieldType", () => {
    const r = decode({
      ...baseShape,
      fieldType: "nope",
    });
    expect(r.TAG).toBe("Error");
    if (r.TAG === "Error") {
      expect(r._0).toContain("unknown fieldType");
    }
  });

  it("rejects a missing fieldType", () => {
    const r = decode({ ...baseShape });
    expect(r.TAG).toBe("Error");
  });

  it("rejects non-object JSON", () => {
    expect(decode("string").TAG).toBe("Error");
    expect(decode(42).TAG).toBe("Error");
    expect(decode(null).TAG).toBe("Error");
  });
});

describe("EventForm.encode round-trip", () => {
  it("encode after decode preserves the wire shape", () => {
    const wire = {
      ...baseShape,
      fieldType: "options",
      inputType: "checkbox",
      multi: false,
      options: [{ id: "a", label: "A", value: "a" }],
    };
    const decoded = decode(wire);
    expect(decoded.TAG).toBe("Ok");
    if (decoded.TAG === "Ok") {
      const back = encode(decoded._0);
      expect(back).toEqual(wire);
    }
  });
});

describe("EventForm.decodeMany", () => {
  it("returns Ok with all decoded fields when every blob is valid", () => {
    const r = decodeMany([
      { ...baseShape, id: "a", fieldType: "date", inputType: "date" },
      {
        ...baseShape,
        id: "b",
        fieldType: "binary",
        inputType: "radio",
        options: [],
      },
    ]);
    expect(r.TAG).toBe("Ok");
    if (r.TAG === "Ok") {
      expect(r._0).toHaveLength(2);
    }
  });

  it("returns Error with the index of the first failure", () => {
    const r = decodeMany([
      { ...baseShape, id: "a", fieldType: "date", inputType: "date" },
      { ...baseShape, id: "b", fieldType: "nope" },
    ]);
    expect(r.TAG).toBe("Error");
    if (r.TAG === "Error") {
      expect(r._0).toContain("field 1");
    }
  });
});

describe("EventForm helpers", () => {
  it("getFieldTag returns the discriminator string", () => {
    const r = decode({
      ...baseShape,
      fieldType: "medicine",
      inputType: "input-group",
      options: [],
      fields: {
        name: "x",
        route: [],
        form: [],
        frequency: "",
        intervals: "",
        dose: "",
        doseUnits: [],
        duration: "",
        durationUnits: [],
      },
    });
    if (r.TAG === "Ok") {
      expect(getFieldTag(r._0)).toBe("medicine");
    }
  });

  it("getUnitsOpt returns Some for free-text with units, undefined otherwise", () => {
    const withUnits = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "short",
      units: ["mg"],
    });
    const noUnits = decode({
      ...baseShape,
      fieldType: "date",
      inputType: "date",
    });
    if (withUnits.TAG === "Ok") {
      expect(getUnitsOpt(withUnits._0)).toEqual(["mg"]);
    }
    if (noUnits.TAG === "Ok") {
      expect(getUnitsOpt(noUnits._0)).toBeUndefined();
    }
  });

  it("getUnitsOpt deduplicates in source order", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "short",
      units: ["mg", "g", "mg", "mcg"],
    });
    if (r.TAG === "Ok") {
      expect(getUnitsOpt(r._0)).toEqual(["mg", "g", "mcg"]);
    }
  });

  it("getUnitsOpt distinguishes Some([]) (explicit empty) from undefined (absent)", () => {
    const explicit = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "textarea",
      length: "long",
      units: [],
    });
    const absent = decode({
      ...baseShape,
      fieldType: "date",
      inputType: "date",
    });
    if (explicit.TAG === "Ok") expect(getUnitsOpt(explicit._0)).toEqual([]);
    if (absent.TAG === "Ok") expect(getUnitsOpt(absent._0)).toBeUndefined();
  });

  it("getUnitsOpt is undefined for a free-text field with no `units` key", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "short",
    });
    if (r.TAG === "Ok") expect(getUnitsOpt(r._0)).toBeUndefined();
  });
});

describe("EventForm.decode — strict per-variant validation", () => {
  it("rejects an invalid binary inputType", () => {
    const r = decode({
      ...baseShape,
      fieldType: "binary",
      inputType: "garbage",
      options: [],
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects a binary field missing options", () => {
    const r = decode({
      ...baseShape,
      fieldType: "binary",
      inputType: "checkbox",
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects free-text with text + length=long (cross-field invariant)", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "long",
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects free-text with textarea + length=short (cross-field invariant)", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "textarea",
      length: "short",
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects free-text with a non-unit string in units", () => {
    const r = decode({
      ...baseShape,
      fieldType: "free-text",
      inputType: "text",
      length: "short",
      units: ["mg", "not-a-unit"],
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects options with inputType=radio + multi=true (cross-field invariant)", () => {
    const r = decode({
      ...baseShape,
      fieldType: "options",
      inputType: "radio",
      multi: true,
      options: [],
    });
    expect(r.TAG).toBe("Error");
  });

  it("accepts options with inputType=radio + multi=false", () => {
    const r = decode({
      ...baseShape,
      fieldType: "options",
      inputType: "radio",
      multi: false,
      options: [],
    });
    expect(r.TAG).toBe("Ok");
  });

  it("rejects medicine with an invalid route value", () => {
    const r = decode({
      ...baseShape,
      fieldType: "medicine",
      inputType: "input-group",
      options: [],
      fields: {
        name: "x",
        route: ["intergalactic"],
        form: [],
        frequency: "",
        intervals: "",
        dose: "",
        doseUnits: [],
        duration: "",
        durationUnits: [],
      },
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects file with a disallowed mime type", () => {
    const r = decode({
      ...baseShape,
      fieldType: "file",
      inputType: "file",
      allowedMimeTypes: ["application/octet-stream"],
      multiple: false,
      minItems: 0,
      maxItems: 1,
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects text display with an invalid size", () => {
    const r = decode({
      ...baseShape,
      fieldType: "text",
      content: "x",
      size: "huge",
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when a base field has the wrong primitive type", () => {
    const r = decode({
      ...baseShape,
      required: "yes",
      fieldType: "separator",
    });
    expect(r.TAG).toBe("Error");
  });
});

// Compile-time check: the discriminated union accepts each fieldType
// literal in a switch, ensuring the .gen.ts shape really is keyed on
// `fieldType` (not on TAG/_0).
function assertDiscriminator(f: field): string {
  switch (f.fieldType) {
    case "binary":
    case "free-text":
    case "medicine":
    case "diagnosis":
    case "date":
    case "options":
    case "file":
    case "text":
    case "separator":
      return f.fieldType;
  }
}

describe("type-level: field is a discriminated union keyed on fieldType", () => {
  it("exhaustive switch compiles and runs", () => {
    const r = decode({
      ...baseShape,
      fieldType: "separator",
    });
    if (r.TAG === "Ok") {
      expect(assertDiscriminator(r._0)).toBe("separator");
    }
  });
});
