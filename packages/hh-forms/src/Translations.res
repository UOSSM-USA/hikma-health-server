// External-translations array for event forms.
//
// Translations are stored separately from `form_fields` so that adding a
// language doesn't require migrating every field blob. Each
// `fieldTranslation` is keyed by `fieldId` and carries per-language values
// for `name`, `description`, and each option's label.

@genType
type fieldTranslation = {
  fieldId: string,
  name: Shared.translationObject,
  description: Shared.translationObject,
  options: dict<Shared.translationObject>,
  createdAt: string,
  updatedAt: string,
}

@genType
type translationKey = [#name | #description]

// Returns the stable identifier for a FieldOption, falling back to `value`
// when `id` is absent (legacy data predates the id backfill).
@genType
let getOptionId = (option: Shared.fieldOption): string => {
  switch option.id {
  | Some(id) => id
  | None => option.value
  }
}

// Returns now() as an ISO-8601 string. Indirected so tests can stub it.
let nowIso = () => Date.make()->Date.toISOString

// Find the translation entry for a given fieldId. Returns None if absent.
@genType
let getFieldTranslation = (
  translations: array<fieldTranslation>,
  fieldId: string,
): option<fieldTranslation> => {
  translations->Array.find(t => t.fieldId === fieldId)
}

let emptyEntry = (fieldId): fieldTranslation => {
  let now = nowIso()
  {
    fieldId,
    name: Dict.make(),
    description: Dict.make(),
    options: Dict.make(),
    createdAt: now,
    updatedAt: now,
  }
}

// Upsert a translation value for a field's `name` or `description` under a
// given language. Creates a new entry if none exists for the field;
// otherwise updates in place (immutably).
@genType
let upsertFieldTranslation = (
  translations: array<fieldTranslation>,
  fieldId: string,
  lang: string,
  key: translationKey,
  value: string,
): array<fieldTranslation> => {
  let now = nowIso()
  let existing = translations->Array.find(t => t.fieldId === fieldId)
  switch existing {
  | Some(_) =>
    translations->Array.map(t => {
      if t.fieldId !== fieldId {
        t
      } else {
        switch key {
        | #name =>
          let nextName = Dict.copy(t.name)
          nextName->Dict.set(lang, value)
          {...t, name: nextName, updatedAt: now}
        | #description =>
          let nextDesc = Dict.copy(t.description)
          nextDesc->Dict.set(lang, value)
          {...t, description: nextDesc, updatedAt: now}
        }
      }
    })
  | None =>
    let entry = emptyEntry(fieldId)
    let entry = switch key {
    | #name =>
      let dict = Dict.make()
      dict->Dict.set(lang, value)
      {...entry, name: dict}
    | #description =>
      let dict = Dict.make()
      dict->Dict.set(lang, value)
      {...entry, description: dict}
    }
    Array.concat(translations, [entry])
  }
}

// Upsert a translation value for a specific option within a field. Creates
// the parent entry if needed.
@genType
let upsertOptionTranslation = (
  translations: array<fieldTranslation>,
  fieldId: string,
  optionId: string,
  lang: string,
  value: string,
): array<fieldTranslation> => {
  let now = nowIso()
  let existing = translations->Array.find(t => t.fieldId === fieldId)
  switch existing {
  | Some(_) =>
    translations->Array.map(t => {
      if t.fieldId !== fieldId {
        t
      } else {
        let nextOptions = Dict.copy(t.options)
        let optTranslation = switch nextOptions->Dict.get(optionId) {
        | Some(existing) => Dict.copy(existing)
        | None => Dict.make()
        }
        optTranslation->Dict.set(lang, value)
        nextOptions->Dict.set(optionId, optTranslation)
        {...t, options: nextOptions, updatedAt: now}
      }
    })
  | None =>
    let entry = emptyEntry(fieldId)
    let optDict = Dict.make()
    optDict->Dict.set(lang, value)
    let opts = Dict.make()
    opts->Dict.set(optionId, optDict)
    Array.concat(translations, [{...entry, options: opts}])
  }
}

// Remove all translation entries for a given fieldId.
@genType
let removeFieldTranslation = (
  translations: array<fieldTranslation>,
  fieldId: string,
): array<fieldTranslation> => {
  translations->Array.filter(t => t.fieldId !== fieldId)
}

// Walk a form_fields JSON array and assign a stable `id` to every options
// entry that lacks one. Idempotent: a second pass returns IDs identical to
// the first. String-valued options (used by medicine fields) are left
// untouched.
//
// `generateId` is injected so the package stays free of runtime
// dependencies (callers typically pass `() => nanoid()`).
@genType
let ensureOptionIds = (
  ~generateId: unit => string,
  fields: array<JSON.t>,
): array<JSON.t> => {
  fields->Array.map(field => {
    switch field {
    | Object(fieldDict) =>
      switch fieldDict->Dict.get("options") {
      | Some(opts) =>
        switch opts {
        | Array(optsArr) =>
          let newOpts = optsArr->Array.map(opt => {
            switch opt {
            | Object(optDict) =>
              switch optDict->Dict.get("id") {
              | Some(_) => opt
              | None =>
                let next = Dict.copy(optDict)
                next->Dict.set("id", JSON.Encode.string(generateId()))
                JSON.Encode.object(next)
              }
            | _ => opt
            }
          })
          let nextField = Dict.copy(fieldDict)
          nextField->Dict.set("options", JSON.Encode.array(newOpts))
          JSON.Encode.object(nextField)
        | _ => field
        }
      | None => field
      }
    | _ => field
    }
  })
}
