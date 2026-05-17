import test from "ava";
import * as JsonLogic from "../src/JsonLogic.gen";

// `validate` / `validateString` are structural checks only. They share
// the parser with `parse`, so semantic coverage of operator shapes lives
// in logic.test.ts; these tests cover the public surface, the
// JSON-parse error path, and the unit-success shape.

test("validate accepts a well-formed rule", (t) => {
  const r = JsonLogic.validate({ "+": [1, 2] });
  t.is(r.TAG, "Ok");
});

test("validate accepts a literal", (t) => {
  t.is(JsonLogic.validate(42).TAG, "Ok");
  t.is(JsonLogic.validate("hello").TAG, "Ok");
  t.is(JsonLogic.validate(null).TAG, "Ok");
  t.is(JsonLogic.validate({}).TAG, "Ok"); // empty object is a literal
});

test("validate accepts nested rules", (t) => {
  const r = JsonLogic.validate({
    if: [{ ">": [{ var: "age" }, 18] }, "adult", "minor"],
  });
  t.is(r.TAG, "Ok");
});

test("validate flags unknown operator", (t) => {
  const r = JsonLogic.validate({ bogus_op: [1] });
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "UnknownOperator");
  if (r._0.TAG === "UnknownOperator") t.is(r._0._0, "bogus_op");
});

test("validate flags multi-key object", (t) => {
  const r = JsonLogic.validate({ "+": [1], "-": [1] });
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "MultiKeyObject");
  if (r._0.TAG === "MultiKeyObject") t.deepEqual(r._0._0.sort(), ["+", "-"]);
});

test("validate flags arity error on comparison", (t) => {
  const r = JsonLogic.validate({ "<": [1] });
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "InvalidShape");
  if (r._0.TAG === "InvalidShape") t.is(r._0.operator, "<");
});

test("validate flags nested unknown operator", (t) => {
  // Outer is fine; inner is not — parser walks the tree.
  const r = JsonLogic.validate({ "+": [{ bogus: 1 }, 2] });
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "UnknownOperator");
});

test("validateString accepts a well-formed rule string", (t) => {
  const r = JsonLogic.validateString('{"+":[1,2]}');
  t.is(r.TAG, "Ok");
});

test("validateString flags invalid JSON with the underlying SyntaxError message", (t) => {
  const r = JsonLogic.validateString("{not json");
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "InvalidJson");
  if (r._0.TAG === "InvalidJson") {
    // Confirm we surfaced the real V8 message, not the "invalid JSON"
    // fallback used when JsExn.message is None.
    t.not(r._0._0, "invalid JSON");
    t.true(r._0._0.length > 0);
  }
});

test("validateString flags empty string as InvalidJson", (t) => {
  const r = JsonLogic.validateString("");
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "InvalidJson");
});

test("validateString flags structural errors after successful JSON parse", (t) => {
  const r = JsonLogic.validateString('{"unknown_op":1}');
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "UnknownOperator");
  if (r._0.TAG === "UnknownOperator") t.is(r._0._0, "unknown_op");
});

test("validateString flags multi-key object", (t) => {
  const r = JsonLogic.validateString('{"+":[1],"-":[1]}');
  if (r.TAG !== "Error") return t.fail("expected Error");
  t.is(r._0.TAG, "MultiKeyObject");
});

test("validateString accepts a bare JSON literal string", (t) => {
  t.is(JsonLogic.validateString("42").TAG, "Ok");
  t.is(JsonLogic.validateString('"hello"').TAG, "Ok");
  t.is(JsonLogic.validateString("null").TAG, "Ok");
});
