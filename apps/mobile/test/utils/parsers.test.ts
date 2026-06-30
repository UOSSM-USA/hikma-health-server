import fc from "fast-check"

import Language from "../../app/models/Language"
import {
  parseMetadata,
  getTranslation,
  normalizeForSearch,
  buildPrefilter,
  tokenizeForSearch,
  searchRanked,
  safeStringify,
  joinCheckboxValues,
  splitCheckboxValues,
} from "../../app/utils/parsers"

describe("parseMetadata", () => {
  it("should return object as-is when metadata is already an object", () => {
    const input = { name: "John", age: 30 }
    const result = parseMetadata<typeof input>(input)
    expect(result.error).toBeNull()
    expect(result.result).toEqual(input)
  })

  it("should parse valid JSON string", () => {
    const input = '{"name":"John","age":30}'
    const result = parseMetadata<{ name: string; age: number }>(input)
    expect(result.error).toBeNull()
    expect(result.result).toEqual({ name: "John", age: 30 })
  })

  it("should return error for invalid JSON string", () => {
    const result = parseMetadata<any>("invalid json")
    expect(result.error).toBeInstanceOf(Error)
    expect(result.result).toBe("invalid json")
  })

  it("round-trips any JSON-serializable object", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const json = JSON.stringify(value)
        const result = parseMetadata(json)
        expect(result.error).toBeNull()
        expect(result.result).toEqual(value)
      }),
    )
  })
})

describe("getTranslation", () => {
  it("should return the requested language translation if it exists", () => {
    const translations: Language.TranslationObject = { en: "Hello", ar: "مرحبا", es: "Hola" }
    expect(getTranslation(translations, "ar")).toBe("مرحبا")
    expect(getTranslation(translations, "es")).toBe("Hola")
  })

  it("should fallback to English when requested language doesn't exist", () => {
    const translations: Language.TranslationObject = { en: "Hello", ar: "مرحبا" }
    expect(getTranslation(translations, "fr")).toBe("Hello")
  })

  it("should return first available translation when English doesn't exist", () => {
    const translations: Language.TranslationObject = { ar: "مرحبا", es: "Hola" }
    expect(getTranslation(translations, "fr")).toBe("مرحبا")
  })

  it("should return empty string for empty translations object", () => {
    expect(getTranslation({} as Language.TranslationObject, "en")).toBe("")
  })

  it("always returns a string for any non-empty translations object", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.constantFrom("en", "ar", "es", "fr", "de"), fc.string({ minLength: 1 }), {
          minKeys: 1,
        }),
        fc.string({ minLength: 1 }),
        (translations, lang) => {
          const result = getTranslation(translations as Language.TranslationObject, lang)
          expect(typeof result).toBe("string")
          expect(result.length).toBeGreaterThan(0)
        },
      ),
    )
  })
})

describe("normalizeForSearch", () => {
  it("folds Arabic letter variants to a canonical form", () => {
    expect(normalizeForSearch("ي")).toBe("ی")
    expect(normalizeForSearch("ى")).toBe("ی")
    expect(normalizeForSearch("أ")).toBe("ا")
    expect(normalizeForSearch("إ")).toBe("ا")
    expect(normalizeForSearch("آ")).toBe("ا")
    expect(normalizeForSearch("ة")).toBe("ه")
    expect(normalizeForSearch("ئ")).toBe("ی")
    expect(normalizeForSearch("ؤ")).toBe("و")
    expect(normalizeForSearch("ء")).toBe("")
  })

  it("strips Arabic diacritics (harakat) and tatweel", () => {
    expect(normalizeForSearch("مُحَمَّد")).toBe("محمد")
    expect(normalizeForSearch("محـــمد")).toBe("محمد")
  })

  it("folds Latin accents and lowercases for English", () => {
    expect(normalizeForSearch("CAFÉ")).toBe("cafe")
    expect(normalizeForSearch("José")).toBe("jose")
  })

  it("collapses whitespace and trims", () => {
    expect(normalizeForSearch("  John   Doe  ")).toBe("john doe")
  })

  it("never produces leading/trailing whitespace or consecutive spaces", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = normalizeForSearch(s)
        expect(result).toBe(result.trim())
        expect(result).not.toMatch(/  /)
      }),
    )
  })
})

describe("buildPrefilter", () => {
  it("wraps a Latin token as a contiguous substring pattern", () => {
    expect(buildPrefilter("john")).toBe("%john%")
  })

  it("drops non-word characters, breaking contiguity", () => {
    expect(buildPrefilter("a.b")).toBe("%a%b%")
  })

  it("separates Arabic letters with % so stored diacritics still match", () => {
    expect(buildPrefilter("محمد")).toBe("%م%ح%م%د%")
  })

  it("maps ambiguous Arabic letters to _ so any stored variant matches", () => {
    // 'ا' is ambiguous → '_' matches the أ/إ/آ/ا family
    expect(buildPrefilter("احمد")).toBe("%_%ح%م%د%")
  })

  it("returns a match-all pattern for a token with no word characters", () => {
    expect(buildPrefilter("!!!")).toBe("%%")
  })

  it("only ever emits letters, digits, % and _ (injection-safe)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const pattern = buildPrefilter(s)
        for (const ch of pattern) {
          expect(ch === "%" || ch === "_" || /[\p{L}\p{N}]/u.test(ch)).toBe(true)
        }
      }),
    )
  })
})

describe("tokenizeForSearch", () => {
  it("normalizes, splits, and lowercases", () => {
    expect(tokenizeForSearch("  John   DOE ")).toEqual(["john", "doe"])
  })

  it("drops tokens with no letter or digit", () => {
    expect(tokenizeForSearch("john !!! doe")).toEqual(["john", "doe"])
  })

  it("returns an empty array for punctuation-only or blank input", () => {
    expect(tokenizeForSearch("   ")).toEqual([])
    expect(tokenizeForSearch("!!! ???")).toEqual([])
  })

  it("folds Arabic variants per token", () => {
    expect(tokenizeForSearch("أحمد")).toEqual(["احمد"])
  })

  it("every token yields a non-match-all prefilter pattern", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        for (const token of tokenizeForSearch(s)) {
          expect(buildPrefilter(token)).not.toBe("%%")
        }
      }),
    )
  })
})

describe("searchRanked", () => {
  // Minimal fake collection: it ignores the built query clause and returns canned
  // candidates, so phase 2 (re-normalize, reject false positives, score, rank)
  // runs for real without needing a database.
  //
  // Mirrors a real WatermelonDB model faithfully: raw column values are reachable
  // ONLY via `_getRaw(columnName)`, never as direct snake_case properties (a real
  // model exposes camelCase getters instead). This forces the test through the same
  // access path as production (readField -> _getRaw); a regression to direct
  // `record[column]` access would read undefined and return no matches here.
  function fakeCollection(records: Array<Record<string, string>>) {
    const models = records.map((fields) => ({
      _getRaw: (column: string) => fields[column] ?? null,
    }))
    return {
      query: () => ({ fetch: async () => models }),
    } as any
  }

  it("returns empty for a blank query", async () => {
    const col = fakeCollection([{ given_name: "John", surname: "Doe" }])
    expect(await searchRanked(col, ["given_name", "surname"], "   ")).toEqual([])
  })

  it("rejects candidates that are missing one of the query tokens", async () => {
    const col = fakeCollection([
      { given_name: "John", surname: "Doe" },
      { given_name: "Jane", surname: "Smith" },
    ])
    const results = await searchRanked(col, ["given_name", "surname"], "john doe")
    expect(results).toHaveLength(1)
    expect(results[0]._getRaw("given_name")).toBe("John")
  })

  it("matches Arabic names ignoring diacritics and letter variants", async () => {
    const col = fakeCollection([
      { given_name: "مُحَمَّد", surname: "" },
      { given_name: "سعيد", surname: "" },
    ])
    const results = await searchRanked(col, ["given_name", "surname"], "محمد")
    expect(results).toHaveLength(1)
    expect(results[0]._getRaw("given_name")).toBe("مُحَمَّد")
  })

  it("ranks an exact full match ahead of a partial match", async () => {
    const col = fakeCollection([
      { given_name: "Johnathan", surname: "Doe" },
      { given_name: "John", surname: "Doe" },
    ])
    const results = await searchRanked(col, ["given_name", "surname"], "john doe")
    expect(results[0]._getRaw("given_name")).toBe("John")
  })
})

describe("safeStringify", () => {
  it("should return defaultValue for null and undefined", () => {
    expect(safeStringify(null, "fallback")).toBe("fallback")
    expect(safeStringify(undefined, "fallback")).toBe("fallback")
  })

  it("should stringify objects", () => {
    expect(safeStringify({ a: 1 }, "{}")).toBe('{"a":1}')
    expect(safeStringify([1, 2, 3], "[]")).toBe("[1,2,3]")
  })

  it("should pass through a valid JSON string re-stringified", () => {
    expect(safeStringify('{"a":1}', "{}")).toBe('{"a":1}')
  })

  it("should stringify non-JSON strings as JSON strings", () => {
    expect(safeStringify("hello world", "default")).toBe('"hello world"')
    expect(safeStringify("FAIL", "default")).toBe('"FAIL"')
  })

  it("should return defaultValue for empty string, null, and undefined", () => {
    expect(safeStringify("", "[]")).toBe("[]")
    expect(safeStringify(null, "{}")).toBe("{}")
    expect(safeStringify(undefined, "[]")).toBe("[]")
  })

  it("should handle boolean and number inputs", () => {
    expect(safeStringify(true, "")).toBe("true")
    expect(safeStringify(42, "")).toBe("42")
  })

  it("round-trips any non-null JSON value through stringify", () => {
    // null/undefined/empty string are handled separately (return defaultValue)
    // Exclude strings that are themselves valid JSON (e.g. "0", "true") because
    // safeStringify normalizes those: "0" → parse(0) → stringify → "0" (number),
    // which is correct behavior but changes the JS type after round-trip.
    const nonNullNonStringJson = fc.oneof(
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.array(fc.jsonValue()),
      fc.dictionary(fc.string(), fc.jsonValue()),
    )
    fc.assert(
      fc.property(nonNullNonStringJson, (value) => {
        const result = safeStringify(value, "__SENTINEL__")
        expect(result).not.toBe("__SENTINEL__")
        // Compare against JSON.parse(JSON.stringify(value)) to account for
        // JSON-inherent lossy conversions (e.g. -0 → 0)
        expect(JSON.parse(result)).toEqual(JSON.parse(JSON.stringify(value)))
      }),
    )
  })

  it("normalizes string inputs that are valid JSON", () => {
    // safeStringify("0") normalizes via JSON.parse then JSON.stringify,
    // so "0" → 0 → "0". The result is valid JSON representing the parsed value.
    expect(safeStringify("0", "default")).toBe("0")
    expect(safeStringify("true", "default")).toBe("true")
    expect(safeStringify("[1,2]", "default")).toBe("[1,2]")
    // Non-JSON strings get wrapped in quotes
    expect(safeStringify("hello", "default")).toBe('"hello"')
  })

  it("never throws for any input", () => {
    fc.assert(
      fc.property(fc.anything(), fc.string(), (input, defaultVal) => {
        expect(() => safeStringify(input, defaultVal)).not.toThrow()
      }),
    )
  })

  it("always returns a string", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = safeStringify(input, "default")
        expect(typeof result).toBe("string")
      }),
    )
  })
})

describe("joinCheckboxValues / splitCheckboxValues", () => {
  it("joins values with \\x1F separator", () => {
    expect(joinCheckboxValues(["A", "B"])).toBe("A\x1FB")
  })

  it("returns empty string for empty array", () => {
    expect(joinCheckboxValues([])).toBe("")
  })

  it("splits \\x1F separated string", () => {
    expect(splitCheckboxValues("A\x1FB\x1FC")).toEqual(["A", "B", "C"])
  })

  it("returns empty array for falsy input", () => {
    expect(splitCheckboxValues("")).toEqual([])
    expect(splitCheckboxValues(null)).toEqual([])
    expect(splitCheckboxValues(undefined)).toEqual([])
  })

  it("round-trips: split(join(arr)) === arr for option labels", () => {
    // \x1F is a non-printable control char that won't appear in human-readable labels
    const optionLabel = fc.string({ minLength: 1 }).filter((s) => !s.includes("\x1F"))
    fc.assert(
      fc.property(fc.array(optionLabel), (values) => {
        expect(splitCheckboxValues(joinCheckboxValues(values))).toEqual(values)
      }),
    )
  })

  it("join then split preserves count for option labels", () => {
    const optionLabel = fc.string({ minLength: 1 }).filter((s) => !s.includes("\x1F"))
    fc.assert(
      fc.property(fc.array(optionLabel, { minLength: 1 }), (values) => {
        const result = splitCheckboxValues(joinCheckboxValues(values))
        expect(result.length).toBe(values.length)
      }),
    )
  })

  it("split always returns an array", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)), (input) => {
        expect(Array.isArray(splitCheckboxValues(input))).toBe(true)
      }),
    )
  })
})
