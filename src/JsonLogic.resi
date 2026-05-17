// Public interface for the JSONLogic interpreter.
//
// `parse` and `evaluate` keep their narrow error types (`parseError` and
// `evalError` from the respective submodules) so callers that drive the
// two phases separately get precise type information. `apply` collapses
// both into a single flat `error` union for the common one-shot case.

@genType
type error =
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | MaxDepthExceeded
  | NaNError
  | InvalidArguments(string)
  | Thrown(JSON.t)

// `validationError` extends `parseError` with `InvalidJson` for the
// string-input variant. The JSON.t-input variant uses `parseError`
// directly since it can never produce a JSON parse failure.
@genType
type validationError =
  | InvalidJson(string)
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | MaxDepthExceeded

@genType
let parse: JSON.t => result<JsonLogic_Ast.t, JsonLogic_Parse.parseError>

@genType
let evaluate: (JsonLogic_Ast.t, JSON.t) => result<JSON.t, JsonLogic_Eval.evalError>

@genType
let apply: (JSON.t, JSON.t) => result<JSON.t, error>

// --- Validation ---
//
// Structural checks only — stop at the first error. Eval-time errors
// (NaN, throw, invalid arguments) depend on input data and are out of
// scope; they surface from `evaluate` / `apply`.

@genType
let validate: JSON.t => result<unit, JsonLogic_Parse.parseError>

@genType
let validateString: string => result<unit, validationError>

// --- Construction ---
//
// `serialize` is the inverse of `parse` for round-trip use by UI editors:
// load JSON → AST (parse), edit the AST, save AST → JSON (serialize).
// The catalog enumerates every operator with metadata a UI palette binds
// to (display label, category, arity, slot labels).

@genType
let serialize: JsonLogic_Ast.t => JSON.t

@genType
let operators: array<JsonLogic_Catalog.operatorMeta>

// --- Result helpers ---
//
// `isOk`/`isError` mirror `Stdlib.Result` for ReScript ergonomics; in TS
// they don't act as type predicates (genType limitation), so prefer
// `r.TAG === "Ok"` there if you need narrowing.
//
// The `*Exn` variants throw `JsonLogicError(error)` on failure — one
// catch shape regardless of which phase produced the error.

@genType
let isOk: result<'a, 'b> => bool

@genType
let isError: result<'a, 'b> => bool

@genType
exception JsonLogicError(error)

@genType
let parseExn: JSON.t => JsonLogic_Ast.t

@genType
let evaluateExn: (JsonLogic_Ast.t, JSON.t) => JSON.t

@genType
let applyExn: (JSON.t, JSON.t) => JSON.t

// `getError(caught)` returns `Some(error)` when `caught` is a value thrown
// by one of the `*Exn` variants, otherwise `None`. Use inside a TS/JS
// `catch` block to inspect what was thrown without writing the runtime
// `RE_EXN_ID` check by hand.
@genType
let getError: 'a => option<error>
