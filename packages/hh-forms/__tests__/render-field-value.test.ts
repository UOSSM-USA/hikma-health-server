import { describe, it, expect } from "vitest";
import {
  renderFieldValue,
  renderBaseFieldValue,
  renderAttributeValue,
  type field,
  type attributeValue,
} from "../src/RegistrationForm.gen";

/**
 * Parity tests for renderFieldValue. Goal: byte-exact match with the
 * server's TS implementation in apps/server/src/models/patient-registration-form.ts.
 *
 * The function leans on JS coercion semantics — `Boolean(0) === false`,
 * `Number(null) === 0`, `String(undefined) === "undefined"`. The ReScript
 * port binds to the JS globals directly so these behaviors carry over.
 */

const US = ""; // Unit Separator (\x1F)

const baseField = (overrides: Partial<field> = {}): field => ({
  id: "f",
  position: 1,
  column: "x",
  label: { en: "X" },
  fieldType: "text",
  options: [],
  required: false,
  baseField: true,
  visible: true,
  deleted: false,
  showsInSummary: false,
  isSearchField: false,
  ...overrides,
});

const attr = (overrides: Partial<attributeValue> = {}): attributeValue => ({
  string_value: null,
  number_value: null,
  boolean_value: null,
  date_value: null,
  ...overrides,
});

describe("renderBaseFieldValue — number", () => {
  const f = baseField({ fieldType: "number" });

  it("returns the number unchanged when parseable", () => {
    expect(renderBaseFieldValue(f, 42)).toBe(42);
    expect(renderBaseFieldValue(f, "42")).toBe(42);
    expect(renderBaseFieldValue(f, "42.5")).toBe(42.5);
  });

  it("returns String(value) when Number(value) is NaN", () => {
    expect(renderBaseFieldValue(f, "abc")).toBe("abc");
  });

  it("treats null as 0 (Number(null) === 0)", () => {
    expect(renderBaseFieldValue(f, null)).toBe(0);
  });

  it("treats undefined as 'undefined' via String() (Number(undefined) is NaN)", () => {
    expect(renderBaseFieldValue(f, undefined)).toBe("undefined");
  });

  it("treats empty string as 0", () => {
    expect(renderBaseFieldValue(f, "")).toBe(0);
  });

  it("treats true as 1 and false as 0", () => {
    expect(renderBaseFieldValue(f, true)).toBe(1);
    expect(renderBaseFieldValue(f, false)).toBe(0);
  });
});

describe("renderBaseFieldValue — boolean", () => {
  const f = baseField({ fieldType: "boolean" });

  it("returns true for truthy, false for falsy (JS Boolean semantics)", () => {
    expect(renderBaseFieldValue(f, true)).toBe(true);
    expect(renderBaseFieldValue(f, false)).toBe(false);
    expect(renderBaseFieldValue(f, 1)).toBe(true);
    expect(renderBaseFieldValue(f, 0)).toBe(false); // critical: Boolean(0) === false
    expect(renderBaseFieldValue(f, "")).toBe(false); // critical: Boolean("") === false
    expect(renderBaseFieldValue(f, "any non-empty")).toBe(true);
    expect(renderBaseFieldValue(f, null)).toBe(false);
    expect(renderBaseFieldValue(f, undefined)).toBe(false);
  });
});

describe("renderBaseFieldValue — date", () => {
  const f = baseField({ fieldType: "date" });

  it("formats a valid date string as yyyy-MM-dd (UTC slice)", () => {
    expect(renderBaseFieldValue(f, "2025-01-15T10:00:00Z")).toBe("2025-01-15");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(renderBaseFieldValue(f, "not-a-date")).toBe("not-a-date");
  });

  it("treats null as epoch — output is local-tz yyyy-MM-dd of UTC midnight Jan 1 1970", () => {
    // new Date(null) === epoch UTC, but date-fns formats in local TZ.
    // In UTC, that's "1970-01-01"; in PST, "1969-12-31". We assert the
    // format, not the exact date — what matters is the function doesn't
    // crash and emits a valid yyyy-MM-dd. (Mirrors the server's behavior.)
    expect(renderBaseFieldValue(f, null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns String(value) for undefined (new Date(undefined) is Invalid)", () => {
    expect(renderBaseFieldValue(f, undefined)).toBe("undefined");
  });
});

describe("renderBaseFieldValue — text and select", () => {
  it("text coerces with String()", () => {
    const f = baseField({ fieldType: "text" });
    expect(renderBaseFieldValue(f, "hello")).toBe("hello");
    expect(renderBaseFieldValue(f, 123)).toBe("123");
    expect(renderBaseFieldValue(f, null)).toBe("null"); // String(null) === "null"
    expect(renderBaseFieldValue(f, undefined)).toBe("undefined");
    expect(renderBaseFieldValue(f, true)).toBe("true");
  });

  it("select coerces with String() identically to text", () => {
    const f = baseField({ fieldType: "select" });
    expect(renderBaseFieldValue(f, "opt-a")).toBe("opt-a");
    expect(renderBaseFieldValue(f, null)).toBe("null");
  });
});

describe("renderBaseFieldValue — checkbox (Unit Separator)", () => {
  const f = baseField({ fieldType: "checkbox" });

  it("splits on \\x1F and joins with comma-space", () => {
    expect(renderBaseFieldValue(f, `a${US}b${US}c`)).toBe("a, b, c");
  });

  it("returns empty string for empty input", () => {
    expect(renderBaseFieldValue(f, "")).toBe("");
  });

  it("filters out empty segments produced by adjacent separators", () => {
    expect(renderBaseFieldValue(f, `a${US}${US}b`)).toBe("a, b");
  });

  it("does NOT split on comma (legacy data with commas stays intact)", () => {
    expect(renderBaseFieldValue(f, "a,b,c")).toBe("a,b,c");
  });

  it("coerces non-string input to string before splitting", () => {
    // String(null) === "null", no separator, no split
    expect(renderBaseFieldValue(f, null)).toBe("null");
  });
});

describe("renderAttributeValue — number_value", () => {
  const f = baseField({ fieldType: "number", baseField: false });

  it("returns the number when parseable", () => {
    expect(renderAttributeValue(f, attr({ number_value: 5 }))).toBe(5);
  });

  it("treats null as 0 (Number(null) === 0)", () => {
    expect(renderAttributeValue(f, attr({ number_value: null }))).toBe(0);
  });
});

describe("renderAttributeValue — boolean_value", () => {
  const f = baseField({ fieldType: "boolean", baseField: false });

  it("returns the boolean value", () => {
    expect(renderAttributeValue(f, attr({ boolean_value: true }))).toBe(true);
    expect(renderAttributeValue(f, attr({ boolean_value: false }))).toBe(false);
  });

  it("Boolean(null) === false", () => {
    expect(renderAttributeValue(f, attr({ boolean_value: null }))).toBe(false);
  });
});

describe("renderAttributeValue — date_value", () => {
  const f = baseField({ fieldType: "date", baseField: false });

  it("formats valid date string as yyyy-MM-dd", () => {
    expect(
      renderAttributeValue(f, attr({ date_value: "2025-01-15T10:00:00Z" })),
    ).toBe("2025-01-15");
  });

  it("null date_value is treated as epoch — local-tz yyyy-MM-dd", () => {
    // Same TZ caveat as the baseField branch.
    expect(renderAttributeValue(f, attr({ date_value: null }))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("renderAttributeValue — string_value (text/select/checkbox)", () => {
  it("text returns String(string_value)", () => {
    const f = baseField({ fieldType: "text", baseField: false });
    expect(renderAttributeValue(f, attr({ string_value: "hi" }))).toBe("hi");
    expect(renderAttributeValue(f, attr({ string_value: null }))).toBe("null");
  });

  it("select returns String(string_value)", () => {
    const f = baseField({ fieldType: "select", baseField: false });
    expect(renderAttributeValue(f, attr({ string_value: "opt" }))).toBe("opt");
  });

  it("checkbox splits string_value on \\x1F and joins", () => {
    const f = baseField({ fieldType: "checkbox", baseField: false });
    expect(
      renderAttributeValue(f, attr({ string_value: `x${US}y${US}z` })),
    ).toBe("x, y, z");
  });
});

describe("renderFieldValue — dispatching entry point", () => {
  it("dispatches to renderBaseFieldValue when baseField is true", () => {
    const f = baseField({ fieldType: "number", baseField: true });
    expect(renderFieldValue(f, 42)).toBe(42);
  });

  it("dispatches to renderAttributeValue when baseField is false", () => {
    const f = baseField({ fieldType: "number", baseField: false });
    expect(renderFieldValue(f, attr({ number_value: 7 }))).toBe(7);
  });
});

describe("renderedValue type-level: TS sees a flat string | number | boolean union", () => {
  it("each fieldType produces an assignable return value", () => {
    const f = baseField();
    const r: string | number | boolean = renderFieldValue(f, "x");
    expect(typeof r).toBe("string");
  });
});

// INV-7 — a select/checkbox value can point at an option the admin later
// removed from `options`. The renderer never looks at `options`; it just
// coerces the stored string, so an orphaned value shows as plain text instead
// of crashing the list/detail view. Locks that in, in case someone later adds
// validation against the option list.
describe("renderFieldValue — INV-7: removed option renders gracefully", () => {
  it("base select: value absent from options renders as the raw stored string", () => {
    const f = baseField({ fieldType: "select", options: [{ en: "North" }] });
    expect(renderFieldValue(f, "South")).toBe("South");
  });

  it("custom select: orphaned attribute value renders as the raw string", () => {
    const f = baseField({
      fieldType: "select",
      baseField: false,
      options: [{ en: "North" }],
    });
    expect(renderFieldValue(f, attr({ string_value: "South" }))).toBe("South");
  });

  it("custom checkbox: still round-trips both stored members when one option is removed", () => {
    // Stored "fever\x1Fcough"; admin removes "cough" from options. The
    // renderer ignores the option list, so both members still display.
    const f = baseField({ fieldType: "checkbox", baseField: false });
    expect(
      renderFieldValue(f, attr({ string_value: `fever${US}cough` })),
    ).toBe("fever, cough");
  });
});

// Characterization of a known bug (INV-5/6), pinned so it can't drift silently.
// When an admin changes a custom field's fieldType (say text → number), the
// update-field-type reducer doesn't migrate the stored value between slots. The
// old value stays put, but the renderer reads the slot for the field's new type,
// so it silently drops out of view — still there in the raw DB, just unreachable.
describe("renderFieldValue — INV-5/6: data-type change strands stored values", () => {
  it("text→number: value stranded in string_value renders as 0, not the original text", () => {
    // "forty" was written while the field was `text` (string_value); the
    // field is now `number`, so the renderer reads number_value === null.
    const f = baseField({ fieldType: "number", baseField: false });
    expect(
      renderFieldValue(f, attr({ string_value: "forty", number_value: null })),
    ).toBe(0);
  });

  it("number→text: value stranded in number_value renders as 'null', not the original number", () => {
    // 42 was written while the field was `number`; the field is now `text`,
    // so the renderer reads string_value === null → String(null) === "null".
    const f = baseField({ fieldType: "text", baseField: false });
    expect(
      renderFieldValue(f, attr({ string_value: null, number_value: 42 })),
    ).toBe("null");
  });
});

// Characterization of a real defect (INV-23): the date renderer formats in the
// runtime's local timezone. A DOB stored as a bare "YYYY-MM-DD" is parsed as UTC
// midnight, so in a negative-offset zone the local calendar date lands on the
// previous day — the displayed DOB differs between a PST device and a UTC one.
// The other date tests above dodge this (T10:00:00Z, or a format-only regex);
// this one pins the day-flip.
describe("renderFieldValue — INV-23: DOB shifts a day across timezones", () => {
  const withTZ = <T>(tz: string, fn: () => T): T => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      process.env.TZ = prev;
    }
  };

  const f = baseField({ fieldType: "date" });

  it("bare date renders the same calendar day in UTC", () => {
    withTZ("UTC", () => {
      expect(renderFieldValue(f, "1990-01-15")).toBe("1990-01-15");
    });
  });

  it("SAME bare date renders the PREVIOUS day in a negative-offset TZ", () => {
    withTZ("America/Los_Angeles", () => {
      expect(renderFieldValue(f, "1990-01-15")).toBe("1990-01-14");
    });
  });
});
