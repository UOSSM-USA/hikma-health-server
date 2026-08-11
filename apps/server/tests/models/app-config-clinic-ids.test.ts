import { describe, expect, it } from "vitest";
import AppConfig from "@/models/app-config";

describe("AppConfig array serialization", () => {
  it("serializes an array config value to JSON", () => {
    const value = [
      { id: "visit_history", visible: true },
      { id: "vitals", visible: false },
    ];
    expect(AppConfig.Utils.serializeValue(value, "array")).toBe(
      '[{"id":"visit_history","visible":true},{"id":"vitals","visible":false}]',
    );
  });

  it("round-trips an array config value through parseValue", () => {
    const value = [{ id: "vitals", visible: false }];
    const serialized = AppConfig.Utils.serializeValue(value, "array");
    const parsed = AppConfig.Utils.parseValue({
      namespace: "ui",
      key: "patient_view.actions",
      display_name: null,
      value: serialized,
      data_type: "array",
      created_at: new Date(),
      updated_at: new Date(),
      last_modified: new Date(),
      last_modified_by: null,
      clinic_ids: null,
    });
    expect(parsed).toEqual(value);
  });
});
