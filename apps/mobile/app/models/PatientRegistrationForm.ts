import { Option } from "effect"

import PatientModel from "@/db/model/Patient"
import RegistrationFormModel from "@/db/model/PatientRegistrationForm"
import { type RuleEvaluation, type RuleScope } from "@/lib/form-rules"

import { type WithInputRules } from "./form-rules"
import Language from "./Language"

namespace PatientRegistrationForm {
  export const inputTypes = ["number", "text", "select", "date", "boolean", "checkbox"] as const

  /**
   * A list of all the base columns that are required for a patient to be registered
   * in the system. These are the fields that are required for all registration forms
   * to be valid.
   */
  export type BaseColumn =
    | "given_name"
    | "surname"
    | "date_of_birth"
    | "sex"
    | "phone"
    | "citizenship"
    | "camp"
    | "government_id"
    | "external_patient_id"
    | "primary_clinic_id"
  export const baseColumns: BaseColumn[] = [
    "given_name",
    "surname",
    "date_of_birth",
    "sex",
    "phone",
    "citizenship",
    "camp",
    "government_id",
    "external_patient_id",
    "primary_clinic_id",
  ]

  export const InputType = {
    NUMBER: "number",
    TEXT: "text",
    SELECT: "select",
    DATE: "date",
    BOOLEAN: "boolean",
    CHECKBOX: "checkbox",
  }
  export type InputType = (typeof InputType)[keyof typeof InputType]

  export const inputTypeList: InputType[] = [
    InputType.NUMBER,
    InputType.TEXT,
    InputType.SELECT,
    InputType.DATE,
    InputType.BOOLEAN,
    InputType.CHECKBOX,
  ]
  export type FormField = {
    id: string
    position: number
    // column name in the database
    column: string
    label: Language.TranslationObject
    fieldType: InputType
    options: Language.TranslationObject[]
    required: boolean
    baseField: boolean // whether or not this is part of the base inputs required of all registration forms
    visible: boolean // Whether or not it displays in the app
    isSearchField: boolean // Whether or not this field can be sea
    deleted: boolean
  }
  export type T = {
    id: string
    name: string
    fields: FormField[]
    metadata: Record<string, any>
    isDeleted: boolean
    deletedAt: Option.Option<Date>
    createdAt: Date
    updatedAt: Date
  }

  // Optional rule slots authored on the web form-builder. JSON
  // pass-through on sync; the renderer evaluates them via
  // `apps/mobile/app/lib/form-rules.ts`. All registration fields are
  // input-collecting primitives, so all four slots are eligible.
  export type RegistrationFormField = {
    id: string
    position: number
    // column name in the database
    column: BaseColumn
    label: Language.TranslationObject
    fieldType: (typeof inputTypes)[number]
    options: Language.TranslationObject[]
    required: boolean

    /** A flag indicating whether or not a field is a "base field" - i.e. one that is required for all patients */
    baseField: boolean

    /** Can be set by the administrator: determines whether or not the field is displayed during patient registration */
    visible: boolean

    /** Whether or not a field is marked as deleted - this is a soft-delete */
    deleted: boolean

    /** Whether or not this field renders in the "advanced search" sections during patient search */
    isSearchField: boolean
  } & WithInputRules

  export type RegistrationForm = {
    id: string
    name: string
    fields: RegistrationFormField[]
    metadata: Record<string, any>
    createdAt: Date
    updatedAt: Date
  }

  /**
  Derived from the Patient Model

  */
  export type BaseFields = {
    id: string
    givenName: string
    surname: string
    dateOfBirth: Date
    citizenship: string
    hometown: string
    phone: string
    sex: string
    camp: string
    photoUrl: string
    governmentId: string
    externalPatientId: string
  }

  // sometimes typescript is so confusing
  // FormState holds an object where the keys are the field, and the values are the form entries by the users
  export type FormState = BaseFields &
    Record<keyof PatientModel, any> &
    Record<BaseColumn, any> & {
      [key: string]: any
    }

  export const empty: T = {
    id: "",
    name: "",
    fields: [],
    metadata: {},
    isDeleted: false,
    deletedAt: Option.none(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  /**
  PatientRecord type containing both the registration form, and the values
  from the database.

  The data field is an object mapping field ids to their values stored in the database.
  */
  export type PatientRecord = {
    fields: RegistrationFormModel["fields"]
    values: Record<RegistrationFormField["id"], number | Date | string | boolean>
  }
  // ---------------------------------------------------------------------------
  // Required-field validation
  // ---------------------------------------------------------------------------

  /** Context needed to validate required fields before submission */
  export type RequiredFieldContext = {
    fields: RegistrationFormField[]
    values: Record<string, number | Date | string | boolean>
    /**
     * Optional rule evaluation result. When present, the helper consults
     * `isVisible` (rule-hidden fields cannot be missing) and `isRequired`
     * (overrides the static `required` flag — see the contract in
     * `app/lib/form-rules.ts`). When absent, this falls back to the
     * pre-rules behavior: every `field.required` is enforced.
     */
    evaluation?: RuleEvaluation
  }

  /**
   * Returns the **labels** (en fallback) of required, visible fields that are
   * missing a value.
   *
   * Pure function — no React or DB dependencies.
   *
   * Rules:
   * - Only non-deleted, admin-visible fields are checked.
   * - If `evaluation` is provided, rule-hidden fields are skipped before any
   *   required check (a hidden field is never "missing").
   * - Required-ness comes from `evaluation.isRequired(field.id)` when
   *   provided, else falls back to the static `field.required` flag.
   * - `undefined`, `null`, and whitespace-only strings are treated as missing.
   * - `0`, `false`, and valid Dates are treated as present.
   */
  export function getMissingRequiredFields(ctx: RequiredFieldContext): string[] {
    const { fields, values, evaluation } = ctx

    const isRequired = (field: RegistrationFormField): boolean =>
      evaluation ? evaluation.isRequired(field.id) : field.required === true

    const isVisible = (field: RegistrationFormField): boolean =>
      evaluation ? evaluation.isVisible(field.id) : true

    return fields
      .filter((field) => field.visible && !field.deleted)
      .filter((field) => isVisible(field) && isRequired(field))
      .filter((field) => {
        const value = values[field.id]
        if (value === undefined || value === null) return true
        if (typeof value === "string" && value.trim() === "") return true
        return false
      })
      .map((field) => field.label.en || field.column)
  }

  // ---------------------------------------------------------------------------
  // Rule-scope assembly (mobile-side)
  // ---------------------------------------------------------------------------

  /**
   * Input for `buildRuleScope`. Registration values are already keyed by
   * field id, so the mapping is straightforward — unlike `EventForm`,
   * there is no diagnosis / medicine / file side-state to reconcile.
   */
  export type RuleScopeContext = {
    fields: ReadonlyArray<RegistrationFormField>
    /**
     * Patient field values keyed by **field id**. Sourced from
     * `patientRecord.values` in `usePatientRecordEditor`.
     */
    values: Record<string, unknown>
    /** Non-form data rules may reference via `{var: "ctx.<key>"}`. */
    ctx: RuleScope["ctx"]
  }

  /**
   * Build the `RuleScope` consumed by the compiled evaluator.
   *
   * Bounds the scope to declared fields rather than passing `values`
   * through wholesale. This matches `EventForm.buildRuleScope` discipline
   * and drops any orphan `values` keys whose fields no longer exist.
   *
   * All registration form fields are input-collecting primitives (no
   * display-only / list-ish kinds in this domain), so every field
   * contributes one slot.
   */
  export function buildRuleScope(input: RuleScopeContext): RuleScope {
    const { fields, values, ctx } = input
    const form: Record<string, unknown> = {}

    for (const field of fields) {
      const value = values[field.id]
      // JsonLogic's comparison coercer treats `Date` instances as
      // non-coercible `Object`s — `>=` errors with NaNError and the
      // evaluator's fail-safe semantics silently skip the validator.
      // Normalize date fields to local "YYYY-MM-DD" strings, matching
      // the rule-template `<input type="date">` literal format. See the
      // parallel fix in `EventForm.buildRuleScope`.
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
  // Dec 31). Mirrors the same helper inlined in `EventForm.buildRuleScope`.
  function formatDateYMD(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  // Clear-on-hide diff

  export type ComputeNewlyHiddenInput = {
    fields: ReadonlyArray<RegistrationFormField>
    evaluation: RuleEvaluation
    /** Set of field ids that were hidden on the previous evaluation. */
    previouslyHidden: ReadonlySet<string>
  }

  export type ComputeNewlyHiddenResult = {
    /**
     * The set of field ids that are currently hidden by rules. The
     * caller assigns this to its ref on every evaluation so the next
     * diff has a fresh baseline.
     */
    nowHidden: Set<string>
    /**
     * Fields that transitioned visible → hidden on this evaluation.
     * The caller dispatches a per-field clear via the hook setter.
     *
     * NOTE on patient-data durability: callers should skip dispatch on
     * the FIRST evaluation after loading a patient, treating that
     * evaluation as baseline. Patient values are durable — clearing a
     * rule-hidden field that was loaded from the DB would silently
     * mutate the record via the transformer's fallback semantic. See
     * `PatientRecordEditorScreen` for the first-render guard.
     */
    newlyHidden: RegistrationFormField[]
  }

  /**
   * Diff helper for the clear-on-hide effect. Mirrors
   * `EventForm.computeNewlyHidden` — no display-only filter needed
   * because registration forms have no display-only field kinds.
   *
   * Loop-safety: the caller only acts on `newlyHidden`. On the follow-up
   * render triggered by clearing, those same fields will appear in both
   * `previouslyHidden` and the new computation, so `newlyHidden` is
   * empty and the effect terminates.
   */
  export function computeNewlyHidden(
    input: ComputeNewlyHiddenInput,
  ): ComputeNewlyHiddenResult {
    const { fields, evaluation, previouslyHidden } = input
    const nowHidden = new Set<string>()
    const newlyHidden: RegistrationFormField[] = []

    for (const field of fields) {
      if (evaluation.isVisible(field.id)) continue

      nowHidden.add(field.id)
      if (!previouslyHidden.has(field.id)) newlyHidden.push(field)
    }

    return { nowHidden, newlyHidden }
  }
}

export default PatientRegistrationForm
