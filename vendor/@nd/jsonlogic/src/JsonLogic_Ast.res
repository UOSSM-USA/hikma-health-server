// JSONLogic AST.
//
// A `Rule.t` is the parsed form of a JSONLogic rule. The parser turns raw
// `JSON.t` into this type, after which evaluation is a total pattern match
// over a closed set of operators.
//
// The variant is flat (no nested `Op(operation)` indirection) so it round-
// trips cleanly through genType into a single discriminated union on the
// TypeScript side.
//
// Shape conventions for operator arguments:
//   - Fixed-arity ops (Map, Reduce, In, …) take individual `t` fields so
//     the parser proves arity at parse time.
//   - Static-variadic ops (And, If, Try, comparisons) take `array<t>`
//     because they need each branch enumerated up front for short-circuit
//     semantics.
//   - Eager-variadic ops (Add, Cat, Merge) take a single `t` whose
//     evaluated value is the operand list. That preserves the spec quirk
//     that lets `{"+": {"val":"arr"}}` work alongside `{"+": [1,2,3]}`.

@genType
type rec t =
  // --- Literals / structural
  | Literal(JSON.t) // any non-rule JSON (incl. empty `{}`)
  | ArrayOf(array<t>) // array rule: evaluates element-by-element
  // --- Path access (unary)
  | Val(t)
  | Var(t)
  | Exists(t)
  | Missing(t)
  // --- Boolean negation (unary)
  | Not(t)
  | NotNot(t)
  // --- Logical (static variadic, short-circuit)
  | And(array<t>)
  | Or(array<t>)
  // --- Conditional (static variadic, pair-based + optional fallback)
  | If(array<t>)
  // --- Comparison (static variadic, chained; ≥2 args)
  | Lt(array<t>)
  | Lte(array<t>)
  | Gt(array<t>)
  | Gte(array<t>)
  | Eq(array<t>)
  | Neq(array<t>)
  | StrictEq(array<t>)
  | StrictNeq(array<t>)
  // --- Arithmetic (eager variadic)
  | Add(t)
  | Sub(t)
  | Mul(t)
  | Div(t)
  | Mod(t)
  | Min(t)
  | Max(t)
  // --- Iteration (static, fixed arity)
  | Map(t, t) // (collection, callback)
  | Filter(t, t)
  | Reduce(t, t, t) // (collection, callback, init)
  | All(t, t)
  | Some_(t, t)
  | None_(t, t)
  // --- Collection / membership (static, fixed arity)
  | In(t, t) // (needle, haystack)
  | MissingSome(t, t) // (min, keys)
  | Merge(t) // eager variadic
  // --- Error handling
  | Throw(t)
  | Try(array<t>) // static variadic — caller-side branches
  // --- Coalesce (static variadic)
  | Coalesce(array<t>)
  // --- String / array
  | Length(t)
  | Cat(t) // eager variadic
  | Substr(array<t>) // static variadic: (str, start[, length])
  // --- Escape hatch — raw JSON, no recursive parse
  | Preserve(JSON.t)
