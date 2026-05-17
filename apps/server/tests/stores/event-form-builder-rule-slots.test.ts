import { describe, it, expect, beforeEach } from "vitest";
import eventFormStore from "@/stores/event-form-builder";
import EventForm from "@/models/event-form";

/**
 * Pins the FieldLogicPanel ↔ store contract: dispatching
 * `set-field-rule-slots` writes all four rule slots atomically to the
 * named field, and undefined slots clear out previous values.
 */

function getState() {
  return eventFormStore.getSnapshot().context;
}

function addBinaryField(id: string) {
  eventFormStore.send({
    type: "add-field",
    payload: new EventForm.BinaryField2({
      id,
      name: "Binary",
      description: "",
      required: false,
      inputType: "checkbox",
      options: [{ id: "yes", label: "Yes", value: "yes" }],
    }),
  });
}

describe("event-form-builder store — set-field-rule-slots", () => {
  beforeEach(() => {
    eventFormStore.send({ type: "reset" });
  });

  it("writes all four slots on the named field", () => {
    addBinaryField("f-1");
    const rule = { ">=": [{ var: "form.age" }, 18] };
    eventFormStore.send({
      type: "set-field-rule-slots",
      payload: {
        fieldId: "f-1",
        slots: {
          visibleIf: rule,
          requiredIf: true,
          validators: [{ id: "v", rule: true, message: "ok" }],
          computedValue: 1,
        },
      },
    });
    const field = getState().form_fields[0] as any;
    expect(field.visibleIf).toEqual(rule);
    expect(field.requiredIf).toBe(true);
    expect(field.validators).toEqual([
      { id: "v", rule: true, message: "ok" },
    ]);
    expect(field.computedValue).toBe(1);
  });

  it("clears previously-set slots when the new payload omits them", () => {
    addBinaryField("f-1");
    eventFormStore.send({
      type: "set-field-rule-slots",
      payload: {
        fieldId: "f-1",
        slots: { visibleIf: { "!!": { var: "form.x" } } },
      },
    });
    expect((getState().form_fields[0] as any).visibleIf).toBeDefined();

    eventFormStore.send({
      type: "set-field-rule-slots",
      payload: { fieldId: "f-1", slots: {} },
    });
    const field = getState().form_fields[0] as any;
    expect(field.visibleIf).toBeUndefined();
    expect(field.requiredIf).toBeUndefined();
    expect(field.validators).toBeUndefined();
    expect(field.computedValue).toBeUndefined();
  });

  it("is a no-op when the fieldId doesn't match any field", () => {
    addBinaryField("f-1");
    const before = getState().form_fields;
    eventFormStore.send({
      type: "set-field-rule-slots",
      payload: { fieldId: "does-not-exist", slots: { visibleIf: true } },
    });
    // The existing field is untouched.
    expect((getState().form_fields[0] as any).visibleIf).toBeUndefined();
    expect(getState().form_fields.length).toBe(before.length);
  });

  it("on a visibility-only variant, only visibleIf is written", () => {
    // Diagnosis is a `WithVisibility` variant — input-only slots
    // (requiredIf / validators / computedValue) are not part of its
    // schema and would surface as stray undefined properties if the
    // store wrote them. CF#3 introduced the variant-aware guard;
    // this is its regression test.
    eventFormStore.send({
      type: "add-field",
      payload: new EventForm.DiagnosisField2({
        id: "d-1",
        name: "Diagnosis",
        description: "",
        required: false,
        inputType: "select",
        options: [],
      }),
    });

    eventFormStore.send({
      type: "set-field-rule-slots",
      payload: {
        fieldId: "d-1",
        slots: {
          visibleIf: { "==": [{ var: "form.x" }, 1] },
          requiredIf: true,
          validators: [{ id: "v", rule: true, message: "ok" }],
          computedValue: 1,
        },
      },
    });

    const field = getState().form_fields[0] as Record<string, unknown>;
    expect(field.visibleIf).toEqual({ "==": [{ var: "form.x" }, 1] });
    // The whole point: input-only slots must NOT appear, even as
    // undefined keys (the JSONB serializer would emit them otherwise).
    expect("requiredIf" in field).toBe(false);
    expect("validators" in field).toBe(false);
    expect("computedValue" in field).toBe(false);
  });
});
