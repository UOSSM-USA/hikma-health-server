/**
 * Test suite for PermissionService
 * Tests context-aware permission checking
 */

import { describe, it, expect } from "vitest";
import { PermissionService, type PermissionContext } from "@/lib/permission-service";
import { Module, PermissionOperation, PermissionScope } from "@/models/permissions";
import User from "@/models/user";

describe("PermissionService", () => {
  describe("Context-based Permission Checking", () => {
    describe("REGISTRAR with CLINIC scope", () => {
      const context: PermissionContext = {
        userId: "user-1",
        role: User.ROLES.REGISTRAR,
        clinicIds: ["clinic-1", "clinic-2"],
        isClinicAdmin: false,
        isSuperAdmin: false,
      };

      it("should allow viewing patients in assigned clinic", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.VIEW,
          { clinicId: "clinic-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should deny viewing patients in different clinic", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.VIEW,
          { clinicId: "clinic-3" },
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("different clinic");
      });

      it("should allow editing own records", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.EDIT,
          { ownerId: "user-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should deny editing other user's records", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.EDIT,
          { ownerId: "user-2" },
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("own resources");
      });

      it("should deny access to event forms", () => {
        const result = PermissionService.check(
          context,
          Module.EVENT_FORMS,
          PermissionOperation.VIEW,
        );
        expect(result.allowed).toBe(false);
      });
    });

    describe("PROVIDER with ASSIGNED scope", () => {
      const context: PermissionContext = {
        userId: "provider-1",
        role: User.ROLES.PROVIDER,
        clinicIds: ["clinic-1"],
        isClinicAdmin: false,
        isSuperAdmin: false,
      };

      it("should allow viewing assigned patient", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.VIEW,
          { providerId: "provider-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should allow creating event forms", () => {
        const result = PermissionService.check(
          context,
          Module.EVENT_FORMS,
          PermissionOperation.ADD,
          { providerId: "provider-1", clinicId: "clinic-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should deny managing users", () => {
        const result = PermissionService.check(
          context,
          Module.USERS,
          PermissionOperation.VIEW,
        );
        expect(result.allowed).toBe(false);
      });

      it("should allow viewing own appointments", () => {
        const result = PermissionService.check(
          context,
          Module.APPOINTMENTS,
          PermissionOperation.VIEW,
          { ownerId: "provider-1" },
        );
        expect(result.allowed).toBe(true);
      });
    });

    describe("ADMIN with CLINIC_ADMIN scope", () => {
      const context: PermissionContext = {
        userId: "admin-1",
        role: User.ROLES.ADMIN,
        clinicIds: ["clinic-1", "clinic-2"],
        isClinicAdmin: true,
        isSuperAdmin: false,
      };

      it("should allow managing patients in assigned clinics", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.EDIT,
          { clinicId: "clinic-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should deny managing patients in non-assigned clinic", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.EDIT,
          { clinicId: "clinic-3" },
        );
        expect(result.allowed).toBe(false);
      });

      it("should allow managing users within clinic", () => {
        const result = PermissionService.check(
          context,
          Module.USERS,
          PermissionOperation.ADD,
          { clinicId: "clinic-1" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should deny deleting patients", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.DELETE,
        );
        expect(result.allowed).toBe(false);
      });

      it("should allow viewing analytics", () => {
        const result = PermissionService.check(
          context,
          Module.DATA_ANALYSIS,
          PermissionOperation.VIEW,
        );
        expect(result.allowed).toBe(true);
      });
    });

    describe("SUPER_ADMIN with ALL scope", () => {
      const context: PermissionContext = {
        userId: "super-admin-1",
        role: User.ROLES.SUPER_ADMIN,
        clinicIds: [],
        isClinicAdmin: false,
        isSuperAdmin: true,
      };

      it("should allow all operations on all modules", () => {
        const modules = Object.values(Module);
        const operations = Object.values(PermissionOperation);

        modules.forEach((module) => {
          operations.forEach((operation) => {
            const result = PermissionService.check(context, module, operation);
            expect(result.allowed).toBe(true);
          });
        });
      });

      it("should allow accessing any clinic", () => {
        const result = PermissionService.check(
          context,
          Module.PATIENTS,
          PermissionOperation.VIEW,
          { clinicId: "any-clinic" },
        );
        expect(result.allowed).toBe(true);
      });

      it("should allow deleting users", () => {
        const result = PermissionService.check(
          context,
          Module.USERS,
          PermissionOperation.DELETE,
        );
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe("Permission Service Helper Methods", () => {
    const adminContext: PermissionContext = {
      userId: "admin-1",
      role: User.ROLES.ADMIN,
      clinicIds: ["clinic-1"],
      isClinicAdmin: true,
      isSuperAdmin: false,
    };

    it("canView should work correctly", () => {
      expect(PermissionService.canView(adminContext, Module.PATIENTS)).toBe(true);
      expect(PermissionService.canView(adminContext, Module.USERS)).toBe(true);
    });

    it("canAdd should work correctly", () => {
      expect(PermissionService.canAdd(adminContext, Module.PATIENTS)).toBe(true);
      expect(PermissionService.canAdd(adminContext, Module.USERS)).toBe(true);
      expect(PermissionService.canAdd(adminContext, Module.PRESCRIPTIONS)).toBe(false);
    });

    it("canEdit should work correctly", () => {
      expect(PermissionService.canEdit(adminContext, Module.PATIENTS)).toBe(true);
      expect(PermissionService.canEdit(adminContext, Module.USERS)).toBe(true);
    });

    it("canDelete should work correctly", () => {
      expect(PermissionService.canDelete(adminContext, Module.PATIENTS)).toBe(false);
      expect(PermissionService.canDelete(adminContext, Module.USERS)).toBe(false);
    });
  });

  describe("checkOrThrow method", () => {
    const registrarContext: PermissionContext = {
      userId: "registrar-1",
      role: User.ROLES.REGISTRAR,
      clinicIds: ["clinic-1"],
      isClinicAdmin: false,
      isSuperAdmin: false,
    };

    it("should not throw for allowed operations", () => {
      expect(() => {
        PermissionService.checkOrThrow(
          registrarContext,
          Module.PATIENTS,
          PermissionOperation.VIEW,
        );
      }).not.toThrow();
    });

    it("should throw for denied operations", () => {
      expect(() => {
        PermissionService.checkOrThrow(
          registrarContext,
          Module.USERS,
          PermissionOperation.VIEW,
        );
      }).toThrow();
    });

    it("should throw with descriptive error message", () => {
      expect(() => {
        PermissionService.checkOrThrow(
          registrarContext,
          Module.EVENT_FORMS,
          PermissionOperation.VIEW,
        );
      }).toThrow(/does not have view permission/);
    });
  });

  describe("getAccessibleModules", () => {
    it("should return correct modules for registrar", () => {
      const context: PermissionContext = {
        userId: "registrar-1",
        role: User.ROLES.REGISTRAR,
        clinicIds: ["clinic-1"],
        isClinicAdmin: false,
        isSuperAdmin: false,
      };

      const modules = PermissionService.getAccessibleModules(context);
      expect(modules).toContain(Module.PATIENTS);
      expect(modules).toContain(Module.APPOINTMENTS);
      expect(modules).toContain(Module.PRESCRIPTIONS);
      expect(modules).not.toContain(Module.EVENT_FORMS);
      expect(modules).not.toContain(Module.USERS);
      expect(modules).not.toContain(Module.SETTINGS);
    });

    it("should return correct modules for provider", () => {
      const context: PermissionContext = {
        userId: "provider-1",
        role: User.ROLES.PROVIDER,
        clinicIds: ["clinic-1"],
        isClinicAdmin: false,
        isSuperAdmin: false,
      };

      const modules = PermissionService.getAccessibleModules(context);
      expect(modules).toContain(Module.PATIENTS);
      expect(modules).toContain(Module.EVENT_FORMS);
      expect(modules).toContain(Module.PRESCRIPTIONS);
      expect(modules).toContain(Module.DATA_ANALYSIS);
      expect(modules).not.toContain(Module.USERS);
      expect(modules).not.toContain(Module.SETTINGS);
    });

    it("should return all modules for super admin", () => {
      const context: PermissionContext = {
        userId: "super-admin-1",
        role: User.ROLES.SUPER_ADMIN,
        clinicIds: [],
        isClinicAdmin: false,
        isSuperAdmin: true,
      };

      const modules = PermissionService.getAccessibleModules(context);
      expect(modules.length).toBe(Object.values(Module).length);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null resource context", () => {
      const context: PermissionContext = {
        userId: "user-1",
        role: User.ROLES.ADMIN,
        clinicIds: ["clinic-1"],
        isClinicAdmin: true,
        isSuperAdmin: false,
      };

      const result = PermissionService.check(
        context,
        Module.PATIENTS,
        PermissionOperation.VIEW,
      );
      expect(result.allowed).toBe(true);
    });

    it("should handle empty clinic IDs", () => {
      const context: PermissionContext = {
        userId: "user-1",
        role: User.ROLES.REGISTRAR,
        clinicIds: [],
        isClinicAdmin: false,
        isSuperAdmin: false,
      };

      const result = PermissionService.check(
        context,
        Module.PATIENTS,
        PermissionOperation.VIEW,
        { clinicId: "clinic-1" },
      );
      expect(result.allowed).toBe(false);
    });
  });
});

