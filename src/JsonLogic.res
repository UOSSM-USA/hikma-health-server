// JSONLogic interpreter — https://jsonlogic.com/
//
// Two-phase design:
//   1. `parse`     : JSON.t → result<Ast.t, parseError>
//      Validates rule structure and produces a typed AST. Unknown operators,
//      multi-key objects, and shape errors (e.g. wrong arity) are caught
//      here.
//   2. `evaluate`  : (Ast.t, JSON.t) → result<JSON.t, evalError>
//      Total over the operator set (the AST is a closed variant). Remaining
//      errors are runtime: NaN, invalid arguments, user-raised `throw`.
//
// `apply` is the convenience that does both in one call and returns a single
// flat `error` variant — a TS caller walks one `TAG` to discriminate, not
// two. Callers that already have a parsed `Ast.t` (e.g. parse once / eval
// many) use `evaluate` directly and get the narrower `evalError`.
//
// Note: `evaluate` is named instead of `eval` because `eval` is a reserved
// identifier in JavaScript strict mode and can't be exported.

// Flat error union for the `apply` convenience path. Variants mirror the
// constructors of `parseError` and `evalError` so users don't have to walk
// two layers of discriminated unions.
@genType
type error =
  // Parse-time
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | MaxDepthExceeded
  // Eval-time
  | NaNError
  | InvalidArguments(string)
  | Thrown(JSON.t)

// Error union returned by `validateString`. Mirrors `parseError` plus an
// `InvalidJson` case for when the input string isn't valid JSON.
@genType
type validationError =
  | InvalidJson(string)
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | MaxDepthExceeded

@genType
let parse = (rule: JSON.t): result<JsonLogic_Ast.t, JsonLogic_Parse.parseError> =>
  JsonLogic_Parse.parse(rule)

@genType
let evaluate = (
  rule: JsonLogic_Ast.t,
  data: JSON.t,
): result<JSON.t, JsonLogic_Eval.evalError> =>
  JsonLogic_Eval.eval(rule, JsonLogic_Scope.make(data))

let liftParseError = (e: JsonLogic_Parse.parseError): error =>
  switch e {
  | UnknownOperator(s) => UnknownOperator(s)
  | MultiKeyObject(ks) => MultiKeyObject(ks)
  | InvalidShape({operator, message}) => InvalidShape({operator, message})
  | MaxDepthExceeded => MaxDepthExceeded
  }

let liftEvalError = (e: JsonLogic_Eval.evalError): error =>
  switch e {
  | NaNError => NaNError
  | InvalidArguments(s) => InvalidArguments(s)
  | Thrown(j) => Thrown(j)
  | MaxDepthExceeded => MaxDepthExceeded
  }

@genType
let apply = (rule: JSON.t, data: JSON.t): result<JSON.t, error> =>
  switch parse(rule) {
  | Error(e) => Error(liftParseError(e))
  | Ok(parsed) =>
    switch evaluate(parsed, data) {
    | Ok(v) => Ok(v)
    | Error(e) => Error(liftEvalError(e))
    }
  }

// --- Validation ---
//
// Structural-only checks, stopping at the first error. `validate` is a
// thin wrapper over `parse` that discards the AST. `validateString`
// additionally handles JSON.parse failures so callers can pass a raw
// rule string straight from disk / network without a two-step dance.

let liftToValidation = (e: JsonLogic_Parse.parseError): validationError =>
  switch e {
  | UnknownOperator(s) => UnknownOperator(s)
  | MultiKeyObject(ks) => MultiKeyObject(ks)
  | InvalidShape({operator, message}) => InvalidShape({operator, message})
  | MaxDepthExceeded => MaxDepthExceeded
  }

@genType
let validate = (rule: JSON.t): result<unit, JsonLogic_Parse.parseError> =>
  switch parse(rule) {
  | Ok(_) => Ok()
  | Error(e) => Error(e)
  }

@genType
let validateString = (input: string): result<unit, validationError> =>
  switch JSON.parseOrThrow(input) {
  | json =>
    switch parse(json) {
    | Ok(_) => Ok()
    | Error(e) => Error(liftToValidation(e))
    }
  | exception JsExn(e) =>
    Error(InvalidJson(JsExn.message(e)->Option.getOr("invalid JSON")))
  }

// --- Construction ---
//
// Re-exports for round-trip and UI-editor consumers. `serialize` is the
// inverse of `parse`; `operators` is the metadata catalog.

@genType
let serialize: JsonLogic_Ast.t => JSON.t = JsonLogic_Serialize.serialize

@genType
let operators: array<JsonLogic_Catalog.operatorMeta> = JsonLogic_Catalog.operators

// --- Result helpers ---
//
// Predicates and throw-on-error wrappers. The predicates are mainly for
// readability and ReScript-side parity with `Stdlib.Result`; TS callers
// get the same return type but not auto-narrowing (genType can't emit
// type predicates), so `r.TAG === "Ok"` is still the way to narrow.
//
// The `*Exn` variants throw a single `JsonLogicError(error)` regardless
// of which phase failed, so TS callers have one catch shape.

@genType
let isOk = (r: result<'a, 'b>): bool =>
  switch r {
  | Ok(_) => true
  | Error(_) => false
  }

@genType
let isError = (r: result<'a, 'b>): bool =>
  switch r {
  | Ok(_) => false
  | Error(_) => true
  }

@genType
exception JsonLogicError(error)

@genType
let parseExn = (rule: JSON.t): JsonLogic_Ast.t =>
  switch parse(rule) {
  | Ok(ast) => ast
  | Error(e) => throw(JsonLogicError(liftParseError(e)))
  }

@genType
let evaluateExn = (rule: JsonLogic_Ast.t, data: JSON.t): JSON.t =>
  switch evaluate(rule, data) {
  | Ok(v) => v
  | Error(e) => throw(JsonLogicError(liftEvalError(e)))
  }

@genType
let applyExn = (rule: JSON.t, data: JSON.t): JSON.t =>
  switch apply(rule, data) {
  | Ok(v) => v
  | Error(e) => throw(JsonLogicError(e))
  }

// `getError` recovers the typed `error` from a value caught in a JS
// try/catch. ReScript exceptions emit as plain JS objects with no TS-
// friendly type metadata, so genType-side consumers need this bridge to
// inspect what the `*Exn` variants threw.
//
// Implementation: re-throw the caught value and re-catch via the
// `JsonLogicError` pattern. Anything that isn't one of ours returns
// `None`, leaving the caller free to rethrow it.
@genType
let getError = (caught: 'a): option<error> =>
  try {
    throw((Obj.magic(caught): exn))
  } catch {
  | JsonLogicError(e) => Some(e)
  | _ => None
  }
