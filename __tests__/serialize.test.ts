import test from "ava";
import * as fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import * as JsonLogic from "../src/JsonLogic.gen";

// Round-trip property: for any JSON that parses to an AST, serializing
// that AST must produce JSON that re-parses to the SAME AST. We compare
// ASTs (not JSON) because the parser canonicalizes a few shapes — e.g.
// `{!: x}` and `{!: [x]}` both produce `Not(parse(x))`, and we always
// emit the array form. JSON equality would fail; AST equality is the
// actual contract.
test("parse(serialize(parse(json))) equals parse(json) on parseable JSON", (t) => {
  fc.assert(
    fc.property(fc.jsonValue(), (json) => {
      const first = JsonLogic.parse(json);
      if (first.TAG !== "Ok") return true; // unparseable inputs are out of scope
      const reJson = JsonLogic.serialize(first._0);
      const second = JsonLogic.parse(reJson as never);
      if (second.TAG !== "Ok") return false;
      return isDeepStrictEqual(first._0, second._0);
    }),
    { numRuns: 1000 },
  );
  t.pass();
});

// Random JSON almost never lands on an operator-shaped object — the test
// above is effectively only checking Literal/ArrayOf round-trip. This
// generator emits rule-shaped objects driven by the catalog so we
// actually exercise serialize on operator constructors. fc.letrec
// size-limits the recursion automatically.
const ruleArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  rule: fc.oneof(
    { weight: 1, arbitrary: tie("literal") },
    { weight: 4, arbitrary: tie("ruleOp") },
  ),
  literal: fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.integer({ min: -100, max: 100 }),
    fc.string({ maxLength: 8 }),
  ),
  ruleOp: fc.constantFrom(...JsonLogic.operators).chain((op) => {
    if (op.key === "preserve") {
      // preserve's arg is raw JSON, not a recursive rule.
      return fc.jsonValue().map((j) => ({ preserve: j }));
    }
    if (op.maxArgs === 1) {
      // parseFixed1 / parseUnaryUnwrap: single rule arg.
      return tie("rule").map((r) => ({ [op.key]: r }));
    }
    const upper = op.maxArgs ?? op.minArgs + 2;
    return fc
      .array(tie("rule"), {
        minLength: Math.max(1, op.minArgs),
        maxLength: Math.max(upper, op.minArgs + 1),
      })
      .map((args) => ({ [op.key]: args }));
  }),
})).rule;

test("parse-serialize-parse is identity on generated operator-shaped rules", (t) => {
  fc.assert(
    fc.property(ruleArb, (json) => {
      const first = JsonLogic.parse(json as never);
      if (first.TAG !== "Ok") return true; // generator may emit invalid arity occasionally
      const reJson = JsonLogic.serialize(first._0);
      const second = JsonLogic.parse(reJson as never);
      if (second.TAG !== "Ok") return false;
      return isDeepStrictEqual(first._0, second._0);
    }),
    { numRuns: 1000 },
  );
  t.pass();
});

// Spot checks — easier to debug than a property failure.

test("serialize emits canonical 'if' key for If", (t) => {
  const ast = JsonLogic.parseExn({ "?:": [true, 1, 2] });
  const json = JsonLogic.serialize(ast) as { if?: unknown[] };
  t.truthy(json.if);
});

test("serialize preserves ArrayOf-of-one through unary negation", (t) => {
  // {!: [[null]]} → Not(ArrayOf([Literal(null)])) → must re-emit a form
  // that re-parses to the same AST (i.e., still Not(ArrayOf([...]))).
  const original = { "!": [[null]] };
  const ast = JsonLogic.parseExn(original);
  const reJson = JsonLogic.serialize(ast);
  const reAst = JsonLogic.parseExn(reJson as never);
  t.true(isDeepStrictEqual(ast, reAst));
});

test("serialize keeps preserve payload verbatim", (t) => {
  const inner = { foo: 1, bar: [1, 2, 3] };
  const ast = JsonLogic.parseExn({ preserve: inner });
  const json = JsonLogic.serialize(ast) as { preserve: unknown };
  t.deepEqual(json.preserve, inner);
});

test("serialize round-trip composes a non-trivial rule", (t) => {
  const rule = {
    if: [{ ">": [{ var: "age" }, 18] }, "adult", "minor"],
  };
  const ast = JsonLogic.parseExn(rule);
  const reJson = JsonLogic.serialize(ast);
  const reAst = JsonLogic.parseExn(reJson as never);
  t.true(isDeepStrictEqual(ast, reAst));
});
