import { describe, it, expect } from "vitest";
import {
  textDisplaySizes,
  durationUnits,
  doseUnits,
  measurementUnits,
  medicineRoutes,
  medicineForms,
  reservedFieldNames,
  formNameFieldId,
  formDescriptionFieldId,
} from "../src/Shared.gen";

describe("Shared constants — pin current values", () => {
  it("textDisplaySizes is xxl..sm in order", () => {
    expect(textDisplaySizes).toEqual(["xxl", "xl", "lg", "md", "sm"]);
  });

  it("durationUnits", () => {
    expect(durationUnits).toEqual([
      "hours",
      "days",
      "weeks",
      "months",
      "years",
    ]);
  });

  it("doseUnits", () => {
    expect(doseUnits).toEqual(["mg", "g", "mcg", "mL", "L", "units"]);
  });

  it("measurementUnits matches the legacy set", () => {
    expect(measurementUnits).toContain("cm");
    expect(measurementUnits).toContain("°C");
    expect(measurementUnits).toContain("mmHg");
    expect(measurementUnits).toContain("%");
    expect(measurementUnits).toHaveLength(17);
  });

  it("medicineRoutes covers all legacy routes", () => {
    expect(medicineRoutes).toContain("oral");
    expect(medicineRoutes).toContain("intravenous");
    expect(medicineRoutes).toContain("other");
    expect(medicineRoutes).toHaveLength(15);
  });

  it("medicineForms covers all legacy forms", () => {
    expect(medicineForms).toContain("tablet");
    expect(medicineForms).toContain("syrup");
    expect(medicineForms).toContain("other");
    expect(medicineForms).toHaveLength(15);
  });

  it("reservedFieldNames is diagnosis + medicine", () => {
    expect(reservedFieldNames).toEqual(["diagnosis", "medicine"]);
  });

  it("sentinel field IDs are stable", () => {
    expect(formNameFieldId).toBe("__form_name__");
    expect(formDescriptionFieldId).toBe("__form_description__");
  });
});
