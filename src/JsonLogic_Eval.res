// JSONLogic evaluator: Rule.t → Scope.t → result<JSON.t, evalError>
//
// Eval is total on the operator set (`Rule.t` is a closed variant — the
// parser already rejected unknowns). The remaining runtime errors are:
//
//   - NaNError          : arithmetic or comparison on non-coercible values
//                         (also covers division by zero, matching the
//                         original implementation's spec mapping).
//   - InvalidArguments  : runtime shape error not catchable at parse time
//                         (e.g. `min`/`max` arg is not numeric).
//   - Thrown            : user-raised `{throw: ...}` value.
//   - MaxDepthExceeded  : the AST under evaluation nests more deeply than
//                         the configured depth cap. Public callers of
//                         `apply` are already protected by the parser's
//                         depth guard; this catches the case where a
//                         caller hands `evaluate` a programmatically-built
//                         AST that bypassed parse.
//
// `try` catches any `Error(_)` and pushes a synthetic error object onto the
// scope before trying the next branch, mirroring the original exception
// behaviour but without leaking exceptions out of the eval path.
//
// Depth limit: every recursive entry point threads `~depth`. The convention
// is that `~depth` names the depth of the rule the function is currently
// processing; recursive calls into child rules pass `~depth=depth + 1`. The
// cap is checked at the top of `eval`, which is the single dispatcher every
// recursion funnels through.

open JsonLogic_Ast
module Scope = JsonLogic_Scope
module Path = JsonLogic_Path
module Coerce = JsonLogic_Coerce

@genType
type evalError =
  | NaNError
  | InvalidArguments(string)
  | Thrown(JSON.t)
  | MaxDepthExceeded

let maxDepth = 256

// --- Result plumbing ---

let bind = (r, f) => Result.flatMap(r, f)
let mapOk = (r, f) => Result.map(r, f)

// Sequence eval over a homogenous list of rules, bailing at first Error.
let rec evalAll = (~depth: int, rules: array<t>, scope: Scope.t): result<array<JSON.t>, evalError> => {
  let out = []
  let err = ref(None)
  let i = ref(0)
  while err.contents == None && i.contents < Array.length(rules) {
    switch eval(~depth=depth + 1, Array.getUnsafe(rules, i.contents), scope) {
    | Ok(v) => Array.push(out, v)
    | Error(e) => err := Some(e)
    }
    i := i.contents + 1
  }
  switch err.contents {
  | Some(e) => Error(e)
  | None => Ok(out)
  }
}

// --- Operand expansion for eager-variadic ops ---
//
// `Add`, `Sub`, `Mul`, etc. accept either an array literal or a rule that
// evaluates to an array. After evaluating the single argument rule, an
// Array result becomes the operand list; anything else is wrapped as a
// singleton (matches the original `eagerArgs`).
and eagerOperands = (~depth: int, rule: t, scope: Scope.t): result<array<JSON.t>, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(v =>
    switch v {
    | Array(arr) => arr
    | other => [other]
    }
  )

// Coerce arg → number; missing coercion is `NaN`, matching the original
// implementation (the `op` argument is unused but kept for future debugging).
and toNumE = (_op: string, v: JSON.t): result<float, evalError> =>
  switch Coerce.toNumOpt(v) {
  | Some(f) => Ok(f)
  | None => Error(NaNError)
  }

// Wrap an arithmetic result. Non-finite values (NaN, +Infinity, -Infinity)
// are not valid JSON and would silently corrupt downstream consumers —
// `JSON.stringify(Infinity)` returns `"null"`, and `NaN !== NaN` breaks
// equality. Surface them as `NaNError` instead.
and finiteNum = (n: float): result<JSON.t, evalError> =>
  Float.isFinite(n) ? Ok(JSON.Number(n)) : Error(NaNError)

// --- Path-access ops ---

// Split an evaluated path into (starting-frame, remaining-segments). If
// the first segment is a one-element array containing a number, treat it
// as a scope-climb directive; otherwise start at the current frame.
and climbAndSegments = (evaluated: JSON.t, scope: Scope.t): (JSON.t, array<JSON.t>) => {
  let segments = Path.pathSegments(evaluated)
  if Array.length(segments) == 0 {
    (Scope.current(scope), segments)
  } else {
    switch Array.getUnsafe(segments, 0) {
    | Array(climbArr) if Array.length(climbArr) == 1 =>
      switch Array.getUnsafe(climbArr, 0) {
      | Number(n) =>
        let rest = segments->Array.slice(~start=1, ~end=Array.length(segments))
        (Scope.dataAt(scope, Float.toInt(n)), rest)
      | _ => (Scope.current(scope), segments)
      }
    | _ => (Scope.current(scope), segments)
    }
  }
}

and evalVal = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(evaluated => {
    let (start, segments) = climbAndSegments(evaluated, scope)
    switch Path.walkPathOpt(segments, 0, start) {
    | Some(v) => v
    | None => Null
    }
  })

and evalExists = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(evaluated => {
    let (start, segments) = climbAndSegments(evaluated, scope)
    JSON.Boolean(Path.walkPathOpt(segments, 0, start) != None)
  })

// `var` — legacy accessor with default support and dot-split paths.
and evalVar = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(evaluated => {
    let (rawPath, defaultValue) = switch evaluated {
    | Array(arr) =>
      switch Array.length(arr) {
      | 0 => (JSON.Null, JSON.Null)
      | 1 => (Array.getUnsafe(arr, 0), JSON.Null)
      | _ => (Array.getUnsafe(arr, 0), Array.getUnsafe(arr, 1))
      }
    | other => (other, JSON.Null)
    }
    switch Path.walkPathOpt(Path.varSegments(rawPath), 0, Scope.current(scope)) {
    | Some(Null) | None => defaultValue
    | Some(v) => v
    }
  })

// `missing` — list of keys that are null or absent in data.
and evalMissing = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(evaluated => {
    let keys = switch evaluated {
    | Array(arr) => arr
    | _ => [evaluated]
    }
    JSON.Array(
      keys->Array.filter(key =>
        switch Path.walkPathOpt(Path.varSegments(key), 0, Scope.current(scope)) {
        | None | Some(Null) => true
        | _ => false
        }
      ),
    )
  })

// `missing_some` — `[min, keys]`: if ≥`min` keys are present, [], else the
// missing ones. Both args are rules.
and evalMissingSome = (~depth: int, minRule: t, keysRule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, minRule, scope)->bind(minV =>
    switch minV {
    // Reject NaN / ±Infinity explicitly. Float.toInt would silently wrap
    // these (and large finite values) to 0, making the "min required"
    // threshold trivially satisfied and silently accepting incomplete data.
    | Number(n) if Float.isFinite(n) =>
      eval(~depth=depth + 1, keysRule, scope)->bind(keysV =>
        switch keysV {
        | Array(keys) =>
          let missing = keys->Array.filter(key =>
            switch Path.walkPathOpt(Path.varSegments(key), 0, Scope.current(scope)) {
            | None | Some(Null) => true
            | _ => false
            }
          )
          let presentCount = Float.fromInt(Array.length(keys) - Array.length(missing))
          Ok(JSON.Array(presentCount >= n ? [] : missing))
        | _ => Error(InvalidArguments("missing_some"))
        }
      )
    | _ => Error(InvalidArguments("missing_some"))
    }
  )

// --- Boolean / logical ---

and evalNot = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(v => JSON.Boolean(!Coerce.isTruthy(v)))

and evalNotNot = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->mapOk(v => JSON.Boolean(Coerce.isTruthy(v)))

// Short-circuit on first falsy (and) / truthy (or). Empty list → Null.
and evalAnd = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let n = Array.length(args)
  if n == 0 {
    Ok(Null)
  } else {
    let result = ref(Ok(JSON.Null))
    let stop = ref(false)
    let i = ref(0)
    while !stop.contents && i.contents < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope) {
      | Error(e) =>
        result := Error(e)
        stop := true
      | Ok(v) =>
        result := Ok(v)
        if !Coerce.isTruthy(v) {
          stop := true
        }
      }
      i := i.contents + 1
    }
    result.contents
  }
}

and evalOr = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let n = Array.length(args)
  if n == 0 {
    Ok(Null)
  } else {
    let result = ref(Ok(JSON.Null))
    let stop = ref(false)
    let i = ref(0)
    while !stop.contents && i.contents < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope) {
      | Error(e) =>
        result := Error(e)
        stop := true
      | Ok(v) =>
        result := Ok(v)
        if Coerce.isTruthy(v) {
          stop := true
        }
      }
      i := i.contents + 1
    }
    result.contents
  }
}

// if [c1, t1, c2, t2, ..., fallback?]
//   - 0 args        → null
//   - 1 arg         → eval(arg)
//   - even n        → as pairs; no fallback (→ null when all conds fail)
//   - odd  n  (>1)  → as pairs; last element is the fallback
and evalIf = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let n = Array.length(args)
  if n == 0 {
    Ok(Null)
  } else if n == 1 {
    eval(~depth=depth + 1, Array.getUnsafe(args, 0), scope)
  } else {
    let result = ref(Ok(JSON.Null))
    let done = ref(false)
    let i = ref(0)
    while !done.contents && i.contents + 1 < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope) {
      | Error(e) =>
        result := Error(e)
        done := true
      | Ok(cond) =>
        if Coerce.isTruthy(cond) {
          result := eval(~depth=depth + 1, Array.getUnsafe(args, i.contents + 1), scope)
          done := true
        } else {
          i := i.contents + 2
        }
      }
    }
    if !done.contents && i.contents < n {
      result := eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope)
    }
    result.contents
  }
}

// --- Comparison / equality ---

and inequalityStep = (op: string, a: JSON.t, b: JSON.t): result<bool, evalError> =>
  switch Coerce.cmpNum(a, b) {
  | Some(c) =>
    Ok(
      switch op {
      | "<" => c < 0
      | "<=" => c <= 0
      | ">" => c > 0
      | ">=" => c >= 0
      | _ => false
      },
    )
  | None =>
    switch (a, b) {
    // null vs non-coercible-string returns false rather than NaN.
    | (Null, String(_)) | (String(_), Null) => Ok(false)
    | _ => Error(NaNError)
    }
  }

and chainCmp = (
  ~depth: int,
  op: string,
  args: array<t>,
  scope: Scope.t,
  step: (string, JSON.t, JSON.t) => result<bool, evalError>,
): result<JSON.t, evalError> => {
  let n = Array.length(args)
  switch eval(~depth=depth + 1, Array.getUnsafe(args, 0), scope) {
  | Error(e) => Error(e)
  | Ok(first) =>
    let prev = ref(first)
    let ok = ref(true)
    let err = ref(None)
    let i = ref(1)
    while err.contents == None && ok.contents && i.contents < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope) {
      | Error(e) => err := Some(e)
      | Ok(curr) =>
        switch step(op, prev.contents, curr) {
        | Error(e) => err := Some(e)
        | Ok(b) =>
          if !b {
            ok := false
          }
          prev := curr
        }
      }
      i := i.contents + 1
    }
    switch err.contents {
    | Some(e) => Error(e)
    | None => Ok(Boolean(ok.contents))
    }
  }
}

and evalEq = (~depth: int, op: string, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let step = (op, a, b) =>
    switch op {
    | "==" =>
      switch Coerce.looseEqOpt(a, b) {
      | Some(b) => Ok(b)
      | None => Error(NaNError)
      }
    | "!=" =>
      switch Coerce.looseEqOpt(a, b) {
      | Some(b) => Ok(!b)
      | None => Error(NaNError)
      }
    | "===" => Ok(Coerce.strictEq(a, b))
    | "!==" => Ok(!Coerce.strictEq(a, b))
    | _ => Ok(false)
    }
  chainCmp(~depth, op, args, scope, step)
}

// --- Arithmetic ---

and evalArith = (~depth: int, op: string, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eagerOperands(~depth, rule, scope)->bind(args => {
    let n = Array.length(args)
    let extractNums = (): result<array<float>, evalError> => {
      let out = []
      let err = ref(None)
      let i = ref(0)
      while err.contents == None && i.contents < n {
        switch toNumE(op, Array.getUnsafe(args, i.contents)) {
        | Ok(f) => Array.push(out, f)
        | Error(e) => err := Some(e)
        }
        i := i.contents + 1
      }
      switch err.contents {
      | Some(e) => Error(e)
      | None => Ok(out)
      }
    }
    switch op {
    | "+" =>
      extractNums()->bind(nums => {
        let total = ref(0.0)
        for i in 0 to Array.length(nums) - 1 {
          total := total.contents +. Array.getUnsafe(nums, i)
        }
        finiteNum(total.contents)
      })
    | "-" =>
      if n == 0 {
        Error(InvalidArguments(op))
      } else if n == 1 {
        toNumE(op, Array.getUnsafe(args, 0))->bind(x =>
          finiteNum(Coerce.normalizeZero(-. x))
        )
      } else {
        extractNums()->bind(nums => {
          let total = ref(Array.getUnsafe(nums, 0))
          for i in 1 to Array.length(nums) - 1 {
            total := total.contents -. Array.getUnsafe(nums, i)
          }
          finiteNum(Coerce.normalizeZero(total.contents))
        })
      }
    | "*" =>
      extractNums()->bind(nums => {
        let total = ref(1.0)
        for i in 0 to Array.length(nums) - 1 {
          total := total.contents *. Array.getUnsafe(nums, i)
        }
        finiteNum(total.contents)
      })
    | "/" =>
      if n == 0 {
        Error(InvalidArguments(op))
      } else if n == 1 {
        toNumE(op, Array.getUnsafe(args, 0))->bind(d =>
          d == 0.0 ? Error(NaNError) : finiteNum(1.0 /. d)
        )
      } else {
        extractNums()->bind(nums => {
          let total = ref(Array.getUnsafe(nums, 0))
          let err = ref(None)
          let i = ref(1)
          while err.contents == None && i.contents < Array.length(nums) {
            let d = Array.getUnsafe(nums, i.contents)
            if d == 0.0 {
              err := Some(NaNError)
            } else {
              total := total.contents /. d
            }
            i := i.contents + 1
          }
          switch err.contents {
          | Some(e) => Error(e)
          | None => finiteNum(total.contents)
          }
        })
      }
    | "%" =>
      if n < 2 {
        Error(InvalidArguments(op))
      } else {
        extractNums()->bind(nums => {
          let total = ref(Array.getUnsafe(nums, 0))
          for i in 1 to Array.length(nums) - 1 {
            let d = Array.getUnsafe(nums, i)
            // JS %: sign follows dividend (truncating remainder). `Math.trunc`
            // is 64-bit-safe; `Float.toInt` would wrap at 2^31 and silently
            // return wrong values for large dividends.
            total := total.contents -. d *. Math.trunc(total.contents /. d)
          }
          finiteNum(total.contents)
        })
      }
    | "min" | "max" =>
      if n == 0 {
        Error(InvalidArguments(op))
      } else {
        // Per the original implementation, min/max require Number-typed
        // operands. Any other type → InvalidArguments (not NaN).
        let pickNum = (v: JSON.t): result<float, evalError> =>
          switch v {
          | Number(x) => Ok(x)
          | _ => Error(InvalidArguments(op))
          }
        let head = pickNum(Array.getUnsafe(args, 0))
        head->bind(first => {
          let total = ref(first)
          let err = ref(None)
          let i = ref(1)
          while err.contents == None && i.contents < n {
            switch pickNum(Array.getUnsafe(args, i.contents)) {
            | Error(e) => err := Some(e)
            | Ok(x) =>
              total := if op == "max" {
                total.contents > x ? total.contents : x
              } else {
                total.contents < x ? total.contents : x
              }
            }
            i := i.contents + 1
          }
          switch err.contents {
          | Some(e) => Error(e)
          | None => finiteNum(total.contents)
          }
        })
      }
    | _ => Error(InvalidArguments(op))
    }
  })

// --- Iterators ---

and withCollection = (
  ~depth: int,
  collRule: t,
  scope: Scope.t,
  withArr: array<JSON.t> => result<JSON.t, evalError>,
): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, collRule, scope)->bind(coll =>
    switch coll {
    | Array(arr) => withArr(arr)
    | _ => Ok(JSON.Array([]))
    }
  )

and iterScope = (scope: Scope.t, item: JSON.t, i: int): Scope.t =>
  Scope.pushTwo(scope, item, Scope.iterMeta(i))

and evalMap = (~depth: int, collRule: t, cbRule: t, scope: Scope.t): result<JSON.t, evalError> =>
  withCollection(~depth, collRule, scope, arr => {
    let out = []
    let err = ref(None)
    let i = ref(0)
    while err.contents == None && i.contents < Array.length(arr) {
      switch eval(~depth=depth + 1, cbRule, iterScope(scope, Array.getUnsafe(arr, i.contents), i.contents)) {
      | Ok(v) => Array.push(out, v)
      | Error(e) => err := Some(e)
      }
      i := i.contents + 1
    }
    switch err.contents {
    | Some(e) => Error(e)
    | None => Ok(JSON.Array(out))
    }
  })

and evalFilter = (~depth: int, collRule: t, cbRule: t, scope: Scope.t): result<JSON.t, evalError> =>
  withCollection(~depth, collRule, scope, arr => {
    let out = []
    let err = ref(None)
    let i = ref(0)
    while err.contents == None && i.contents < Array.length(arr) {
      let item = Array.getUnsafe(arr, i.contents)
      switch eval(~depth=depth + 1, cbRule, iterScope(scope, item, i.contents)) {
      | Ok(v) => if Coerce.isTruthy(v) { Array.push(out, item) }
      | Error(e) => err := Some(e)
      }
      i := i.contents + 1
    }
    switch err.contents {
    | Some(e) => Error(e)
    | None => Ok(JSON.Array(out))
    }
  })

and evalReduce = (
  ~depth: int,
  collRule: t,
  cbRule: t,
  initRule: t,
  scope: Scope.t,
): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, collRule, scope)->bind(coll =>
    eval(~depth=depth + 1, initRule, scope)->bind(init =>
      switch coll {
      | Array(arr) =>
        let acc = ref(Ok(init))
        let i = ref(0)
        while (
          switch acc.contents {
          | Ok(_) => true
          | _ => false
          }
        ) &&
          i.contents < Array.length(arr) {
          let item = Array.getUnsafe(arr, i.contents)
          let accVal = switch acc.contents {
          | Ok(v) => v
          | Error(_) => JSON.Null
          }
          let cur = JSON.Object(
            Dict.fromArray([("current", item), ("accumulator", accVal)]),
          )
          acc := eval(~depth=depth + 1, cbRule, Scope.pushOne(scope, cur))
          i := i.contents + 1
        }
        acc.contents
      | _ => Ok(init)
      }
    )
  )

and evalQuantifier = (
  ~depth: int,
  op: string,
  collRule: t,
  cbRule: t,
  scope: Scope.t,
): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, collRule, scope)->bind(coll => {
    let arr = switch coll {
    | Array(a) => a
    | _ => []
    }
    let n = Array.length(arr)
    if n == 0 {
      Ok(JSON.Boolean(op == "none"))
    } else {
      let truthyCount = ref(0)
      let err = ref(None)
      let i = ref(0)
      while err.contents == None && i.contents < n {
        switch eval(~depth=depth + 1, cbRule, iterScope(scope, Array.getUnsafe(arr, i.contents), i.contents)) {
        | Error(e) => err := Some(e)
        | Ok(v) => if Coerce.isTruthy(v) { truthyCount := truthyCount.contents + 1 }
        }
        i := i.contents + 1
      }
      switch err.contents {
      | Some(e) => Error(e)
      | None =>
        Ok(
          JSON.Boolean(
            switch op {
            | "all" => truthyCount.contents == n
            | "some" => truthyCount.contents > 0
            | "none" => truthyCount.contents == 0
            | _ => false
            },
          ),
        )
      }
    }
  })

// --- Collection / membership ---

and evalIn = (~depth: int, needleRule: t, haystackRule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, needleRule, scope)->bind(needle =>
    eval(~depth=depth + 1, haystackRule, scope)->mapOk(haystack =>
      switch haystack {
      | Array(arr) =>
        JSON.Boolean(arr->Array.some(item => Coerce.strictEq(item, needle)))
      | String(s) =>
        switch needle {
        | String(ns) => JSON.Boolean(String.includes(s, ns))
        | _ => JSON.Boolean(false)
        }
      | _ => JSON.Boolean(false)
      }
    )
  )

and evalMerge = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eagerOperands(~depth, rule, scope)->mapOk(args => JSON.Array(
    args->Array.flatMap(arg =>
      switch arg {
      | Array(arr) => arr
      | other => [other]
      }
    ),
  ))

// --- Error handling ---

and evalThrow = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->bind(v => {
    let errorObj = switch v {
    | Object(_) => v
    | _ => JSON.Object(Dict.fromArray([("type", v)]))
    }
    Error(Thrown(errorObj))
  })

and errorToScopeJson = (e: evalError): JSON.t =>
  switch e {
  | Thrown(obj) => obj
  | NaNError => JSON.Object(Dict.fromArray([("type", JSON.String("NaN"))]))
  | InvalidArguments(_) =>
    JSON.Object(Dict.fromArray([("type", JSON.String("Invalid Arguments"))]))
  | MaxDepthExceeded =>
    JSON.Object(Dict.fromArray([("type", JSON.String("Max Depth Exceeded"))]))
  }

// `try` — evaluate args in order; return the first that doesn't error.
// On error, push the synthesised error object onto scope and try the next.
// If all error, return the last error.
and evalTry = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let n = Array.length(args)
  if n == 0 {
    Ok(Null)
  } else {
    let currentScope = ref(scope)
    let result = ref(None)
    let lastError = ref(None)
    let i = ref(0)
    while result.contents == None && i.contents < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), currentScope.contents) {
      | Ok(v) => result := Some(Ok(v))
      | Error(e) =>
        lastError := Some(e)
        currentScope := Scope.pushOne(scope, errorToScopeJson(e))
      }
      i := i.contents + 1
    }
    switch result.contents {
    | Some(r) => r
    | None =>
      switch lastError.contents {
      | Some(e) => Error(e)
      | None => Ok(Null)
      }
    }
  }
}

and evalCoalesce = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let n = Array.length(args)
  if n == 0 {
    Ok(Null)
  } else {
    let result = ref(Ok(JSON.Null))
    let found = ref(false)
    let i = ref(0)
    while !found.contents && i.contents < n {
      switch eval(~depth=depth + 1, Array.getUnsafe(args, i.contents), scope) {
      | Error(e) =>
        result := Error(e)
        found := true
      | Ok(Null) => ()
      | Ok(v) =>
        result := Ok(v)
        found := true
      }
      i := i.contents + 1
    }
    result.contents
  }
}

// --- String / array ---

and evalLength = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eval(~depth=depth + 1, rule, scope)->bind(v =>
    switch v {
    | String(s) => Ok(JSON.Number(Float.fromInt(String.length(s))))
    | Array(arr) => Ok(JSON.Number(Float.fromInt(Array.length(arr))))
    | _ => Error(InvalidArguments("length"))
    }
  )

and evalCat = (~depth: int, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  eagerOperands(~depth, rule, scope)->mapOk(args => JSON.String(
    args->Array.map(Coerce.catCoerce)->Array.join(""),
  ))

and evalSubstr = (~depth: int, args: array<t>, scope: Scope.t): result<JSON.t, evalError> => {
  let nArgs = Array.length(args)
  evalAll(~depth, args, scope)->bind(vals => {
    let strV = Array.getUnsafe(vals, 0)
    let startV = Array.getUnsafe(vals, 1)
    switch strV {
    | String(str) =>
      switch startV {
      | Number(s) =>
        let length = String.length(str)
        let clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x
        let startRaw = Float.toInt(s)
        let start = clamp(startRaw < 0 ? length + startRaw : startRaw, 0, length)
        if nArgs < 3 {
          Ok(JSON.String(String.slice(str, ~start, ~end=length)))
        } else {
          switch Array.getUnsafe(vals, 2) {
          | Number(l) =>
            let lenArg = Float.toInt(l)
            let endRaw = lenArg < 0 ? length + lenArg : start + lenArg
            let stop = clamp(endRaw, start, length)
            Ok(JSON.String(String.slice(str, ~start, ~end=stop)))
          | _ => Error(InvalidArguments("substr"))
          }
        }
      | _ => Error(InvalidArguments("substr"))
      }
    | _ => Error(InvalidArguments("substr"))
    }
  })
}

// --- Dispatch ---

and eval = (~depth=0, rule: t, scope: Scope.t): result<JSON.t, evalError> =>
  if depth > maxDepth {
    Error(MaxDepthExceeded)
  } else {
    switch rule {
    | Literal(j) => Ok(j)
    | ArrayOf(rules) => evalAll(~depth, rules, scope)->mapOk(vs => JSON.Array(vs))
    | Val(r) => evalVal(~depth, r, scope)
    | Var(r) => evalVar(~depth, r, scope)
    | Exists(r) => evalExists(~depth, r, scope)
    | Missing(r) => evalMissing(~depth, r, scope)
    | MissingSome(m, k) => evalMissingSome(~depth, m, k, scope)
    | Not(r) => evalNot(~depth, r, scope)
    | NotNot(r) => evalNotNot(~depth, r, scope)
    | And(args) => evalAnd(~depth, args, scope)
    | Or(args) => evalOr(~depth, args, scope)
    | If(args) => evalIf(~depth, args, scope)
    | Lt(args) => chainCmp(~depth, "<", args, scope, inequalityStep)
    | Lte(args) => chainCmp(~depth, "<=", args, scope, inequalityStep)
    | Gt(args) => chainCmp(~depth, ">", args, scope, inequalityStep)
    | Gte(args) => chainCmp(~depth, ">=", args, scope, inequalityStep)
    | Eq(args) => evalEq(~depth, "==", args, scope)
    | Neq(args) => evalEq(~depth, "!=", args, scope)
    | StrictEq(args) => evalEq(~depth, "===", args, scope)
    | StrictNeq(args) => evalEq(~depth, "!==", args, scope)
    | Add(r) => evalArith(~depth, "+", r, scope)
    | Sub(r) => evalArith(~depth, "-", r, scope)
    | Mul(r) => evalArith(~depth, "*", r, scope)
    | Div(r) => evalArith(~depth, "/", r, scope)
    | Mod(r) => evalArith(~depth, "%", r, scope)
    | Min(r) => evalArith(~depth, "min", r, scope)
    | Max(r) => evalArith(~depth, "max", r, scope)
    | Map(c, b) => evalMap(~depth, c, b, scope)
    | Filter(c, b) => evalFilter(~depth, c, b, scope)
    | Reduce(c, b, i) => evalReduce(~depth, c, b, i, scope)
    | All(c, b) => evalQuantifier(~depth, "all", c, b, scope)
    | Some_(c, b) => evalQuantifier(~depth, "some", c, b, scope)
    | None_(c, b) => evalQuantifier(~depth, "none", c, b, scope)
    | In(n, h) => evalIn(~depth, n, h, scope)
    | Merge(r) => evalMerge(~depth, r, scope)
    | Throw(r) => evalThrow(~depth, r, scope)
    | Try(args) => evalTry(~depth, args, scope)
    | Coalesce(args) => evalCoalesce(~depth, args, scope)
    | Length(r) => evalLength(~depth, r, scope)
    | Cat(r) => evalCat(~depth, r, scope)
    | Substr(args) => evalSubstr(~depth, args, scope)
    | Preserve(j) => Ok(j)
    }
  }
