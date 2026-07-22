import { describe, expect, it } from "vitest";

import {
  conditionKindsFor,
  conditionValid,
  defaultConditionFor,
  defaultConditionForKind,
  type EditorConfig,
  editorReduce,
  editorRuleState,
  initEditorState,
} from "@/components/form-builder/field-logic/rule-model";
import {
  compileVisibilityTemplate,
  decompileVisibilityTemplate,
  type LogicField,
} from "@/lib/form-rule-templates";
import type { JsonLogicRule } from "@/models/form-rules";

/**
 * Coverage strategy: Radix Tabs don't flip state under jsdom, so the
 * simple/advanced tab-switch orchestration can't be driven through the
 * UI. These tests exercise the pure editor state machine directly —
 * init, per-tab edits, and the cross-sync (or skip-sync) on mode
 * switch. Compile/decompile correctness has its own unit-test file;
 * here we assert relationally against those functions.
 */

const fields: LogicField[] = [
  { id: "age", displayName: "Age", kind: "primitive", primitiveKind: "number" },
  {
    id: "consent",
    displayName: "Consent",
    kind: "primitive",
    primitiveKind: "boolean",
  },
];

const sectionConfig: EditorConfig = {
  allowAlways: true,
  allowMultiple: true,
  fields,
};

const validatorConfig: EditorConfig = {
  allowAlways: false,
  allowMultiple: false,
  fields,
};

const ageRule: JsonLogicRule = { "==": [{ var: "form.age" }, 18] };
const orRule: JsonLogicRule = {
  or: [
    { "==": [{ var: "form.age" }, 18] },
    { "==": [{ var: "form.consent" }, true] },
  ],
};

describe("initEditorState", () => {
  it("opens Simple on 'Always' when no rule is stored and the section allows it", () => {
    const state = initEditorState(sectionConfig, undefined);
    expect(state).toEqual({ mode: "simple", template: "Always", text: "" });
  });

  it("seeds Simple mode from a representable stored rule", () => {
    const state = initEditorState(sectionConfig, ageRule);
    expect(state.mode).toBe("simple");
    expect(state.template).toEqual(decompileVisibilityTemplate(ageRule));
    expect(state.text).toBe(JSON.stringify(ageRule, null, 2));
  });

  it("opens Advanced for a rule the section can't represent (OR group)", () => {
    const state = initEditorState(sectionConfig, orRule);
    expect(state.mode).toBe("advanced");
    expect(state.text).toBe(JSON.stringify(orRule, null, 2));
    // The simple draft falls back to the section default, untouched by
    // the unrepresentable rule.
    expect(state.template).toBe("Always");
  });

  it("opens a fresh validator in Advanced with a default comparison row on the preferred field", () => {
    const state = initEditorState(validatorConfig, undefined, "consent");
    // No stored rule decompiles to "Always", which validators can't
    // represent (they must carry a rule) — hence Advanced.
    expect(state.mode).toBe("advanced");
    expect(state.template).toEqual({
      TAG: "Conditions",
      connector: "and",
      conditions: [
        { TAG: "Comparison", fieldId: "consent", op: "==", value: "" },
      ],
    });
  });
});

describe("editorReduce — per-tab edits", () => {
  it("editTemplate patches only the template", () => {
    const before = initEditorState(sectionConfig, ageRule);
    const after = editorReduce(sectionConfig, before, {
      kind: "editTemplate",
      template: "Always",
    });
    expect(after.template).toBe("Always");
    expect(after.mode).toBe(before.mode);
    expect(after.text).toBe(before.text);
  });

  it("editText patches only the text", () => {
    const before = initEditorState(sectionConfig, ageRule);
    const after = editorReduce(sectionConfig, before, {
      kind: "editText",
      text: "{ nonsense",
    });
    expect(after.text).toBe("{ nonsense");
    expect(after.mode).toBe(before.mode);
    expect(after.template).toBe(before.template);
  });

  it("switching to the current mode returns the state unchanged", () => {
    const before = initEditorState(sectionConfig, undefined);
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "simple",
    });
    expect(after).toBe(before);
  });
});

describe("editorReduce — switch to Advanced", () => {
  it("syncs the JSON text from a fully-authored simple template", () => {
    const template = decompileVisibilityTemplate(ageRule);
    if (template === undefined) throw new Error("expected decompile to succeed");
    const before = editorReduce(
      sectionConfig,
      initEditorState(sectionConfig, undefined),
      { kind: "editTemplate", template },
    );
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "advanced",
    });
    expect(after.mode).toBe("advanced");
    expect(after.text).toBe(
      JSON.stringify(compileVisibilityTemplate(template), null, 2),
    );
  });

  it("keeps the existing JSON when the simple draft is incomplete", () => {
    const incomplete = {
      TAG: "Conditions",
      connector: "and",
      conditions: [{ TAG: "Comparison", fieldId: "age", op: "==", value: "" }],
    } as const;
    const seeded = initEditorState(sectionConfig, ageRule);
    const before = editorReduce(sectionConfig, seeded, {
      kind: "editTemplate",
      template: incomplete,
    });
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "advanced",
    });
    expect(after.mode).toBe("advanced");
    expect(after.text).toBe(seeded.text);
  });

  it("clears the JSON when the simple draft is 'Always' (no rule)", () => {
    const seeded = initEditorState(sectionConfig, ageRule);
    const before = editorReduce(sectionConfig, seeded, {
      kind: "editTemplate",
      template: "Always",
    });
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "advanced",
    });
    expect(after.text).toBe("");
  });
});

describe("editorReduce — switch to Simple", () => {
  const inAdvanced = (config: EditorConfig, text: string) => {
    const seeded = editorReduce(config, initEditorState(config, undefined), {
      kind: "switchMode",
      mode: "advanced",
    });
    return editorReduce(config, seeded, { kind: "editText", text });
  };

  it("syncs the template from valid, representable JSON", () => {
    const before = inAdvanced(sectionConfig, JSON.stringify(ageRule));
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "simple",
    });
    expect(after.mode).toBe("simple");
    expect(after.template).toEqual(decompileVisibilityTemplate(ageRule));
  });

  it("syncs to 'Always' from empty JSON when the section allows a no-rule state", () => {
    const before = inAdvanced(sectionConfig, "");
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "simple",
    });
    expect(after.template).toBe("Always");
  });

  it("keeps the existing template when the JSON is malformed", () => {
    const before = inAdvanced(sectionConfig, "{ not json");
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "simple",
    });
    expect(after.mode).toBe("simple");
    expect(after.template).toBe(before.template);
  });

  it("keeps the existing template when the JSON isn't representable (OR group)", () => {
    const before = inAdvanced(sectionConfig, JSON.stringify(orRule));
    const after = editorReduce(sectionConfig, before, {
      kind: "switchMode",
      mode: "simple",
    });
    expect(after.mode).toBe("simple");
    expect(after.template).toBe(before.template);
  });
});

describe("editorRuleState", () => {
  it("evaluates the simple draft when Simple is active", () => {
    const template = decompileVisibilityTemplate(ageRule);
    if (template === undefined) throw new Error("expected decompile to succeed");
    const state = editorReduce(
      sectionConfig,
      initEditorState(sectionConfig, undefined),
      { kind: "editTemplate", template },
    );
    expect(editorRuleState(sectionConfig, state)).toEqual({
      rule: compileVisibilityTemplate(template),
      isValid: true,
    });
  });

  it("treats empty advanced text as valid only when the section allows no rule", () => {
    const emptyAdvanced = {
      mode: "advanced",
      template: "Always",
      text: "",
    } as const;
    expect(editorRuleState(sectionConfig, emptyAdvanced)).toEqual({
      rule: undefined,
      isValid: true,
    });
    expect(editorRuleState(validatorConfig, emptyAdvanced)).toEqual({
      rule: undefined,
      isValid: false,
    });
  });

  it("marks malformed advanced text invalid", () => {
    const state = {
      mode: "advanced",
      template: "Always",
      text: "{ not json",
    } as const;
    expect(editorRuleState(sectionConfig, state).isValid).toBe(false);
  });
});

const langs: LogicField = {
  id: "langs",
  displayName: "Languages",
  kind: "primitive",
  primitiveKind: "string",
  multiValue: true,
  options: [
    { value: "en", label: "English" },
    { value: "sw", label: "Swahili" },
  ],
};

// Free-text field (single-line text): the only surface that offers length
// comparison. A `select` shares primitiveKind "string" but is option-backed,
// so it must NOT offer length.
const notes: LogicField = {
  id: "notes",
  displayName: "Notes",
  kind: "primitive",
  primitiveKind: "string",
  freeText: true,
};

const city: LogicField = {
  id: "city",
  displayName: "City",
  kind: "primitive",
  primitiveKind: "string",
  options: [{ value: "dar", label: "Dar es Salaam" }],
};

describe("conditionKindsFor", () => {
  it("offers comparison + presence for a scalar field", () => {
    expect(conditionKindsFor(fields[0])).toEqual(["Comparison", "Truthy", "Falsy"]);
  });

  it("swaps comparison for membership kinds on a multi-value field", () => {
    expect(conditionKindsFor(langs)).toEqual([
      "IncludesOption",
      "ExcludesOption",
      "IncludesAny",
      "IncludesAll",
      "Truthy",
      "Falsy",
    ]);
  });

  it("adds length comparison for a free-text field", () => {
    expect(conditionKindsFor(notes)).toEqual([
      "Comparison",
      "LengthCompare",
      "Truthy",
      "Falsy",
    ]);
  });

  it("does not offer length on an option-backed string field", () => {
    expect(conditionKindsFor(city)).toEqual(["Comparison", "Truthy", "Falsy"]);
  });

  it("falls back to the scalar set for a missing field", () => {
    expect(conditionKindsFor(undefined)).toEqual(["Comparison", "Truthy", "Falsy"]);
  });
});

describe("defaultConditionForKind", () => {
  it("seeds IncludesOption with the field's first option value", () => {
    expect(defaultConditionForKind("IncludesOption", langs)).toEqual({
      TAG: "IncludesOption",
      fieldId: "langs",
      value: "en",
    });
  });

  it("starts IncludesAny with an empty values array", () => {
    expect(defaultConditionForKind("IncludesAny", langs)).toEqual({
      TAG: "IncludesAny",
      fieldId: "langs",
      values: [],
    });
  });

  it("resets Comparison to == with an empty value", () => {
    expect(defaultConditionForKind("Comparison", fields[0])).toEqual({
      TAG: "Comparison",
      fieldId: "age",
      op: "==",
      value: "",
    });
  });

  it("seeds LengthCompare with a > 0 bound", () => {
    expect(defaultConditionForKind("LengthCompare", notes)).toEqual({
      TAG: "LengthCompare",
      fieldId: "notes",
      op: ">",
      value: 0,
    });
  });
});

describe("defaultConditionFor", () => {
  it("opens a scalar field on a comparison", () => {
    expect(defaultConditionFor(fields)).toMatchObject({ TAG: "Comparison", fieldId: "age" });
  });

  it("opens a multi-value field on IncludesOption", () => {
    expect(defaultConditionFor([langs])).toMatchObject({
      TAG: "IncludesOption",
      fieldId: "langs",
      value: "en",
    });
  });
});

describe("conditionValid — membership kinds", () => {
  const all = [fields[0], langs];

  it("IncludesOption needs a non-empty value", () => {
    expect(conditionValid({ TAG: "IncludesOption", fieldId: "langs", value: "en" }, all)).toBe(true);
    expect(conditionValid({ TAG: "IncludesOption", fieldId: "langs", value: "" }, all)).toBe(false);
  });

  it("IncludesAny / IncludesAll need at least two values", () => {
    expect(conditionValid({ TAG: "IncludesAny", fieldId: "langs", values: ["en", "sw"] }, all)).toBe(true);
    expect(conditionValid({ TAG: "IncludesAll", fieldId: "langs", values: ["en"] }, all)).toBe(false);
  });

  it("Truthy / Falsy just need a valid field reference", () => {
    expect(conditionValid({ TAG: "Truthy", fieldId: "langs" }, all)).toBe(true);
  });

  it("rejects a condition referencing an unknown field", () => {
    expect(conditionValid({ TAG: "IncludesOption", fieldId: "nope", value: "en" }, all)).toBe(false);
  });
});

describe("conditionValid — LengthCompare", () => {
  const all = [notes];

  it("accepts a non-negative integer bound", () => {
    expect(conditionValid({ TAG: "LengthCompare", fieldId: "notes", op: ">", value: 10 }, all)).toBe(true);
    expect(conditionValid({ TAG: "LengthCompare", fieldId: "notes", op: "<=", value: 0 }, all)).toBe(true);
  });

  it("rejects a negative or fractional bound", () => {
    expect(conditionValid({ TAG: "LengthCompare", fieldId: "notes", op: ">", value: -1 }, all)).toBe(false);
    expect(conditionValid({ TAG: "LengthCompare", fieldId: "notes", op: ">", value: 2.5 }, all)).toBe(false);
  });

  it("rejects a length condition on an unknown field", () => {
    expect(conditionValid({ TAG: "LengthCompare", fieldId: "nope", op: ">", value: 3 }, all)).toBe(false);
  });
});
