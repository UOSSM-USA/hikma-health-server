// Eligibility-screening example (TypeScript consumer).
//
// Demonstrates the parse-once / evaluate-many pattern: a single rule is
// validated, parsed into a typed AST, then evaluated against a batch of
// patient records. Mirrors example/Eligibility.res so the two consumers
// can be compared side-by-side.
//
// Run:  pnpm example:ts

import * as JsonLogic from "../src/JsonLogic.gen";

// Rule: eligible for a diabetes risk panel when
//   age >= 45   OR   (bmi >= 25  AND  has_risk_factor === true)
const rule = {
  or: [
    { ">=": [{ var: "age" }, 45] },
    {
      and: [
        { ">=": [{ var: "bmi" }, 25] },
        { "===": [{ var: "has_risk_factor" }, true] },
      ],
    },
  ],
};

type Patient = {
  id: string;
  age: number;
  bmi: number;
  has_risk_factor: boolean;
};

const patients: Patient[] = [
  { id: "p1", age: 32, bmi: 22.1, has_risk_factor: false },
  { id: "p2", age: 50, bmi: 21.0, has_risk_factor: false },
  { id: "p3", age: 38, bmi: 28.3, has_risk_factor: true },
  { id: "p4", age: 27, bmi: 31.5, has_risk_factor: false },
];

// 1. Validate structurally. Catches authoring errors (unknown op, bad arity)
//    before the first evaluation, so a typo can't masquerade as "ineligible".
const validation = JsonLogic.validate(rule);
if (validation.TAG === "Error") {
  console.error("invalid rule:", validation._0);
  process.exit(1);
}

// 2. Parse once. The AST is reused across every patient.
const parsed = JsonLogic.parse(rule);
if (parsed.TAG !== "Ok") {
  // Unreachable: validate succeeded, so parse cannot fail with the same input.
  console.error("parse failed:", parsed._0);
  process.exit(1);
}
const ast = parsed._0;

// 3. Evaluate per patient. Eval-time errors (NaN, user `throw`) are surfaced
//    per record so one bad row does not abort the batch.
for (const p of patients) {
  const r = JsonLogic.evaluate(ast, p);
  if (r.TAG === "Ok") {
    console.log(`${p.id}: ${r._0 ? "ELIGIBLE" : "not eligible"}`);
  } else {
    console.error(`${p.id}: evaluation error —`, r._0);
  }
}

// --- Throw-on-error variant ---
//
// When the caller has already validated the rule and just wants the value,
// `applyExn` throws a single `JsonLogicError(error)`. `getError` recovers
// the typed payload; anything else is rethrown.
try {
  const v = JsonLogic.applyExn(rule, {
    age: 60,
    bmi: 24,
    has_risk_factor: false,
  });
  console.log("synthetic 60yo:", v);
} catch (e) {
  const err = JsonLogic.getError(e);
  if (err === undefined) throw e;
  console.error("synthetic failed:", err);
}
