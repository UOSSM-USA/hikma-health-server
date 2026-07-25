/**
 * `vitals.update` takes a bare record id, so being authenticated must not be
 * enough. These drive the real procedure with the database stubbed, and assert
 * the update never lands unless the caller can edit in the owning clinic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Option } from "effect";

const OWNING_CLINIC = "clinic-owning-the-record";
const OTHER_CLINIC = "clinic-the-caller-belongs-to";
const VITALS_ID = "vitals-1";

const executeUpdate = vi.fn(async () => undefined);
const getClinicScope = vi.fn();
const getByUser = vi.fn();

vi.mock("@/db", () => ({
  default: {
    updateTable: () => ({
      set: () => ({
        where: () => ({
          where: () => ({ execute: executeUpdate }),
        }),
      }),
    }),
  },
}));

// Kept real because sync.ts reads their Table metadata while the router graph is
// built; only the functions under test are replaced.
vi.mock("@/models/token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/token")>();
  return {
    default: {
      ...actual.default,
      getUser: async () => Option.some({ id: "user-1", role: "provider" }),
    },
  };
});

vi.mock("@/models/user-clinic-permissions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/models/user-clinic-permissions")>();
  return {
    default: { ...actual.default, API: { ...actual.default.API, getByUser } },
  };
});

vi.mock("@/models/patient-vital", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/models/patient-vital")>();
  return {
    default: {
      ...actual.default,
      API: { ...actual.default.API, getClinicScope },
    },
  };
});

vi.mock("@/lib/server-functions/audit", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@sentry/tanstackstart-react", () => ({ captureException: vi.fn() }));

const { commandAppRouter } = await import("@/integrations/trpc/router");

/** Permission row shaped as the middleware expects, with everything off but the named grants */
const permissionsFor = (clinicId: string, grants: Record<string, boolean>) => ({
  clinic_id: clinicId,
  user_id: "user-1",
  can_register_patients: false,
  can_view_history: false,
  can_edit_records: false,
  can_delete_records: false,
  is_clinic_admin: false,
  ...grants,
});

const callUpdate = () =>
  commandAppRouter
    .createCaller({ authHeader: "Bearer valid-token" })
    .vitals.update({ id: VITALS_ID, systolic_bp: 130 });

beforeEach(() => {
  executeUpdate.mockClear();
  getClinicScope.mockReset();
  getByUser.mockReset();
  getClinicScope.mockResolvedValue({
    patientId: "patient-1",
    primaryClinicId: OWNING_CLINIC,
  });
});

describe("vitals.update authorization", () => {
  it("allows an edit when the caller holds can_edit_records on the owning clinic", async () => {
    getByUser.mockResolvedValue([
      permissionsFor(OWNING_CLINIC, { can_edit_records: true }),
    ]);

    await expect(callUpdate()).resolves.toEqual({ ok: true, id: VITALS_ID });
    expect(executeUpdate).toHaveBeenCalledTimes(1);
  });

  it("refuses an edit for a record owned by a clinic the caller cannot edit in", async () => {
    getByUser.mockResolvedValue([
      permissionsFor(OTHER_CLINIC, { can_edit_records: true }),
    ]);

    await expect(callUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(executeUpdate).not.toHaveBeenCalled();
  });

  it("refuses an edit from a read-only user in the owning clinic", async () => {
    getByUser.mockResolvedValue([
      permissionsFor(OWNING_CLINIC, { can_view_history: true }),
    ]);

    await expect(callUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(executeUpdate).not.toHaveBeenCalled();
  });

  it("refuses an edit from an authenticated user with no clinic permissions", async () => {
    getByUser.mockResolvedValue([]);

    await expect(callUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(executeUpdate).not.toHaveBeenCalled();
  });

  it("reports an unknown or deleted record as not found instead of silently succeeding", async () => {
    getClinicScope.mockResolvedValue(null);
    getByUser.mockResolvedValue([
      permissionsFor(OWNING_CLINIC, { can_edit_records: true }),
    ]);

    await expect(callUpdate()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(executeUpdate).not.toHaveBeenCalled();
  });

  it("does not leak the authorization failure as a generic server error", async () => {
    // The handler's try/catch rewrites everything to INTERNAL_SERVER_ERROR, so
    // the check must sit outside it or a denial arrives looking like an outage.
    getByUser.mockResolvedValue([]);

    await expect(callUpdate()).rejects.not.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  describe("legacy patients with no primary clinic", () => {
    beforeEach(() => {
      getClinicScope.mockResolvedValue({
        patientId: "patient-legacy",
        primaryClinicId: null,
      });
    });

    it("allows the edit when the caller can edit records somewhere", async () => {
      getByUser.mockResolvedValue([
        permissionsFor(OTHER_CLINIC, { can_edit_records: true }),
      ]);

      await expect(callUpdate()).resolves.toEqual({ ok: true, id: VITALS_ID });
      expect(executeUpdate).toHaveBeenCalledTimes(1);
    });

    it("still refuses the edit when the caller can edit records nowhere", async () => {
      getByUser.mockResolvedValue([
        permissionsFor(OTHER_CLINIC, { can_view_history: true }),
      ]);

      await expect(callUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(executeUpdate).not.toHaveBeenCalled();
    });
  });
});
