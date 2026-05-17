// Coercion + comparison primitives, lifted from the original interpreter.
//
// These operate on `JSON.t` directly because JSONLogic values flow through
// evaluation as JSON. The numeric helpers return `option<float>` rather than
// raising — eval converts `None` into the appropriate evalError.

// JSONLogic truthiness — note `{}` and `[]` are BOTH falsy, matching the
// spec (and diverging from JavaScript's `!!{}` semantics).
let isTruthy = (v: JSON.t): bool =>
  switch v {
  | Null => false
  | Boolean(b) => b
  | Number(n) => n != 0.0
  | String(s) => s != ""
  | Array(arr) => Array.length(arr) > 0
  | Object(dict) => Dict.toArray(dict)->Array.length > 0
  }

// Strict numeric parse — JS `Number(s)` rejects partial matches like
// "2024-01-01"; `Float.fromString`/`parseFloat` would accept the "2024"
// prefix. Empty string strict-coerces to 0, matching JSONLogic.
@val external jsNumber: string => float = "Number"

let parseNumStrict = (s: string): option<float> => {
  let n = jsNumber(s)
  Float.isNaN(n) ? None : Some(n)
}

// Numeric coercion for arithmetic/comparison. `None` signals "would be NaN".
// Conventions: null → 0; booleans → 0/1; numeric strings parse strictly;
// arrays/objects are not coercible.
let toNumOpt = (v: JSON.t): option<float> =>
  switch v {
  | Null => Some(0.0)
  | Boolean(true) => Some(1.0)
  | Boolean(false) => Some(0.0)
  | Number(n) => Some(n)
  | String(s) => parseNumStrict(s)
  | Array(_) | Object(_) => None
  }

// Avoid producing -0 when negating: `deepEqual` treats it as distinct.
let normalizeZero = (n: float): float => n == 0.0 ? 0.0 : n

// Three-way compare with JSONLogic coercion rules. `None` means neither side
// is comparable (would be NaN). NaN operands also yield `None` to preserve
// IEEE-754's "NaN compares unequal to everything" — otherwise the inline
// ternaries treat "neither <, nor >" as 0 ("equal"), making `<= NaN, NaN`
// silently true.
let cmpNum = (a: JSON.t, b: JSON.t): option<int> =>
  switch (a, b) {
  | (String(sa), String(sb)) => Some(sa < sb ? -1 : sa > sb ? 1 : 0)
  | _ =>
    switch (toNumOpt(a), toNumOpt(b)) {
    | (Some(x), Some(y)) if !Float.isNaN(x) && !Float.isNaN(y) =>
      Some(x < y ? -1 : x > y ? 1 : 0)
    | _ => None
    }
  }

let looseEqOpt = (a: JSON.t, b: JSON.t): option<bool> =>
  switch (a, b) {
  | (Null, Null) => Some(true)
  // NaN-aware guards — Number(NaN) reachable from TS callers hand-building
  // JSON.t. `NaN == anything` is false in IEEE-754; surface as `None` so
  // the evaluator can produce NaNError rather than misreporting equality.
  | (Number(n), _) if Float.isNaN(n) => None
  | (_, Number(n)) if Float.isNaN(n) => None
  | (Null, Number(n)) | (Number(n), Null) => Some(n == 0.0)
  | (Null, Boolean(b)) | (Boolean(b), Null) => Some(!b)
  | (Null, String(_)) | (String(_), Null) => Some(false)
  | (Array(_), _) | (_, Array(_)) => None
  | (Object(_), _) | (_, Object(_)) => None
  | (Boolean(b1), Boolean(b2)) => Some(b1 == b2)
  | (Number(n1), Number(n2)) => Some(n1 == n2)
  | (String(s1), String(s2)) => Some(s1 == s2)
  | _ =>
    switch (toNumOpt(a), toNumOpt(b)) {
    | (Some(x), Some(y)) if !Float.isNaN(x) && !Float.isNaN(y) => Some(x == y)
    | _ => None
    }
  }

let strictEq = (a: JSON.t, b: JSON.t): bool =>
  switch (a, b) {
  | (Null, Null) => true
  | (Boolean(b1), Boolean(b2)) => b1 == b2
  | (Number(n1), Number(n2)) => n1 == n2
  | (String(s1), String(s2)) => s1 == s2
  | _ => false
  }

// String coercion for `cat`. Non-finite numbers (NaN, ±Infinity) are not
// valid JSON and embedding their JS token spelling ("NaN", "Infinity") into
// the result would leak host runtime artifacts; coerce to empty string,
// matching the `Null` branch.
let catCoerce = (v: JSON.t): string =>
  switch v {
  | String(s) => s
  | Number(n) if !Float.isFinite(n) => ""
  | Number(n) => Float.toString(n)
  | Boolean(true) => "true"
  | Boolean(false) => "false"
  | Null => ""
  | _ => JSON.stringify(v)
  }
