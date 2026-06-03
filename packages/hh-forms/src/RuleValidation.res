// Authoring-time structural validation for form-rule slots.
//
// Wraps `@nd/jsonlogic`'s `validate` (parse-only, no evaluation) and
// surfaces a stable error variant so consumers can branch on the specific
// failure shape. Runtime concerns (NaN, throw, invalid arguments) belong
// to the evaluator in Rules.res — this module only checks structural
// validity.
//
// Pairs with Rules.res:
//   - Rules.res evaluates rules at render time and degrades gracefully
//     (broken rules don't block rendering).
//   - RuleValidation.res rejects broken rules at *authoring* time so they
//     can't enter the data store. Used by FieldLogicPanel inline checks
//     and the server's upsert guard.

// Authoring-time validation error. Mirrors the four variants
// `JsonLogic_Parse.parseError` can produce; we re-export with a stable
// shape so consumers don't depend on vendor types. The additional
// `ComplexityBudgetExceeded`, `IterationBudgetExceeded`, and
// `DynamicVarPath` variants are local pre-flight checks run before the
// vendor parser — they close attack surfaces in the vendored evaluator
// (unbounded iteration, dynamic-var cycle-detection bypass) at the
// authoring boundary rather than patching the vendored code.
@genType
type ruleValidationError =
  | MaxDepthExceeded
  | UnknownOperator(string)
  | MultiKeyObject(array<string>)
  | InvalidShape({operator: string, message: string})
  | ComplexityBudgetExceeded({nodes: int, limit: int})
  | IterationBudgetExceeded({operator: string, count: int, limit: int})
  | DynamicVarPath

// One slot-level failure inside a field. `slot` is a structural path
// like `"visibleIf"`, `"requiredIf"`, or `"validators[2].rule"`.
@genType
type fieldRuleSlotError = {
  slot: string,
  error: ruleValidationError,
}

// Aggregated issue across many fields. Adds the `fieldId` so server-side
// summary messages can name the offending field.
@genType
type formFieldRuleIssue = {
  fieldId: string,
  slot: string,
  error: ruleValidationError,
}

// Per-field slot shape the validator inspects. Mirrors Rules.fieldWithRules
// minus the `id`/`required` fields it doesn't need; computedValue belongs
// here because it's a rule slot the validator checks like any other.
@genType
type fieldRuleSlots = {
  visibleIf?: Rules.jsonLogicRule,
  requiredIf?: Rules.jsonLogicRule,
  computedValue?: Rules.jsonLogicRule,
  validators?: array<Rules.validator>,
}

// Adapter from the vendored parseError to our public variant. Keeps the
// API stable across vendor refactors and gives the surface a name that's
// meaningful in the application domain ("rule validation") rather than
// the engine domain ("parse").
let fromParseError = (e: JsonLogic_Parse.parseError): ruleValidationError =>
  switch e {
  | UnknownOperator(s) => UnknownOperator(s)
  | MultiKeyObject(ks) => MultiKeyObject(ks)
  | InvalidShape({operator, message}) => InvalidShape({operator, message})
  | MaxDepthExceeded => MaxDepthExceeded
  }

// Pre-flight budget. Both bounds are deliberately generous — well-formed
// rules fit comfortably under them. The vendored evaluator iterates
// `map`/`filter`/`reduce`/`merge`/`all`/`some`/`none` argument arrays
// without a per-call cap; capping authoring-time node count and
// iteration-op occurrences ensures a self-contained DoS rule (large
// embedded arrays, deeply chained iteration) can't enter the data store
// in the first place. Tune up if a legitimate form ever bumps the wall.
let maxRuleNodes: int = 1000
let maxIterationOps: int = 5

let iterationOpKeys = ["map", "filter", "reduce", "merge", "all", "some", "none"]

// Iterative pre-flight walker. Counts total JSON node visits and
// occurrences of iteration operators. Returns the first budget violation
// encountered (node count, then iteration count) so callers see a stable
// reason. Recursion would risk a stack overflow on adversarial input —
// the same hazard `RuleCycles.collectRefs` already mitigates with an
// explicit worklist.
let checkComplexityBudget = (rule: JSON.t): option<ruleValidationError> => {
  let stack: array<JSON.t> = [rule]
  let nodes = ref(0)
  let iterOps = ref(0)
  let result = ref(None)
  while result.contents === None && Array.length(stack) > 0 {
    let node = Array.pop(stack)->Option.getUnsafe
    nodes := nodes.contents + 1
    if nodes.contents > maxRuleNodes {
      result := Some(ComplexityBudgetExceeded({nodes: nodes.contents, limit: maxRuleNodes}))
    } else {
      switch JSON.Classify.classify(node) {
      | Array(items) => items->Array.forEach(v => Array.push(stack, v))
      | Object(obj) =>
        obj
        ->Dict.keysToArray
        ->Array.forEach(k =>
          if iterationOpKeys->Array.includes(k) {
            iterOps := iterOps.contents + 1
            if iterOps.contents > maxIterationOps && result.contents === None {
              result :=
                Some(
                  IterationBudgetExceeded({
                    operator: k,
                    count: iterOps.contents,
                    limit: maxIterationOps,
                  }),
                )
            }
          }
        )
        obj->Dict.valuesToArray->Array.forEach(v => Array.push(stack, v))
      | Null | Bool(_) | Number(_) | String(_) => ()
      }
    }
  }
  result.contents
}

// Reject `{var: <non-string-path>}` shapes — e.g. `{var: {cat: [...]}}`
// or `{var: [<non-string>, default]}`. Dynamic paths bypass static
// reference extraction in `RuleCycles`, so an authored cycle escapes the
// authoring-time graph check and burns CPU per-keystroke at runtime via
// `stabilizeComputedValues`' iteration cap. Rejecting at the upsert
// boundary means downstream consumers (cycle detector, scope builder)
// only ever see statically-resolvable references.
let checkDynamicVarPaths = (rule: JSON.t): option<ruleValidationError> => {
  let stack: array<JSON.t> = [rule]
  let result = ref(None)
  while result.contents === None && Array.length(stack) > 0 {
    let node = Array.pop(stack)->Option.getUnsafe
    switch JSON.Classify.classify(node) {
    | Array(items) => items->Array.forEach(v => Array.push(stack, v))
    | Object(obj) =>
      switch obj->Dict.get("var") {
      | Some(arg) =>
        switch arg {
        | String(_) => ()
        | Array(a) if Array.length(a) > 0 =>
          // Array-form `var`: first element is the path (must be a static
          // string); subsequent elements are the default value.
          switch a->Array.getUnsafe(0) {
          | String(_) => ()
          | _ => result := Some(DynamicVarPath)
          }
        | _ => result := Some(DynamicVarPath)
        }
      | None => obj->Dict.valuesToArray->Array.forEach(v => Array.push(stack, v))
      }
    | Null | Bool(_) | Number(_) | String(_) => ()
    }
  }
  result.contents
}

// Structurally validate a single JSONLogic rule.
//
// Returns `Ok()` for structurally valid rules, `Error(ruleValidationError)`
// otherwise. Does NOT execute — eval-time issues depend on runtime data
// and surface at evaluation time (see Rules.res).
//
// Pre-flight order: complexity budget (cheapest), then dynamic-var
// rejection, then vendor parse. Vendor parse is last because it bails on
// the same shapes our pre-flight rejects — we want our variants on the
// public surface, not theirs.
@genType
let validateRule = (rule: Rules.jsonLogicRule): result<unit, ruleValidationError> =>
  switch checkComplexityBudget(rule) {
  | Some(e) => Error(e)
  | None =>
    switch checkDynamicVarPaths(rule) {
    | Some(e) => Error(e)
    | None =>
      switch JsonLogic.validate(rule) {
      | Ok(_) => Ok()
      | Error(e) => Error(fromParseError(e))
      }
    }
  }

// Validate every rule slot on one field. Returns a flat list of errors
// keyed by slot path. Absent slots are skipped silently; empty result
// means structurally valid.
@genType
let validateFieldRules = (field: fieldRuleSlots): array<fieldRuleSlotError> => {
  let errors: array<fieldRuleSlotError> = []
  // Order matters: callers and tests assume visibleIf → requiredIf →
  // computedValue → validators[...] traversal order.
  let checkSlot = (slot: string, rule: option<Rules.jsonLogicRule>): unit =>
    switch rule {
    | None => ()
    | Some(r) =>
      switch validateRule(r) {
      | Ok() => ()
      | Error(e) => Array.push(errors, {slot, error: e})
      }
    }
  checkSlot("visibleIf", field.visibleIf)
  checkSlot("requiredIf", field.requiredIf)
  checkSlot("computedValue", field.computedValue)
  switch field.validators {
  | None => ()
  | Some(arr) =>
    arr->Array.forEachWithIndex((v, idx) =>
      switch validateRule(v.rule) {
      | Ok() => ()
      | Error(e) => Array.push(errors, {slot: `validators[${Int.toString(idx)}].rule`, error: e})
      }
    )
  }
  errors
}

// Field shape the multi-field collector inspects. `id` is optional; when
// missing we surface the sentinel `"<unknown>"` so the server-side error
// summary still names something.
@genType
type fieldWithId = {
  id?: string,
  visibleIf?: Rules.jsonLogicRule,
  requiredIf?: Rules.jsonLogicRule,
  computedValue?: Rules.jsonLogicRule,
  validators?: array<Rules.validator>,
}

// Aggregate validation across many fields. Returns the flat issue list
// (does NOT throw — that's the consumer's responsibility, kept in the
// server-side TS shim where `FormFieldRulesValidationError` lives so
// `instanceof` checks keep working).
@genType
let collectFieldRuleIssues = (fields: array<fieldWithId>): array<formFieldRuleIssue> => {
  let issues: array<formFieldRuleIssue> = []
  fields->Array.forEach(field => {
    let fieldId = switch field.id {
    | Some(s) => s
    | None => "<unknown>"
    }
    let slots: fieldRuleSlots = {
      visibleIf: ?field.visibleIf,
      requiredIf: ?field.requiredIf,
      computedValue: ?field.computedValue,
      validators: ?field.validators,
    }
    validateFieldRules(slots)->Array.forEach(e =>
      Array.push(issues, {fieldId, slot: e.slot, error: e.error})
    )
  })
  issues
}

// Human-readable single-error formatter. Server-side error summaries
// concatenate these per issue.
@genType
let formatRuleError = (e: ruleValidationError): string =>
  switch e {
  | MaxDepthExceeded => "rule is nested too deep"
  | UnknownOperator(op) => `unknown operator '${op}'`
  | MultiKeyObject(keys) => `object has multiple operator keys: ${keys->Array.join(", ")}`
  | InvalidShape({operator, message}) => `invalid ${operator}: ${message}`
  | ComplexityBudgetExceeded({nodes, limit}) =>
    `rule is too large (${Int.toString(nodes)} nodes exceeds limit of ${Int.toString(limit)})`
  | IterationBudgetExceeded({operator, count, limit}) =>
    `rule uses too many iteration operators (saw '${operator}' bringing the count to ${Int.toString(
        count,
      )}, limit is ${Int.toString(limit)})`
  | DynamicVarPath => "rule uses a dynamic var path; field references must be static string ids like 'form.<id>'"
  }

// Human-readable multi-issue formatter. Newline-joined "field <id> <slot>:
// <msg>" lines — used inside the server-side
// FormFieldRulesValidationError message.
@genType
let formatFieldRuleIssues = (issues: array<formFieldRuleIssue>): string =>
  issues
  ->Array.map(i => `field ${i.fieldId} ${i.slot}: ${formatRuleError(i.error)}`)
  ->Array.join("\n")
