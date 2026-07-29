import { Q } from "@nozbe/watermelondb"
import { Option } from "effect"

import database from "@/db"
import EventFormModel from "@/db/model/EventForm"
import { type RuleEvaluation, type RuleScope } from "@/lib/form-rules"
import { sanitizeFieldName } from "@/utils/fieldNameSanitizer"
import { splitMultiValues } from "@/utils/parsers"

import { type WithInputRules } from "./form-rules"
import Language from "./Language"

namespace EventForm {
  export const InputType = {
    TEXT: "text",
    NUMBER: "number",
    RADIO: "radio",
    CHECKBOX: "checkbox",
    DATE: "date",
    SELECT: "select",
    DIAGNOSIS: "diagnosis",
    DROPDOWN: "dropdown",
    MEDICINE: "medicine",
    INPUT_GROUP: "input-group",
    FILE: "file",
  }
  export type InputType = (typeof InputType)[keyof typeof InputType]
  export const inputTypeList: InputType[] = [
    InputType.TEXT,
    InputType.NUMBER,
    InputType.RADIO,
    InputType.CHECKBOX,
    InputType.DATE,
    InputType.SELECT,
    InputType.DIAGNOSIS,
    InputType.DROPDOWN,
    InputType.MEDICINE,
    InputType.INPUT_GROUP,
    InputType.FILE,
  ]

  export const FORM_NAME_FIELD_ID = "__form_name__"
  export const FORM_DESCRIPTION_FIELD_ID = "__form_description__"

  /** Field types that are display-only and do not collect user input */
  export const DISPLAY_ONLY_FIELD_TYPES = ["text", "separator"] as const

  /** Returns true if a field is display-only (text or separator) and should not be included in form data */
  export function isDisplayOnly(field: { fieldType: string }): boolean {
    return (DISPLAY_ONLY_FIELD_TYPES as readonly string[]).includes(field.fieldType)
  }

  /**
   * Upper bound on files per field when a `multiple` field omits `maxItems`.
   * Keeps an unbounded upload loop out of a low-bandwidth clinic.
   */
  const FILE_FIELD_MAX_ITEMS_DEFAULT = 10

  /**
   * How many files a file field accepts. A field authored without these props
   * is a single optional file. `required` is enforced separately by
   * `getMissingRequiredFields`, which floors `minItems` at 1.
   */
  export function fileFieldLimits(field: {
    multiple?: boolean
    minItems?: number
    maxItems?: number
  }): { minItems: number; maxItems: number } {
    if (field.multiple !== true) return { minItems: 0, maxItems: 1 }
    const maxItems = Math.max(1, field.maxItems ?? FILE_FIELD_MAX_ITEMS_DEFAULT)
    const minItems = Math.min(Math.max(0, field.minItems ?? 0), maxItems)
    return { minItems, maxItems }
  }

  export type FieldTranslation = {
    fieldId: string
    name: Language.TranslationObject
    description: Language.TranslationObject
    options: Record<string, Language.TranslationObject>
    createdAt: string
    updatedAt: string
  }

  // Optional rule slots authored on the web form-builder. JSON
  // pass-through on sync; the renderer evaluates them via
  // `apps/mobile/app/lib/form-rules.ts`. Non-primitive field kinds
  // (display-only, list) only ever carry `visibleIf` from the
  // authoring UI — the other slots stay undefined for them.
  export type FieldItem = {
    id: string
    name: string
    description?: string
    fieldType: string
    inputType: InputType
    multi: Option.Option<boolean>
    options: Option.Option<any[]>
    // text field (read-only display)
    content?: string
    size?: "xxl" | "xl" | "lg" | "md" | "sm"
    required?: boolean
    // File fields. Absent on older authored forms; `fileFieldLimits` fills in
    // single-file defaults when they are.
    multiple?: boolean
    minItems?: number
    maxItems?: number
    // Diagnosis fields. Absent on forms authored before the flag existed,
    // which read as "do not record" — see `Event.problemsFromFormData`.
    addToProblems?: boolean
  } & WithInputRules
  export type T = {
    id: string
    name: string
    description: string
    language: string
    isEditable: boolean
    isSnapshotForm: boolean
    formFields: FieldItem[]
    metadata: Record<string, any>
    isDeleted: boolean
    deletedAt: Option.Option<Date>
    clinicIds: string[]
    translations: FieldTranslation[]
    createdAt: Date
    updatedAt: Date
  }

  export const empty: T = {
    id: "",
    name: "",
    description: "",
    language: "",
    isEditable: false,
    isSnapshotForm: false,
    formFields: [],
    metadata: {},
    isDeleted: false,
    deletedAt: Option.none(),
    clinicIds: [],
    translations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  /**
   * Helper that filters and returns only the set of forms that are snapshots
   * @param {EventForm.T[] | EventForm.DB.T[]} forms - The list of forms
   * @returns {T[]} result - The snapshot forms
   */
  export function filterSnapshots<T extends EventForm.T | EventForm.DB.T>(forms: T[]): T[] {
    return forms.filter((form) => form.isSnapshotForm)
  }

  /**
   * Converts from EventFormModel (aka DBEventForm) to EventForm.T
   * @param dbEventForm The EventFormModel to convert
   * @returns The converted EventForm.T
   */
  export const fromDB = (dbEventForm: DB.T): T => ({
    id: dbEventForm.id,
    name: dbEventForm.name,
    description: dbEventForm.description,
    language: dbEventForm.language,
    isEditable: dbEventForm.isEditable,
    isSnapshotForm: dbEventForm.isSnapshotForm,
    formFields: dbEventForm.formFields,
    metadata: dbEventForm.metadata,
    isDeleted: dbEventForm.isDeleted,
    deletedAt: Option.fromNullable(dbEventForm.deletedAt),
    clinicIds: dbEventForm.clinicIds,
    translations: dbEventForm.translations ?? [],
    createdAt: dbEventForm.createdAt,
    updatedAt: dbEventForm.updatedAt,
  })

  export namespace DB {
    export type T = EventFormModel

    /**
     * Look up a single form by id.
     *
     * Returns `null` for a missing or malformed id rather than throwing, so
     * callers that only need the form to enrich a write can carry on without
     * it.
     *
     * @param formId The form's id
     * @returns The form, or `null` if there is no such record
     */
    export async function findById(formId: string): Promise<EventForm.DB.T | null> {
      if (!formId) return null
      try {
        return await database.get<EventForm.DB.T>("event_forms").find(formId)
      } catch {
        return null
      }
    }

    /**
     * Subscription to an event form record in the database
     * @param language The event form language
     * @param callback Function called when event form data updates
     * @returns Object containing unsubscribe function
     */
    export function subscribe(
      language: Option.Option<Language.LanguageName>,
      callback: (forms: Option.Option<EventForm.DB.T[]>, isLoading: boolean) => void,
    ): { unsubscribe: () => void } {
      let isLoading = true
      const queries = [Q.where("is_deleted", Q.notEq(true)), Q.sortBy("name", Q.asc)]

      const languageQueries = Option.match(language, {
        onNone: () => [],
        onSome: (lng) => {
          const resolved = lng === "en-US" ? "en" : typeof lng === "string" ? lng : ""
          return [Q.where("language", resolved)]
        },
      })

      const subscription = database.collections
        .get<EventForm.DB.T>("event_forms")
        .query([...languageQueries, ...queries])
        .observe()
        .subscribe((dbForms) => {
          const forms = dbForms
          isLoading = false
          callback(Option.fromNullable(forms), isLoading)
        })

      return {
        unsubscribe: () => subscription.unsubscribe(),
      }
    }
  }


  /** Context needed to validate required fields before submission */
  export type RequiredFieldContext = {
    formFields: FieldItem[]
    data: Record<string, any>
    diagnoses: any[]
    medicines: any[]
    fileUploads: Record<string, { files?: { id: string }[] } | undefined>
    /**
     * Optional rule evaluation result. When present, the helper consults
     * `isVisible` (hidden fields cannot be missing) and `isRequired`
     * (overrides the static `required` flag — see the contract in
     * `app/lib/form-rules.ts`). When absent, this falls back to the
     * pre-rules behavior: every `field.required` is enforced.
     */
    evaluation?: RuleEvaluation
  }

  /**
   * Returns the **names** of required fields that are missing a value.
   *
   * This is a pure function so it can be tested without any React or DB
   * dependencies.
   *
   * Rules:
   * - Display-only fields (text / separator) are skipped.
   * - If `evaluation` is provided, hidden fields are skipped before any
   *   required check (a hidden field is never "missing").
   * - Required-ness comes from `evaluation.isRequired(field.id)` when
   *   provided, else falls back to the static `field.required` flag.
   * - Diagnosis fields check `diagnoses.length`.
   * - Medicine fields check `medicines.length`.
   * - File fields check the uploaded count against `minItems`, floored at 1
   *   (a required field needs at least one file whatever `minItems` says).
   *   `minItems` on a field that is *not* required is not enforced here —
   *   this function reports missing **required** fields only.
   * - Everything else checks `data[name]` — `undefined`, `null`, and
   *   empty / whitespace-only strings are all treated as missing.
   */
  export function getMissingRequiredFields(ctx: RequiredFieldContext): string[] {
    const { formFields, data, diagnoses, medicines, fileUploads, evaluation } = ctx

    const isRequired = (field: FieldItem): boolean =>
      evaluation ? evaluation.isRequired(field.id) : field.required === true

    const isVisible = (field: FieldItem): boolean =>
      evaluation ? evaluation.isVisible(field.id) : true

    return formFields
      .filter((field) => !isDisplayOnly(field) && isVisible(field) && isRequired(field))
      .filter((field) => {
        // Diagnosis list managed outside react-hook-form
        if (field.fieldType === "diagnosis") return diagnoses.length === 0

        // Medicine list managed outside react-hook-form
        if (field.fieldType === "medicine") return medicines.length === 0

        // File uploads tracked in a separate state map
        if (field.inputType === "file") {
          const uploadedCount = fileUploads[field.name]?.files?.length ?? 0
          return uploadedCount < Math.max(fileFieldLimits(field).minItems, 1)
        }

        // All other inputs: value lives in react-hook-form `data`
        const value = data[field.name]
        if (value === undefined || value === null) return true
        if (typeof value === "string" && value.trim() === "") return true

        return false
      })
      .map((field) => field.name)
  }


  /**
   * Input for `buildRuleScope`. The three keyings the renderer juggles —
   * id (rules), raw name (fileUploads), sanitized name (RHF) — are
   * reconciled here so the rest of the screen can ignore the
   * distinction.
   */
  export type RuleScopeContext = {
    formFields: ReadonlyArray<FieldItem>
    /**
     * Snapshot of RHF `watch()` (or `useWatch({ control })`) keyed by
     * the **sanitized** field name. The helper re-applies
     * `sanitizeFieldName(field.name)` when reading.
     */
    watchedValues: Record<string, unknown>
    diagnoses: ReadonlyArray<unknown>
    medicines: ReadonlyArray<unknown>
    /** Keyed by **raw** field name — matches the screen's existing usage. */
    fileUploads: Record<string, { files?: { id: string }[] } | undefined>
    /** Non-form data rules may reference via `{var: "ctx.<key>"}`. */
    ctx: RuleScope["ctx"]
  }

  // Whether a field is a multi-select (its value is a *set* of option
  // values, not a scalar). `multi` is an Effect `Option<boolean>` on
  // FieldItem in production; tests build fields with a plain boolean, so
  // accept both shapes.
  function isMultiSelectField(field: FieldItem): boolean {
    const m: unknown = field.multi
    if (Option.isOption(m)) return Option.getOrElse(m, () => false) === true
    return m === true
  }

  /**
   * Build the `RuleScope` consumed by the compiled evaluator.
   *
   * Why a dedicated helper: rules reference fields by **id**, RHF keys
   * by **sanitized name**, and `fileUploads` keys by **raw name**. Mixing
   * those three in the screen's render body is the easiest way to make
   * rules silently misfire on any field whose name contains `.`, `[`,
   * `]`, `|`, `'`, or `"`.
   *
   * Per-field-type mapping:
   * - Display-only fields contribute nothing (rules on them only ever
   *   reference *other* fields).
   * - Diagnosis / medicine fields → the corresponding side-state array.
   * - File fields → the uploaded resource ids as a `string[]` (empty when
   *   nothing is attached). Filenames and mimetypes aren't surfaced — rules
   *   have no stable contract for them. The form-builder only offers
   *   `primitive`-kind fields as rule subjects and file maps to `list`, so
   *   nothing reads this today.
   * - Multi-select fields → the chosen option values as a `string[]`
   *   (split from the persisted joined string) so membership rules see a
   *   real array.
   * - All other fields → `watchedValues[sanitizeFieldName(field.name)]`.
   *   Missing keys map to `undefined` (matches the evaluator's
   *   conservative defaults).
   */
  export function buildRuleScope(input: RuleScopeContext): RuleScope {
    const { formFields, watchedValues, diagnoses, medicines, fileUploads, ctx } = input
    const form: Record<string, unknown> = {}

    for (const field of formFields) {
      if (isDisplayOnly(field)) continue

      if (field.fieldType === "diagnosis") {
        form[field.id] = diagnoses
        continue
      }
      if (field.fieldType === "medicine") {
        form[field.id] = medicines
        continue
      }
      if (field.inputType === "file") {
        form[field.id] = (fileUploads[field.name]?.files ?? []).map((file) => file.id)
        continue
      }

      const value = watchedValues[sanitizeFieldName(field.name)]
      // Multi-select fields persist their chosen option values as a
      // `EVENT_MULTI_SEPARATOR`-joined string (see the picker's `setValue`).
      // The evaluator needs a real array so membership operators (`in`) test
      // exact option values instead of substring-matching the joined string
      // (`"cat"` in `"catalog; dog"`), and so `some`/`all` stop collapsing a
      // string to `[]`. Split at the scope boundary only — persisted storage
      // stays the joined string.
      if (isMultiSelectField(field)) {
        form[field.id] = Array.isArray(value)
          ? value
          : typeof value === "string"
            ? splitMultiValues(value)
            : []
        continue
      }
      // JsonLogic's comparison coercer (`vendor/@nd/jsonlogic/.../Coerce.res`)
      // treats `Date` instances as non-coercible `Object`s — comparisons error
      // with NaNError and the evaluator's fail-safe semantics silently skip
      // the validator. Normalize date fields to local "YYYY-MM-DD" strings
      // (matching the rule-template `<input type="date">` literal format) so
      // string-vs-string lex compare works as authors expect.
      if (field.fieldType === "date" && value instanceof Date) {
        form[field.id] = formatDateYMD(value)
        continue
      }

      form[field.id] = value
    }

    return { form, ctx }
  }

  // Local-date YYYY-MM-DD. NOT `toISOString().slice(0, 10)` — UTC truncation
  // would shift the day in non-UTC timezones (PST-midnight Jan 1 → UTC
  // Dec 31). Matches the format `<input type="date">` emits in the web
  // form-builder's rule editor.
  function formatDateYMD(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  // Clear-on-hide diff

  export type ComputeNewlyHiddenInput = {
    formFields: ReadonlyArray<FieldItem>
    evaluation: RuleEvaluation
    /** Set of field ids that were hidden on the previous evaluation. */
    previouslyHidden: ReadonlySet<string>
  }

  export type ComputeNewlyHiddenResult = {
    /**
     * The set of input-collecting field ids that are currently hidden.
     * The caller assigns this to its ref on every evaluation so the
     * next diff has a fresh baseline.
     */
    nowHidden: Set<string>
    /**
     * Fields that transitioned visible → hidden on this evaluation.
     * The caller dispatches the right clear action per field type
     * (RHF setValue, setDiagnoses, setMedicines, setFileUploads).
     */
    newlyHidden: FieldItem[]
  }

  /**
   * Diff helper for the clear-on-hide effect.
   *
   * Why this is a pure helper: the screen-side `useEffect` only needs
   * to (a) know which fields just hid so it can clear their values, and
   * (b) update its ref. The set algebra is annoying to read inline and
   * impossible to unit-test from inside the effect. Extracting it makes
   * the effect a thin dispatcher and the diff logic testable.
   *
   * Display-only fields are skipped — they have a `visibleIf` slot in
   * the data model but no user-input state to clear, so the diff has
   * nothing to act on for them.
   *
   * Loop-safety: the caller should only act on `newlyHidden`. On the
   * follow-up render triggered by clearing, those same fields will
   * be in both `previouslyHidden` and the new computation, so
   * `newlyHidden` is empty and the effect terminates.
   */
  export function computeNewlyHidden(
    input: ComputeNewlyHiddenInput,
  ): ComputeNewlyHiddenResult {
    const { formFields, evaluation, previouslyHidden } = input
    const nowHidden = new Set<string>()
    const newlyHidden: FieldItem[] = []

    for (const field of formFields) {
      if (isDisplayOnly(field)) continue
      if (evaluation.isVisible(field.id)) continue

      nowHidden.add(field.id)
      if (!previouslyHidden.has(field.id)) newlyHidden.push(field)
    }

    return { nowHidden, newlyHidden }
  }
}

export default EventForm
