// Patient registration form field definition.
//
// Unlike EventForm, this is a flat record — registration fields are
// uniform in shape (the variant lives in `fieldType` as a string),
// translations are stored inline on `label` and `options`, and each field
// carries metadata about its database column, position, visibility, and
// summary/search behavior.

@genType
type inputType = [
  | #number
  | #text
  | #select
  | #checkbox
  | #date
  | #boolean
]

@genType
let inputTypes: array<inputType> = [
  #number,
  #text,
  #select,
  #checkbox,
  #date,
  #boolean,
]

@genType
type field = {
  id: string,
  position: int,
  // Database column name; used by mobile UIs to drive special-case rendering
  // (e.g., government_id, date_of_birth, primary_clinic_id).
  column: string,
  label: Shared.translationObject,
  fieldType: inputType,
  options: array<Shared.translationObject>,
  required: bool,
  // True iff this is one of the eleven baseline registration fields. Base
  // fields are merged in on read from the server's `baseFields` table — the
  // stored row may omit any that haven't been customized.
  baseField: bool,
  // Renders in the registration UI when true.
  visible: bool,
  // Soft-delete marker (preserves historical values for fields removed from
  // a form). Renderers should generally treat `deleted: true` like
  // `visible: false`.
  deleted: bool,
  // Whether the field is displayed in the patient summary view.
  showsInSummary: bool,
  // Whether the field is offered as a patient-search criterion.
  isSearchField: bool,
}

// Decode an untyped JSON blob into a `field`. Strict per-field
// validation: every declared field must be present with the correct
// primitive shape, polyvariant payloads must be members of the legal
// set, and the `label`/`options` translation maps must have
// string-valued entries.

let asInputType = j => Decode.asPolyEnum(~allowed=inputTypes, j)
let asTranslationObject = j => Decode.asDict(Decode.asString, j)

let decodeField = (d: dict<JSON.t>): option<field> => {
  let id = d->Dict.get("id")->Option.flatMap(Decode.asString)
  let position = d->Dict.get("position")->Option.flatMap(Decode.asInt)
  let column = d->Dict.get("column")->Option.flatMap(Decode.asString)
  let label = d->Dict.get("label")->Option.flatMap(asTranslationObject)
  let fieldType = d->Dict.get("fieldType")->Option.flatMap(asInputType)
  let options =
    d->Dict.get("options")->Option.flatMap(Decode.asArrayOf(asTranslationObject, _))
  let required = d->Dict.get("required")->Option.flatMap(Decode.asBool)
  let baseField = d->Dict.get("baseField")->Option.flatMap(Decode.asBool)
  let visible = d->Dict.get("visible")->Option.flatMap(Decode.asBool)
  let deleted = d->Dict.get("deleted")->Option.flatMap(Decode.asBool)
  let showsInSummary = d->Dict.get("showsInSummary")->Option.flatMap(Decode.asBool)
  let isSearchField = d->Dict.get("isSearchField")->Option.flatMap(Decode.asBool)
  switch (
    id,
    position,
    column,
    label,
    fieldType,
    options,
    required,
    baseField,
    visible,
    deleted,
    showsInSummary,
    isSearchField,
  ) {
  | (
      Some(id),
      Some(position),
      Some(column),
      Some(label),
      Some(fieldType),
      Some(options),
      Some(required),
      Some(baseField),
      Some(visible),
      Some(deleted),
      Some(showsInSummary),
      Some(isSearchField),
    ) =>
    Some({
      id,
      position,
      column,
      label,
      fieldType,
      options,
      required,
      baseField,
      visible,
      deleted,
      showsInSummary,
      isSearchField,
    })
  | _ => None
  }
}

@genType
let decode = (json: JSON.t): result<field, string> =>
  switch json {
  | Object(d) =>
    switch d->Dict.get("fieldType") {
    | None => Error("missing fieldType")
    | Some(String(ft)) =>
      if inputTypes->(Obj.magic: array<inputType> => array<string>)->Array.includes(ft) {
        switch decodeField(d) {
        | Some(f) => Ok(f)
        | None => Error(`invalid ${ft} field`)
        }
      } else {
        Error("unknown fieldType: " ++ ft)
      }
    | Some(_) => Error("fieldType is not a string")
    }
  | _ => Error("expected a JSON object")
  }

@genType
let decodeMany = (jsons: array<JSON.t>): result<array<field>, string> => {
  let rec loop = (idx, acc) =>
    if idx >= Array.length(jsons) {
      Ok(acc)
    } else {
      switch decode(Array.getUnsafe(jsons, idx)) {
      | Ok(f) =>
        Array.push(acc, f)
        loop(idx + 1, acc)
      | Error(e) => Error(`field ${idx->Int.toString}: ${e}`)
      }
    }
  loop(0, [])
}

@genType
let encode = (field: field): JSON.t => {
  (Obj.magic(field): JSON.t)
}

// ============================================================
// renderFieldValue — display formatting for stored patient values.
//
// Port of `apps/server/src/models/patient-registration-form.ts`'s
// `renderFieldValue`. The TS version leans on JS coercion semantics
// (`Boolean(0) === false`, `Number(null) === 0`, `String(undefined) ===
// "undefined"`) so we bind the global JS coercion functions directly via
// `@val`/`@new` externals rather than reimplementing them — the goal is
// byte-exact parity with the server.
// ============================================================

@val external jsNumber: 'a => float = "Number"
@val external jsBoolean: 'a => bool = "Boolean"
@val external jsString: 'a => string = "String"
@val external jsonStringify: 'a => string = "JSON.stringify"
@new external jsNewDate: 'a => Date.t = "Date"

// Checkbox values are stored as a `\x1F`-joined string (Unit Separator,
// chosen so plain commas in user input don't get split). Mirrors
// `CHECKBOX_SEPARATOR` + `splitCheckboxValues` in apps/server/src/lib/utils.ts.
let checkboxSeparator = "\u{001F}"

let splitCheckboxValues = (raw: string): array<string> => {
  if raw === "" {
    []
  } else {
    raw->String.split(checkboxSeparator)->Array.filter(s => s !== "")
  }
}

// Flat tagged union of `string | number | boolean` for the rendered output.
// `@unboxed` strips the constructor so the runtime value is just the raw
// primitive — genType emits this as the same TS union, so consumers don't
// see a tagged-class wrapper.
@genType
@unboxed
type renderedValue = String(string) | Number(float) | Boolean(bool)

// Patient additional-attributes row shape. Nullable slots map to
// `option<...>` in ReScript and `T | null` in TS — but the renderer uses
// `jsNumber`/`jsBoolean`/`jsString` directly on the raw slot to preserve
// `Number(null) === 0` / `Boolean(null) === false` / `String(null) === "null"`.
@genType
type attributeValue = {
  string_value: Null.t<string>,
  number_value: Null.t<float>,
  boolean_value: Null.t<bool>,
  date_value: Null.t<string>,
}

let pad2 = (n: int): string => n < 10 ? `0${Int.toString(n)}` : Int.toString(n)

// Local-timezone yyyy-MM-dd format. Mirrors `date-fns.format(d, "yyyy-MM-dd")`,
// which is what the server uses — that means the output is the *local*
// calendar date, not UTC. The behavior is genuinely timezone-dependent (e.g.
// `new Date(null)` is epoch UTC, which renders as 1969-12-31 in PST/PDT and
// 1970-01-01 in UTC). Tests must account for this.
let formatYyyyMmDdLocal = (date: Date.t): string => {
  let year = date->Date.getFullYear
  let month = date->Date.getMonth + 1
  let day = date->Date.getDate
  `${Int.toString(year)}-${pad2(month)}-${pad2(day)}`
}

let formatDateOrFallback = (raw: 'a): string => {
  let date = jsNewDate(raw)
  if Float.isNaN(date->Date.getTime) {
    jsString(raw)
  } else {
    formatYyyyMmDdLocal(date)
  }
}

// Render a value for a baseField. `value` is the raw column value from the
// patient row — string, number, boolean, Date, null, or whatever JS coerces.
@genType
let renderBaseFieldValue = (field: field, value: 'a): renderedValue => {
  switch field.fieldType {
  | #number =>
    let n = jsNumber(value)
    if Float.isNaN(n) {
      String(jsString(value))
    } else {
      Number(n)
    }
  | #boolean => Boolean(jsBoolean(value))
  | #date => String(formatDateOrFallback(value))
  | #text | #select => String(jsString(value))
  | #checkbox =>
    String(splitCheckboxValues(jsString(value))->Array.join(", "))
  }
}

// Render a value for a non-baseField — the value comes from the
// additional-attributes row with separate slots per primitive type.
@genType
let renderAttributeValue = (field: field, attr: attributeValue): renderedValue => {
  switch field.fieldType {
  | #number =>
    let n = jsNumber(attr.number_value)
    if Float.isNaN(n) {
      String(jsString(attr.number_value))
    } else {
      Number(n)
    }
  | #boolean => Boolean(jsBoolean(attr.boolean_value))
  | #date => String(formatDateOrFallback(attr.date_value))
  | #text | #select => String(jsString(attr.string_value))
  | #checkbox =>
    String(splitCheckboxValues(jsString(attr.string_value))->Array.join(", "))
  }
}

// Dispatching entry point that matches the server's single-function API.
// `value` is `unknown`-typed so the TS surface accepts either a raw
// primitive (for baseField) or an attribute envelope (for non-baseField);
// dispatch happens on `field.baseField`.
@genType
let renderFieldValue = (field: field, value: 'a): renderedValue => {
  if field.baseField {
    renderBaseFieldValue(field, value)
  } else {
    renderAttributeValue(field, (Obj.magic(value): attributeValue))
  }
}

// Merge the canonical `baseFields` into a stored fields array, adding any
// that the stored row doesn't already include, and sort the result by
// `position`.
//
// Equivalent to the inline merge in apps/server's PatientRegistrationForm.getAll.
@genType
let mergeBaseFields = (
  existing: array<field>,
  baseFields: array<field>,
): array<field> => {
  let existingBaseIds = existing
    ->Array.filter(f => f.baseField)
    ->Array.map(f => f.id)
  let missing = baseFields->Array.filter(f => !(existingBaseIds->Array.includes(f.id)))
  let merged = Array.concat(existing, missing)
  merged->Array.toSorted((a, b) => Int.compare(a.position, b.position))
}
