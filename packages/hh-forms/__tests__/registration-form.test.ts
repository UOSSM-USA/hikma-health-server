import { describe, it, expect } from "vitest";
import {
  decode,
  decodeMany,
  encode,
  mergeBaseFields,
  inputTypes,
  type field,
} from "../src/RegistrationForm.gen";

const baseField = (overrides: Partial<field> = {}): field => ({
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

describe("RegistrationForm.inputTypes", () => {
  it("exports the six input types in fixed order", () => {
    expect(inputTypes).toEqual([
      "number",
      "text",
      "select",
      "checkbox",
      "date",
      "boolean",
    ]);
  });
});

describe("RegistrationForm.decode", () => {
  it("accepts a typical text base field", () => {
    const r = decode(baseField());
    expect(r.TAG).toBe("Ok");
  });

  it("accepts each known fieldType", () => {
    for (const ft of [
      "number",
      "text",
      "select",
      "checkbox",
      "date",
      "boolean",
    ] as const) {
      const r = decode(baseField({ fieldType: ft }));
      expect(r.TAG).toBe("Ok");
    }
  });

  it("rejects an unknown fieldType", () => {
    const r = decode({ ...baseField(), fieldType: "nope" });
    expect(r.TAG).toBe("Error");
  });

  it("rejects a missing fieldType", () => {
    const { fieldType: _ft, ...withoutFt } = baseField();
    const r = decode(withoutFt as unknown);
    expect(r.TAG).toBe("Error");
  });

  it("rejects non-object input", () => {
    expect(decode("nope").TAG).toBe("Error");
    expect(decode(42).TAG).toBe("Error");
    expect(decode(null).TAG).toBe("Error");
  });
});

describe("RegistrationForm.decode — strict per-field validation", () => {
  it("rejects a missing required boolean field", () => {
    const { required: _r, ...withoutRequired } = baseField();
    const r = decode(withoutRequired as unknown);
    expect(r.TAG).toBe("Error");
  });

  it("rejects when position is a string instead of a number", () => {
    const r = decode({ ...baseField(), position: "first" as unknown as number });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when position is a non-integer number", () => {
    const r = decode({ ...baseField(), position: 1.5 });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when label is not an object", () => {
    const r = decode({ ...baseField(), label: "First name" as unknown as Record<string, string> });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when a label entry has a non-string value", () => {
    const r = decode({
      ...baseField(),
      label: { en: 42 as unknown as string },
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when options contains a non-translation entry", () => {
    const r = decode({
      ...baseField(),
      options: [{ en: 42 as unknown as string }],
    });
    expect(r.TAG).toBe("Error");
  });

  it("rejects when baseField is a non-boolean", () => {
    const r = decode({ ...baseField(), baseField: "true" as unknown as boolean });
    expect(r.TAG).toBe("Error");
  });
});

describe("RegistrationForm.encode round-trip", () => {
  it("preserves the wire shape", () => {
    const wire = baseField({
      id: "x",
      column: "phone",
      fieldType: "text",
    });
    const r = decode(wire);
    if (r.TAG === "Ok") {
      expect(encode(r._0)).toEqual(wire);
    }
  });
});

describe("RegistrationForm.decodeMany", () => {
  it("returns Ok with all decoded fields", () => {
    const r = decodeMany([
      baseField({ id: "a", position: 1 }),
      baseField({ id: "b", position: 2 }),
    ]);
    expect(r.TAG).toBe("Ok");
    if (r.TAG === "Ok") {
      expect(r._0).toHaveLength(2);
    }
  });

  it("returns Error pointing at the first failure", () => {
    const r = decodeMany([
      baseField({ id: "a" }),
      { ...baseField({ id: "b" }), fieldType: "nope" as never },
    ]);
    expect(r.TAG).toBe("Error");
    if (r.TAG === "Error") {
      expect(r._0).toContain("field 1");
    }
  });
});

describe("RegistrationForm.mergeBaseFields", () => {
  const baseFirstName = baseField({
    id: "bf-1",
    column: "given_name",
    position: 1,
  });
  const baseSurname = baseField({
    id: "bf-2",
    column: "surname",
    position: 2,
  });
  const customField = baseField({
    id: "custom-1",
    column: "x",
    position: 99,
    baseField: false,
  });

  it("merges missing base fields", () => {
    const merged = mergeBaseFields([customField], [baseFirstName, baseSurname]);
    expect(merged).toHaveLength(3);
    expect(merged.map((f) => f.id)).toContain("bf-1");
    expect(merged.map((f) => f.id)).toContain("bf-2");
    expect(merged.map((f) => f.id)).toContain("custom-1");
  });

  it("does not duplicate base fields already present", () => {
    const merged = mergeBaseFields(
      [baseFirstName, customField],
      [baseFirstName, baseSurname],
    );
    expect(merged.filter((f) => f.id === "bf-1")).toHaveLength(1);
    expect(merged).toHaveLength(3);
  });

  it("sorts the result by position", () => {
    const merged = mergeBaseFields([customField], [baseSurname, baseFirstName]);
    expect(merged.map((f) => f.position)).toEqual([1, 2, 99]);
  });
});

// Compile-time check: TS sees the same field properties as the server's
// PatientRegistrationForm.Field. If a field is renamed/removed in
// RegistrationForm.res, this fails to compile.
function assertShape(f: field): {
  position: number;
  column: string;
  visible: boolean;
} {
  return { position: f.position, column: f.column, visible: f.visible };
}

describe("type-level: field shape exposes expected properties", () => {
  it("position, column, visible are accessible", () => {
    const r = decode(baseField());
    if (r.TAG === "Ok") {
      const shape = assertShape(r._0);
      expect(shape.column).toBe("given_name");
    }
  });
});
