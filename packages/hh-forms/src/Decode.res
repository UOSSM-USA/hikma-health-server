// Internal JSON-decoding primitives shared by EventForm and
// RegistrationForm. Helpers return `option<...>` rather than
// `result<...>`; the per-variant decoders that compose them attach
// error messages at the field-set level.
//
// Not re-exported from HhForms.res — this module is package-private.

let asString = (json: JSON.t): option<string> =>
  switch json {
  | String(s) => Some(s)
  | _ => None
  }

let asBool = (json: JSON.t): option<bool> =>
  switch json {
  | Boolean(b) => Some(b)
  | _ => None
  }

// JSON has no native integer type. Accept finite numbers whose value
// is an exact integer (after IEEE-754 round-trip).
let asInt = (json: JSON.t): option<int> =>
  switch json {
  | Number(n) =>
    let i = Float.toInt(n)
    Int.toFloat(i) === n ? Some(i) : None
  | _ => None
  }

let asArray = (json: JSON.t): option<array<JSON.t>> =>
  switch json {
  | Array(a) => Some(a)
  | _ => None
  }

let asObject = (json: JSON.t): option<dict<JSON.t>> =>
  switch json {
  | Object(d) => Some(d)
  | _ => None
  }

// Validates that a JSON string is a member of a polyvariant's tag set,
// then casts. Sound by construction: polyvars (without `@as`) have
// runtime representation equal to their tag string, so
// `array<polyvar>` is `array<string>` at runtime and `s` is a valid
// tag value iff it appears in the allowed set.
let asPolyEnum = (~allowed: array<'a>, json: JSON.t): option<'a> => {
  let allowedStrings: array<string> = Obj.magic(allowed)
  switch json {
  | String(s) if allowedStrings->Array.includes(s) =>
    Some((Obj.magic(s): 'a))
  | _ => None
  }
}

// Decode every element of a JSON array with `item`. Returns None if
// the input isn't an array or if any element fails to decode.
let asArrayOf = (item: JSON.t => option<'a>, json: JSON.t): option<array<'a>> =>
  switch asArray(json) {
  | None => None
  | Some(arr) =>
    let out: array<'a> = []
    let ok = ref(true)
    arr->Array.forEach(x =>
      if ok.contents {
        switch item(x) {
        | Some(v) => Array.push(out, v)
        | None => ok := false
        }
      }
    )
    ok.contents ? Some(out) : None
  }

// Accept JSON `null` as the `Null` case; otherwise decode as an array.
// Used for wire shapes where `null` is a meaningful, explicit value
// distinct from "missing field".
let asNullableArrayOf = (
  item: JSON.t => option<'a>,
  json: JSON.t,
): option<Null.t<array<'a>>> =>
  switch json {
  | Null => Some(Null.null)
  | _ => asArrayOf(item, json)->Option.map(Null.make)
  }

// Decode a JSON object where every value passes `item`. Returns None
// if input isn't an object or any value fails.
let asDict = (item: JSON.t => option<'a>, json: JSON.t): option<dict<'a>> =>
  switch asObject(json) {
  | None => None
  | Some(d) =>
    let out: dict<'a> = Dict.make()
    let ok = ref(true)
    d
    ->Dict.toArray
    ->Array.forEach(((k, v)) =>
      if ok.contents {
        switch item(v) {
        | Some(x) => out->Dict.set(k, x)
        | None => ok := false
        }
      }
    )
    ok.contents ? Some(out) : None
  }
