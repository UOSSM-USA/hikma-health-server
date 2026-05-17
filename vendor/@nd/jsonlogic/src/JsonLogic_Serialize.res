// AST → JSON.t — the inverse of JsonLogic_Parse.
//
// Goal: `parse(serialize(parse(json))) == parse(json)` for any parseable
// JSON. The interesting case is the unary-unwrap pair (`!`, `!!`): the
// parser strips a single-element array wrapper, so to preserve an
// `ArrayOf` of length 1 we always emit the operand inside an array
// (`{ "!": [serialize(arg)] }`). Parser unwraps once; the inner shape is
// preserved.
//
// Other shape decisions:
//   - `if`/`?:` round-trip through `"if"` (canonical key).
//   - `try`/`??` always emit array form (parseStaticPermissive accepts
//     either, but array is unambiguous).
//   - `preserve` emits the stored JSON verbatim — that's the whole point
//     of the escape hatch.

open JsonLogic_Ast

let rec serialize = (rule: t): JSON.t =>
  switch rule {
  | Literal(json) => json
  | ArrayOf(elems) => JSON.Array(elems->Array.map(serialize))
  // Path access
  | Val(r) => obj("val", serialize(r))
  | Var(r) => obj("var", serialize(r))
  | Exists(r) => obj("exists", serialize(r))
  | Missing(r) => obj("missing", serialize(r))
  | MissingSome(a, b) => obj("missing_some", JSON.Array([serialize(a), serialize(b)]))
  // Boolean negation — wrap to preserve ArrayOf-of-one through parser unwrap.
  | Not(r) => obj("!", JSON.Array([serialize(r)]))
  | NotNot(r) => obj("!!", JSON.Array([serialize(r)]))
  // Logical
  | And(args) => obj("and", serializeAll(args))
  | Or(args) => obj("or", serializeAll(args))
  // Conditional — canonical key is "if"; "?:" is an accepted alias on parse.
  | If(args) => obj("if", serializeAll(args))
  // Comparison
  | Lt(args) => obj("<", serializeAll(args))
  | Lte(args) => obj("<=", serializeAll(args))
  | Gt(args) => obj(">", serializeAll(args))
  | Gte(args) => obj(">=", serializeAll(args))
  | Eq(args) => obj("==", serializeAll(args))
  | Neq(args) => obj("!=", serializeAll(args))
  | StrictEq(args) => obj("===", serializeAll(args))
  | StrictNeq(args) => obj("!==", serializeAll(args))
  // Arithmetic (eager variadic — single rule arg)
  | Add(r) => obj("+", serialize(r))
  | Sub(r) => obj("-", serialize(r))
  | Mul(r) => obj("*", serialize(r))
  | Div(r) => obj("/", serialize(r))
  | Mod(r) => obj("%", serialize(r))
  | Min(r) => obj("min", serialize(r))
  | Max(r) => obj("max", serialize(r))
  // Iteration
  | Map(c, b) => obj("map", JSON.Array([serialize(c), serialize(b)]))
  | Filter(c, b) => obj("filter", JSON.Array([serialize(c), serialize(b)]))
  | Reduce(c, b, i) =>
    obj("reduce", JSON.Array([serialize(c), serialize(b), serialize(i)]))
  | All(c, b) => obj("all", JSON.Array([serialize(c), serialize(b)]))
  | Some_(c, b) => obj("some", JSON.Array([serialize(c), serialize(b)]))
  | None_(c, b) => obj("none", JSON.Array([serialize(c), serialize(b)]))
  // Collection / membership
  | In(n, h) => obj("in", JSON.Array([serialize(n), serialize(h)]))
  | Merge(r) => obj("merge", serialize(r))
  // Error handling
  | Throw(r) => obj("throw", serialize(r))
  | Try(args) => obj("try", serializeAll(args))
  // Coalesce
  | Coalesce(args) => obj("??", serializeAll(args))
  // String / array
  | Length(r) => obj("length", serialize(r))
  | Cat(r) => obj("cat", serialize(r))
  | Substr(args) => obj("substr", serializeAll(args))
  // Escape hatch — raw JSON, no recursion.
  | Preserve(json) => obj("preserve", json)
  }
and serializeAll = (args: array<t>): JSON.t => JSON.Array(args->Array.map(serialize))
and obj = (key: string, value: JSON.t): JSON.t =>
  JSON.Object(Dict.fromArray([(key, value)]))
