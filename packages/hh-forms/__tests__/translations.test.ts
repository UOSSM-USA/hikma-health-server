import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  getOptionId,
  getFieldTranslation,
  upsertFieldTranslation,
  upsertOptionTranslation,
  removeFieldTranslation,
  ensureOptionIds,
  type fieldTranslation,
} from "../src/Translations.gen";

let idCounter = 0;
const stableGenerateId = () => `gen-${++idCounter}`;

describe("getOptionId", () => {
  it("returns id when present", () => {
    expect(getOptionId({ id: "abc", label: "X", value: "x" })).toBe("abc");
  });

  it("falls back to value when id is missing (fast-check)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        expect(getOptionId({ label: "any", value })).toBe(value);
      }),
    );
  });
});

describe("upsertFieldTranslation", () => {
  it("creates a new entry when none exists", () => {
    const result = upsertFieldTranslation([], "field-1", "ar", "name", "اسم");
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe("field-1");
    expect(result[0].name.ar).toBe("اسم");
    expect(result[0].description).toEqual({});
  });

  it("updates an existing entry without duplicating", () => {
    const initial = upsertFieldTranslation([], "field-1", "ar", "name", "اسم");
    const updated = upsertFieldTranslation(
      initial,
      "field-1",
      "es",
      "name",
      "nombre",
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].name.ar).toBe("اسم");
    expect(updated[0].name.es).toBe("nombre");
  });

  it("upserts description independently of name", () => {
    const initial = upsertFieldTranslation([], "f", "en", "name", "Name");
    const next = upsertFieldTranslation(
      initial,
      "f",
      "en",
      "description",
      "Helpful",
    );
    expect(next).toHaveLength(1);
    expect(next[0].name.en).toBe("Name");
    expect(next[0].description.en).toBe("Helpful");
  });

  it("does not affect other field entries", () => {
    const initial = upsertFieldTranslation([], "f1", "ar", "name", "اسم");
    const result = upsertFieldTranslation(
      initial,
      "f2",
      "es",
      "description",
      "desc",
    );
    expect(result).toHaveLength(2);
    expect(result[0].fieldId).toBe("f1");
    expect(result[1].fieldId).toBe("f2");
  });
});

describe("upsertOptionTranslation", () => {
  it("creates entry with option translation when none exists", () => {
    const r = upsertOptionTranslation([], "field-1", "opt-1", "ar", "خيار");
    expect(r).toHaveLength(1);
    expect(r[0].options["opt-1"].ar).toBe("خيار");
  });

  it("adds to existing field entry without overwriting name", () => {
    const initial = upsertFieldTranslation([], "field-1", "en", "name", "Name");
    const r = upsertOptionTranslation(
      initial,
      "field-1",
      "opt-1",
      "es",
      "opcion",
    );
    expect(r).toHaveLength(1);
    expect(r[0].name.en).toBe("Name");
    expect(r[0].options["opt-1"].es).toBe("opcion");
  });

  it("merges multiple languages into the same option", () => {
    const a = upsertOptionTranslation([], "f", "opt", "en", "Yes");
    const b = upsertOptionTranslation(a, "f", "opt", "es", "Sí");
    expect(b[0].options["opt"].en).toBe("Yes");
    expect(b[0].options["opt"].es).toBe("Sí");
  });
});

describe("removeFieldTranslation", () => {
  it("removes the entry for the given fieldId", () => {
    const translations: fieldTranslation[] = [
      upsertFieldTranslation([], "f1", "en", "name", "A")[0],
      upsertFieldTranslation([], "f2", "en", "name", "B")[0],
    ];
    const r = removeFieldTranslation(translations, "f1");
    expect(r).toHaveLength(1);
    expect(r[0].fieldId).toBe("f2");
  });

  it("returns empty array when removing the only entry", () => {
    const translations = upsertFieldTranslation([], "f1", "en", "name", "A");
    expect(removeFieldTranslation(translations, "f1")).toEqual([]);
  });
});

describe("getFieldTranslation", () => {
  it("finds existing translation entry", () => {
    const translations = upsertFieldTranslation([], "f1", "en", "name", "Test");
    const r = getFieldTranslation(translations, "f1");
    expect(r).toBeDefined();
    expect(r?.name.en).toBe("Test");
  });

  it("returns undefined for missing fieldId", () => {
    const r = getFieldTranslation([], "missing");
    expect(r).toBeUndefined();
  });
});

describe("ensureOptionIds", () => {
  it("adds ids to options that are missing them", () => {
    idCounter = 0;
    const fields = [
      { id: "f1", options: [{ label: "A", value: "a" }] },
      { id: "f2", name: "no-options" },
    ];
    const result = ensureOptionIds(stableGenerateId, fields);
    expect((result[0] as any).options[0].id).toBe("gen-1");
    expect((result[0] as any).options[0].label).toBe("A");
    expect(result[1]).toEqual(fields[1]);
  });

  it("is idempotent — pre-existing ids are preserved", () => {
    idCounter = 0;
    const fields = [
      { id: "f1", options: [{ id: "pre", label: "A", value: "a" }] },
    ];
    const once = ensureOptionIds(stableGenerateId, fields);
    const twice = ensureOptionIds(stableGenerateId, once);
    expect((twice[0] as any).options[0].id).toBe("pre");
  });

  it("leaves string options (medicine) untouched", () => {
    const fields = [{ id: "f1", options: ["aspirin", "ibuprofen"] }];
    const r = ensureOptionIds(stableGenerateId, fields);
    expect((r[0] as any).options).toEqual(["aspirin", "ibuprofen"]);
  });

  it("leaves fields without an `options` key alone", () => {
    const fields = [{ id: "f1", description: "no options here" }];
    const r = ensureOptionIds(stableGenerateId, fields);
    expect(r[0]).toEqual(fields[0]);
  });
});
