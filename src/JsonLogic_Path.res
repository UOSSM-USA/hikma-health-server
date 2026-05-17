// Path resolution helpers — shared by `val`, `exists`, `missing`, and friends.

// Own-property guard. Bracket access `obj[key]` walks the JS prototype chain,
// so `{var: "__proto__"}` on a plain object would return `Object.prototype`
// and `{var: "constructor"}` would return the `Object` constructor — both
// violate `JSON.t` and silently corrupt downstream consumers
// (`JSON.stringify` drops them). `Object.hasOwn` (Node ≥ 16.9) restricts the
// walk to own properties; `Dict.has` may use `in`, which is not safe.
@val external hasOwn: ('a, string) => bool = "Object.hasOwn"

let segToKey = (seg: JSON.t): string =>
  switch seg {
  | String(s) => s
  | Number(n) =>
    let asInt = Float.toInt(n)
    Float.fromInt(asInt) == n ? Int.toString(asInt) : Float.toString(n)
  | _ => ""
  }

let segToIndex = (seg: JSON.t): option<int> =>
  switch seg {
  | Number(n) =>
    let asInt = Float.toInt(n)
    Float.fromInt(asInt) == n ? Some(asInt) : None
  | String(s) => Int.fromString(s)
  | _ => None
  }

// Descend one level. `None` = missing; `Some(Null)` = present and null.
let stepIntoOpt = (seg: JSON.t, data: JSON.t): option<JSON.t> =>
  switch data {
  | Object(dict) =>
    let key = segToKey(seg)
    hasOwn(dict, key) ? Dict.get(dict, key) : None
  | Array(arr) =>
    switch segToIndex(seg) {
    | Some(i) => arr[i]
    | None => None
    }
  | _ => None
  }

let rec walkPathOpt = (segments: array<JSON.t>, i: int, data: JSON.t): option<JSON.t> =>
  if i >= Array.length(segments) {
    Some(data)
  } else {
    switch stepIntoOpt(Array.getUnsafe(segments, i), data) {
    | Some(v) => walkPathOpt(segments, i + 1, v)
    | None => None
    }
  }

let pathSegments = (pathArg: JSON.t): array<JSON.t> =>
  switch pathArg {
  | Array(arr) => arr
  | _ => [pathArg]
  }

// Legacy `var`-style path: dot-split string keys; treat the "absent path"
// sentinels (null / "" / []) as zero segments (→ return the whole data).
let varSegments = (path: JSON.t): array<JSON.t> =>
  switch path {
  | Null => []
  | String("") => []
  | String(s) => s->String.split(".")->Array.map(seg => JSON.String(seg))
  | Array(arr) => arr
  | _ => [path]
  }
