import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  AdvancedRuleEditor,
  FieldLogicPanel,
  syncTemplateFromAdvanced,
  syncTextFromSimple,
  type RuleState,
  type ValidationStatus,
} from "@/components/form-builder/FieldLogicPanel";
import type { LogicField } from "@/lib/form-rule-templates";

/**
 * Coverage strategy:
 *
 * - `FieldLogicPanel` tests focus on the collapse-toggle and on
 *   surfacing the "stuck in advanced" advisory when the existing rule
 *   can't be represented as a template. The Tabs primitive (Radix)
 *   doesn't flip state under jsdom's synthetic events, so we don't
 *   drive tab switching from this test.
 *
 * - The textarea + validation flow lives in `AdvancedRuleEditor` which
 *   is exported and tested directly. The compile/decompile logic has
 *   its own unit-test file.
 */

const sampleForm: LogicField[] = [
  {
    id: "age",
    displayName: "Age",
    kind: "primitive",
    primitiveKind: "number",
  },
  {
    id: "consent",
    displayName: "Consent",
    kind: "primitive",
    primitiveKind: "boolean",
  },
  {
    id: "this-field",
    displayName: "Current",
    kind: "primitive",
    primitiveKind: "string",
  },
];

describe("FieldLogicPanel — open/close + section layout", () => {
  it("starts collapsed; the toggle reveals the four sections", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText("Visibility")).toBeNull();
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByText("Visibility")).toBeDefined();
    expect(screen.getByText("Required when…")).toBeDefined();
    expect(screen.getByText("Validators")).toBeDefined();
    expect(screen.getByText("Computed value")).toBeDefined();
  });
});

describe("FieldLogicPanel — initial mode advisory", () => {
  it("does not advise when the rule decompiles to a template", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: { ">=": [{ var: "form.age" }, 18] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
  });

  it("advises when the rule can't be represented in Simple mode", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // An if/else has no simple-template equivalent.
        initial={{
          visibleIf: {
            if: [{ ">=": [{ var: "form.age" }, 18] }, true, false],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByText(/authored in Advanced mode/i)).toBeDefined();
  });

  it("does NOT advise for an AND of conditions — it now opens in Simple mode", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          visibleIf: {
            and: [
              { ">=": [{ var: "form.age" }, 18] },
              { "==": [{ var: "form.consent" }, true] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    // Both AND-ed conditions render as rows.
    expect(screen.getByTestId("condition-row-0")).toBeDefined();
    expect(screen.getByTestId("condition-row-1")).toBeDefined();
  });
});

describe("FieldLogicPanel — multiple AND-ed visibility conditions", () => {
  const twoConditionRule = {
    and: [
      { ">=": [{ var: "form.age" }, 18] },
      { "==": [{ var: "form.consent" }, true] },
    ],
  };

  it("saves an unedited multi-condition rule unchanged", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: twoConditionRule }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].visibleIf).toEqual(twoConditionRule);
  });

  it("adding a second condition saves an `and` of both", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // Open in Simple mode on a single consent condition.
        initial={{ visibleIf: { "==": [{ var: "form.consent" }, true] } }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    // Add a second condition — defaults to a comparison on the first
    // primitive (age) with an empty value, which needs filling in.
    fireEvent.click(screen.getByRole("button", { name: /Add condition/i }));
    const secondValue = within(
      screen.getByTestId("condition-row-1"),
    ).getByTestId("rule-value");
    fireEvent.change(secondValue, { target: { value: "18" } });

    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].visibleIf).toEqual({
      and: [
        { "==": [{ var: "form.consent" }, true] },
        { "==": [{ var: "form.age" }, 18] },
      ],
    });
  });

  it("removing a condition down to one saves the bare single-condition rule", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: twoConditionRule }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    // Drop the first condition (age) — leaving the consent comparison.
    fireEvent.click(screen.getAllByLabelText("Remove condition")[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    // One condition compiles to the bare leaf rule, not an `and` wrapper.
    expect(onSave.mock.calls[0]?.[0].visibleIf).toEqual({
      "==": [{ var: "form.consent" }, true],
    });
  });
});

describe("FieldLogicPanel — OR connector", () => {
  const orRule = {
    or: [
      { ">=": [{ var: "form.age" }, 18] },
      { "==": [{ var: "form.consent" }, true] },
    ],
  };

  it("opens an OR group in Simple mode with both rows", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: orRule }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    expect(screen.getByTestId("condition-row-0")).toBeDefined();
    expect(screen.getByTestId("condition-row-1")).toBeDefined();
    // The separator between rows reads the connector, not a hardcoded "and".
    expect(screen.getByTestId("condition-separator-1").textContent).toBe("or");
  });

  it("saves an unedited OR rule unchanged", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: orRule }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].visibleIf).toEqual(orRule);
  });

  it("offers the connector picker only once there are two conditions", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ visibleIf: { ">=": [{ var: "form.age" }, 18] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByTestId("rule-connector")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add condition/i }));
    expect(screen.getByTestId("rule-connector")).toBeDefined();
  });
});

describe("FieldLogicPanel — membership leaf on a field with no option list", () => {
  // `decompileEqGroup` is field-blind, so a same-field `or`-of-`==` collapses to
  // EqualsAny even on a free-text field. That rule is a valid "is one of", but
  // Simple mode has only an option picker to offer — which would render empty
  // and falsely claim the values can never match. It belongs in Advanced.
  const orOfEq = {
    or: [
      { "==": [{ var: "form.notes" }, "a"] },
      { "==": [{ var: "form.notes" }, "b"] },
    ],
  };

  it("keeps it in Advanced rather than offering an empty option picker", () => {
    render(
      <FieldLogicPanel
        form={textForm}
        fieldId="this-field"
        initial={{ visibleIf: orOfEq }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByText(/authored in Advanced mode/i)).toBeDefined();
    expect(screen.queryByTestId("rule-options")).toBeNull();
    // The values match at runtime — never tell the author otherwise.
    expect(screen.queryByTestId("rule-option-stale")).toBeNull();
  });

  it("still opens in Simple when the field is option-backed but emptied", () => {
    // Options deleted from an option-backed field is the genuine stale case,
    // and stays in Simple so the author can see and drop the orphaned tokens.
    const emptied: LogicField[] = [
      {
        id: "langs",
        displayName: "Languages",
        kind: "primitive",
        primitiveKind: "string",
        multiValue: true,
        options: [],
      },
      {
        id: "this-field",
        displayName: "Current",
        kind: "primitive",
        primitiveKind: "string",
      },
    ];
    render(
      <FieldLogicPanel
        form={emptied}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { in: ["en", { var: "form.langs" }] },
              { in: ["sw", { var: "form.langs" }] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    expect(screen.getByTestId("rule-option-stale")).toBeDefined();
  });
});

describe("FieldLogicPanel — simple mode field-reference guard", () => {
  it("blocks save when the form has no other primitive fields to reference", () => {
    const onSave = vi.fn();
    // Only field is the one being edited — `referenceableFields` is empty,
    // so a comparison-kind template can't pick a real field.
    render(
      <FieldLogicPanel
        form={[
          {
            id: "only-me",
            displayName: "Only Field",
            kind: "primitive",
            primitiveKind: "string",
          },
        ]}
        fieldId="only-me"
        // Pre-seed a comparison rule whose fieldId references the
        // currently-edited field — after filtering, no primitive field
        // matches, so save must be disabled even though the rule itself
        // is structurally valid JSONLogic.
        initial={{
          visibleIf: { "==": [{ var: "form.only-me" }, "x"] },
        }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    const saveBtn = screen.getByRole("button", {
      name: /Save visibility/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("FieldLogicPanel — validators section", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByText("Logic & Validation"));
  // Each section now starts collapsed when its slot is empty. Tests
  // that interact with the section's editor or Save button must expand
  // first; tests that pass `initial.validators` skip this because the
  // smart default opens sections with existing content.
  const expandValidators = () =>
    fireEvent.click(screen.getByRole("button", { name: "Validators" }));

  it("shows the empty-state hint when no validators are configured", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expandValidators();
    expect(screen.getByText(/No validators yet/i)).toBeDefined();
  });

  it("renders existing validators as rows on mount", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // Use an `and` rule that doesn't decompile to the simple template
        // — guarantees the row renders the Advanced JSON textarea (Radix
        // Tabs doesn't switch under jsdom's synthetic events).
        initial={{
          validators: [
            {
              id: "v1",
              rule: {
                and: [
                  { ">=": [{ var: "form.age" }, 18] },
                  { "!=": [{ var: "form.consent" }, null] },
                ],
              },
              message: "Must be adult with consent",
              code: "adult_consent",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.getByText("Validator 1")).toBeDefined();
    expect(
      screen.getByDisplayValue(
        "Must be adult with consent",
      ) as HTMLInputElement,
    ).toBeDefined();
    expect(
      screen.getByDisplayValue("adult_consent") as HTMLInputElement,
    ).toBeDefined();
  });

  it("Add validator inserts a new row in disabled-save state", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={onSave}
      />,
    );
    openPanel();
    expandValidators();
    fireEvent.click(screen.getByRole("button", { name: /Add validator/i }));
    expect(screen.getByText("Validator 1")).toBeDefined();
    const saveBtn = screen.getByRole("button", {
      name: /Save validators/i,
    }) as HTMLButtonElement;
    // Empty message + empty rule → cannot save.
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save remains disabled with only the message filled", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expandValidators();
    fireEvent.click(screen.getByRole("button", { name: /Add validator/i }));

    const messageInput = screen.getByPlaceholderText(
      /Shown to the user when this validator fails/i,
    );
    fireEvent.change(messageInput, { target: { value: "Required" } });

    expect(
      (
        screen.getByRole("button", {
          name: /Save validators/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("Save remains disabled with only an invalid rule", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expandValidators();
    fireEvent.click(screen.getByRole("button", { name: /Add validator/i }));

    // The validator row renders one textarea (the Advanced JSON editor).
    // Scope to the row's testid so the same-named textarea in the
    // Computed Value section can't shadow it on reorder.
    const textarea = within(screen.getByTestId("validator-row-0")).getByRole(
      "textbox",
      { name: /JSONLogic rule/i },
    );
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ not_a_real_op: [1] }) },
    });
    expect(screen.getByText(/Unknown operator/i)).toBeDefined();

    expect(
      (
        screen.getByRole("button", {
          name: /Save validators/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("Save commits the validators array (preserving other slots from initial)", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // Pre-existing visibility rule we must NOT clobber.
        initial={{ visibleIf: { "!!": { var: "form.age" } } }}
        onSave={onSave}
      />,
    );
    openPanel();
    expandValidators();
    fireEvent.click(screen.getByRole("button", { name: /Add validator/i }));

    fireEvent.change(
      screen.getByPlaceholderText(
        /Shown to the user when this validator fails/i,
      ),
      { target: { value: "Adults only" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/machine-readable/i), {
      target: { value: "adult_required" },
    });

    const rule = { ">=": [{ var: "form.age" }, 18] };
    fireEvent.change(
      within(screen.getByTestId("validator-row-0")).getByRole("textbox", {
        name: /JSONLogic rule/i,
      }),
      { target: { value: JSON.stringify(rule) } },
    );

    const saveBtn = screen.getByRole("button", {
      name: /Save validators/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0]?.[0];
    expect(arg.visibleIf).toEqual({ "!!": { var: "form.age" } });
    expect(arg.validators).toHaveLength(1);
    expect(arg.validators[0]).toMatchObject({
      rule,
      message: "Adults only",
      code: "adult_required",
    });
    expect(typeof arg.validators[0].id).toBe("string");
    expect(arg.validators[0].id.length).toBeGreaterThan(0);
  });

  it("Remove drops the row and lets you save an empty validators list", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              rule: { and: [{ ">=": [{ var: "form.age" }, 18] }] },
              message: "x",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    openPanel();
    expect(screen.getByText("Validator 1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Remove validator/i }));
    expect(screen.queryByText("Validator 1")).toBeNull();
    // Empty draft list is a legitimate state — Save should be enabled.
    fireEvent.click(screen.getByRole("button", { name: /Save validators/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    // Empty array maps to undefined so the field's `validators` slot is
    // cleared rather than stored as `[]`.
    expect(onSave.mock.calls[0]?.[0].validators).toBeUndefined();
  });

  // Regression: a comparison rule with `value: ""` is structurally valid
  // JSONLogic but the author hasn't actually picked a value — Save must
  // not activate until they do. We load a stored validator whose rule
  // has an empty value so Simple mode opens with the empty-value
  // template; bypasses jsdom's inability to drive Radix Tabs.
  it("does not commit a comparison validator with an empty value", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              rule: { "==": [{ var: "form.age" }, ""] },
              message: "Required",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    openPanel();
    const saveBtn = screen.getByRole("button", {
      name: /Save validators/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("hides the section entirely when the field isn't primitive", () => {
    render(
      <FieldLogicPanel
        form={[
          {
            id: "meds",
            displayName: "Meds",
            kind: "list",
          },
        ]}
        fieldId="meds"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    // The "Validators" label still renders (via the disabled-state
    // placeholder), but the actual editor (and its Add button) does not.
    expect(screen.queryByRole("button", { name: /Add validator/i })).toBeNull();
  });
});

describe("FieldLogicPanel — validator self-reference warning", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByText("Logic & Validation"));

  // Reusable regex — match the warning copy without coupling to exact text.
  const WARNING_RE = /doesn't reference the field being validated/i;

  it("shows the warning when an existing validator references only another field", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              // References `age`, not `this-field` — typical authoring
              // mistake (validator placed on the wrong field).
              rule: { ">": [{ var: "form.age" }, 2] },
              message: "must be > 2",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.getByText(WARNING_RE)).toBeDefined();
  });

  it("hides the warning when the rule references the current field", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              rule: { "!=": [{ var: "form.this-field" }, null] },
              message: "required",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.queryByText(WARNING_RE)).toBeNull();
  });

  it("hides the warning when the rule references current field via subpath", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              // Subpath access into the current field still counts as
              // self-reference. Authored in advanced (and rule") form so
              // it doesn't decompile — proves the walker is recursive.
              rule: {
                and: [{ "!=": [{ var: "form.this-field.x" }, null] }],
              },
              message: "x required",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.queryByText(WARNING_RE)).toBeNull();
  });

  it("does not block Save — the warning is advisory only", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              rule: { ">": [{ var: "form.age" }, 2] },
              message: "must be > 2",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    openPanel();
    expect(screen.getByText(WARNING_RE)).toBeDefined();
    const saveBtn = screen.getByRole("button", {
      name: /Save validators/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("the warning is per-row — multiple validators surface their own", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              // Bad — references `age`.
              rule: { ">": [{ var: "form.age" }, 2] },
              message: "A",
            },
            {
              id: "v2",
              // Good — references self.
              rule: { "!=": [{ var: "form.this-field" }, null] },
              message: "B",
            },
            {
              id: "v3",
              // Bad — references `consent`.
              rule: { "==": [{ var: "form.consent" }, true] },
              message: "C",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.getAllByText(WARNING_RE)).toHaveLength(2);
  });
});

describe("FieldLogicPanel — requiredIf section", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByText("Logic & Validation"));
  // Sections start collapsed when their slot is empty (smart default).
  // Tests that touch the editor when `initial.requiredIf` is undefined
  // must expand first.
  const expandRequired = () =>
    fireEvent.click(screen.getByRole("button", { name: "Required when…" }));

  it("renders the editor for primitive fields (no advisory on a decompilable rule)", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ requiredIf: { "==": [{ var: "form.consent" }, true] } }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expect(screen.getByText("Required when…")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Save required rule/i }),
    ).toBeDefined();
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
  });

  it("advises when the existing requiredIf can't be represented in Simple mode", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // An if/else has no simple-template equivalent (an AND would now
        // decompile, so it wouldn't trigger the advisory).
        initial={{
          requiredIf: {
            if: [{ ">=": [{ var: "form.age" }, 18] }, true, false],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    // Both visibility and requiredIf can show this advisory — guard
    // against the visibility one bleeding in by asserting count.
    expect(screen.getAllByText(/authored in Advanced mode/i)).toHaveLength(1);
  });

  it("Save preserves other slots and writes requiredIf=undefined for the 'no conditional rule' choice", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // Pre-existing slots that must NOT be clobbered.
        initial={{
          visibleIf: { "!!": { var: "form.age" } },
          validators: [
            {
              id: "v1",
              rule: { ">=": [{ var: "form.age" }, 0] },
              message: "non-negative",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    openPanel();
    expandRequired();
    // With no initial requiredIf, simple mode opens on { kind: "always" },
    // which compiles to undefined — Save commits requiredIf: undefined.
    fireEvent.click(
      screen.getByRole("button", { name: /Save required rule/i }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0]?.[0];
    expect(arg.requiredIf).toBeUndefined();
    expect(arg.visibleIf).toEqual({ "!!": { var: "form.age" } });
    expect(arg.validators).toHaveLength(1);
  });

  it("Save passes through an existing decompilable requiredIf unchanged when the user doesn't edit it", () => {
    const onSave = vi.fn();
    const rule = { "==": [{ var: "form.consent" }, true] };
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ requiredIf: rule }}
        onSave={onSave}
      />,
    );
    openPanel();
    fireEvent.click(
      screen.getByRole("button", { name: /Save required rule/i }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].requiredIf).toEqual(rule);
  });

  it("is replaced with the non-supported placeholder for non-primitive fields", () => {
    render(
      <FieldLogicPanel
        form={[
          {
            id: "meds",
            displayName: "Meds",
            kind: "list",
          },
        ]}
        fieldId="meds"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    // The "Required when…" label still renders (via the placeholder),
    // but the Save button does not.
    expect(screen.getByText("Required when…")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /Save required rule/i }),
    ).toBeNull();
  });
});

describe("FieldLogicPanel — computedValue section", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByText("Logic & Validation"));
  // Sections start collapsed when their slot is empty (smart default).
  // Tests that touch the editor when `initial.computedValue` is
  // undefined must expand first.
  const expandComputed = () =>
    fireEvent.click(screen.getByRole("button", { name: "Computed value" }));

  it("renders the editor and Save for primitive fields", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expandComputed();
    expect(screen.getByText("Computed value")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Save computed value/i }),
    ).toBeDefined();
  });

  it("is replaced with the non-supported placeholder for non-primitive fields", () => {
    render(
      <FieldLogicPanel
        form={[{ id: "meds", displayName: "Meds", kind: "list" }]}
        fieldId="meds"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    // Placeholder is not collapsible — its title text renders directly.
    expect(screen.getByText("Computed value")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /Save computed value/i }),
    ).toBeNull();
  });

  it("Save passes computedValue through and preserves other slots", () => {
    const onSave = vi.fn();
    const rule = { "+": [{ var: "form.age" }, 1] };
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        // Pre-existing slots that must NOT be clobbered.
        initial={{
          visibleIf: { "!!": { var: "form.age" } },
          validators: [
            {
              id: "v1",
              rule: { ">=": [{ var: "form.age" }, 0] },
              message: "non-negative",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    openPanel();
    expandComputed();
    const computedBox = within(
      screen.getByTestId("computed-value-section"),
    ).getByRole("textbox", { name: /JSONLogic rule/i });
    fireEvent.change(computedBox, {
      target: { value: JSON.stringify(rule) },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Save computed value/i }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0]?.[0];
    expect(arg.computedValue).toEqual(rule);
    expect(arg.visibleIf).toEqual({ "!!": { var: "form.age" } });
    expect(arg.validators).toHaveLength(1);
  });

  it("clearing the textarea saves computedValue=undefined", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{ computedValue: { "+": [{ var: "form.age" }, 1] } }}
        onSave={onSave}
      />,
    );
    openPanel();
    const computedBox = within(
      screen.getByTestId("computed-value-section"),
    ).getByRole("textbox", { name: /JSONLogic rule/i });
    fireEvent.change(computedBox, { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Save computed value/i }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].computedValue).toBeUndefined();
  });

  it("keeps Save disabled while the JSON is malformed", () => {
    render(
      <FieldLogicPanel
        form={sampleForm}
        fieldId="this-field"
        initial={{}}
        onSave={vi.fn()}
      />,
    );
    openPanel();
    expandComputed();
    const computedBox = within(
      screen.getByTestId("computed-value-section"),
    ).getByRole("textbox", { name: /JSONLogic rule/i });
    fireEvent.change(computedBox, { target: { value: "{ not valid" } });
    const saveBtn = screen.getByRole("button", {
      name: /Save computed value/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});

describe("AdvancedRuleEditor — validation gating", () => {
  it("blocks save when the JSON is malformed", () => {
    const onSave = vi.fn();
    render(<AdvancedRuleEditor initialRule={undefined} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "{not valid json" },
    });
    expect(screen.getByText(/JSON:/i)).toBeDefined();
    const btn = screen.getByRole("button", {
      name: /Save visibility/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blocks save when JSON parses but uses an unknown operator", () => {
    const onSave = vi.fn();
    render(<AdvancedRuleEditor initialRule={undefined} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: JSON.stringify({ not_a_real_op: [1, 2] }) },
    });
    expect(screen.getByText(/Unknown operator/i)).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a structurally valid rule", () => {
    const onSave = vi.fn();
    render(<AdvancedRuleEditor initialRule={undefined} onSave={onSave} />);
    const rule = {
      and: [
        { ">=": [{ var: "form.age" }, 18] },
        { "==": [{ var: "form.consent" }, true] },
      ],
    };
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: JSON.stringify(rule) },
    });
    expect(screen.getByText("Valid")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(rule);
  });

  it("clearing the textarea saves undefined (i.e. removes the rule)", () => {
    const onSave = vi.fn();
    render(
      <AdvancedRuleEditor
        initialRule={{ "!!": { var: "form.age" } }}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "" },
    });
    expect(screen.getByText(/Empty/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Save visibility/i }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// Tab-switch cross-sync (simple ↔ advanced)
//
// Radix `Tabs` doesn't flip state under jsdom's synthetic events, so the
// integration is exercised via the pure helpers `syncTextFromSimple` /
// `syncTemplateFromAdvanced` that the `RuleEditor` calls at the
// `onValueChange` boundary.
// ---------------------------------------------------------------------------

describe("syncTextFromSimple", () => {
  it("returns the stringified rule when the simple template is valid", () => {
    const state: RuleState = {
      rule: { "==": [{ var: "form.age" }, 18] },
      isValid: true,
    };
    expect(syncTextFromSimple(state)).toBe(JSON.stringify(state.rule, null, 2));
  });

  it("returns the empty string for a valid 'Always' template (rule is undefined)", () => {
    // The simple template "Always" compiles to undefined; the advanced
    // textarea's empty state means the same thing (no rule).
    const state: RuleState = { rule: undefined, isValid: true };
    expect(syncTextFromSimple(state)).toBe("");
  });

  it("returns null (skip-sync) when the simple template is invalid", () => {
    // e.g. a Comparison with an empty value the author hasn't filled in.
    // Don't clobber a known-good advanced JSON with an incomplete simple.
    const state: RuleState = { rule: undefined, isValid: false };
    expect(syncTextFromSimple(state)).toBeNull();
  });
});

describe("syncTemplateFromAdvanced", () => {
  it("decompiles a single comparison rule into a one-condition group", () => {
    const status: ValidationStatus = {
      kind: "ok",
      parsed: { "==": [{ var: "form.age" }, 18] },
    };
    const result = syncTemplateFromAdvanced(status, true, true, []);
    expect(result).toEqual({
      TAG: "Conditions",
      connector: "and",
      conditions: [{ TAG: "Comparison", fieldId: "age", op: "==", value: 18 }],
    });
  });

  it("decompiles an AND of conditions into a multi-condition group", () => {
    const status: ValidationStatus = {
      kind: "ok",
      parsed: {
        and: [
          { ">=": [{ var: "form.age" }, 18] },
          { "==": [{ var: "form.consent" }, true] },
        ],
      },
    };
    expect(syncTemplateFromAdvanced(status, true, true, [])).toEqual({
      TAG: "Conditions",
      connector: "and",
      conditions: [
        { TAG: "Comparison", fieldId: "age", op: ">=", value: 18 },
        { TAG: "Comparison", fieldId: "consent", op: "==", value: true },
      ],
    });
  });

  it("returns null for a multi-condition AND when the section is single-only", () => {
    // Validator section (allowMultiple=false) can't render a group — keep
    // the existing simple draft rather than collapse the user's rule.
    const status: ValidationStatus = {
      kind: "ok",
      parsed: {
        and: [
          { ">=": [{ var: "form.age" }, 18] },
          { "==": [{ var: "form.consent" }, true] },
        ],
      },
    };
    expect(syncTemplateFromAdvanced(status, false, false, [])).toBeNull();
  });

  it("returns null on a malformed JSON status (skip-sync)", () => {
    const status: ValidationStatus = {
      kind: "parseError",
      message: "Unexpected token",
    };
    expect(syncTemplateFromAdvanced(status, true, true, [])).toBeNull();
  });

  it("returns null on a non-template rule (preserves the simple draft)", () => {
    // An if/else has no template equivalent — switching back to simple
    // should leave the prior simple draft alone rather than snap to a
    // default.
    const status: ValidationStatus = {
      kind: "ok",
      parsed: { if: [{ ">=": [{ var: "form.age" }, 18] }, true, false] },
    };
    expect(syncTemplateFromAdvanced(status, true, true, [])).toBeNull();
  });

  it("snaps to 'Always' on empty advanced JSON when the section allows it", () => {
    const status: ValidationStatus = { kind: "empty" };
    expect(syncTemplateFromAdvanced(status, true, true, [])).toBe("Always");
  });

  it("returns null on empty advanced JSON when the section disallows 'Always'", () => {
    // Validator section: every validator must carry a rule, so an
    // empty advanced textarea can't promote the simple side to "Always".
    // Keep the existing simple draft.
    const status: ValidationStatus = { kind: "empty" };
    expect(syncTemplateFromAdvanced(status, false, false, [])).toBeNull();
  });
});

const multiForm: LogicField[] = [
  {
    id: "langs",
    displayName: "Languages",
    kind: "primitive",
    primitiveKind: "string",
    multiValue: true,
    options: [
      { value: "en", label: "English" },
      { value: "sw", label: "Swahili" },
      { value: "ar", label: "Arabic" },
    ],
  },
  {
    id: "this-field",
    displayName: "Current",
    kind: "primitive",
    primitiveKind: "string",
  },
];

describe("FieldLogicPanel — multi-select membership", () => {
  it("seeds Simple mode with a single-option picker for a stored `in` rule", () => {
    render(
      <FieldLogicPanel
        form={multiForm}
        fieldId="this-field"
        initial={{ visibleIf: { in: ["en", { var: "form.langs" }] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    // Representable now → no advisory, and the single-option picker renders.
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    expect(screen.getByTestId("rule-option")).toBeDefined();
  });

  it("seeds Simple mode with a multi-option picker for a stored `or`-of-`in` rule", () => {
    render(
      <FieldLogicPanel
        form={multiForm}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { in: ["en", { var: "form.langs" }] },
              { in: ["sw", { var: "form.langs" }] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    // The multi-pick renders every option inline (labels, not portaled).
    expect(screen.getByTestId("rule-options")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByText("Swahili")).toBeDefined();
    expect(screen.getByText("Arabic")).toBeDefined();
  });

  // A rule outlives the option it names: rename or delete "fr" and the stored
  // token still compiles but can never match. It gets its own row so it isn't
  // invisible while Save stays enabled.
  it("surfaces a multi-pick token the field no longer offers", () => {
    render(
      <FieldLogicPanel
        form={multiForm}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { in: ["en", { var: "form.langs" }] },
              { in: ["fr", { var: "form.langs" }] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    // Rendered as its own checked row, so unchecking is how it's dropped.
    expect(screen.getByTestId("rule-option-fr")).toBeDefined();
    expect(screen.getByTestId("rule-option-stale")).toBeDefined();
  });

  it("leaves a fully-resolvable multi-pick unmarked", () => {
    render(
      <FieldLogicPanel
        form={multiForm}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { in: ["en", { var: "form.langs" }] },
              { in: ["sw", { var: "form.langs" }] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByTestId("rule-option-stale")).toBeNull();
  });

  // `unknownOptionTokens` stays silent on a field with no options, but the
  // widget knows more: tokens present against zero options is unambiguous.
  it("surfaces stored tokens when every option has been deleted", () => {
    const emptied: LogicField[] = [
      {
        id: "langs",
        displayName: "Languages",
        kind: "primitive",
        primitiveKind: "string",
        multiValue: true,
        options: [],
      },
      {
        id: "this-field",
        displayName: "Current",
        kind: "primitive",
        primitiveKind: "string",
      },
    ];
    render(
      <FieldLogicPanel
        form={emptied}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { in: ["en", { var: "form.langs" }] },
              { in: ["sw", { var: "form.langs" }] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByTestId("rule-option-stale")).toBeDefined();
  });

  it("surfaces a single stored token when every option has been deleted", () => {
    const emptied: LogicField[] = [
      {
        id: "langs",
        displayName: "Languages",
        kind: "primitive",
        primitiveKind: "string",
        multiValue: true,
        options: [],
      },
      {
        id: "this-field",
        displayName: "Current",
        kind: "primitive",
        primitiveKind: "string",
      },
    ];
    render(
      <FieldLogicPanel
        form={emptied}
        fieldId="this-field"
        initial={{ visibleIf: { in: ["en", { var: "form.langs" }] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByTestId("rule-option-stale")).toBeDefined();
  });

  it("surfaces a single-pick token the field no longer offers", () => {
    render(
      <FieldLogicPanel
        form={multiForm}
        fieldId="this-field"
        initial={{ visibleIf: { in: ["fr", { var: "form.langs" }] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByTestId("rule-option-stale")).toBeDefined();
    // The trigger shows the token, not the "Pick an option" placeholder.
    expect(screen.getByTestId("rule-option").textContent).toMatch(/fr/);
  });
});

// A single-valued option field (registration `select`, event single-select).
// It gets the same membership rows as a checkbox, but they are stored as
// equality — `in` would substring-match against the single stored string.
const selectForm: LogicField[] = [
  {
    id: "city",
    displayName: "City",
    kind: "primitive",
    primitiveKind: "string",
    options: [
      { value: "dar", label: "Dar es Salaam" },
      { value: "arusha", label: "Arusha" },
    ],
  },
  {
    id: "this-field",
    displayName: "Current",
    kind: "primitive",
    primitiveKind: "string",
  },
];

describe("FieldLogicPanel — single-valued option fields", () => {
  it("seeds an option picker for a stored `==` rule instead of a free-text box", () => {
    render(
      <FieldLogicPanel
        form={selectForm}
        fieldId="this-field"
        initial={{ visibleIf: { "==": [{ var: "form.city" }, "dar"] } }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    expect(screen.getByTestId("rule-option")).toBeDefined();
  });

  it("seeds the multi-option picker for a stored `or`-of-`==` rule", () => {
    render(
      <FieldLogicPanel
        form={selectForm}
        fieldId="this-field"
        initial={{
          visibleIf: {
            or: [
              { "==": [{ var: "form.city" }, "dar"] },
              { "==": [{ var: "form.city" }, "arusha"] },
            ],
          },
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.queryByText(/authored in Advanced mode/i)).toBeNull();
    expect(screen.getByTestId("rule-options")).toBeDefined();
    expect(screen.getByText("Dar es Salaam")).toBeDefined();
    expect(screen.getByText("Arusha")).toBeDefined();
  });

  // The validator section renders a single ConditionRow with no add/remove,
  // a separate branch from the visibility list — it needs its own coverage.
  it("seeds an option picker in the single-row validator section", () => {
    render(
      <FieldLogicPanel
        form={selectForm}
        fieldId="this-field"
        initial={{
          validators: [
            {
              id: "v1",
              rule: { "==": [{ var: "form.city" }, "dar"] },
              message: "Must be in Dar",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByTestId("rule-option")).toBeDefined();
  });
});

const textForm: LogicField[] = [
  {
    id: "notes",
    displayName: "Notes",
    kind: "primitive",
    primitiveKind: "string",
    freeText: true,
  },
  {
    id: "this-field",
    displayName: "Current",
    kind: "primitive",
    primitiveKind: "string",
  },
];

describe("FieldLogicPanel — length validators", () => {
  // The headline case: "this value must be longer than 10 characters" — a
  // validator on `notes` constraining `notes`'s own length.
  it("seeds Simple mode with a populated length row for a self-referencing length rule", () => {
    render(
      <FieldLogicPanel
        form={textForm}
        fieldId="notes"
        initial={{
          validators: [
            {
              id: "min-len",
              rule: { ">": [{ length: { var: ["form.notes", ""] } }, 10] },
              message: "Notes must be longer than 10 characters",
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));
    expect(screen.getByText("Validator 1")).toBeDefined();
    // A single length leaf decompiles to Simple mode (no Radix Tabs switch
    // needed), so the character-count input renders populated.
    expect(
      (screen.getByTestId("rule-length-value") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      screen.getByDisplayValue("Notes must be longer than 10 characters"),
    ).toBeDefined();
    // The defaulted-var length rule references its own field, so the
    // "wrong field" advisory must stay hidden — ruleReferencesField reads the
    // array-var head.
    expect(
      screen.queryByText(/doesn't reference the field being validated/i),
    ).toBeNull();
  });

  it("edits the character count and saves the updated bound", () => {
    const onSave = vi.fn();
    render(
      <FieldLogicPanel
        form={textForm}
        fieldId="notes"
        initial={{
          validators: [
            {
              id: "min-len",
              rule: { ">": [{ length: { var: ["form.notes", ""] } }, 10] },
              message: "Too short",
            },
          ],
        }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Logic & Validation"));

    fireEvent.change(screen.getByTestId("rule-length-value"), {
      target: { value: "25" },
    });

    const saveBtn = screen.getByRole("button", {
      name: /Save validators/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0]?.[0];
    expect(arg.validators).toHaveLength(1);
    expect(arg.validators[0].rule).toEqual({
      ">": [{ length: { var: ["form.notes", ""] } }, 25],
    });
    expect(arg.validators[0].message).toBe("Too short");
  });
});
