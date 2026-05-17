import test from "ava";
import * as JsonLogic from "../src/JsonLogic.gen";

// Adversarial test suite. Every test in this file is written to FAIL when the
// corresponding bug exists. They are not coverage tests — each one names a
// specific failure mode that an attacker (or careless caller) can trigger.
//
// Findings are summarised in the adversarial-review report; each test maps to
// one finding by its short ID in the comment header.

// ───────────────────────────────────────────────────────────────────────────
// F1: Stack-overflow DoS via deep AST nesting (parse / validate / apply /
// serialize all recurse without a depth guard).
//
// The reference behaviour we want: return a typed error, not crash the host
// process. Today every entry point throws an uncaught RangeError on rules of
// modest depth (~10k). For an app that loads user-authored rules, this is a
// one-shot process-killer.
// ───────────────────────────────────────────────────────────────────────────

const buildDeep = (depth: number): unknown => {
  let r: unknown = { "==": [1, 1] };
  for (let i = 0; i < depth; i++) r = { "+": [r, 0] };
  return r;
};

test("F1a: apply does not throw RangeError on deep rules", (t) => {
  const deep = buildDeep(20000);
  t.notThrows(() => {
    const r = JsonLogic.apply(deep as never, null);
    // Either Ok or a typed Error is acceptable; the contract violation is
    // an uncaught host-runtime exception.
    t.true(r.TAG === "Ok" || r.TAG === "Error");
  });
});

test("F1b: parse does not throw RangeError on deep rules", (t) => {
  const deep = buildDeep(20000);
  t.notThrows(() => {
    const r = JsonLogic.parse(deep as never);
    t.true(r.TAG === "Ok" || r.TAG === "Error");
  });
});

test("F1c: validate does not throw RangeError on deep rules", (t) => {
  // The README suggests `validate` for linting user rules — meaning callers
  // will pass untrusted input. It must not crash on hostile depth.
  const deep = buildDeep(20000);
  t.notThrows(() => {
    const r = JsonLogic.validate(deep as never);
    t.true(r.TAG === "Ok" || r.TAG === "Error");
  });
});

test("F1d: validateString does not throw RangeError on deep rule strings", (t) => {
  // Build the JSON string directly — JSON.stringify on a deep object itself
  // overflows the V8 stack, which would mask whether validateString handles
  // the depth. V8's JSON.parse is iterative and handles arbitrary depth, so
  // the load reaches the library's recursive parser, which is what we want
  // to exercise.
  let deep = '{"==":[1,1]}';
  for (let i = 0; i < 20000; i++) deep = '{"+":[' + deep + ',0]}';
  t.notThrows(() => {
    const r = JsonLogic.validateString(deep);
    t.true(r.TAG === "Ok" || r.TAG === "Error");
  });
});

test("F1e: serialize does not throw RangeError on deep ASTs", (t) => {
  // Round-trip use case (UI editor saves edited AST back to JSON). The
  // attacker doesn't even have to craft a JSON rule — a normal-looking
  // AST built programmatically blows up on save.
  const shallow = buildDeep(10000);
  const parsed = JsonLogic.parse(shallow as never);
  if (parsed.TAG !== "Ok") {
    t.pass();
    return;
  }
  t.notThrows(() => {
    JsonLogic.serialize(parsed._0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// F2: Prototype / host-object leak through `var` and `val`.
//
// `JsonLogic_Path.stepIntoOpt` compiles to `data[key]`. JS property access
// walks the prototype chain, so `{var: "__proto__"}` returns the host
// `Object.prototype`, and `{var: "constructor"}` returns the `Object`
// constructor function. The library's declared return type is JSON.t — these
// values violate that contract and silently drop data when re-serialised.
// ───────────────────────────────────────────────────────────────────────────

test("F2a: {var: \"__proto__\"} does not leak Object.prototype", (t) => {
  const r = JsonLogic.apply({ var: "__proto__" }, { a: 1 });
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  // Today: r._0 === Object.prototype (a JS host object, not a JSON value).
  t.not(
    r._0,
    Object.prototype,
    "result is Object.prototype, not a JSON value",
  );
});

test("F2b: {var: \"constructor\"} does not leak a Function", (t) => {
  const r = JsonLogic.apply({ var: "constructor" }, { a: 1 });
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  // Today: r._0 is the Object constructor function. JSON.stringify(r._0)
  // returns undefined — caller's logs/responses silently lose this value.
  t.not(typeof r._0, "function", "result is a Function, not a JSON value");
});

test("F2c: {exists: \"__proto__\"} on a plain object is false", (t) => {
  // `exists` is documented as "true iff the path resolves". A plain
  // `JSON.parse('{"a":1}')` object has no own `__proto__` key, so existence
  // should be false. Today this returns true because the prototype walk
  // finds Object.prototype.
  const r = JsonLogic.apply({ exists: "__proto__" }, { a: 1 });
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  t.false(r._0, "exists __proto__ returned true on a plain object");
});

test("F2d: JSON.stringify(apply(...).value) round-trips without dropping data", (t) => {
  // The practically scary part of the contract violation: a caller that
  // sends the result over the network or writes it to a log loses the
  // leaked value without warning.
  const r = JsonLogic.apply({ var: "constructor" }, { a: 1 });
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  // If the library upholds its return contract, JSON.stringify works.
  t.not(JSON.stringify(r._0), undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// F3: 32-bit truncation in `%` produces wildly wrong results on large numbers.
//
// `Float.toInt` compiles to `n | 0`, which is 32-bit signed truncation. The
// modulo implementation uses it to truncate the quotient. For healthcare /
// finance / time-interval math, silent miscalculation is the worst kind of
// bug — no error, just wrong numbers.
// ───────────────────────────────────────────────────────────────────────────

test("F3a: % gives the mathematically correct result for large dividends", (t) => {
  const r = JsonLogic.apply({ "%": [1e20, 7] }, null);
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  // The mathematically correct result is in [0, 7). Today this returns
  // ~9.999e19 because Float.toInt(quotient) wraps to 0.
  t.true(
    typeof r._0 === "number" && r._0 >= 0 && r._0 < 7,
    `1e20 % 7 = ${r._0}, expected value in [0, 7)`,
  );
});

test("F3b: % round-trips small operands", (t) => {
  // Sanity check the operator still works on small values.
  const r = JsonLogic.apply({ "%": [101, 7] }, null);
  t.is(r.TAG, "Ok");
  if (r.TAG === "Ok") t.is(r._0, 3);
});

// ───────────────────────────────────────────────────────────────────────────
// F4: Same Float.toInt root cause: missing_some with huge/non-finite `min`
// silently reports "no keys missing" — exactly the opposite of safe-by-default
// for a "required fields present?" check.
// ───────────────────────────────────────────────────────────────────────────

test("F4a: missing_some with Infinity min does not silently report no-missing", (t) => {
  // No keys present, min = Infinity — under the old Float.toInt(Infinity) = 0
  // wrap, presentCount(0) >= 0 was true and the impl returned [] ("nothing
  // missing"), silently accepting incomplete submissions. Either a typed
  // error (InvalidArguments) or the actually-missing key list is
  // acceptable; only `Ok([])` is wrong.
  const r = JsonLogic.apply(
    { missing_some: [{ preserve: Infinity }, ["a", "b"]] },
    {},
  );
  if (r.TAG === "Ok") {
    t.notDeepEqual(r._0, [], "missing_some silently returned 'nothing missing'");
  } else {
    t.pass();
  }
});

test("F4b: missing_some with MAX_SAFE_INTEGER min reports actually-missing keys", (t) => {
  // MAX_SAFE_INTEGER | 0 = -1; presentCount(0) >= -1 is trivially true,
  // so the implementation reports nothing missing.
  const r = JsonLogic.apply(
    { missing_some: [Number.MAX_SAFE_INTEGER, ["a", "b"]] },
    {},
  );
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  t.deepEqual(r._0, ["a", "b"]);
});

// ───────────────────────────────────────────────────────────────────────────
// F5: NaN comparison silently returns true.
//
// `cmpNum` returns Some(0) for (Some(NaN), Some(_)) because the inline
// ternaries treat "neither <, nor >" as equal. This breaks the IEEE-754
// invariant that NaN compares unequal to everything (including itself).
//
// Reachable only when a TS caller hand-constructs `JSON.t` with `NaN` —
// e.g. passing `{x: NaN}` as data without going through JSON.parse. Worth a
// guard because the failure is silent ("true" returned for a comparison that
// must be false).
// ───────────────────────────────────────────────────────────────────────────

test("F5: <=: [NaN, NaN] does not silently return true", (t) => {
  const r = JsonLogic.apply({ "<=": [{ var: "x" }, { var: "x" }] }, {
    x: NaN,
  } as never);
  // Either a typed error (preferred) or a correct false — NOT a silent true.
  if (r.TAG === "Ok") {
    t.false(r._0 as boolean, "NaN <= NaN returned true");
  } else {
    t.pass();
  }
});

// ───────────────────────────────────────────────────────────────────────────
// F6: `cat` of a non-finite Number leaks "NaN"/"Infinity" strings.
//
// Low severity — cosmetic — but the library otherwise blocks non-finite
// numbers from arithmetic results via `finiteNum`. cat skips that check by
// reading a Number value straight from data.
// ───────────────────────────────────────────────────────────────────────────

test("F6: cat of NaN/Infinity does not embed the literal token in the string", (t) => {
  const r = JsonLogic.apply({ cat: [{ var: "x" }, "_done"] }, {
    x: NaN,
  } as never);
  t.is(r.TAG, "Ok");
  if (r.TAG !== "Ok") return;
  t.false(
    typeof r._0 === "string" && r._0.includes("NaN"),
    `cat produced "${r._0}" — leaked NaN token`,
  );
});
