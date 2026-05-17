import test from "ava";
import * as JsonLogic from "../src/JsonLogic.gen";

// Smoke tests for the Result helpers and Exn variants. The bulk of
// semantic coverage lives in logic.test.ts via the `apply` suites; these
// only verify the thin wrappers around it.

test("isOk / isError discriminate Result", (t) => {
  t.true(JsonLogic.isOk(JsonLogic.apply(1, null)));
  t.false(JsonLogic.isError(JsonLogic.apply(1, null)));
  t.true(JsonLogic.isError(JsonLogic.apply({ "unknown_op": 1 }, null)));
  t.false(JsonLogic.isOk(JsonLogic.apply({ "unknown_op": 1 }, null)));
});

test("applyExn returns the value when Ok", (t) => {
  t.is(JsonLogic.applyExn({ "+": [1, 2] }, null), 3);
});

test("applyExn throws JsonLogicError on Error, recoverable via getError", (t) => {
  try {
    JsonLogic.applyExn({ "unknown_op": 1 }, null);
    t.fail("expected throw");
  } catch (e) {
    const err = JsonLogic.getError(e);
    if (err === undefined) {
      t.fail("getError returned undefined for a JsonLogic exception");
      return;
    }
    if (typeof err === "string") {
      t.fail(`unexpected NaNError for an unknown operator`);
      return;
    }
    t.is(err.TAG, "UnknownOperator");
    if (err.TAG === "UnknownOperator") t.is(err._0, "unknown_op");
  }
});

test("getError returns undefined for non-JsonLogic throws", (t) => {
  try {
    throw new Error("nope");
  } catch (e) {
    t.is(JsonLogic.getError(e), undefined);
  }
});

test("parseExn round-trips through evaluateExn", (t) => {
  const ast = JsonLogic.parseExn({ "*": [3, 4] });
  t.is(JsonLogic.evaluateExn(ast, null), 12);
});

test("parseExn throws on unknown operator, recoverable via getError", (t) => {
  try {
    JsonLogic.parseExn({ "bogus": 1 });
    t.fail("expected throw");
  } catch (e) {
    const err = JsonLogic.getError(e);
    t.not(err, undefined);
    if (err && typeof err !== "string") {
      t.is(err.TAG, "UnknownOperator");
    }
  }
});
