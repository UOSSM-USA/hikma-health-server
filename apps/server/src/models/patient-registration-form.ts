import { Option } from "effect";
import {
  type ColumnType,
  type Generated,
  type Selectable,
  type Insertable,
  type Updateable,
  type JSONColumnType,
  sql,
} from "kysely";
import { type Language } from "./language";
import { v1 as uuidv1 } from "uuid";
import db from "@/db";
import { createServerOnlyFn } from "@tanstack/react-start";
import { format } from "date-fns";
import {
  mapObjectValues,
  toSafeDateString,
  splitCheckboxValues,
} from "@/lib/utils";
import { baseFields } from "@/data/registration-form-base-fields";
import type { WithInputRules } from "@/models/form-rules";
import { assertFieldRulesValid } from "@/models/form-rules";
import type {
  LogicField,
  LogicPrimitiveKind,
} from "@/lib/form-rule-templates";
import type {
  ruleEvaluation,
  ruleScope,
} from "@hikmahealth/forms/Rules";

namespace PatientRegistrationForm {
  export type T = {
    id: string;
    clinic_id: Option.Option<string>;
    name: Option.Option<string>;
    fields: Field[];
    metadata: Record<string, any>;
    is_deleted: boolean;
    created_at: Date;
    updated_at: Date;
    last_modified: Date;
    server_created_at: Date;
    deleted_at: Option.Option<Date>;
  };

  export const inputTypes = [
    "number",
    "text",
    "select",
    "checkbox",
    "date",
    "boolean",
  ] as const;

  export type InputType = (typeof inputTypes)[number];

  // Registration fields collect simple primitive values across all six
  // input types (number / text / select / checkbox / date / boolean), so
  // every field carries the full input-rules slot — `visibleIf`,
  // `requiredIf`, `validators`, `computedValue`. Slots are optional;
  // legacy stored fields without rules decode unchanged.
  //
  // The `visible` flag (existing) is the static, author-set switch;
  // `visibleIf` (new) is the dynamic, data-driven override. The mobile
  // renderer treats a field as hidden if EITHER says hidden.
  export type Field = WithInputRules & {
    id: string;
    position: number;
    // column name in the database
    column: string;
    label: Language.TranslationObject;
    fieldType: InputType;
    options: Language.TranslationObject[];
    required: boolean;
    baseField: boolean; // whether or not this is part of the base inputs required of all registration forms
    visible: boolean; // Whether or not it displays in the app
    deleted: boolean; // Whether or not this field has been marked as "deleted" - soft delete allows for field values to still be retrievable
    showsInSummary: boolean; // Whether or not this field is shown on the patient file
    isSearchField: boolean; // Whether or not this field can be sea
  };

  export type EncodedT = {
    id: string;
    clinic_id: string | null;
    name: string;
    fields: Field[];
    metadata: Record<string, any>;
    is_deleted: boolean;
    created_at: Date;
    updated_at: Date;
    last_modified: Date;
    server_created_at: Date;
    deleted_at: Date | null;
  };

  /**
   * Convert a database entry into a T entry
   * @param entry The database entry
   * @returns {PatientRegistrationForm.T} entry
   */
  export const fromDbEntry = (
    entry: PatientRegistrationForm.Table.PatientRegistrationForms,
  ): PatientRegistrationForm.T => {
    return {
      id: entry.id,
      clinic_id: Option.fromNullable(entry.clinic_id),
      name: Option.fromNullable(decodeURI(entry.name)),
      fields: entry.fields.map((field) => ({
        ...field,
        label: mapObjectValues(field.label, decodeURI),
        options: field.options.map((opt) => mapObjectValues(opt, decodeURI)),
        column: decodeURI(field.column),
      })),
      metadata: entry.metadata,
      is_deleted: entry.is_deleted,
      created_at: new Date(entry.created_at as unknown as Date),
      updated_at: new Date(entry.updated_at as unknown as Date),
      last_modified: new Date(entry.last_modified as unknown as Date),
      server_created_at: new Date(entry.server_created_at as unknown as Date),
      deleted_at: Option.fromNullable(
        entry.deleted_at as unknown as Date | null,
      ),
    };
  };

  export namespace Table {
    /**
     * If set to true, this table is always pushed regardless of the the last sync date times. All sync events push to mobile the latest table.
     * IMPORTANT: If ALWAYS_PUSH_TO_MOBILE is true, content of the table should never be edited on the client or pushed to the server from mobile. its one way only.
     * */
    export const ALWAYS_PUSH_TO_MOBILE = false;
    /** The name of the table in the server database */
    export const name = "patient_registration_forms";
    /** The name of the table in the mobile database */
    export const mobileName = "registration_forms";

    export const columns = {
      id: "id",
      clinic_id: "clinic_id",
      name: "name",
      fields: "fields",
      metadata: "metadata",
      is_deleted: "is_deleted",
      created_at: "created_at",
      updated_at: "updated_at",
      last_modified: "last_modified",
      server_created_at: "server_created_at",
      deleted_at: "deleted_at",
    };

    export interface T {
      id: string;
      clinic_id: string | null;
      name: string;
      fields: JSONColumnType<Field[]>;
      metadata: JSONColumnType<Record<string, any>>;
      is_deleted: Generated<boolean>;
      created_at: Generated<ColumnType<Date, string | undefined, never>>;
      updated_at: Generated<
        ColumnType<Date, Date | string | undefined, string | Date>
      >;
      last_modified: Generated<ColumnType<Date, string | undefined, never>>;
      server_created_at: Generated<ColumnType<Date, string | undefined, never>>;
      deleted_at: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
    }

    export type PatientRegistrationForms = Selectable<T>;
    export type NewPatientRegistrationForms = Insertable<T>;
    export type PatientRegistrationFormsUpdate = Updateable<T>;
  }

  /**
   * Upsert a patient registration form
   * @param form The form to upsert
   */
  export const upsertPatientRegistrationForm = createServerOnlyFn(
    async (form: PatientRegistrationForm.EncodedT) => {
      // Defense-in-depth: structurally validate every rule slot before
      // the JSONB write. The form-builder UI is the primary gate, but
      // this catches direct-API and future-refactor bypasses. Throws
      // FormFieldRulesValidationError on invalid rules.
      assertFieldRulesValid(
        (form.fields ?? []) as Array<{ id?: unknown } & Record<string, unknown>>,
      );

      // NOTE: it is possible for the form to not have an id (if it is a new form)
      const id = Option.match(Option.fromNullable(form.id), {
        onNone: () => uuidv1(),
        onSome: (id) => {
          if (typeof id !== "string" || id.length === 0) {
            return uuidv1();
          }
          return id;
        },
      });
      return db
        .insertInto(Table.name)
        .values({
          id,
          clinic_id: form.clinic_id,
          name: form.name,
          // fields: form.fields,
          fields: sql`${JSON.stringify(form.fields)}::jsonb`,
          // metadata: form.metadata,
          metadata: sql`${JSON.stringify(form.metadata)}::jsonb`,
          is_deleted: false,
          created_at: sql`${toSafeDateString(
            form.created_at,
          )}::timestamp with time zone`,
          updated_at: sql`${toSafeDateString(
            form.updated_at,
          )}::timestamp with time zone`,
          last_modified: sql`now()::timestamp with time zone`,
          server_created_at: sql`now()::timestamp with time zone`,
          deleted_at: null,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            clinic_id: form.clinic_id,
            name: form.name,
            fields: sql`${JSON.stringify(form.fields)}::jsonb`,
            metadata: sql`${JSON.stringify(form.metadata)}::jsonb`,
            is_deleted: false,
            updated_at: sql`${toSafeDateString(
              form.updated_at,
            )}::timestamp with time zone`,
            last_modified: sql`now()::timestamp with time zone`,
            server_created_at: sql`now()::timestamp with time zone`,
            deleted_at: null,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
    },
  );

  /**
   * Get all the patient registration forms
   * @returns {Promise<PatientRegistrationForm.T[]>} Array of patient registration forms
   */
  export const getAll = createServerOnlyFn(
    async (): Promise<PatientRegistrationForm.EncodedT[]> => {
      const result = await db.selectFrom(Table.name).selectAll().execute();

      // Merge with all base fields to support adding base fields on the fly
      return result.map((form) => {
        const existingBaseFieldIds = form.fields
          .filter((f) => f.baseField)
          .map((f) => f.id);
        const missingBaseFields = baseFields.filter(
          (f) => !existingBaseFieldIds.includes(f.id),
        );

        form.fields = [...form.fields, ...missingBaseFields];
        form.fields.sort((a, b) => a.position - b.position);
        return form;
      });
    },
  );

  /**
   * Given a registration form field and a value from a patient, return the decoded value
   * @param field The registration form field
   * @param value The value from the patient
   * @returns {unknown} The decoded value
   */
  export const renderFieldValue = (
    field: Field,
    value:
      | unknown
      | Record<
          "string_value" | "number_value" | "boolean_value" | "date_value",
          unknown | null
        >,
  ): string | number | boolean => {
    try {
      if (field.baseField) {
        switch (field.fieldType) {
          case "number":
            const num = Number(value);
            return isNaN(num) ? String(value) : num;
          case "boolean":
            return Boolean(value);
          case "date":
            const date = new Date(value as any);
            return isNaN(date.getTime())
              ? String(value)
              : format(date, "yyyy-MM-dd");
          case "text":
            return String(value);
          case "select":
            return String(value);
          case "checkbox":
            return splitCheckboxValues(String(value)).join(", ");
          default:
            return JSON.stringify(value);
        }
      } else {
        // these are the additional attributes
        const val = value as Record<
          "string_value" | "number_value" | "boolean_value" | "date_value",
          unknown | null
        >;
        switch (field.fieldType) {
          case "number":
            const num = Number(val.number_value);
            return isNaN(num) ? String(val.number_value) : num;
          case "boolean":
            return Boolean(val.boolean_value);
          case "date":
            const date = new Date(val.date_value as any);
            return isNaN(date.getTime())
              ? String(val.date_value)
              : format(date, "yyyy-MM-dd");
          case "text":
            return String(val.string_value);
          case "select":
            return String(val.string_value);
          case "checkbox":
            return splitCheckboxValues(String(val.string_value)).join(", ");
          default:
            return JSON.stringify(val);
        }
      }
    } catch (error) {
      return JSON.stringify(value);
    }
  };

  // ------------------------------------------------------------------
  // FieldLogicPanel adapter.
  //
  // Maps each `InputType` to a `LogicPrimitiveKind` so the panel's value
  // input picks the right widget. `displayName` falls back to the
  // English label, then the column, so the field picker always shows
  // *something* even before a translation lands.
  // ------------------------------------------------------------------
  const inputTypeToPrimitive: Record<InputType, LogicPrimitiveKind> = {
    number: "number",
    text: "string",
    select: "string",
    checkbox: "string",
    date: "date",
    boolean: "boolean",
  };

  /**
   * Convert a registration form's field list into the abstracted
   * `LogicField[]` consumed by `FieldLogicPanel`. Deleted fields are
   * elided — they can't sensibly be referenced by a rule.
   */
  export const toLogicFields = (
    fields: ReadonlyArray<Field>,
  ): LogicField[] =>
    fields
      .filter((f) => !f.deleted)
      .map((f) => ({
        id: f.id,
        // `||` rather than `??` so a stored-but-empty translation entry
        // still falls back to the column name.
        displayName: f.label.en?.trim() || f.column || f.id,
        kind: "primitive" as const,
        primitiveKind: inputTypeToPrimitive[f.fieldType],
      }));

  // Rule-scope assembly (web register form).
  //
  // Mirrors mobile's `PatientRegistrationForm.buildRuleScope` so authored
  // rules behave identically across surfaces. Three web-specific coercions
  // happen at the scope boundary (load-bearing):
  //
  //   - Number fields: RHF returns strings; coerce to Number so rules
  //     like `{">=": [{var: "form.age"}, 18]}` work without authors
  //     thinking about coercion.
  //   - Checkbox fields: RHF stores joined "a,b" string via
  //     joinCheckboxValues; rules see an array via splitCheckboxValues
  //     so `.length` / `.includes("foo")` are intuitive.
  //   - Date fields: JsonLogic's coercer treats `Date` instances as
  //     non-coercible Object — comparisons error and the evaluator's
  //     fail-safe semantics silently skip the rule. Normalize to local
  //     "YYYY-MM-DD" so string-vs-string lex compare works.

  export type RuleScopeContext = {
    fields: ReadonlyArray<Field>;
    /** Patient field values keyed by field **id** (not column). */
    values: Record<string, unknown>;
    ctx: ruleScope["ctx"];
  };

  export function buildRuleScope(input: RuleScopeContext): ruleScope {
    const { fields, values, ctx } = input;
    const form: Record<string, unknown> = {};
    for (const field of fields) {
      form[field.id] = coerceForRules(field, values[field.id]);
    }
    return { form, ctx };
  }

  function coerceForRules(field: Field, value: unknown): unknown {
    if (value === undefined || value === null) return value;
    switch (field.fieldType) {
      case "number": {
        if (typeof value === "number") return value;
        if (typeof value !== "string" || value.trim() === "") return undefined;
        const n = Number(value);
        // Non-numeric strings stay as the string — JsonLogic's `cmpNum`
        // coerces, and falling through lets `==` against a string still
        // match if that's what the author wrote.
        return Number.isNaN(n) ? value : n;
      }
      case "checkbox":
        if (typeof value === "string") return splitCheckboxValues(value);
        if (Array.isArray(value)) return value;
        return value;
      case "date":
        if (value instanceof Date) return formatDateYMD(value);
        return value;
      default:
        return value;
    }
  }

  // Local-date YYYY-MM-DD. NOT toISOString().slice(0, 10) — UTC truncation
  // shifts the day in non-UTC timezones (PST-midnight Jan 1 → UTC Dec 31).
  // Mirrors the same helper in mobile's PatientRegistrationForm.ts.
  function formatDateYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Required-field check

  export type RequiredFieldContext = {
    fields: ReadonlyArray<Field>;
    /** Values keyed by field id (post-coercion or raw — only nullish/empty
     *  checks happen here, so number-string vs number doesn't matter). */
    values: Record<string, unknown>;
    /**
     * Optional rule evaluation. When present, hidden fields are skipped
     * and required-ness comes from `evaluation.isRequired`. When absent,
     * falls back to the static `field.required` flag.
     */
    evaluation?: ruleEvaluation;
  };

  /** Returns the labels (en fallback) of required, visible fields that are
   *  missing a value. Pure — no DB or React deps. */
  export function getMissingRequiredFields(
    ctx: RequiredFieldContext,
  ): string[] {
    const { fields, values, evaluation } = ctx;
    const isRequired = (f: Field) =>
      evaluation ? evaluation.isRequired(f.id) : f.required === true;
    const isVisible = (f: Field) =>
      evaluation ? evaluation.isVisible(f.id) : true;

    return fields
      .filter((f) => f.visible && !f.deleted)
      .filter((f) => isVisible(f) && isRequired(f))
      .filter((f) => {
        const v = values[f.id];
        if (v === undefined || v === null) return true;
        if (typeof v === "string" && v.trim() === "") return true;
        return false;
      })
      .map((f) => f.label.en || f.column);
  }

  // Clear-on-hide diff.
  //
  // Patient registration is *creating a new patient*, so the durability
  // concern that forced mobile's first-render baseline skip does NOT apply
  // — there's no DB value to protect from a `""` overwrite. Caller can
  // clear on every visible→hidden transition.

  export type ComputeNewlyHiddenInput = {
    fields: ReadonlyArray<Field>;
    evaluation: ruleEvaluation;
    /** Set of field ids hidden on the previous evaluation. */
    previouslyHidden: ReadonlySet<string>;
  };

  export type ComputeNewlyHiddenResult = {
    /** All ids hidden by the current evaluation. Caller assigns to ref. */
    nowHidden: Set<string>;
    /** Fields that transitioned visible→hidden this tick. */
    newlyHidden: Field[];
  };

  export function computeNewlyHidden(
    input: ComputeNewlyHiddenInput,
  ): ComputeNewlyHiddenResult {
    const { fields, evaluation, previouslyHidden } = input;
    const nowHidden = new Set<string>();
    const newlyHidden: Field[] = [];
    for (const field of fields) {
      if (evaluation.isVisible(field.id)) continue;
      nowHidden.add(field.id);
      if (!previouslyHidden.has(field.id)) newlyHidden.push(field);
    }
    return { nowHidden, newlyHidden };
  }
}

export default PatientRegistrationForm;
