/**
 * Tests for `usePatientRecordRules` — the rule-evaluation half of the patient
 * record editor. Covers the read-only derivations (visibility, requiredness,
 * validator buckets) and the two rule-driven writebacks it owns: clear-on-hide
 * (with the first-render baseline skip that protects durable values) and
 * computedValue writeback.
 */

import { renderHook } from "@testing-library/react-native"

import PatientRegistrationForm from "../../app/models/PatientRegistrationForm"
import {
  usePatientRecordRules,
  type UsePatientRecordRulesInput,
} from "../../app/hooks/usePatientRecordRules"

function makeField(
  overrides: Partial<PatientRegistrationForm.RegistrationFormField> &
    Pick<PatientRegistrationForm.RegistrationFormField, "id">,
): PatientRegistrationForm.RegistrationFormField {
  return {
    id: overrides.id,
    position: overrides.position ?? 0,
    column: overrides.column ?? ("given_name" as PatientRegistrationForm.BaseColumn),
    label: overrides.label ?? { en: overrides.id },
    fieldType: overrides.fieldType ?? "text",
    options: overrides.options ?? [],
    required: overrides.required ?? false,
    baseField: overrides.baseField ?? false,
    visible: overrides.visible ?? true,
    isSearchField: overrides.isSearchField ?? false,
    deleted: overrides.deleted ?? false,
    ...overrides,
  }
}

const base = {
  updateField: () => {},
  patientId: null,
  isLoading: false,
} satisfies Partial<UsePatientRecordRulesInput>

describe("usePatientRecordRules — derivations", () => {
  it("evaluates visibleIf against the current values", () => {
    const fields = [
      makeField({ id: "trigger" }),
      makeField({
        id: "dependent",
        visibleIf: { "==": [{ var: "form.trigger" }, "show"] },
      }),
    ]

    const { result, rerender } = renderHook((props) => usePatientRecordRules(props), {
      initialProps: { ...base, fields, values: { trigger: "hide" }, language: "en" },
    })
    expect(result.current.evaluation.isVisible("dependent")).toBe(false)

    rerender({ ...base, fields, values: { trigger: "show" }, language: "en" })
    expect(result.current.evaluation.isVisible("dependent")).toBe(true)
  })

  it("applies requiredIf as an override of the static flag", () => {
    const fields = [
      makeField({ id: "trigger" }),
      makeField({
        id: "dependent",
        required: false,
        requiredIf: { "==": [{ var: "form.trigger" }, "yes"] },
      }),
    ]

    const { result } = renderHook(() =>
      usePatientRecordRules({ ...base, fields, values: { trigger: "yes" }, language: "en" }),
    )
    expect(result.current.evaluation.isRequired("dependent")).toBe(true)
  })

  it("buckets validator errors by field id", () => {
    const fields = [
      makeField({
        id: "age",
        fieldType: "number",
        validators: [
          {
            id: "min",
            rule: { ">=": [{ var: "form.age" }, 18] },
            message: "Must be at least 18",
          },
        ],
      }),
    ]

    const { result } = renderHook(() =>
      usePatientRecordRules({ ...base, fields, values: { age: 10 }, language: "en" }),
    )
    const errors = result.current.errorsByFieldId.get("age")
    expect(errors).toHaveLength(1)
    expect(errors?.[0].message).toBe("Must be at least 18")
  })

  it("ignores rules on hidden and soft-deleted fields", () => {
    const fields = [
      makeField({ id: "trigger" }),
      makeField({
        id: "deleted",
        deleted: true,
        visibleIf: { "==": [{ var: "form.trigger" }, "show"] },
      }),
    ]

    const { result } = renderHook(() =>
      usePatientRecordRules({ ...base, fields, values: { trigger: "hide" }, language: "en" }),
    )
    expect(result.current.evaluation.isVisible("deleted")).toBe(true)
  })
})

describe("usePatientRecordRules — clear-on-hide", () => {
  const hideableFields = [
    makeField({ id: "trigger" }),
    makeField({
      id: "dependent",
      visibleIf: { "==": [{ var: "form.trigger" }, "show"] },
    }),
  ]

  it("does not clear a field hidden on the first evaluation", () => {
    const updateField = jest.fn()
    renderHook(() =>
      usePatientRecordRules({
        ...base,
        fields: hideableFields,
        values: { trigger: "hide", dependent: "keep" },
        language: "en",
        updateField,
      }),
    )
    expect(updateField).not.toHaveBeenCalled()
  })

  it("clears a field when it transitions visible → hidden", () => {
    const updateField = jest.fn()
    const { rerender } = renderHook((props) => usePatientRecordRules(props), {
      initialProps: {
        ...base,
        fields: hideableFields,
        values: { trigger: "show", dependent: "keep" } as Record<string, unknown>,
        language: "en",
        updateField,
      },
    })
    expect(updateField).not.toHaveBeenCalled()

    rerender({
      ...base,
      fields: hideableFields,
      values: { trigger: "hide", dependent: "keep" },
      language: "en",
      updateField,
    })
    expect(updateField).toHaveBeenCalledWith("dependent", undefined)
  })

  it("re-baselines on a patient change instead of clearing", () => {
    const updateField = jest.fn()
    const { rerender } = renderHook((props) => usePatientRecordRules(props), {
      initialProps: {
        ...base,
        fields: hideableFields,
        values: { trigger: "show" } as Record<string, unknown>,
        language: "en",
        updateField,
        patientId: "p1",
      },
    })

    rerender({
      ...base,
      fields: hideableFields,
      values: { trigger: "hide" },
      language: "en",
      updateField,
      patientId: "p2",
    })
    expect(updateField).not.toHaveBeenCalledWith("dependent", undefined)
  })
})

describe("usePatientRecordRules — computedValue writeback", () => {
  const computedField = [makeField({ id: "sum", computedValue: { "+": [1, 2] } })]

  it("writes back a computed value that differs from the stored one", () => {
    const updateField = jest.fn()
    renderHook(() =>
      usePatientRecordRules({
        ...base,
        fields: computedField,
        values: { sum: 0 },
        language: "en",
        updateField,
      }),
    )
    expect(updateField).toHaveBeenCalledWith("sum", 3)
  })

  it("skips the writeback when the value already matches", () => {
    const updateField = jest.fn()
    renderHook(() =>
      usePatientRecordRules({
        ...base,
        fields: computedField,
        values: { sum: 3 },
        language: "en",
        updateField,
      }),
    )
    expect(updateField).not.toHaveBeenCalled()
  })

  it("suppresses writebacks while loading", () => {
    const updateField = jest.fn()
    renderHook(() =>
      usePatientRecordRules({
        ...base,
        fields: computedField,
        values: { sum: 0 },
        language: "en",
        updateField,
        isLoading: true,
      }),
    )
    expect(updateField).not.toHaveBeenCalled()
  })
})
