// Authoring-time helpers for the FieldLogicPanel UI.
//
// Two responsibilities:
//
//   1. `logicField` — abstracted field shape both event-form and
//      patient-registration-form adapt into, so the panel doesn't need to
//      know either form's native shape. Adapters live in each model;
//      this file just defines the contract.
//
//   2. `simpleVisibilityTemplate` — discriminated union covering the
//      "easy 80%" of visibility rules. The panel works in template mode
//      by default and falls back to a raw-JSON editor for rules that
//      don't decompile to a template.
//
// Rule reference convention: rules read fields by id via
// `{var: "form.<fieldId>"}`. The Rules.res evaluator mirrors this scope
// shape exactly.

// What kind of value a field collects. Drives which rule slots are
// allowed and which value-input widget renders in the panel.
//   - `primitive`   : binary / text / date / options / registration
//                     fields. All four rule slots apply.
//   - `list`        : medicine / diagnosis / file fields. Only visibleIf
//                     applies (per the data-model decision).
//   - `displayOnly` : text-display / separator. Only visibleIf applies.
@genType
type logicFieldKind = [#primitive | #list | #displayOnly]

// Narrower primitive-value type, used by the value input in the template
// UI. Only meaningful when `kind === #primitive`. `string` covers text /
// select / checkbox-as-value; `number`, `boolean`, `date` are the others.
@genType
type logicPrimitiveKind = [#string | #number | #boolean | #date]

@genType
type logicField = {
  id: string,
  displayName: string,
  kind: logicFieldKind,
  // Set when kind === #primitive. Drives value-input rendering.
  primitiveKind?: logicPrimitiveKind,
}

// Comparison operators the simple template exposes. Mirrors the legacy
// TS COMPARISON_OPS array order — order matters for the operator
// picker UI.
@genType
type comparisonOp = [#"==" | #"!=" | #">" | #">=" | #"<" | #"<="]

// Exposed for consumers iterating the operator set (operator picker UI).
@genType
let comparisonOps: array<comparisonOp> = [#"==", #"!=", #">", #">=", #"<", #"<="]

// Human-readable labels for the operator picker. The dict shape preserves
// the legacy `Record<ComparisonOp, string>` ergonomics.
@genType
let comparisonOpLabels: dict<string> = {
  let d: dict<string> = Dict.make()
  d->Dict.set("==", "equals")
  d->Dict.set("!=", "does not equal")
  d->Dict.set(">", "is greater than")
  d->Dict.set(">=", "is greater than or equal to")
  d->Dict.set("<", "is less than")
  d->Dict.set("<=", "is less than or equal to")
  d
}

// A single leaf condition over one field. This is the reusable seam: a
// future nested/mixed boolean tree would wrap these leaves in group nodes
// without changing the leaf shape, and the serialized JSONLogic is
// identical either way (storage is always one rule).
//
// `Comparison` — comparison between a field reference and a literal.
// `Truthy`     — `{!!: {var: "form.<id>"}}` — field has any truthy value.
// `Falsy`      — `{!: {var: "form.<id>"}}` — field is empty / falsy.
//
// `value` in `Comparison` is JSON.t because the simple template accepts
// string / number / boolean / null literals — exactly the JSON primitive
// space minus arrays/objects. Callers narrow via JSON.t pattern matching.
@genType
type visibilityCondition =
  | Comparison({fieldId: string, op: comparisonOp, value: JSON.t})
  | Truthy({fieldId: string})
  | Falsy({fieldId: string})

// How a list of conditions combines. Only `#and` is surfaced in the UI
// today; `#or` is defined now so the type and serializer are ready for a
// later OR/mixed-logic editor with no structural change.
@genType
type connector = [#"and" | #"or"]

// `Always`     — no visibleIf rule; field is always visible.
// `Conditions` — one or more leaf conditions combined by `connector`.
//                A single condition compiles to the bare leaf rule (no
//                wrapper); two or more compile to `{and: [...]}` /
//                `{or: [...]}`. `conditions` is expected non-empty;
//                an empty list compiles to "no rule" defensively.
@genType
type simpleVisibilityTemplate =
  | Always
  | Conditions({connector: connector, conditions: array<visibilityCondition>})

let formVarPrefix = "form."

// Read the field id from a `{var: "form.<id>"}` rule, or None if the
// shape doesn't match. Used internally by the decompiler.
//
// Empty rest (path is exactly `"form."`) returns None: an empty fieldId
// is a malformed authoring shape, not a legitimate reference. Treating it
// as `Some("")` would let downstream `ruleReferencesField` match the empty
// target against any field whose id is also `""`, silently corrupting
// scope/cycle reasoning.
let isFormVar = (rule: JSON.t): option<string> =>
  switch rule {
  | Object(obj) =>
    switch obj->Dict.get("var") {
    | Some(String(path)) =>
      if String.startsWith(path, formVarPrefix) {
        let rest = String.sliceToEnd(path, ~start=String.length(formVarPrefix))
        if String.length(rest) > 0 {
          Some(rest)
        } else {
          None
        }
      } else {
        None
      }
    | _ => None
    }
  | _ => None
  }

// Comparison templates accept string / number / boolean / null literals.
// Arrays and objects are rejected — those shapes belong in advanced mode.
let isLiteral = (v: JSON.t): bool =>
  switch v {
  | Null | Boolean(_) | Number(_) | String(_) => true
  | _ => false
  }

// Compile one leaf condition into its JSONLogic rule object.
let compileCondition = (c: visibilityCondition): JSON.t => {
  let varRef = fieldId =>
    JSON.Object(Dict.fromArray([("var", JSON.String(formVarPrefix ++ fieldId))]))
  switch c {
  | Comparison({fieldId, op, value}) =>
    JSON.Object(Dict.fromArray([((op :> string), JSON.Array([varRef(fieldId), value]))]))
  | Truthy({fieldId}) => JSON.Object(Dict.fromArray([("!!", varRef(fieldId))]))
  | Falsy({fieldId}) => JSON.Object(Dict.fromArray([("!", varRef(fieldId))]))
  }
}

// Compile a SimpleVisibilityTemplate into a JSONLogic rule.
//
// `Always` (and a defensively-empty condition list) returns `None` — the
// absence of a rule. A single condition compiles to the bare leaf rule so
// existing stored single-condition rules round-trip byte-identically; two
// or more wrap in `{and: [...]}` / `{or: [...]}`.
@genType
let compileVisibilityTemplate = (t: simpleVisibilityTemplate): option<JSON.t> =>
  switch t {
  | Always => None
  | Conditions({conditions}) if Array.length(conditions) === 0 => None
  | Conditions({conditions}) if Array.length(conditions) === 1 =>
    Some(compileCondition(Array.getUnsafe(conditions, 0)))
  | Conditions({connector, conditions}) =>
    Some(
      JSON.Object(
        Dict.fromArray([((connector :> string), JSON.Array(conditions->Array.map(compileCondition)))]),
      ),
    )
  }

let comparisonOpFromString = (s: string): option<comparisonOp> =>
  switch s {
  | "==" => Some(#"==")
  | "!=" => Some(#"!=")
  | ">" => Some(#">")
  | ">=" => Some(#">=")
  | "<" => Some(#"<")
  | "<=" => Some(#"<=")
  | _ => None
  }

// Read the field id from a unary boolean operand: either the direct
// `{var: "form.<id>"}` form or the legacy single-element array wrapper.
let unaryFieldId = (arg: JSON.t): option<string> =>
  switch isFormVar(arg) {
  | Some(id) => Some(id)
  | None =>
    switch arg {
    | Array(a) if Array.length(a) === 1 => isFormVar(a->Array.getUnsafe(0))
    | _ => None
    }
  }

// Decompile a single bare leaf rule into a condition, or None if it
// doesn't match a leaf shape (comparison / truthy / falsy).
let decompileCondition = (rule: JSON.t): option<visibilityCondition> =>
  switch rule {
  | Object(obj) =>
    switch Dict.keysToArray(obj) {
    | [op] =>
      let arg = obj->Dict.get(op)->Option.getUnsafe
      // Comparison: { "<op>": [{var: "form.<id>"}, <literal>] }
      switch comparisonOpFromString(op) {
      | Some(cop) =>
        switch arg {
        | Array(args) if Array.length(args) === 2 =>
          let lhs = args->Array.getUnsafe(0)
          let rhs = args->Array.getUnsafe(1)
          switch isFormVar(lhs) {
          | Some(fieldId) if isLiteral(rhs) => Some(Comparison({fieldId, op: cop, value: rhs}))
          | _ => None
          }
        | _ => None
        }
      // Truthy / Falsy: { "!!" | "!": {var: "form.<id>"} }
      | None =>
        switch op {
        | "!!" => unaryFieldId(arg)->Option.map(id => Truthy({fieldId: id}))
        | "!" => unaryFieldId(arg)->Option.map(id => Falsy({fieldId: id}))
        | _ => None
        }
      }
    | _ => None
    }
  | _ => None
  }

// Decompile every element of an `and`/`or` argument list into a leaf
// condition. Returns None — conservatively dropping the whole group to
// advanced mode — if any element is a nested group or non-leaf shape.
let decompileConditions = (items: array<JSON.t>): option<array<visibilityCondition>> => {
  let out = []
  let ok = ref(true)
  let i = ref(0)
  while ok.contents && i.contents < Array.length(items) {
    switch decompileCondition(items->Array.getUnsafe(i.contents)) {
    | Some(c) => Array.push(out, c)
    | None => ok := false
    }
    i := i.contents + 1
  }
  ok.contents ? Some(out) : None
}

// Decompile a JSONLogic rule back into a SimpleVisibilityTemplate, or
// None if the rule doesn't match a template shape — meaning it was
// authored in advanced (raw-JSON) mode. `Null` / undefined-equivalent
// rules decompile to `Always`.
//
// Shapes recognised:
//   - missing / Null            → Always
//   - a single bare leaf        → Conditions(#and, [leaf])   (connector is
//                                 canonically #and for one condition)
//   - `{and|or: [leaf, leaf…]}` → Conditions(connector, leaves), iff every
//                                 element is a leaf and there are ≥2 of them
//
// Conservative by design: an `and`/`or` with <2 elements, a nested group,
// or any non-leaf member returns None and stays in advanced mode.
@genType
let decompileVisibilityTemplate = (rule: option<JSON.t>): option<simpleVisibilityTemplate> =>
  switch rule {
  | None | Some(Null) => Some(Always)
  | Some(Object(obj)) =>
    switch Dict.keysToArray(obj) {
    | [op] =>
      let arg = obj->Dict.get(op)->Option.getUnsafe
      let connectorOpt: option<connector> = switch op {
      | "and" => Some(#"and")
      | "or" => Some(#"or")
      | _ => None
      }
      switch connectorOpt {
      | Some(conn) =>
        switch arg {
        | Array(items) if Array.length(items) >= 2 =>
          decompileConditions(items)->Option.map(cs => Conditions({connector: conn, conditions: cs}))
        | _ => None
        }
      | None =>
        decompileCondition(JSON.Object(obj))->Option.map(c =>
          Conditions({connector: #"and", conditions: [c]})
        )
      }
    | _ => None
    }
  | _ => None
  }

// Walks an arbitrary JSONLogic rule, returning true if any
// `{var: "form.<fieldId>"}` reference (including subpath access like
// `form.<fieldId>.foo`) is found.
//
// Used as an authoring-time guardrail: a validator placed on field A
// whose rule never references `form.A` is almost always a mistake; the
// UI surfaces a soft warning when this returns false.
//
// Pathological `var` shapes (`{var: {cat: [...]}}` — computed paths)
// are treated as non-references; we can't statically resolve them.
// Iterative tree walk; recursion would stack-overflow on the deeply-nested
// JSON the advanced-mode editor allows authors to paste. Same node-visit
// ceiling as RuleCycles for the same reason.
let maxWalkVisits: int = 50_000

@genType
let ruleReferencesField = (rule: option<JSON.t>, fieldId: string): bool =>
  if String.length(fieldId) === 0 {
    // An empty target would collapse to the bare prefix `"form."` and
    // match any rule that happens to contain `{var: "form."}` — a
    // malformed-rule shape, not a legitimate reference. Treat empty
    // fieldId as "no field" so callers don't get a misleading true.
    false
  } else {
    let target = formVarPrefix ++ fieldId
    let subpathPrefix = target ++ "."
  let pathMatches = (p: JSON.t): bool =>
    switch p {
    | String(s) => s === target || String.startsWith(s, subpathPrefix)
    | _ => false
    }
  let walk = (root: JSON.t): bool => {
    let stack: array<JSON.t> = [root]
    let found = ref(false)
    let visited = ref(0)
    while !found.contents && Array.length(stack) > 0 && visited.contents < maxWalkVisits {
      visited := visited.contents + 1
      let node = Array.pop(stack)->Option.getUnsafe
      // ReScript collapses our empty Null/Boolean/Number/String arms with
      // the catch-all and dispatches Object via `typeof === "object"`; in
      // JS, `typeof null === "object"`, so an unguarded match reads
      // `null["var"]` and throws. Classify explicitly via JSON.Classify
      // so null lands in the Null arm instead of the Object arm.
      switch JSON.Classify.classify(node) {
      | Array(items) => items->Array.forEach(r => Array.push(stack, r))
      | Object(obj) =>
        switch obj->Dict.get("var") {
        | Some(arg) =>
          if pathMatches(arg) {
            found := true
          } else {
            switch arg {
            | Array(a) if Array.length(a) > 0 =>
              if pathMatches(a[0]->Option.getUnsafe) {
                found := true
              }
            | _ => ()
            }
          }
        | None => obj->Dict.valuesToArray->Array.forEach(v => Array.push(stack, v))
        }
      | Null | Bool(_) | Number(_) | String(_) => ()
      }
    }
    found.contents
  }
  switch rule {
  | None | Some(Null) => false
  | Some(node) =>
    switch node {
    | Object(_) | Array(_) => walk(node)
    | _ => false
    }
  }
}
