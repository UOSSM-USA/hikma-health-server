// Event-form field definition.
//
// The `field` variant uses `@tag("fieldType")` + `@as("...")` so its
// runtime representation is the existing JSONB wire shape on disk:
//   { fieldType: "binary", id: "...", inputType: "checkbox", options: [...] }
//
// `fieldType` is the discriminator (the legacy Effect Schema's duplicate
// `_tag` is no longer required; if present in legacy blobs it is ignored
// by `decode`).
//
// `decode` is strict at the per-variant level: each declared field must
// be present with the correct primitive shape; polyvariant payload
// values must be members of the legal set; structural cross-field
// invariants are enforced
// (`textarea ⇔ length="long"`, `inputType="radio" ⇒ multi=false`).
// Unknown extra fields on the wire (e.g. legacy `_tag`) are tolerated.

@genType
type binaryInputType = [#checkbox | #radio | #select]

@genType
type freeTextInputType = [
  | #text
  | #number
  | #email
  | #password
  | #tel
  | #textarea
]

@genType
type freeTextLength = [#short | #long]

@genType
type optionsInputType = [#radio | #checkbox | #select]

// Kept as `string` (rather than a polyvar) because the legal values
// contain "/" which polyvars can't represent. `decode` validates
// membership against `allowedMimeTypes` at the boundary.
@genType
type allowedMimeType = string

@genType
let allowedMimeTypes: array<allowedMimeType> = [
  "image/png",
  "image/jpeg",
  "application/pdf",
]

// Discriminator for the `field` variant, returned by `getFieldTag` in
// the same string form used on the wire. Consumers gain exhaustive
// narrowing on the TS side via the literal-string union.
@genType
type fieldTag = [
  | #binary
  | #"free-text"
  | #medicine
  | #diagnosis
  | #date
  | #options
  | #file
  | #text
  | #separator
]

// Polyvariant union for unit annotations carried by FreeText fields:
// either a dose unit (mg/g/mcg/...) or a duration unit (hours/days/...).
@genType
type unitTag = [Shared.doseUnit | Shared.durationUnit]

@genType
type medicineSubFields = {
  name: string,
  route: array<Shared.medicineRoute>,
  form: array<Shared.medicineForm>,
  frequency: string,
  intervals: string,
  dose: string,
  doseUnits: array<Shared.doseUnit>,
  duration: string,
  durationUnits: array<Shared.durationUnit>,
}

@genType
@tag("fieldType")
type field =
  | @as("binary")
  Binary({
      id: string,
      name: string,
      description: string,
      required: bool,
      inputType: binaryInputType,
      options: array<Shared.fieldOption>,
    })
  | @as("free-text")
  FreeText({
      id: string,
      name: string,
      description: string,
      required: bool,
      inputType: freeTextInputType,
      length: freeTextLength,
      units: option<array<unitTag>>,
    })
  | @as("medicine")
  Medicine({
      id: string,
      name: string,
      description: string,
      required: bool,
      // Wire-compat constant: legacy blobs carry this redundantly.
      inputType: [#"input-group"],
      options: array<Shared.fieldOption>,
      fields: medicineSubFields,
    })
  | @as("diagnosis")
  Diagnosis({
      id: string,
      name: string,
      description: string,
      required: bool,
      // Wire-compat constant.
      inputType: [#select],
      options: array<Shared.fieldOption>,
    })
  | @as("date")
  DateField({
      id: string,
      name: string,
      description: string,
      required: bool,
      // Wire-compat constant.
      inputType: [#date],
    })
  | @as("options")
  Options({
      id: string,
      name: string,
      description: string,
      required: bool,
      inputType: optionsInputType,
      multi: bool,
      options: array<Shared.fieldOption>,
    })
  | @as("file")
  File({
      id: string,
      name: string,
      description: string,
      required: bool,
      // Wire-compat constant.
      inputType: [#file],
      allowedMimeTypes: Null.t<array<allowedMimeType>>,
      multiple: bool,
      minItems: int,
      maxItems: int,
    })
  | @as("text")
  TextDisplay({
      id: string,
      name: string,
      description: string,
      required: bool,
      content: string,
      size: Shared.textDisplaySize,
    })
  | @as("separator")
  Separator({
      id: string,
      name: string,
      description: string,
      required: bool,
    })

@genType
let getFieldTag = (field: field): fieldTag =>
  switch field {
  | Binary(_) => #binary
  | FreeText(_) => #"free-text"
  | Medicine(_) => #medicine
  | Diagnosis(_) => #diagnosis
  | DateField(_) => #date
  | Options(_) => #options
  | File(_) => #file
  | TextDisplay(_) => #text
  | Separator(_) => #separator
  }

// Returns the de-duplicated units array for a field, in source order,
// or `None` for fields that don't carry units. `Some([])` is a distinct
// state from `None` — an explicit empty `units: []` decodes that way.
@genType
let getUnitsOpt = (field: field): option<array<unitTag>> =>
  switch field {
  | FreeText({units: Some(units)}) =>
    let seen = Dict.make()
    let deduped = units->Array.filter(u => {
      let key = (Obj.magic(u): string)
      switch seen->Dict.get(key) {
      | Some(_) => false
      | None =>
        seen->Dict.set(key, true)
        true
      }
    })
    Some(deduped)
  | _ => None
  }

// ==================================================================
// Decoding — strict per-variant validation.
// ==================================================================

// All `unitTag` values, used by the units decoder to validate
// membership in the union. Built via per-element coercion because
// polyvariant subtyping is invariant under `array<_>`.
let allUnitTags: array<unitTag> = Array.concat(
  Shared.doseUnits->Array.map(u => (u :> unitTag)),
  Shared.durationUnits->Array.map(u => (u :> unitTag)),
)

let asBinaryInputType = j => Decode.asPolyEnum(~allowed=[#checkbox, #radio, #select], j)
let asFreeTextInputType = j =>
  Decode.asPolyEnum(~allowed=[#text, #number, #email, #password, #tel, #textarea], j)
let asFreeTextLength = j => Decode.asPolyEnum(~allowed=[#short, #long], j)
let asOptionsInputType = j => Decode.asPolyEnum(~allowed=[#radio, #checkbox, #select], j)
let asMedicineRoute = j => Decode.asPolyEnum(~allowed=Shared.medicineRoutes, j)
let asMedicineForm = j => Decode.asPolyEnum(~allowed=Shared.medicineForms, j)
let asDoseUnit = j => Decode.asPolyEnum(~allowed=Shared.doseUnits, j)
let asDurationUnit = j => Decode.asPolyEnum(~allowed=Shared.durationUnits, j)
let asTextDisplaySize = j => Decode.asPolyEnum(~allowed=Shared.textDisplaySizes, j)
let asUnitTag = j => Decode.asPolyEnum(~allowed=allUnitTags, j)

let asAllowedMimeType = (j): option<allowedMimeType> =>
  switch Decode.asString(j) {
  | Some(s) if allowedMimeTypes->Array.includes(s) => Some(s)
  | _ => None
  }

let asFieldOption = (json: JSON.t): option<Shared.fieldOption> =>
  switch Decode.asObject(json) {
  | None => None
  | Some(d) =>
    let id = d->Dict.get("id")->Option.flatMap(Decode.asString)
    let label = d->Dict.get("label")->Option.flatMap(Decode.asString)
    let value = d->Dict.get("value")->Option.flatMap(Decode.asString)
    switch (label, value) {
    | (Some(label), Some(value)) => Some({?id, label, value})
    | _ => None
    }
  }

let asMedicineSubFields = (json: JSON.t): option<medicineSubFields> =>
  switch Decode.asObject(json) {
  | None => None
  | Some(d) =>
    let name = d->Dict.get("name")->Option.flatMap(Decode.asString)
    let route = d->Dict.get("route")->Option.flatMap(Decode.asArrayOf(asMedicineRoute, _))
    let form = d->Dict.get("form")->Option.flatMap(Decode.asArrayOf(asMedicineForm, _))
    let frequency = d->Dict.get("frequency")->Option.flatMap(Decode.asString)
    let intervals = d->Dict.get("intervals")->Option.flatMap(Decode.asString)
    let dose = d->Dict.get("dose")->Option.flatMap(Decode.asString)
    let doseUnits = d->Dict.get("doseUnits")->Option.flatMap(Decode.asArrayOf(asDoseUnit, _))
    let duration = d->Dict.get("duration")->Option.flatMap(Decode.asString)
    let durationUnits =
      d->Dict.get("durationUnits")->Option.flatMap(Decode.asArrayOf(asDurationUnit, _))
    switch (name, route, form, frequency, intervals, dose, doseUnits, duration, durationUnits) {
    | (
        Some(name),
        Some(route),
        Some(form),
        Some(frequency),
        Some(intervals),
        Some(dose),
        Some(doseUnits),
        Some(duration),
        Some(durationUnits),
      ) =>
      Some({name, route, form, frequency, intervals, dose, doseUnits, duration, durationUnits})
    | _ => None
    }
  }

// The four-field base every variant shares.
let asBase = (d: dict<JSON.t>): option<(string, string, string, bool)> => {
  let id = d->Dict.get("id")->Option.flatMap(Decode.asString)
  let name = d->Dict.get("name")->Option.flatMap(Decode.asString)
  let description = d->Dict.get("description")->Option.flatMap(Decode.asString)
  let required = d->Dict.get("required")->Option.flatMap(Decode.asBool)
  switch (id, name, description, required) {
  | (Some(id), Some(name), Some(description), Some(required)) =>
    Some((id, name, description, required))
  | _ => None
  }
}

let decodeBinary = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType = d->Dict.get("inputType")->Option.flatMap(asBinaryInputType)
    let options = d->Dict.get("options")->Option.flatMap(Decode.asArrayOf(asFieldOption, _))
    switch (inputType, options) {
    | (Some(inputType), Some(options)) =>
      Some(Binary({id, name, description, required, inputType, options}))
    | _ => None
    }
  }

let decodeFreeText = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType = d->Dict.get("inputType")->Option.flatMap(asFreeTextInputType)
    let length = d->Dict.get("length")->Option.flatMap(asFreeTextLength)
    // `units` is optional on the wire. JSON `null` is treated as absent
    // to tolerate legacy blobs that explicitly null-out the slot.
    let units = switch d->Dict.get("units") {
    | None | Some(Null) => Some(None)
    | Some(j) => Decode.asArrayOf(asUnitTag, j)->Option.map(arr => Some(arr))
    }
    switch (inputType, length, units) {
    | (Some(inputType), Some(length), Some(units)) =>
      // Cross-field invariant: textarea ⇔ long.
      let valid = switch (inputType, length) {
      | (#textarea, #long) => true
      | (#textarea, _) | (_, #long) => false
      | _ => true
      }
      valid
        ? Some(FreeText({id, name, description, required, inputType, length, units}))
        : None
    | _ => None
    }
  }

let decodeMedicine = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType =
      d->Dict.get("inputType")->Option.flatMap(j =>
        Decode.asPolyEnum(~allowed=[#"input-group"], j)
      )
    let options = d->Dict.get("options")->Option.flatMap(Decode.asArrayOf(asFieldOption, _))
    let fields = d->Dict.get("fields")->Option.flatMap(asMedicineSubFields)
    switch (inputType, options, fields) {
    | (Some(inputType), Some(options), Some(fields)) =>
      Some(Medicine({id, name, description, required, inputType, options, fields}))
    | _ => None
    }
  }

let decodeDiagnosis = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType =
      d->Dict.get("inputType")->Option.flatMap(j => Decode.asPolyEnum(~allowed=[#select], j))
    let options = d->Dict.get("options")->Option.flatMap(Decode.asArrayOf(asFieldOption, _))
    switch (inputType, options) {
    | (Some(inputType), Some(options)) =>
      Some(Diagnosis({id, name, description, required, inputType, options}))
    | _ => None
    }
  }

let decodeDate = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType =
      d->Dict.get("inputType")->Option.flatMap(j => Decode.asPolyEnum(~allowed=[#date], j))
    inputType->Option.map(inputType =>
      DateField({id, name, description, required, inputType})
    )
  }

let decodeOptions = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType = d->Dict.get("inputType")->Option.flatMap(asOptionsInputType)
    let multi = d->Dict.get("multi")->Option.flatMap(Decode.asBool)
    let options = d->Dict.get("options")->Option.flatMap(Decode.asArrayOf(asFieldOption, _))
    switch (inputType, multi, options) {
    | (Some(inputType), Some(multi), Some(options)) =>
      // Cross-field invariant: inputType=#radio ⇒ multi=false.
      let valid = inputType !== #radio || !multi
      valid
        ? Some(Options({id, name, description, required, inputType, multi, options}))
        : None
    | _ => None
    }
  }

let decodeFile = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let inputType =
      d->Dict.get("inputType")->Option.flatMap(j => Decode.asPolyEnum(~allowed=[#file], j))
    let allowedMimeTypes =
      d
      ->Dict.get("allowedMimeTypes")
      ->Option.flatMap(j => Decode.asNullableArrayOf(asAllowedMimeType, j))
    let multiple = d->Dict.get("multiple")->Option.flatMap(Decode.asBool)
    let minItems = d->Dict.get("minItems")->Option.flatMap(Decode.asInt)
    let maxItems = d->Dict.get("maxItems")->Option.flatMap(Decode.asInt)
    switch (inputType, allowedMimeTypes, multiple, minItems, maxItems) {
    | (
        Some(inputType),
        Some(allowedMimeTypes),
        Some(multiple),
        Some(minItems),
        Some(maxItems),
      ) =>
      Some(
        File({
          id,
          name,
          description,
          required,
          inputType,
          allowedMimeTypes,
          multiple,
          minItems,
          maxItems,
        }),
      )
    | _ => None
    }
  }

let decodeTextDisplay = (d: dict<JSON.t>): option<field> =>
  switch asBase(d) {
  | None => None
  | Some((id, name, description, required)) =>
    let content = d->Dict.get("content")->Option.flatMap(Decode.asString)
    let size = d->Dict.get("size")->Option.flatMap(asTextDisplaySize)
    switch (content, size) {
    | (Some(content), Some(size)) =>
      Some(TextDisplay({id, name, description, required, content, size}))
    | _ => None
    }
  }

let decodeSeparator = (d: dict<JSON.t>): option<field> =>
  asBase(d)->Option.map(((id, name, description, required)) =>
    Separator({id, name, description, required})
  )

@genType
let decode = (json: JSON.t): result<field, string> =>
  switch json {
  | Object(d) =>
    switch d->Dict.get("fieldType") {
    | None => Error("missing fieldType")
    | Some(String(ft)) =>
      let decoder = switch ft {
      | "binary" => Some(decodeBinary)
      | "free-text" => Some(decodeFreeText)
      | "medicine" => Some(decodeMedicine)
      | "diagnosis" => Some(decodeDiagnosis)
      | "date" => Some(decodeDate)
      | "options" => Some(decodeOptions)
      | "file" => Some(decodeFile)
      | "text" => Some(decodeTextDisplay)
      | "separator" => Some(decodeSeparator)
      | _ => None
      }
      switch decoder {
      | None => Error("unknown fieldType: " ++ ft)
      | Some(fn) =>
        switch fn(d) {
        | Some(f) => Ok(f)
        | None => Error(`invalid ${ft} field`)
        }
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

// Encode a field back to JSON. Because the variant's runtime
// representation matches the wire shape (via `@tag` + `@as`), this is
// a zero-cost cast. Unknown fields present on the original wire blob
// (e.g. legacy `_tag`) are NOT preserved — `decode` reconstructs the
// canonical shape from declared fields only.
@genType
let encode = (field: field): JSON.t => (Obj.magic(field): JSON.t)
