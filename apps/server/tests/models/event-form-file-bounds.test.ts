import { describe, it, expect } from "vitest";
import fc from "fast-check";
import EventForm from "@/models/event-form";

const { withFileItemBounds, FILE_FIELD_ITEMS_MAX } = EventForm;

describe("EventForm.withFileItemBounds", () => {
  it("applies an in-range edit unchanged", () => {
    expect(
      withFileItemBounds({ minItems: 0, maxItems: 10 }, { maxItems: 4 }),
    ).toEqual({ minItems: 0, maxItems: 4 });
    expect(
      withFileItemBounds({ minItems: 0, maxItems: 10 }, { minItems: 3 }),
    ).toEqual({ minItems: 3, maxItems: 10 });
  });

  // The edited bound wins; the other yields. Discarding the author's input
  // would read as a broken text box.
  it("pulls minItems down when maxItems is lowered past it", () => {
    expect(
      withFileItemBounds({ minItems: 8, maxItems: 10 }, { maxItems: 3 }),
    ).toEqual({ minItems: 3, maxItems: 3 });
  });

  it("pushes maxItems up when minItems is raised past it", () => {
    expect(
      withFileItemBounds({ minItems: 1, maxItems: 3 }, { minItems: 7 }),
    ).toEqual({ minItems: 7, maxItems: 7 });
  });

  it("clamps to the ceiling", () => {
    expect(
      withFileItemBounds({ minItems: 0, maxItems: 5 }, { maxItems: 9999 }),
    ).toEqual({ minItems: 0, maxItems: FILE_FIELD_ITEMS_MAX });
  });

  it("refuses a maximum below one and a minimum below zero", () => {
    expect(
      withFileItemBounds({ minItems: 0, maxItems: 5 }, { maxItems: 0 }),
    ).toEqual({ minItems: 0, maxItems: 1 });
    expect(
      withFileItemBounds({ minItems: 2, maxItems: 5 }, { minItems: -4 }),
    ).toEqual({ minItems: 0, maxItems: 5 });
  });

  // An emptied number input arrives as NaN; the author is mid-retype, not
  // asking for zero.
  it("leaves the pair alone for non-numeric input", () => {
    expect(
      withFileItemBounds(
        { minItems: 2, maxItems: 6 },
        { minItems: Number.NaN },
      ),
    ).toEqual({ minItems: 2, maxItems: 6 });
    expect(withFileItemBounds({ minItems: 2, maxItems: 6 }, {})).toEqual({
      minItems: 2,
      maxItems: 6,
    });
  });

  it("repairs an already-incoherent stored pair", () => {
    expect(withFileItemBounds({ minItems: 9, maxItems: 2 }, {})).toEqual({
      minItems: 2,
      maxItems: 2,
    });
  });

  it("truncates fractional input", () => {
    expect(
      withFileItemBounds({ minItems: 0, maxItems: 5 }, { maxItems: 3.9 }),
    ).toEqual({ minItems: 0, maxItems: 3 });
  });

  it("always returns a coherent pair, whatever goes in", () => {
    const arbCount = fc.oneof(
      fc.integer({ min: -50, max: 200 }),
      fc.double({ min: -50, max: 200, noNaN: true }),
    );
    fc.assert(
      fc.property(
        arbCount,
        arbCount,
        fc.option(arbCount, { nil: undefined }),
        fc.option(arbCount, { nil: undefined }),
        (minItems, maxItems, nextMin, nextMax) => {
          const result = withFileItemBounds(
            { minItems, maxItems },
            { minItems: nextMin, maxItems: nextMax },
          );
          expect(result.maxItems).toBeGreaterThanOrEqual(1);
          expect(result.maxItems).toBeLessThanOrEqual(FILE_FIELD_ITEMS_MAX);
          expect(result.minItems).toBeGreaterThanOrEqual(0);
          expect(result.minItems).toBeLessThanOrEqual(result.maxItems);
          expect(Number.isInteger(result.minItems)).toBe(true);
          expect(Number.isInteger(result.maxItems)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });
});
