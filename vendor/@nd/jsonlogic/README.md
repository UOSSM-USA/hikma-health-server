# jsonlogic

A [JSONLogic](https://jsonlogic.com/) interpreter written in ReScript. Consumable from both ReScript and TypeScript codebases — every error path is a discriminated union, every operator is a closed AST constructor, nothing is `unknown`.

## Install

```sh
pnpm install
```

## Usage

The interpreter is two phases — `parse` (JSON → typed AST) and `evaluate` (AST + data → result). `apply` does both in one call and is the right default. `validate` / `validateString` perform structural checks only (no evaluation).

### TypeScript

```ts
import * as JsonLogic from "@nd/jsonlogic";

const result = JsonLogic.apply(
  { "if": [{ ">": [{ "var": "age" }, 18] }, "adult", "minor"] },
  { age: 21 },
);

if (result.TAG === "Ok") {
  console.log(result._0); // "adult"
} else {
  // result._0 is a discriminated union — handle by TAG
  switch (result._0) {
    case "NaNError":          /* … */ break;
    case "MaxDepthExceeded":  /* rule nested past the parse/eval depth cap */ break;
    default:
      switch (result._0.TAG) {
        case "UnknownOperator": /* result._0._0 is the op name */ break;
        case "MultiKeyObject":  /* result._0._0 is the list of keys */ break;
        case "InvalidShape":    /* result._0.operator, .message */ break;
        case "InvalidArguments":/* result._0._0 is the op name */ break;
        case "Thrown":          /* result._0._0 is the thrown JSON */ break;
      }
  }
}
```

For parse-once / evaluate-many, use the narrower entry points:

```ts
const parsed = JsonLogic.parse(rule);
if (parsed.TAG === "Ok") {
  const a = JsonLogic.evaluate(parsed._0, dataA);
  const b = JsonLogic.evaluate(parsed._0, dataB);
}
```

#### Throw-on-error variants

When the caller knows the rule is valid and just wants the value, the `*Exn` variants throw `JsonLogicError(error)` on failure:

```ts
try {
  const value = JsonLogic.applyExn(rule, data);
  // ...
} catch (e) {
  const err = JsonLogic.getError(e);
  if (err !== undefined) {
    // err is a typed JsonLogic.error — discriminate by TAG
    switch (err.TAG) {
      case "UnknownOperator": /* err._0 is the op name */ break;
      // …other cases as needed
    }
  } else {
    throw e; // not one of ours — let it propagate
  }
}
```

`JsonLogic.parseExn` and `JsonLogic.evaluateExn` work analogously. All three throw the same exception shape, so a single catch + `getError` covers the whole library.

`getError(caught)` returns `undefined` when the caught value is not a JsonLogic exception — handy for narrowing in mixed-error catch blocks.

#### Validation

To check whether a rule is structurally valid without evaluating it (e.g. linting user-authored rules), use `validate` or `validateString`. Both stop at the first error; eval-time errors (NaN, throw) are out of scope because they depend on data.

```ts
const r = JsonLogic.validate({ "if": [{ ">": [{ "var": "x" }, 0] }, "pos", "neg"] });
if (r.TAG === "Error") { /* r._0 has TAG: UnknownOperator | MultiKeyObject | InvalidShape | MaxDepthExceeded */ }

// validateString additionally surfaces JSON.parse failures
const s = JsonLogic.validateString('{"+":[1,2]}');
// s._0 may also be { TAG: "InvalidJson", _0: <SyntaxError message> }
```

#### Predicates

`JsonLogic.isOk(result)` and `JsonLogic.isError(result)` are convenience predicates. Note: they're *not* TS type predicates (genType doesn't emit `r is Ok<T>`), so for narrowing prefer `result.TAG === "Ok"`.

### ReScript

```rescript
switch JsonLogic.apply(rule, data) {
| Ok(value) => Console.log(value)
| Error(NaNError) => Console.log("NaN")
| Error(UnknownOperator(op)) => Console.log("unknown op: " ++ op)
| Error(Thrown(json)) => Console.log2("thrown:", json)
| Error(_) => ()
}
```

For the bail-on-error path, ReScript can pattern match the exception directly:

```rescript
try {
  let value = JsonLogic.applyExn(rule, data)
  Console.log(value)
} catch {
| JsonLogic.JsonLogicError(err) => Console.log2("failed:", err)
}
```

(`JsonLogic.getError` exists for TS/JS consumers that can't pattern match exceptions; ReScript callers should use the constructor in `catch` as shown above.)

```rescript
switch JsonLogic.validate(rule) {
| Ok() => Console.log("valid")
| Error(UnknownOperator(op)) => Console.log2("unknown op:", op)
| Error(_) => ()
}

switch JsonLogic.validateString(ruleString) {
| Ok() => Console.log("valid")
| Error(InvalidJson(msg)) => Console.log2("bad JSON:", msg)
| Error(_) => ()
}
```

The AST (`JsonLogic_Ast.t`) is a closed variant — build rules programmatically or pattern match over parsed ones with full exhaustiveness.

## Scripts

- `pnpm res:build` — compile ReScript
- `pnpm res:dev`   — compile in watch mode
- `pnpm test`      — run the JSONLogic spec test suite

## Project layout

```
src/
  JsonLogic.res          — public API: parse, evaluate, apply, error
  JsonLogic.resi         — public signature (locks the surface)
  JsonLogic_Ast.res      — closed AST variant
  JsonLogic_Parse.res    — JSON.t → result<Ast.t, parseError>
  JsonLogic_Eval.res     — Ast.t → Scope.t → result<JSON.t, evalError>
  JsonLogic_Serialize.res — Ast.t → JSON.t (inverse of parse)
  JsonLogic_Catalog.res  — operator metadata (for UI palettes)
  JsonLogic_Scope.res    — scope chain (list-based)
  JsonLogic_Path.res     — path / segment helpers
  JsonLogic_Coerce.res   — truthiness, numeric, equality primitives
__tests__/
  logic.test.ts          — AVA harness running JSONLogic compatibility suites
  validate.test.ts       — validate / validateString surface
  serialize.test.ts      — AST → JSON round-trip
  catalog.test.ts        — operator catalog ↔ parser parity
  helpers.test.ts        — predicates and *Exn variants
  properties.test.ts     — fast-check property tests
  adversarial.test.ts    — failure-mode tests for known footguns
  suites/                — JSON test fixtures
```

## License

Apache License 2.0 — see [LICENSE](LICENSE). Copyright 2026 No Discipline and Elsa Health.

## Compatibility notes

- The `evaluate` entry point is named instead of the spec-natural `eval` because `eval` is a reserved identifier in JavaScript strict mode.
- A few JSONLogic spec cases (`reduce` with array accumulator depth limits) are not implemented and are listed in `knownLimitations` in the test file.
- Parse and eval cap AST depth at 256 to prevent stack-overflow DoS on hostile or pathological rules; deeper rules surface as `MaxDepthExceeded` instead of crashing the host.


## Special Thanks
#### JsonLogic package and implementation
URL: [https://jsonlogic.com/](https://jsonlogic.com/)

Organization leading the charge in creating re-usable logic that can be used across the stack and anywhere JSON can be parsed and interpreted! Check out the repo and give them a star!


### JsonLogic engine
URL: [https://json-logic.github.io/json-logic-engine/](https://json-logic.github.io/json-logic-engine/)

Clean, fast and comprehensive implementation of JSONLogic parsing. This repository's test suite is entirely adapted from json-logic-engine! Couldn't do better if I tried.
