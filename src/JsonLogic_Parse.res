// JSONLogic parser: JSON.t → result<Ast.t, parseError>
//
// Rules:
//   - Any JSON value that isn't an object or array is a literal.
//   - An array becomes `ArrayOf`, with each element recursively parsed.
//   - A multi-key object is ambiguous (which op runs first?) and the spec
//     treats it as an error.
//   - A single-key object whose key is a known operator becomes the
//     corresponding constructor (`Add(...)`, `Map(...)`, …).
//   - `preserve` is the escape hatch: the value is kept as raw JSON with no
//     recursion, so multi-key/operator-shaped data can be embedded.
//   - An empty object `{}` is a literal — matches the original
//     "0-entry → return rule" behaviour in applyScope.
//
// The parser is intentionally dumb about path semantics. `var`'s dot-split
// and the scope-climb `[N]` array form happen at eval time, not parse time:
// `{var: "a.b"}` parses to `Var(Literal(String "a.b"))`, and the dot-split
// happens inside the evaluator.
//
// Depth limit: every recursive entry point threads `~depth` to bound AST
// nesting. A rule deeper than `maxDepth` returns `MaxDepthExceeded` rather
// than recursing to a `RangeError`. The convention is that `~depth` names
// the depth of the rule the function is currently processing; recursive
// calls into child rules pass `~depth=depth + 1`.

open JsonLogic_Ast

@genType
type parseError =
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | MaxDepthExceeded

let maxDepth = 256

let shapeErr = (op: string, msg: string): parseError => InvalidShape({
  operator: op,
  message: msg,
})

// Traverse an array of rules, bailing at the first parse error.
let rec parseAll = (~depth: int, arr: array<JSON.t>): result<array<t>, parseError> => {
  let out = []
  let err = ref(None)
  let i = ref(0)
  while err.contents == None && i.contents < Array.length(arr) {
    switch parse(~depth=depth + 1, Array.getUnsafe(arr, i.contents)) {
    | Ok(r) => Array.push(out, r)
    | Error(e) => err := Some(e)
    }
    i := i.contents + 1
  }
  switch err.contents {
  | Some(e) => Error(e)
  | None => Ok(out)
  }
}

// Parse the raw arg as an array of sub-rules. Used for static-arity ops that
// require an array literal in the source rule.
and parseArray = (~depth: int, op: string, raw: JSON.t): result<array<t>, parseError> =>
  switch raw {
  | Array(arr) => parseAll(~depth, arr)
  | _ => Error(shapeErr(op, "expects an array of arguments"))
  }

and parseFixed1 = (~depth: int, _op: string, raw: JSON.t, build: t => t): result<t, parseError> =>
  parse(~depth=depth + 1, raw)->Result.map(r => build(r))

and parseFixed2 = (~depth: int, op: string, raw: JSON.t, build: (t, t) => t): result<t, parseError> =>
  switch parseArray(~depth, op, raw) {
  | Error(e) => Error(e)
  | Ok(args) =>
    Array.length(args) >= 2
      ? Ok(build(Array.getUnsafe(args, 0), Array.getUnsafe(args, 1)))
      : Error(shapeErr(op, "expects at least 2 arguments"))
  }

and parseFixed3 = (~depth: int, op: string, raw: JSON.t, build: (t, t, t) => t): result<t, parseError> =>
  switch parseArray(~depth, op, raw) {
  | Error(e) => Error(e)
  | Ok(args) =>
    Array.length(args) >= 3
      ? Ok(
          build(
            Array.getUnsafe(args, 0),
            Array.getUnsafe(args, 1),
            Array.getUnsafe(args, 2),
          ),
        )
      : Error(shapeErr(op, "expects at least 3 arguments"))
  }

// Static variadic: arg must be an array literal.
and parseStatic = (~depth: int, op: string, raw: JSON.t, build: array<t> => t): result<t, parseError> =>
  parseArray(~depth, op, raw)->Result.map(args => build(args))

// Static variadic with minimum arity (comparisons, substr).
and parseStaticMin = (
  ~depth: int,
  op: string,
  raw: JSON.t,
  min: int,
  build: array<t> => t,
): result<t, parseError> =>
  switch parseArray(~depth, op, raw) {
  | Error(e) => Error(e)
  | Ok(args) =>
    Array.length(args) >= min
      ? Ok(build(args))
      : Error(shapeErr(op, `expects at least ${Int.toString(min)} arguments`))
  }

// `try` and `??` allow either an array of attempts or a single attempt rule.
// Normalize to `array<t>` at parse time.
and parseStaticPermissive = (~depth: int, raw: JSON.t, build: array<t> => t): result<t, parseError> =>
  switch raw {
  | Array(arr) => parseAll(~depth, arr)->Result.map(args => build(args))
  | _ => parse(~depth=depth + 1, raw)->Result.map(r => build([r]))
  }

// Unary boolean ops accept `{!: rule}` or `{!: [rule]}` interchangeably —
// EXCEPT when `rule` is itself a single-element array. Unwrap strips one
// array level, so `{!: [[null]]}` parses to `Not(ArrayOf([Literal(null)]))`
// (truthy → false) while `{!: [null]}` parses to `Not(Literal(null))`
// (falsy → true). This matches reference JSONLogic.js's `if
// (Array.isArray(a)) a = a[0]` and is observable to callers.
and parseUnaryUnwrap = (~depth: int, raw: JSON.t, build: t => t): result<t, parseError> =>
  switch raw {
  | Array(arr) if Array.length(arr) == 1 =>
    parse(~depth=depth + 1, Array.getUnsafe(arr, 0))->Result.map(r => build(r))
  | _ => parse(~depth=depth + 1, raw)->Result.map(r => build(r))
  }

and parseOp = (~depth: int, op: string, raw: JSON.t): result<t, parseError> =>
  switch op {
  // Path access (unary)
  | "val" => parseFixed1(~depth, op, raw, r => Val(r))
  | "var" => parseFixed1(~depth, op, raw, r => Var(r))
  | "exists" => parseFixed1(~depth, op, raw, r => Exists(r))
  | "missing" => parseFixed1(~depth, op, raw, r => Missing(r))
  | "missing_some" => parseFixed2(~depth, op, raw, (a, b) => MissingSome(a, b))
  // Boolean negation
  | "!" => parseUnaryUnwrap(~depth, raw, r => Not(r))
  | "!!" => parseUnaryUnwrap(~depth, raw, r => NotNot(r))
  // Logical
  | "and" => parseStatic(~depth, op, raw, args => And(args))
  | "or" => parseStatic(~depth, op, raw, args => Or(args))
  // Conditional — both keys are equivalent.
  | "if" | "?:" => parseStatic(~depth, op, raw, args => If(args))
  // Comparison (require ≥2 args)
  | "<" => parseStaticMin(~depth, op, raw, 2, args => Lt(args))
  | "<=" => parseStaticMin(~depth, op, raw, 2, args => Lte(args))
  | ">" => parseStaticMin(~depth, op, raw, 2, args => Gt(args))
  | ">=" => parseStaticMin(~depth, op, raw, 2, args => Gte(args))
  | "==" => parseStaticMin(~depth, op, raw, 2, args => Eq(args))
  | "!=" => parseStaticMin(~depth, op, raw, 2, args => Neq(args))
  | "===" => parseStaticMin(~depth, op, raw, 2, args => StrictEq(args))
  | "!==" => parseStaticMin(~depth, op, raw, 2, args => StrictNeq(args))
  // Arithmetic (eager variadic — arg may evaluate to an array)
  | "+" => parseFixed1(~depth, op, raw, r => Add(r))
  | "-" => parseFixed1(~depth, op, raw, r => Sub(r))
  | "*" => parseFixed1(~depth, op, raw, r => Mul(r))
  | "/" => parseFixed1(~depth, op, raw, r => Div(r))
  | "%" => parseFixed1(~depth, op, raw, r => Mod(r))
  | "min" => parseFixed1(~depth, op, raw, r => Min(r))
  | "max" => parseFixed1(~depth, op, raw, r => Max(r))
  // Iteration
  | "map" => parseFixed2(~depth, op, raw, (c, b) => Map(c, b))
  | "filter" => parseFixed2(~depth, op, raw, (c, b) => Filter(c, b))
  | "reduce" => parseFixed3(~depth, op, raw, (c, b, i) => Reduce(c, b, i))
  | "all" => parseFixed2(~depth, op, raw, (c, b) => All(c, b))
  | "some" => parseFixed2(~depth, op, raw, (c, b) => Some_(c, b))
  | "none" => parseFixed2(~depth, op, raw, (c, b) => None_(c, b))
  // Collection / membership
  | "in" => parseFixed2(~depth, op, raw, (n, h) => In(n, h))
  | "merge" => parseFixed1(~depth, op, raw, r => Merge(r))
  // Error handling
  | "throw" => parseFixed1(~depth, op, raw, r => Throw(r))
  | "try" => parseStaticPermissive(~depth, raw, args => Try(args))
  // Coalesce
  | "??" => parseStaticPermissive(~depth, raw, args => Coalesce(args))
  // String / array
  | "length" => parseFixed1(~depth, op, raw, r => Length(r))
  | "cat" => parseFixed1(~depth, op, raw, r => Cat(r))
  | "substr" => parseStaticMin(~depth, op, raw, 2, args => Substr(args))
  // Escape — raw, no recursion
  | "preserve" => Ok(Preserve(raw))
  | _ => Error(UnknownOperator(op))
  }

and parse = (~depth=0, json: JSON.t): result<t, parseError> =>
  if depth > maxDepth {
    Error(MaxDepthExceeded)
  } else {
    switch json {
    | Array(arr) => parseAll(~depth, arr)->Result.map(elems => ArrayOf(elems))
    | Object(dict) =>
      let entries = Dict.toArray(dict)
      switch Array.length(entries) {
      | 0 => Ok(Literal(json))
      | 1 =>
        let (op, arg) = Array.getUnsafe(entries, 0)
        parseOp(~depth, op, arg)
      | _ => Error(MultiKeyObject(entries->Array.map(((k, _)) => k)))
      }
    | _ => Ok(Literal(json))
    }
  }
