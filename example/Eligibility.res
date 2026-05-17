// Eligibility-screening example (ReScript consumer).
//
// Mirrors example/eligibility.ts but uses native variants and pattern
// matching. Demonstrates the parse-once / evaluate-many pattern: a single
// rule is validated, parsed, then evaluated against a batch of patients.
//
// Run:  pnpm example:rs

@val external exit: int => unit = "process.exit"

// Rule: eligible for a diabetes risk panel when
//   age >= 45   OR   (bmi >= 25  AND  has_risk_factor === true)
let rule = JSON.parseOrThrow(`{
  "or": [
    { ">=": [{ "var": "age" }, 45] },
    {
      "and": [
        { ">=": [{ "var": "bmi" }, 25] },
        { "===": [{ "var": "has_risk_factor" }, true] }
      ]
    }
  ]
}`)

let patients = [
  ("p1", JSON.parseOrThrow(`{"age":32,"bmi":22.1,"has_risk_factor":false}`)),
  ("p2", JSON.parseOrThrow(`{"age":50,"bmi":21.0,"has_risk_factor":false}`)),
  ("p3", JSON.parseOrThrow(`{"age":38,"bmi":28.3,"has_risk_factor":true}`)),
  ("p4", JSON.parseOrThrow(`{"age":27,"bmi":31.5,"has_risk_factor":false}`)),
]

// 1. Validate structurally. Catches authoring errors (unknown op, bad arity)
//    before the first evaluation.
switch JsonLogic.validate(rule) {
| Ok() => ()
| Error(e) =>
  Console.error2("invalid rule:", e)
  exit(1)
}

// 2. Parse once. The AST is reused across every patient.
let ast = switch JsonLogic.parse(rule) {
| Ok(ast) => ast
// Unreachable: validate just succeeded on the same input.
| Error(_) => throw(Failure("parse failed after validate succeeded"))
}

// 3. Evaluate per patient. Per-record error handling keeps one bad row from
//    aborting the batch.
patients->Array.forEach(((id, p)) => {
  switch JsonLogic.evaluate(ast, p) {
  | Ok(JSON.Boolean(true)) => Console.log(id ++ ": ELIGIBLE")
  | Ok(_) => Console.log(id ++ ": not eligible")
  | Error(e) => Console.error3(id, ": evaluation error —", e)
  }
})

// --- Throw-on-error variant ---
//
// `applyExn` throws `JsonLogic.JsonLogicError(error)`. ReScript pattern-
// matches the exception directly — no `getError` bridge needed.
try {
  let v = JsonLogic.applyExn(
    rule,
    JSON.parseOrThrow(`{"age":60,"bmi":24,"has_risk_factor":false}`),
  )
  Console.log2("synthetic 60yo:", v)
} catch {
| JsonLogic.JsonLogicError(e) => Console.error2("synthetic failed:", e)
}
