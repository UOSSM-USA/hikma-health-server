import fc from "fast-check"

import { sanitizeMetadata } from "../../app/utils/db"

describe("sanitizeMetadata", () => {
  it("passes a plain object through", () => {
    expect(sanitizeMetadata({ a: 1, b: "two" })).toEqual({ a: 1, b: "two" })
    expect(sanitizeMetadata({})).toEqual({})
  })

  it("preserves nesting", () => {
    const nested = { a: { b: { c: 1 } } }
    expect(sanitizeMetadata(nested)).toEqual(nested)
  })

  // `@json` parses the column once, so a doubly-encoded value arrives as a string.
  it("recovers a double-encoded object", () => {
    expect(sanitizeMetadata('{"key":"value"}')).toEqual({ key: "value" })
    expect(sanitizeMetadata(JSON.stringify({ eventId: "abc" }))).toEqual({ eventId: "abc" })
  })

  it("returns {} for JSON that is not an object", () => {
    expect(sanitizeMetadata("[]")).toEqual({})
    expect(sanitizeMetadata('"hello"')).toEqual({})
    expect(sanitizeMetadata("42")).toEqual({})
    expect(sanitizeMetadata("true")).toEqual({})
    expect(sanitizeMetadata("null")).toEqual({})
  })

  it("returns {} for invalid JSON strings", () => {
    expect(sanitizeMetadata("not json")).toEqual({})
    expect(sanitizeMetadata("{broken")).toEqual({})
    expect(sanitizeMetadata("undefined")).toEqual({})
    expect(sanitizeMetadata("{key: value}")).toEqual({})
  })

  it("returns {} for arrays", () => {
    expect(sanitizeMetadata([1, 2, 3])).toEqual({})
  })

  it("returns {} for null, undefined, numbers and booleans", () => {
    for (const input of [null, undefined, 42, 0, NaN, true, false]) {
      expect(sanitizeMetadata(input)).toEqual({})
    }
  })

  it("never returns a string", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(typeof sanitizeMetadata(input)).toBe("object")
      }),
    )
  })

  it("never throws regardless of input", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => sanitizeMetadata(input)).not.toThrow()
      }),
    )
  })

  it("round-trips any JSON-serializable object", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (obj) => {
        expect(sanitizeMetadata(obj)).toEqual(obj)
      }),
    )
  })

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const once = sanitizeMetadata(input)
        expect(sanitizeMetadata(once)).toEqual(once)
      }),
    )
  })
})
