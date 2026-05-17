// Scope chain for iteration-aware data access.
//
// A scope is a non-empty stack of data contexts, innermost first. Iterators
// (map/filter/reduce/quantifiers) push a frame for each element so inner
// rules can climb back to ancestors via `{val: [[N], ...]}`.
//
// Backed by `list` for O(1) cons — scope depth is small in practice, so the
// list walk in `dataAt` is fine.

type t = list<JSON.t>

let make = (data: JSON.t): t => list{data}

let current = (s: t): JSON.t =>
  switch s {
  | list{top, ..._} => top
  // Constructor `make` guarantees non-empty and `push*` only grows; this
  // branch is unreachable, but `list` pattern matching forces us to name it.
  | list{} => JSON.Null
  }

let pushOne = (s: t, top: JSON.t): t => list{top, ...s}
let pushTwo = (s: t, top: JSON.t, second: JSON.t): t => list{top, second, ...s}

// `dataAt` resolves `{val: [[N], ...]}` climbs. Sign is ignored (N and -N
// refer to the same depth); requests past the root clamp to the deepest
// frame so paths in shallower scopes still find the original data.
let dataAt = (s: t, n: int): JSON.t => {
  let abs = n < 0 ? -n : n
  let rec walk = (remaining: t, i: int, last: JSON.t): JSON.t =>
    switch remaining {
    | list{} => last
    | list{top, ...rest} => i == abs ? top : walk(rest, i + 1, top)
    }
  switch s {
  | list{} => JSON.Null
  | list{top, ...rest} => walk(rest, 1, top)
  }
}

// Iteration meta frame: `{ index: <i> }`. Sits just below the current element
// in iterator callbacks so `{val: [[1], "index"]}` retrieves it.
let iterMeta = (i: int): JSON.t =>
  JSON.Object(Dict.fromArray([("index", JSON.Number(Float.fromInt(i)))]))
