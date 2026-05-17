import test from "ava";
import * as fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import * as JsonLogic from "../src/JsonLogic.gen";

// Adversarial property tests. Each property attempts to break the
// interpreter by sampling broadly over its input surface and asserting
// invariants that the docs or implementation imply. A failure here means
// one of: a real bug, an undocumented edge case, or a tightly-coupled
// assumption that needs to be made explicit.
//
// These tests are written from a "try to crash it" perspective — several
// are expected to fail until either the implementation or the
// documentation is reconciled.

// ── 1. Totality of apply ───────────────────────────────────────────────
// `apply`'s contract is "any JSON in, Result out". It must never throw
// an uncaught exception on any input. This is the broadest fuzz — most
// inputs won't parse as rules, but any code path that does (preserve,
// arrays, deeply nested objects, etc.) is exercised.
test("apply never throws on arbitrary JSON inputs", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), fc.jsonValue(), (rule, data) => {
      const r = JsonLogic.apply(rule, data);
      return r.TAG === "Ok" || r.TAG === "Error";
    }),
    { numRuns: 1000 },
  );
  t.pass();
});

// ── 2. validate ≡ parse on structure ──────────────────────────────────
// `validate` is documented as a thin wrapper over the parser. For ANY
// input, success/failure must agree. Divergence implies a regression in
// one of them or a subtle non-determinism in the parser.
test("validate(rule).TAG matches parse(rule).TAG on arbitrary JSON", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), (rule) => {
      const v = JsonLogic.validate(rule);
      const p = JsonLogic.parse(rule);
      if (v.TAG !== p.TAG) return false;
      if (v.TAG === "Error" && p.TAG === "Error") {
        return isDeepStrictEqual(v._0, p._0);
      }
      return true;
    }),
    { numRuns: 1000 },
  );
  t.pass();
});

// ── 3. applyExn ≡ apply (throw/return inverted) ───────────────────────
// `applyExn` must throw exactly when `apply` errors, with an identical
// payload recoverable via `getError`. If they ever disagree, callers
// using the Exn variant lose information that the Result variant has.
test("applyExn throws iff apply errors, with identical payload", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), fc.jsonValue(), (rule, data) => {
      const r = JsonLogic.apply(rule, data);
      try {
        const v = JsonLogic.applyExn(rule, data);
        if (r.TAG !== "Ok") return false;
        return isDeepStrictEqual(v, r._0);
      } catch (e) {
        if (r.TAG !== "Error") return false;
        const err = JsonLogic.getError(e);
        return err !== undefined && isDeepStrictEqual(err, r._0);
      }
    }),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 4. apply ≡ parse then evaluate ────────────────────────────────────
// The README documents `apply` as `parse` followed by `evaluate`. They
// must produce structurally identical results — same TAG, same payload.
// `liftParseError` and `liftEvalError` in JsonLogic.res are pure
// relabelers, so deep-equal on error payloads is the right assertion.
test("apply equals parse then evaluate (incl. error payloads)", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), fc.jsonValue(), (rule, data) => {
      const direct = JsonLogic.apply(rule, data);
      const parsed = JsonLogic.parse(rule);
      if (parsed.TAG === "Error") {
        if (direct.TAG !== "Error") return false;
        return isDeepStrictEqual(direct._0, parsed._0);
      }
      const evald = JsonLogic.evaluate(parsed._0, data);
      if (direct.TAG !== evald.TAG) return false;
      return isDeepStrictEqual(direct._0, evald._0);
    }),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 5. '!' wrapped vs unwrapped argument equivalence ──────────────────
// `{!: rule}` and `{!: [rule]}` are interchangeable EXCEPT when `rule`
// is itself a single-element array — the parser's unwrap rule strips
// one array level, so `{!: [[null]]}` (unwrap → `[null]`, truthy → false)
// and `{!: [null]}` (unwrap → null, falsy → true) diverge. This matches
// reference JSONLogic.js (`if (Array.isArray(a)) a = a[0]`). Filter that
// case out; over the rest of the JSON domain the equivalence holds.
const isSingletonArray = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 1;
test("'!' wrapped and unwrapped arguments produce equal results", (t) => {
  fc.assert(
    fc.property(
      fc.jsonValue().filter((x) => !isSingletonArray(x)),
      (x) => {
        const wrapped = JsonLogic.apply({ "!": [x] }, null);
        const unwrapped = JsonLogic.apply({ "!": x }, null);
        return isDeepStrictEqual(wrapped, unwrapped);
      },
    ),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 6. '!!x' inverts '!x' ─────────────────────────────────────────────
// `!!` is documented as a truthiness coercion. For any JSON x, both
// must succeed (or both must fail identically) and the boolean results
// must be opposites. A failure here suggests the truthiness rules are
// inconsistent between the two operators.
test("'!!' inverts '!' on arbitrary JSON", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), (x) => {
      const notX = JsonLogic.apply({ "!": x }, null);
      const notNotX = JsonLogic.apply({ "!!": x }, null);
      if (notX.TAG !== notNotX.TAG) return false;
      if (notX.TAG === "Error" && notNotX.TAG === "Error") {
        return isDeepStrictEqual(notX._0, notNotX._0);
      }
      if (notX.TAG === "Ok" && notNotX.TAG === "Ok") {
        return (
          typeof notX._0 === "boolean" &&
          typeof notNotX._0 === "boolean" &&
          notX._0 === !notNotX._0
        );
      }
      return false;
    }),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 7. preserve is identity ───────────────────────────────────────────
// `preserve` is documented as an escape hatch: value is kept as raw
// JSON with no recursion. For ANY JSON x, `{preserve: x}` must return
// x verbatim. Adversarial: x includes operator-shaped objects, multi-
// key objects, deeply nested arrays — none of which should be touched.
test("preserve returns its argument unchanged for arbitrary JSON", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), (x) => {
      const r = JsonLogic.apply({ preserve: x }, null);
      return r.TAG === "Ok" && isDeepStrictEqual(r._0, x);
    }),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 8. length matches host .length for strings and arrays ─────────────
// `length` must report the same count the host language does. Strings
// are wrapped in `preserve` so a string that happens to look like JSON
// isn't reinterpreted; arrays of arbitrary JSON exercise the array
// path. Adversarial: unicode, surrogate pairs, deeply nested elements.
test("length matches host .length for strings and arrays", (t) => {
  fc.assert(
    fc.property(
      fc.oneof(fc.string(), fc.array(fc.jsonValue())),
      (x) => {
        const r = JsonLogic.apply({ length: { preserve: x } }, null);
        if (r.TAG !== "Ok") return false;
        return r._0 === (x as string | unknown[]).length;
      },
    ),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 9. '+' must never silently return NaN as a Number ─────────────────
// If arithmetic would produce NaN — e.g. Infinity + (-Infinity) via
// string coercion of "Infinity"/"-Infinity"/"1e500" — the library should
// surface NaNError, not return Ok(Number(NaN)). NaN is not valid JSON
// and downstream consumers will mis-handle it (e.g. JSON.stringify
// produces "null", `===` against itself returns false).
test("'+' does not silently return NaN as a Number value", (t) => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.constantFrom(
            "Infinity",
            "-Infinity",
            "1e500",
            "-1e500",
            "0",
            "",
            "1.5",
          ),
        ),
        { minLength: 1, maxLength: 6 },
      ),
      (operands) => {
        const r = JsonLogic.apply({ "+": operands }, null);
        if (r.TAG !== "Ok") return true; // erroring is the desired behaviour
        return typeof r._0 === "number" && Number.isFinite(r._0);
      },
    ),
    { numRuns: 500 },
  );
  t.pass();
});

// ── 10. Multi-key objects parse to MultiKeyObject listing every key ───
// Any object with ≥2 keys is ambiguous (which op runs first?) and the
// parser must flag it with all keys reported. Adversarial: keys include
// dangerous strings like "__proto__", "constructor", empty-ish keys,
// and unicode — to verify the parser walks the dict without coupling to
// JS prototype behaviour. We build the object with `Object.fromEntries`
// so the `__proto__` literal-setter trap doesn't corrupt the input.
test("objects with 2+ keys parse to MultiKeyObject listing every key", (t) => {
  fc.assert(
    fc.property(
      fc
        .uniqueArray(fc.string({ minLength: 1 }), {
          minLength: 2,
          maxLength: 8,
        })
        .chain((keys) =>
          fc
            .array(fc.jsonValue(), {
              minLength: keys.length,
              maxLength: keys.length,
            })
            .map((vals) => ({ keys, vals })),
        ),
      ({ keys, vals }) => {
        const obj = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
        const r = JsonLogic.parse(obj);
        if (r.TAG !== "Error") return false;
        if (r._0.TAG !== "MultiKeyObject") return false;
        const reported = [...r._0._0].sort();
        const expected = [...keys].sort();
        return isDeepStrictEqual(reported, expected);
      },
    ),
    { numRuns: 300 },
  );
  t.pass();
});
