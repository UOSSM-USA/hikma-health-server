// JSONLogic evaluator for form-rule slots (visibility, requiredIf,
// validators). Slim Phase-6 port: the `computedValue` path and its
// stabilizing iteration helper stay in TS for now (deferred to a later
// slice — see decision #16 in hhform-logic-implementation.local.md).
//
// Design:
//   1. `compileRules(fields)` parses every slot rule ONCE and returns a
//      closure. Parse failures are captured as diagnostics, not thrown —
//      a broken rule must NOT block the form from rendering.
//   2. The closure `(scope) => ruleEvaluation` walks each field's parsed
//      ASTs and builds an immutable snapshot of the per-render decisions
//      (visibility, requiredness, validator errors).
//   3. Hidden-field policy: when `visibleIf` evaluates falsy, the field's
//      `requiredIf` and `validators` are short-circuited. The renderer
//      clears the field's value from form state (clear-on-hide).
//   4. Fail-safe semantics: parse and eval errors fall back to
//      conservative defaults (visible=true, required=field.required,
//      validator skipped). Diagnostics surface the underlying error.

// JSONLogic rules are opaque JSON. The TS side calls it `unknown`; in
// ReScript we keep it as `JSON.t` so consumers can pass through any JSON
// value the @nd/jsonlogic parser will accept.
@genType
type jsonLogicRule = JSON.t

// A user-authored validator. `rule` evaluates against the form scope;
// a falsy result fails validation and `message` is shown to the user.
// `id` is stable across reorderings so the form-builder UI can edit a
// specific validator. `code` is an optional machine-readable error code
// consumers may branch on.
@genType
type validator = {
  id: string,
  rule: jsonLogicRule,
  message: string,
  code?: string,
}

// Evaluation context. `form` maps field id → current value. `ctx` carries
// non-form data rules may reference via `{var: "ctx.now"}` etc. Mirrors
// the TS `RuleScope` shape exactly so the wire-level scope object built
// by callers is shared verbatim.
@genType
type ruleCtx = {
  now: string,
  language: string,
  patient?: JSON.t,
  provider?: JSON.t,
}

@genType
type ruleScope = {
  form: dict<JSON.t>,
  ctx: ruleCtx,
}

// One validator failure on one field. Surface for the screen renderer.
@genType
type validationError = {
  fieldId: string,
  validatorId: string,
  message: string,
  code?: string,
}

// Where in the rule structure a parse/eval diagnostic originated.
// Polyvariants so genType emits the same `"visibleIf" | "requiredIf" |
// "validators" | "computedValue"` string-union the TS consumers expect.
// `computedValue` is included in the slot type even though this slim
// evaluator doesn't fire it — the future-slice deferred path will, and
// keeping the type stable avoids breaking the diagnostic shape later.
@genType
type ruleSlot = [#visibleIf | #requiredIf | #validators | #computedValue]

// Whether the failure happened during parse (compile) or evaluation
// (per-tick). Kept distinct because parse errors are stable across
// evaluations and the closure attaches them once at compile time.
@genType
type rulePhase = [#parse | #evaluate]

// A diagnostic from a parse or eval failure. The renderer should NOT
// fail the form on these — they're for dev visibility / telemetry.
// `error` is the stringified underlying engine error.
@genType
type ruleEvalDiagnostic = {
  fieldId: string,
  slot: ruleSlot,
  validatorId?: string,
  phase: rulePhase,
  error: string,
}

// Per-render evaluation snapshot. `isVisible` / `isRequired` accept a
// field id even for unknown fields (return their defaults) to keep
// downstream rendering code defensive. `validationErrors` carries one
// entry per failing validator; `diagnostics` carries parse + eval
// failures.
//
// `computedValues` is a dict keyed by field id, populated only for
// fields whose `computedValue` rule successfully parsed AND evaluated
// AND the field is currently visible. Consumers should prefer the
// accessor helpers (`hasComputed`, `getComputed`, `computedEntries`,
// `computedCount`) over raw dict access — those are designed to keep
// future prefix-key changes invisible at call sites.
@genType
type ruleEvaluation = {
  isVisible: string => bool,
  isRequired: string => bool,
  computedValues: dict<JSON.t>,
  validationErrors: array<validationError>,
  diagnostics: array<ruleEvalDiagnostic>,
}

// Minimum field shape the evaluator needs. Both the mobile `FieldItem`
// and the registration `field` satisfy this after their type-level
// extension with `WithInputRules`.
@genType
type fieldWithRules = {
  id: string,
  required?: bool,
  visibleIf?: jsonLogicRule,
  requiredIf?: jsonLogicRule,
  validators?: array<validator>,
  computedValue?: jsonLogicRule,
}

@genType
type compiledEvaluator = ruleScope => ruleEvaluation

// ---------------------------------------------------------------------------
// JSONLogic engine integration helpers (package-private)
// ---------------------------------------------------------------------------

// Convert a JsonLogic parse error to a one-line string for diagnostics.
// Used both at compile time (parse) and at eval time (the eval error
// has its own variant which we stringify symmetrically).
let parseErrorToString = (err: JsonLogic_Parse.parseError): string =>
  switch err {
  | UnknownOperator(op) => `UnknownOperator: ${op}`
  | MultiKeyObject(keys) => `MultiKeyObject: ${keys->Array.join(", ")}`
  | InvalidShape({operator, message}) => `InvalidShape(${operator}): ${message}`
  | MaxDepthExceeded => "MaxDepthExceeded"
  }

let evalErrorToString = (err: JsonLogic_Eval.evalError): string =>
  switch err {
  | NaNError => "NaNError"
  | InvalidArguments(s) => `InvalidArguments: ${s}`
  | Thrown(j) => `Thrown: ${JSON.stringify(j)}`
  | MaxDepthExceeded => "MaxDepthExceeded"
  }

// Scope object passed to JsonLogic.evaluate is the JSON.t encoding of
// our typed `ruleScope`. We re-build it as a JSON.t each tick so the
// engine sees a normal `{ form: {...}, ctx: {...} }` structure.
let scopeToJson = (scope: ruleScope): JSON.t => {
  let ctxDict: dict<JSON.t> = Dict.make()
  ctxDict->Dict.set("now", String(scope.ctx.now))
  ctxDict->Dict.set("language", String(scope.ctx.language))
  switch scope.ctx.patient {
  | Some(p) => ctxDict->Dict.set("patient", p)
  | None => ()
  }
  switch scope.ctx.provider {
  | Some(p) => ctxDict->Dict.set("provider", p)
  | None => ()
  }
  let formDict: dict<JSON.t> = scope.form
  let outer: dict<JSON.t> = Dict.make()
  outer->Dict.set("form", Object(formDict))
  outer->Dict.set("ctx", Object(ctxDict))
  Object(outer)
}

// JSONLogic uses JS truthiness with one notable adjustment: empty array
// is truthy in JS but falsy in classic JSONLogic. Routed through one
// helper so future divergence has a single fix-site.
let isTruthy = (value: JSON.t): bool =>
  switch value {
  | Null => false
  | Boolean(b) => b
  | Number(n) => n !== 0.0 && !Float.isNaN(n)
  | String(s) => s !== ""
  | Array(a) => Array.length(a) > 0
  | Object(_) => true
  }

// ---------------------------------------------------------------------------
// Compile step — parse-once per slot
// ---------------------------------------------------------------------------

type compiledValidator = {
  id: string,
  ast: option<JsonLogic_Ast.t>,
  message: string,
  code: option<string>,
}

type compiledField = {
  id: string,
  required: bool,
  visibleIfAst: option<JsonLogic_Ast.t>,
  requiredIfAst: option<JsonLogic_Ast.t>,
  computedValueAst: option<JsonLogic_Ast.t>,
  validators: array<compiledValidator>,
  // Parse-time diagnostics. Stable across evaluations, so we attach
  // them to the per-call result without re-running parse.
  parseDiagnostics: array<ruleEvalDiagnostic>,
}

let compileSlot = (
  rule: option<jsonLogicRule>,
  fieldId: string,
  slot: ruleSlot,
  validatorId: option<string>,
  diagnostics: array<ruleEvalDiagnostic>,
): option<JsonLogic_Ast.t> =>
  switch rule {
  | None => None
  | Some(r) =>
    switch JsonLogic.parse(r) {
    | Ok(ast) => Some(ast)
    | Error(e) =>
      Array.push(
        diagnostics,
        {
          fieldId,
          slot,
          validatorId: ?validatorId,
          phase: #parse,
          error: parseErrorToString(e),
        },
      )
      None
    }
  }

let compileField = (field: fieldWithRules): compiledField => {
  let parseDiagnostics: array<ruleEvalDiagnostic> = []
  let visibleIfAst = compileSlot(
    field.visibleIf,
    field.id,
    #visibleIf,
    None,
    parseDiagnostics,
  )
  let requiredIfAst = compileSlot(
    field.requiredIf,
    field.id,
    #requiredIf,
    None,
    parseDiagnostics,
  )
  let computedValueAst = compileSlot(
    field.computedValue,
    field.id,
    #computedValue,
    None,
    parseDiagnostics,
  )
  let validators = switch field.validators {
  | None => []
  | Some(arr) =>
    arr->Array.map(v => {
      let ast = compileSlot(
        Some(v.rule),
        field.id,
        #validators,
        Some(v.id),
        parseDiagnostics,
      )
      {id: v.id, ast, message: v.message, code: v.code}
    })
  }
  {
    id: field.id,
    required: switch field.required {
    | Some(r) => r
    | None => false
    },
    visibleIfAst,
    requiredIfAst,
    computedValueAst,
    validators,
    parseDiagnostics,
  }
}

// ---------------------------------------------------------------------------
// Per-slot evaluators — each returns a conservative default on failure
// ---------------------------------------------------------------------------

let computeVisible = (
  cf: compiledField,
  scopeJson: JSON.t,
  diagnostics: array<ruleEvalDiagnostic>,
): bool =>
  switch cf.visibleIfAst {
  | None => true
  | Some(ast) =>
    switch JsonLogic.evaluate(ast, scopeJson) {
    | Ok(v) => isTruthy(v)
    | Error(e) =>
      Array.push(diagnostics, {
        fieldId: cf.id,
        slot: #visibleIf,
        phase: #evaluate,
        error: evalErrorToString(e),
      })
      // Broken rule must NOT make a field disappear.
      true
    }
  }

let computeRequired = (
  cf: compiledField,
  scopeJson: JSON.t,
  diagnostics: array<ruleEvalDiagnostic>,
): bool =>
  switch cf.requiredIfAst {
  | None => cf.required
  | Some(ast) =>
    switch JsonLogic.evaluate(ast, scopeJson) {
    | Ok(v) => isTruthy(v)
    | Error(e) =>
      Array.push(diagnostics, {
        fieldId: cf.id,
        slot: #requiredIf,
        phase: #evaluate,
        error: evalErrorToString(e),
      })
      // Fall back to static flag on eval failure — safer than silently
      // making a required field optional.
      cf.required
    }
  }

// `present: None` means "no entry in the map" — either no rule, parse
// failure, or eval failure. The renderer treats absence as "field stays
// editable" rather than read-only-with-broken-value.
let computeComputedValue = (
  cf: compiledField,
  scopeJson: JSON.t,
  diagnostics: array<ruleEvalDiagnostic>,
): option<JSON.t> =>
  switch cf.computedValueAst {
  | None => None
  | Some(ast) =>
    switch JsonLogic.evaluate(ast, scopeJson) {
    | Ok(v) => Some(v)
    | Error(e) =>
      Array.push(diagnostics, {
        fieldId: cf.id,
        slot: #computedValue,
        phase: #evaluate,
        error: evalErrorToString(e),
      })
      // Eval error → no entry. Field falls back to editable input —
      // safer than stranding the user with a read-only field showing
      // `undefined` and no escape.
      None
    }
  }

let computeValidatorErrors = (
  cf: compiledField,
  scopeJson: JSON.t,
  diagnostics: array<ruleEvalDiagnostic>,
  errors: array<validationError>,
): unit => {
  cf.validators->Array.forEach(v => {
    switch v.ast {
    | None => () // parse already diagnosed; skip
    | Some(ast) =>
      switch JsonLogic.evaluate(ast, scopeJson) {
      | Ok(value) =>
        if !isTruthy(value) {
          Array.push(errors, {
            fieldId: cf.id,
            validatorId: v.id,
            message: v.message,
            code: ?v.code,
          })
        }
      | Error(e) =>
        Array.push(diagnostics, {
          fieldId: cf.id,
          slot: #validators,
          validatorId: v.id,
          phase: #evaluate,
          error: evalErrorToString(e),
        })
        // Eval error — treat as "did not fail" rather than blocking
        // the user on a broken rule. The diagnostic surfaces the bug.
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

@genType
let compileRules = (fields: array<fieldWithRules>): compiledEvaluator => {
  let compiled = fields->Array.map(compileField)
  scope => {
    let scopeJson = scopeToJson(scope)
    let visMap: dict<bool> = Dict.make()
    let reqMap: dict<bool> = Dict.make()
    let computedValues: dict<JSON.t> = Dict.make()
    let validationErrors: array<validationError> = []
    let diagnostics: array<ruleEvalDiagnostic> = []
    compiled->Array.forEach(cf => {
      // Carry parse diagnostics forward on every evaluation. They're
      // static for the lifetime of the closure, but consumers expect
      // them in the same snapshot as eval diagnostics.
      cf.parseDiagnostics->Array.forEach(d => Array.push(diagnostics, d))
      let visible = computeVisible(cf, scopeJson, diagnostics)
      visMap->Dict.set(cf.id, visible)
      if !visible {
        // Hidden short-circuit: requiredIf, validators, AND computedValue
        // are skipped. The renderer is responsible for clearing the
        // field's value via the clear-on-hide policy; running
        // computedValue on hidden fields would race that effect by
        // re-writing the cleared value on the next render.
        reqMap->Dict.set(cf.id, false)
      } else {
        let required = computeRequired(cf, scopeJson, diagnostics)
        reqMap->Dict.set(cf.id, required)
        computeValidatorErrors(cf, scopeJson, diagnostics, validationErrors)
        switch computeComputedValue(cf, scopeJson, diagnostics) {
        | Some(v) => computedValues->Dict.set(cf.id, v)
        | None => ()
        }
      }
    })
    {
      isVisible: id =>
        switch visMap->Dict.get(id) {
        | Some(v) => v
        | None => true // unknown id defaults to visible
        },
      isRequired: id =>
        switch reqMap->Dict.get(id) {
        | Some(r) => r
        | None => false
        },
      computedValues,
      validationErrors,
      diagnostics,
    }
  }
}

// ---------------------------------------------------------------------------
// computedValues accessors
//
// Consumers should prefer these over reading the raw dict — keeps
// future internal key-encoding changes (prefix-key, etc.) invisible at
// call sites.
// ---------------------------------------------------------------------------

@genType
let hasComputed = (evaluation: ruleEvaluation, fieldId: string): bool =>
  switch evaluation.computedValues->Dict.get(fieldId) {
  | Some(_) => true
  | None => false
  }

@genType
let getComputed = (evaluation: ruleEvaluation, fieldId: string): option<JSON.t> =>
  evaluation.computedValues->Dict.get(fieldId)

@genType
let computedCount = (evaluation: ruleEvaluation): int =>
  evaluation.computedValues->Dict.keysToArray->Array.length

@genType
let computedEntries = (evaluation: ruleEvaluation): array<(string, JSON.t)> =>
  evaluation.computedValues->Dict.toArray

// ---------------------------------------------------------------------------
// Screen-side helpers — small utilities used by both screens. They're
// generic over the field shape (only `id` matters) so callers don't have
// to massage their typed field arrays.
// ---------------------------------------------------------------------------

// Submit-blocker bundle returned by `summarizeSubmitBlockers`. The
// screens build the actual toast/alert text themselves; this just
// decides "is the submit blocked" and de-duplicates validator messages.
@genType
type submitGate = {
  blocked: bool,
  missingRequired: array<string>,
  validatorErrors: array<validationError>,
}

// Bundles missing-required + validator errors into a single gate
// decision. Dedupes validator errors by `message` so a multi-validator
// field doesn't shout the same line twice. Does NOT format text —
// callers build their own message from the structured bundle.
@genType
let summarizeSubmitBlockers = (
  ~missingFieldNames: array<string>,
  ~validatorErrors: array<validationError>,
): submitGate => {
  // Prefix keys with a sentinel to dodge `__proto__` / `constructor` /
  // other dangerous JS object keys that would alias the prototype chain
  // when used as raw dict keys. Validator messages are user-authored, so
  // an attacker-shaped message must NOT silently dedup against a real
  // message.
  let seen: dict<bool> = Dict.make()
  let deduped: array<validationError> = []
  validatorErrors->Array.forEach(err => {
    let key = "k:" ++ err.message
    switch seen->Dict.get(key) {
    | Some(_) => ()
    | None =>
      seen->Dict.set(key, true)
      Array.push(deduped, err)
    }
  })
  {
    blocked: Array.length(missingFieldNames) > 0 || Array.length(deduped) > 0,
    missingRequired: missingFieldNames,
    validatorErrors: deduped,
  }
}

// Filter a field list to those currently visible. `null`/`undefined`
// evaluation is a pass-through (backward-compat with pre-rules callers).
//
// Generic over the field shape via a `getId` callback — ReScript doesn't
// support TS-style row polymorphism (`<T extends { id: string }>`), so
// the callback lets callers preserve the precise input type through the
// filter without ReScript narrowing it to a structural `{id: string}`.
@genType
let filterVisibleFields = (
  fields: array<'a>,
  ~getId: 'a => string,
  evaluation: Null.t<ruleEvaluation>,
): array<'a> =>
  switch evaluation->Null.toOption {
  | None => fields
  | Some(ev) => fields->Array.filter(f => ev.isVisible(getId(f)))
  }

// ---------------------------------------------------------------------------
// computedValue equality + display + stabilization
// ---------------------------------------------------------------------------

// Structural equality for the computedValue writeback short-circuit.
//
// Why JSON-serialization equality rather than reference equality alone:
// a rule that produces a fresh array/object/Date every eval (which is
// every such rule, since each `evaluate` allocates fresh containers)
// fails reference equality on each tick and re-fires `setValue`
// indefinitely. JSON-string equality covers the JSONLogic-producible
// value space.
//
// Non-finite numbers (NaN, ±Infinity) all serialize to "null" via
// JSON.stringify, which would let the fallback collapse them with each
// other and with literal null. We handle top-level numbers explicitly
// before the stringify fallback: NaN==NaN is treated as equal (so a
// rule consistently producing NaN converges instead of looping), but
// NaN is never equal to a non-NaN value or to null/Infinity. Nested
// non-finite values inside arrays/objects still hit the stringify path
// — accepted because those are rare and the engine's `finiteNum` guard
// already prevents arithmetic ops from producing them.
//
// Returns `false` rather than throwing on non-serializable inputs
// (cycles, BigInt). A non-serializable computed value is a bug
// upstream; treating it as "unequal" forces a re-write, which is
// harmless if both sides are equally non-serializable.
@genType
let computedValuesEqual = (a: JSON.t, b: JSON.t): bool => {
  // Identity check first — most ticks settle this way.
  if Obj.magic(a) === Obj.magic(b) {
    true
  } else {
    switch (a, b) {
    | (Number(x), Number(y)) =>
      // Float equality with NaN treated as self-equal. `x == y` would
      // return false for NaN/NaN per IEEE-754 and trigger an infinite
      // rewrite loop in stabilize.
      if Float.isNaN(x) && Float.isNaN(y) {
        true
      } else {
        x == y
      }
    | (Number(n), _) if !Float.isFinite(n) =>
      // Non-finite on the left, anything-else on the right. JSON.stringify
      // would collapse non-finite numbers to "null" and mis-equate them
      // with literal null. Split from the right-hand arm to satisfy
      // ReScript's ambiguous-or-pattern check.
      false
    | (_, Number(n)) if !Float.isFinite(n) => false
    | _ =>
      // JSON.stringify on JSON.t can't actually throw (the type guarantees
      // no cycles / BigInt), but the TS surface accepts `unknown` via
      // genType — callers passing raw form values may hit a throw. Catch
      // defensively and report "unequal" so the writeback proceeds.
      try {
        JSON.stringify(a) === JSON.stringify(b)
      } catch {
      | _ => false
      }
    }
  }
}

// Display formatter for a computed (read-only) field. Primitives
// stringify directly; objects/arrays serialize as JSON so a misbehaving
// rule is visible to the author. `null` renders as empty.
@genType
let formatComputedValue = (value: JSON.t): string =>
  switch value {
  | Null => ""
  | String(s) => s
  | Number(n) =>
    // Render integers without a trailing `.0`; Float.toString already
    // does this on V8 (e.g. `(2.0).toString() === "2"`). Other engines
    // are consistent here too — keeping the JS-native conversion.
    Float.toString(n)
  | Boolean(b) =>
    if b {
      "true"
    } else {
      "false"
    }
  | Array(_) | Object(_) =>
    try {
      JSON.stringify(value)
    } catch {
    | _ => "[unserializable]"
    }
  }

// Hard cap on stabilization iterations.
//
// Each pass propagates one chain link, so an N-deep linear chain needs
// N evaluations to settle plus one confirming pass — the cap must
// exceed that depth or stabilize falsely flags clean chains as cycles.
// 64 covers any realistic clinical form (deepest observed in practice
// is ~5; healthcare scoring rubrics top out around 10–15) with a wide
// margin. Each iteration is O(N_fields) cheap evaluator work, so the
// budget at the cap is still bounded.
//
// True arithmetic cycles (A=B+1, B=A+1 — values diverge upward forever)
// hit the cap and report `convergence: "cycle"`, which the screens
// handle by emptying the computedValues map.
@genType
let maxStabilizeIterations: int = 64

@genType
type stabilizeConvergence = [#stable | #cycle]

@genType
type stabilizeResult = {
  evaluation: ruleEvaluation,
  convergence: stabilizeConvergence,
  iterations: int,
}

// Iterate the evaluator until `computedValues` reach a fixed point, or
// `maxStabilizeIterations` is hit (cycle).
//
// Returns the final evaluation with `computedValues` / `validationErrors`
// / `isVisible` / `isRequired` all reflecting the stabilized values —
// NOT the values that were passed in. Callers using the same evaluation
// for visibility + validators + computedValue-writeback get a consistent
// snapshot.
//
// On cycle, returns the last evaluation with `computedValues` emptied so
// the caller's writeback effect naturally no-ops — no special-casing at
// the call site. Visibility / required / validator bits are preserved
// from the last iteration; the rest of the form still renders.
@genType
let stabilizeComputedValues = (
  ~evaluator: compiledEvaluator,
  ~initialScope: ruleScope,
): stabilizeResult => {
  // Copy form values so we never alias the caller's scope.
  let values: dict<JSON.t> = Dict.make()
  initialScope.form
  ->Dict.toArray
  ->Array.forEach(((k, v)) => values->Dict.set(k, v))
  let ctx = initialScope.ctx

  let evaluationRef = ref(evaluator({form: values, ctx}))
  let iterations = ref(1)
  let converged = ref(false)
  let cycleHit = ref(false)

  while !converged.contents && !cycleHit.contents {
    let anyChanged = ref(false)
    evaluationRef.contents.computedValues
    ->Dict.toArray
    ->Array.forEach(((fieldId, computed)) => {
      let current = switch values->Dict.get(fieldId) {
      | Some(v) => v
      | None => JSON.Null
      }
      if !computedValuesEqual(current, computed) {
        values->Dict.set(fieldId, computed)
        anyChanged := true
      }
    })
    if !anyChanged.contents {
      converged := true
    } else {
      iterations := iterations.contents + 1
      if iterations.contents >= maxStabilizeIterations {
        cycleHit := true
      } else {
        evaluationRef := evaluator({form: values, ctx})
      }
    }
  }

  if cycleHit.contents {
    // One last evaluation at the cap so the returned evaluation reflects
    // the latest scope, then strip computedValues to suppress the
    // oscillating writeback.
    let finalEval = evaluator({form: values, ctx})
    {
      evaluation: {...finalEval, computedValues: Dict.make()},
      convergence: #cycle,
      iterations: iterations.contents,
    }
  } else {
    {
      evaluation: evaluationRef.contents,
      convergence: #stable,
      iterations: iterations.contents,
    }
  }
}
