import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  requireClinicPermission,
  type AuthedContext,
} from "@/integrations/trpc/init";
import type UserClinicPermissions from "@/models/user-clinic-permissions";

/**
 * Unit tests for the clinic-permission gate. requireClinicPermission is the one
 * server-side authorization primitive, and it wasn't directly tested — the
 * permission role matrix has coverage (user-clinic-permissions.test.ts), but the
 * gate that reads it never did.
 *
 * These are pure (no DB, no auth fixture): they cover the enforcement logic.
 * Whether a given command actually wires the gate in (register_patient at
 * commands.ts:161) is checked separately in the integration tests.
 */

const permRow = (
  clinicId: string,
  overrides: Partial<Record<UserClinicPermissions.UserPermissionsT, boolean>> = {},
): UserClinicPermissions.EncodedT =>
  ({
    user_id: "user-1",
    clinic_id: clinicId,
    can_register_patients: false,
    can_view_history: false,
    can_edit_records: false,
    can_delete_records: false,
    is_clinic_admin: false,
    can_edit_other_provider_event: false,
    can_download_patient_reports: false,
    can_prescribe_medications: false,
    can_dispense_medications: false,
    can_delete_patient_visits: false,
    can_delete_patient_records: false,
    created_by: null,
    last_modified_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as UserClinicPermissions.EncodedT;

const ctx = (permissions: AuthedContext["permissions"]): AuthedContext => ({
  userId: "user-1",
  role: "provider" as AuthedContext["role"],
  permissions,
});

const codeOf = (fn: () => void): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NON_TRPC_ERROR";
  }
  return undefined;
};

const CLINIC = "clinic-1";

describe("requireClinicPermission — specific clinic", () => {
  it("passes when the clinic grants the permission", () => {
    const c = ctx({ [CLINIC]: permRow(CLINIC, { can_register_patients: true }) });
    expect(() =>
      requireClinicPermission(c, "can_register_patients", CLINIC),
    ).not.toThrow();
  });

  it("throws FORBIDDEN when the clinic denies the permission", () => {
    const c = ctx({ [CLINIC]: permRow(CLINIC, { can_register_patients: false }) });
    expect(codeOf(() => requireClinicPermission(c, "can_register_patients", CLINIC))).toBe(
      "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when the user has no permission row for that clinic", () => {
    const c = ctx({
      "other-clinic": permRow("other-clinic", { can_register_patients: true }),
    });
    expect(codeOf(() => requireClinicPermission(c, "can_register_patients", CLINIC))).toBe(
      "FORBIDDEN",
    );
  });

  it("scopes per clinic: a grant on clinic A does not authorize clinic B", () => {
    const c = ctx({ A: permRow("A", { can_edit_records: true }) });
    expect(codeOf(() => requireClinicPermission(c, "can_edit_records", "B"))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("requireClinicPermission — any-clinic check (clinicId null/undefined)", () => {
  it("passes when at least one clinic grants the permission", () => {
    const c = ctx({
      A: permRow("A", { can_view_history: false }),
      B: permRow("B", { can_view_history: true }),
    });
    expect(() =>
      requireClinicPermission(c, "can_view_history", null),
    ).not.toThrow();
  });

  it("throws FORBIDDEN when no clinic grants the permission", () => {
    const c = ctx({ A: permRow("A"), B: permRow("B") });
    expect(codeOf(() => requireClinicPermission(c, "can_view_history", null))).toBe(
      "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when the permissions map is empty", () => {
    expect(
      codeOf(() => requireClinicPermission(ctx({}), "can_register_patients", undefined)),
    ).toBe("FORBIDDEN");
  });
});

// Right now only INV-27 is wired to this gate (commands.ts:161,
// can_register_patients). The same check would cover INV-29 (edit/view/delete)
// if those commands called it — they don't yet, so this suite exercises the
// gate logic ahead of that wiring.
describe("requireClinicPermission — capability-agnostic gate", () => {
  const caps: UserClinicPermissions.UserPermissionsT[] = [
    "can_register_patients",
    "can_edit_records",
    "can_view_history",
    "can_delete_records",
  ];

  for (const cap of caps) {
    it(`enforces ${cap} independently`, () => {
      const granted = ctx({ [CLINIC]: permRow(CLINIC, { [cap]: true }) });
      const denied = ctx({ [CLINIC]: permRow(CLINIC) });
      expect(() => requireClinicPermission(granted, cap, CLINIC)).not.toThrow();
      expect(codeOf(() => requireClinicPermission(denied, cap, CLINIC))).toBe(
        "FORBIDDEN",
      );
    });
  }
});
