import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PATIENT_VIEW_ACTIONS } from "@/lib/patient-view-actions";

/**
 * Catches drift between the two hand-maintained action registries.
 *
 * The mobile one is read as text rather than imported: nothing in this repo
 * imports across the app boundary today, so that resolution is unproven.
 *
 * `import.meta.url` rather than `__dirname` — vitest runs this over ESM, where
 * `__dirname` is not reliably defined.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_REGISTRY = resolve(
  HERE,
  "../../../mobile/app/config/patientViewActions.ts",
);

describe("patient view action registry parity", () => {
  it("server and mobile declare the same action ids", () => {
    const source = readFileSync(MOBILE_REGISTRY, "utf8");
    const mobileIds = [...source.matchAll(/id:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    const serverIds = PATIENT_VIEW_ACTIONS.map((a) => a.id);

    expect(mobileIds.length).toBeGreaterThan(0);
    expect(mobileIds).toEqual(serverIds);
  });
});
