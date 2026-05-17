import test from "ava";
import * as JsonLogic from "../src/JsonLogic.gen";

// Catalog drift guard. The parser's known operator set lives in
// JsonLogic_Parse.parseOp; if you add an operator there you MUST also
// add it here. Failing this test means the catalog (a UI's source of
// truth) lost sync with what the engine accepts.
const KNOWN_OPERATORS: ReadonlySet<string> = new Set([
  "var", "val", "exists", "missing", "missing_some",
  "!", "!!",
  "and", "or",
  "if", "?:",
  "<", "<=", ">", ">=", "==", "!=", "===", "!==",
  "+", "-", "*", "/", "%", "min", "max",
  "map", "filter", "reduce", "all", "some", "none",
  "in", "merge",
  "throw", "try",
  "??",
  "length", "cat", "substr",
  "preserve",
]);

const catalogKeys = (): Set<string> => {
  const out = new Set<string>();
  for (const op of JsonLogic.operators) {
    out.add(op.key);
    for (const alias of op.aliases) out.add(alias);
  }
  return out;
};

test("catalog covers every operator the parser recognizes", (t) => {
  const cat = catalogKeys();
  const missing = [...KNOWN_OPERATORS].filter((k) => !cat.has(k));
  t.deepEqual(missing, [], `missing from catalog: ${missing.join(", ")}`);
});

test("catalog contains no operators the parser does not recognize", (t) => {
  const cat = catalogKeys();
  const extra = [...cat].filter((k) => !KNOWN_OPERATORS.has(k));
  t.deepEqual(extra, [], `unknown to parser: ${extra.join(", ")}`);
});

test("every operator key in the catalog parses a minimal invocation", (t) => {
  // Always emit array form of length `minArgs` (min 1). Static-array ops
  // like `and`/`or` need the brackets even for 0 args; unary ops accept
  // `[x]` via parseUnaryUnwrap; everything else accepts the array.
  for (const op of JsonLogic.operators) {
    const len = Math.max(op.minArgs, 1);
    const args = Array.from({ length: len }, () => null);
    const rule = { [op.key]: args };
    const r = JsonLogic.parse(rule);
    if (r.TAG !== "Ok") {
      t.fail(`parse failed for catalog entry "${op.key}": ${JSON.stringify(r._0)}`);
    }
  }
  t.pass();
});

test("operator labels and categories are non-empty", (t) => {
  for (const op of JsonLogic.operators) {
    t.true(op.label.length > 0, `${op.key} has empty label`);
    t.true(op.category.length > 0, `${op.key} has empty category`);
    t.true(op.minArgs >= 0, `${op.key} has negative minArgs`);
    if (op.maxArgs !== undefined) {
      t.true(op.maxArgs >= op.minArgs, `${op.key} maxArgs < minArgs`);
    }
  }
});
