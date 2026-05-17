# Example

Two parallel implementations of the same eligibility-screening scenario —
one consumed from TypeScript, one written in native ReScript — so you can
see the same library used from both sides.

The rule decides whether a patient qualifies for a diabetes risk panel:

```
age >= 45   OR   (bmi >= 25  AND  has_risk_factor === true)
```

Both files apply it to the same batch of patient records and print results.

## Files

- `eligibility.ts` — TypeScript consumer. Uses `validate` → `parse` →
  `evaluate` and discriminates errors via `result.TAG`.
- `Eligibility.res` — ReScript consumer. Same flow with native variants
  and pattern matching.

## Run

```sh
pnpm example:ts   # TypeScript
pnpm example:rs   # ReScript (compiles first)
```

Expected output (both):

```
p1: not eligible
p2: ELIGIBLE
p3: ELIGIBLE
p4: not eligible
synthetic 60yo: true
```

## What each example demonstrates

- **Validate up front.** Catches authoring errors (unknown operator, bad
  arity) before any data is evaluated.
- **Parse once, evaluate many.** The AST is built once and reused across
  every record — the right shape for batch scoring or per-request rule
  application.
- **Per-record error handling.** Eval-time errors (`NaNError`, user
  `throw`) are surfaced per record so one bad row doesn't abort the batch.
- **Throw-on-error variant.** `applyExn` for known-good rules. TS callers
  recover the typed error via `getError`; ReScript pattern-matches the
  exception directly.
