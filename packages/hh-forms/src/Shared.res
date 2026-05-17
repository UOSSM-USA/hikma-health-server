// Primitives shared by EventForm and PatientRegistrationForm.
//
// Kept deliberately small: anything that *both* form families need lives
// here, anything specific to one family lives in EventForm.res or
// RegistrationForm.res.

@genType
type translationObject = dict<string>

// FieldOption — a labeled choice with an optional stable id.
//
// The `id` is optional because legacy data on disk predates the id
// backfill. Decoders MUST tolerate options without an `id` (consumers fall
// back to `value` via `getOptionId` in EventForm / Translations).
@genType
type fieldOption = {
  id?: string,
  label: string,
  value: string,
}

// Two-letter ISO 639-2 language code. Kept as `string` rather than a closed
// variant because (a) the canonical TS type lists ~90 codes and (b) the
// translation dictionary is keyed by arbitrary strings already.
@genType
type languageCode = string

// Text display size used by the event-form "text" display variant.
@genType
type textDisplaySize = [#xxl | #xl | #lg | #md | #sm]

@genType
let textDisplaySizes: array<textDisplaySize> = [#xxl, #xl, #lg, #md, #sm]

@genType
type durationUnit = [#hours | #days | #weeks | #months | #years]

@genType
let durationUnits: array<durationUnit> = [#hours, #days, #weeks, #months, #years]

@genType
type doseUnit = [#mg | #g | #mcg | #mL | #L | #units]

@genType
let doseUnits: array<doseUnit> = [#mg, #g, #mcg, #mL, #L, #units]

// Measurement units are kept as plain strings — the set contains symbols
// (°C, °F, %, /) that don't form valid polymorphic-variant identifiers
// without `@as` annotations, and consumers treat them as opaque labels
// anyway.
@genType
let measurementUnits: array<string> = [
  "cm",
  "m",
  "kg",
  "lb",
  "in",
  "ft",
  "mmHg",
  "cmH2O",
  "mmH2O",
  "°C",
  "°F",
  "BPM",
  "P",
  "mmol/L",
  "mg/dL",
  "%",
  "units",
]

@genType
type medicineRoute = [
  | #oral
  | #sublingual
  | #rectal
  | #topical
  | #inhalation
  | #intravenous
  | #intramuscular
  | #intradermal
  | #subcutaneous
  | #nasal
  | #ophthalmic
  | #otic
  | #vaginal
  | #transdermal
  | #other
]

@genType
let medicineRoutes: array<medicineRoute> = [
  #oral,
  #sublingual,
  #rectal,
  #topical,
  #inhalation,
  #intravenous,
  #intramuscular,
  #intradermal,
  #subcutaneous,
  #nasal,
  #ophthalmic,
  #otic,
  #vaginal,
  #transdermal,
  #other,
]

@genType
type medicineForm = [
  | #tablet
  | #syrup
  | #ampule
  | #suppository
  | #cream
  | #drops
  | #bottle
  | #spray
  | #gel
  | #lotion
  | #inhaler
  | #capsule
  | #injection
  | #patch
  | #other
]

@genType
let medicineForms: array<medicineForm> = [
  #tablet,
  #syrup,
  #ampule,
  #suppository,
  #cream,
  #drops,
  #bottle,
  #spray,
  #gel,
  #lotion,
  #inhaler,
  #capsule,
  #injection,
  #patch,
  #other,
]

// Field names that may not be reused by user-defined fields because they
// collide with built-in event-form behaviors (diagnoses and medications).
@genType
let reservedFieldNames: array<string> = ["diagnosis", "medicine"]

// Sentinel field IDs used by the external-translations array to address
// form-level (rather than field-level) name and description.
@genType
let formNameFieldId = "__form_name__"

@genType
let formDescriptionFieldId = "__form_description__"
