import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  problemsFromFormData,
  diffProblems,
  toNewProblem,
  type field,
  type formDataItem,
} from "../src/Problems.gen";

const diagnosisField = (overrides: Partial<field> = {}): field => ({
  id: "field-1",
  fieldType: "diagnosis",
  addToProblems: true,
  ...overrides,
});

const diagnosisData = (value: unknown, fieldId = "field-1"): formDataItem => ({
  fieldId,
  fieldType: "diagnosis",
  value,
});

const cholera = { code: "1A00", label: "Cholera" };
const diabetes = { code: "5A11", label: "Type 2 diabetes" };

describe("problemsFromFormData", () => {
  it("records the diagnoses of a field marked addToProblems", () => {
    const result = problemsFromFormData(
      [diagnosisData([{ code: "1A00", desc: "Cholera" }])],
      [diagnosisField()],
    );

    expect(result).toEqual({ recordsProblems: true, problems: [cholera] });
  });

  // Forms authored before the flag existed have no `addToProblems`; they must
  // not start writing to patients' charts on upgrade.
  it("records nothing when the field omits the flag", () => {
    const result = problemsFromFormData(
      [diagnosisData([{ code: "1A00", desc: "Cholera" }])],
      [diagnosisField({ addToProblems: undefined })],
    );

    expect(result).toEqual({ recordsProblems: false, problems: [] });
  });

  it("records nothing when the field opts out", () => {
    const result = problemsFromFormData(
      [diagnosisData([{ code: "1A00", desc: "Cholera" }])],
      [diagnosisField({ addToProblems: false })],
    );

    expect(result).toEqual({ recordsProblems: false, problems: [] });
  });

  it("ignores diagnoses submitted against a field that opted out", () => {
    const result = problemsFromFormData(
      [
        diagnosisData([{ code: "1A00", desc: "Cholera" }], "opted-out"),
        diagnosisData([{ code: "5A11", desc: "Type 2 diabetes" }], "field-1"),
      ],
      [
        diagnosisField({ id: "opted-out", addToProblems: false }),
        diagnosisField({ id: "field-1" }),
      ],
    );

    expect(result.problems).toEqual([diabetes]);
  });

  it("deduplicates a diagnosis entered twice", () => {
    const result = problemsFromFormData(
      [
        diagnosisData([
          { code: "1A00", desc: "Cholera" },
          { code: "1A00", desc: "Cholera" },
        ]),
      ],
      [diagnosisField()],
    );

    expect(result.problems).toEqual([cholera]);
  });

  // Free-text diagnoses get a unique `0000-…` code when created, but events
  // saved before that share the bare "0000" placeholder — those must still
  // come through as separate problems.
  it("keeps free-text diagnoses that share a code but differ in label", () => {
    const result = problemsFromFormData(
      [
        diagnosisData([
          { code: "0000", desc: "Snake bite" },
          { code: "0000", desc: "Scorpion sting" },
        ]),
      ],
      [diagnosisField()],
    );

    expect(result.problems).toHaveLength(2);
  });

  it("skips entries missing a code or a label", () => {
    const result = problemsFromFormData(
      [
        diagnosisData([
          { code: "", desc: "No code" },
          { code: "1A00", desc: "" },
          { code: "1A00", desc: "Cholera" },
        ]),
      ],
      [diagnosisField()],
    );

    expect(result.problems).toEqual([cholera]);
  });

  it("tolerates values that are not arrays of diagnoses", () => {
    for (const value of ["not an array", 42, null, undefined, {}, [1, "two"]]) {
      const result = problemsFromFormData(
        [diagnosisData(value)],
        [diagnosisField()],
      );
      expect(result.problems).toEqual([]);
    }
  });

  it("ignores a non-diagnosis item carrying a recording field's id", () => {
    const result = problemsFromFormData(
      [{ fieldId: "field-1", fieldType: "options", value: [cholera] }],
      [diagnosisField()],
    );

    expect(result.problems).toEqual([]);
  });

  it("never yields a problem with an empty code or label", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ code: fc.string(), desc: fc.string() })),
        (entries) => {
          const { problems } = problemsFromFormData(
            [diagnosisData(entries)],
            [diagnosisField()],
          );
          return problems.every((p) => p.code !== "" && p.label !== "");
        },
      ),
    );
  });
});

describe("diffProblems", () => {
  it("creates what is new and retires what is gone", () => {
    const result = diffProblems(
      [
        { id: "p1", ...cholera },
        { id: "p2", ...diabetes },
      ],
      [cholera, { code: "BA00", label: "Hypertension" }],
      [],
    );

    expect(result).toEqual({
      toCreate: [{ code: "BA00", label: "Hypertension" }],
      toRemoveIds: ["p2"],
    });
  });

  it("is a no-op when nothing changed", () => {
    const result = diffProblems([{ id: "p1", ...cholera }], [cholera], [cholera]);

    expect(result).toEqual({ toCreate: [], toRemoveIds: [] });
  });

  it("retires everything when all diagnoses are removed", () => {
    const result = diffProblems([{ id: "p1", ...cholera }], [], [cholera]);

    expect(result.toRemoveIds).toEqual(["p1"]);
    expect(result.toCreate).toEqual([]);
  });

  // A relabelled code is a different problem: the label is what a clinician
  // reads on the chart.
  it("treats a changed label as a replacement", () => {
    const result = diffProblems(
      [{ id: "p1", code: "0000", label: "Snake bite" }],
      [{ code: "0000", label: "Snake bite, left arm" }],
      [{ code: "0000", label: "Snake bite" }],
    );

    expect(result.toCreate).toEqual([
      { code: "0000", label: "Snake bite, left arm" },
    ]);
    expect(result.toRemoveIds).toEqual(["p1"]);
  });

  // A brand-new event has asked for nothing yet, so every diagnosis is new.
  it("creates everything when the event has no history", () => {
    const result = diffProblems([], [cholera], []);

    expect(result.toCreate).toEqual([cholera]);
  });

  it("does not recreate a diagnosis taken off the chart by hand", () => {
    const result = diffProblems([], [cholera], [cholera]);

    expect(result).toEqual({ toCreate: [], toRemoveIds: [] });
  });

  it("still creates a diagnosis newly added alongside one taken off", () => {
    const result = diffProblems([], [cholera, diabetes], [cholera]);

    expect(result.toCreate).toEqual([diabetes]);
  });

  it("never both creates and retires the same problem", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            code: fc.string(),
            label: fc.string(),
          }),
        ),
        fc.array(fc.record({ code: fc.string(), label: fc.string() })),
        fc.array(fc.record({ code: fc.string(), label: fc.string() })),
        (existing, desired, alreadyRequested) => {
          const { toCreate, toRemoveIds } = diffProblems(
            existing,
            desired,
            alreadyRequested,
          );
          const removedKeys = new Set(
            existing
              .filter((e) => toRemoveIds.includes(e.id))
              .map((e) => `${e.code}::${e.label}`),
          );
          return toCreate.every(
            (c) => !removedKeys.has(`${c.code}::${c.label}`),
          );
        },
      ),
    );
  });
});

describe("toNewProblem", () => {
  it("records an ICD-11 problem a provider asserted but nobody has confirmed", () => {
    expect(toNewProblem(cholera)).toEqual({
      codeSystem: "icd11",
      code: "1A00",
      label: "Cholera",
      clinicalStatus: "active",
      verificationStatus: "provisional",
    });
  });

  // A free-text diagnosis is unbounded user input, and the columns are
  // varchar(100) / varchar(255).
  it("clamps code and label to their column widths", () => {
    const row = toNewProblem({ code: "c".repeat(300), label: "l".repeat(300) });

    expect(row.code).toHaveLength(100);
    expect(row.label).toHaveLength(255);
  });

  it("leaves values within the column widths untouched", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.string({ maxLength: 255 }),
        (code, label) => {
          const row = toNewProblem({ code, label });
          return row.code === code && row.label === label;
        },
      ),
    );
  });
});
