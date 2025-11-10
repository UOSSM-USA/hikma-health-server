/**
 * Test suite for the comprehensive permission matrix
 * Based on UOSSM Hikma Role-Based Permission Matrix
 */

import { describe, it, expect } from "vitest";
import {
  Module,
  PermissionOperation,
  PermissionScope,
  hasPermission,
  getPermissionScope,
  getPermissionRestrictions,
  hasAnyPermission,
  PERMISSION_MATRIX,
} from "@/models/permissions";
import User from "@/models/user";

describe("Permission Matrix - Complete Coverage", () => {
  describe("REGISTRAR Permissions", () => {
    const role = User.ROLES.REGISTRAR;

    describe("Patients Module", () => {
      it("should allow viewing patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(true);
        expect(getPermissionScope(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(
          PermissionScope.CLINIC,
        );
      });

      it("should allow adding patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.ADD)).toBe(true);
      });

      it("should allow editing patients (own records only)", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.EDIT)).toBe(true);
        expect(getPermissionScope(role, Module.PATIENTS, PermissionOperation.EDIT)).toBe(
          PermissionScope.OWN,
        );
      });

      it("should NOT allow deleting patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Event Forms Module", () => {
      it("should NOT have access to event forms (clinical data)", () => {
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.VIEW)).toBe(false);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.ADD)).toBe(false);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.EDIT)).toBe(false);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Users Module", () => {
      it("should NOT have access to user management", () => {
        expect(hasPermission(role, Module.USERS, PermissionOperation.VIEW)).toBe(false);
        expect(hasPermission(role, Module.USERS, PermissionOperation.ADD)).toBe(false);
      });
    });

    describe("Appointments Module", () => {
      it("should allow viewing appointments", () => {
        expect(hasPermission(role, Module.APPOINTMENTS, PermissionOperation.VIEW)).toBe(true);
      });

      it("should allow creating and editing appointments", () => {
        expect(hasPermission(role, Module.APPOINTMENTS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.APPOINTMENTS, PermissionOperation.EDIT)).toBe(true);
      });

      it("should NOT allow deleting appointments", () => {
        expect(hasPermission(role, Module.APPOINTMENTS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Prescriptions Module", () => {
      it("should allow viewing prescriptions only", () => {
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.ADD)).toBe(false);
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.EDIT)).toBe(false);
      });
    });
  });

  describe("PROVIDER Permissions", () => {
    const role = User.ROLES.PROVIDER;

    describe("Patients Module", () => {
      it("should allow viewing assigned patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(true);
        expect(getPermissionScope(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(
          PermissionScope.ASSIGNED,
        );
      });

      it("should allow adding and editing patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.EDIT)).toBe(true);
      });

      it("should NOT allow deleting patients", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Event Forms Module", () => {
      it("should allow full access to clinical forms for assigned patients", () => {
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.EDIT)).toBe(true);
        expect(getPermissionScope(role, Module.EVENT_FORMS, PermissionOperation.VIEW)).toBe(
          PermissionScope.ASSIGNED,
        );
      });

      it("should NOT allow deleting event forms", () => {
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Clinics Module", () => {
      it("should allow managing clinic information", () => {
        expect(hasPermission(role, Module.CLINICS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.CLINICS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.CLINICS, PermissionOperation.EDIT)).toBe(true);
      });
    });

    describe("Prescriptions Module", () => {
      it("should allow managing prescriptions for assigned patients", () => {
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.EDIT)).toBe(true);
      });
    });

    describe("Data Analysis Module", () => {
      it("should allow limited view of own patient data", () => {
        expect(hasPermission(role, Module.DATA_ANALYSIS, PermissionOperation.VIEW)).toBe(true);
        expect(getPermissionScope(role, Module.DATA_ANALYSIS, PermissionOperation.VIEW)).toBe(
          PermissionScope.OWN,
        );
      });
    });
  });

  describe("ADMIN Permissions", () => {
    const role = User.ROLES.ADMIN;

    describe("Patients Module", () => {
      it("should have full access except delete", () => {
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.EDIT)).toBe(true);
        expect(hasPermission(role, Module.PATIENTS, PermissionOperation.DELETE)).toBe(false);
        expect(getPermissionScope(role, Module.PATIENTS, PermissionOperation.VIEW)).toBe(
          PermissionScope.CLINIC_ADMIN,
        );
      });
    });

    describe("Event Forms Module", () => {
      it("should allow viewing and editing all forms in clinic", () => {
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.EVENT_FORMS, PermissionOperation.EDIT)).toBe(true);
      });
    });

    describe("Users Module", () => {
      it("should allow managing users within clinic", () => {
        expect(hasPermission(role, Module.USERS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.USERS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.USERS, PermissionOperation.EDIT)).toBe(true);
        
        const restrictions = getPermissionRestrictions(role, Module.USERS, PermissionOperation.ADD);
        expect(restrictions.some((r) => r.includes("super_admin"))).toBe(true);
      });

      it("should NOT allow deleting users", () => {
        expect(hasPermission(role, Module.USERS, PermissionOperation.DELETE)).toBe(false);
      });
    });

    describe("Prescriptions Module", () => {
      it("should allow viewing and editing (review/approve)", () => {
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.EDIT)).toBe(true);
      });

      it("should NOT allow creating prescriptions", () => {
        expect(hasPermission(role, Module.PRESCRIPTIONS, PermissionOperation.ADD)).toBe(false);
      });
    });

    describe("Data Analysis Module", () => {
      it("should allow viewing analytics", () => {
        expect(hasPermission(role, Module.DATA_ANALYSIS, PermissionOperation.VIEW)).toBe(true);
      });
    });

    describe("Settings Module", () => {
      it("should allow viewing settings", () => {
        expect(hasPermission(role, Module.SETTINGS, PermissionOperation.VIEW)).toBe(true);
      });
    });

    describe("Clinic Permissions Module", () => {
      it("should allow managing clinic permissions", () => {
        expect(hasPermission(role, Module.CLINIC_PERMISSIONS, PermissionOperation.VIEW)).toBe(true);
        expect(hasPermission(role, Module.CLINIC_PERMISSIONS, PermissionOperation.ADD)).toBe(true);
        expect(hasPermission(role, Module.CLINIC_PERMISSIONS, PermissionOperation.EDIT)).toBe(true);
      });
    });
  });

  describe("SUPER_ADMIN Permissions", () => {
    const role = User.ROLES.SUPER_ADMIN;

    it("should have full access to all modules", () => {
      const allModules = Object.values(Module);
      const allOperations = Object.values(PermissionOperation);

      allModules.forEach((module) => {
        allOperations.forEach((operation) => {
          expect(hasPermission(role, module, operation)).toBe(true);
          expect(getPermissionScope(role, module, operation)).toBe(PermissionScope.ALL);
        });
      });
    });

    it("should have system-wide scope for all operations", () => {
      expect(getPermissionScope(role, Module.PATIENTS, PermissionOperation.DELETE)).toBe(
        PermissionScope.ALL,
      );
      expect(getPermissionScope(role, Module.USERS, PermissionOperation.DELETE)).toBe(
        PermissionScope.ALL,
      );
      expect(getPermissionScope(role, Module.EVENT_FORMS, PermissionOperation.DELETE)).toBe(
        PermissionScope.ALL,
      );
    });
  });

  describe("Permission Matrix Structure", () => {
    it("should have all roles defined", () => {
      expect(PERMISSION_MATRIX[User.ROLES.REGISTRAR]).toBeDefined();
      expect(PERMISSION_MATRIX[User.ROLES.PROVIDER]).toBeDefined();
      expect(PERMISSION_MATRIX[User.ROLES.ADMIN]).toBeDefined();
      expect(PERMISSION_MATRIX[User.ROLES.SUPER_ADMIN]).toBeDefined();
    });

    it("should have all modules for each role", () => {
      const roles = Object.values(User.ROLES);
      const modules = Object.values(Module);

      roles.forEach((role) => {
        modules.forEach((module) => {
          expect(PERMISSION_MATRIX[role][module]).toBeDefined();
        });
      });
    });
  });

  describe("Permission Restrictions", () => {
    it("should have restrictions for registrar patient editing", () => {
      const restrictions = getPermissionRestrictions(
        User.ROLES.REGISTRAR,
        Module.PATIENTS,
        PermissionOperation.EDIT,
      );
      expect(restrictions.length).toBeGreaterThan(0);
      expect(restrictions.some((r) => r.includes("demographic"))).toBe(true);
    });

    it("should have restrictions for admin user creation", () => {
      const restrictions = getPermissionRestrictions(
        User.ROLES.ADMIN,
        Module.USERS,
        PermissionOperation.ADD,
      );
      expect(restrictions.some((r) => r.includes("super_admin"))).toBe(true);
    });

    it("should have restrictions for provider data analysis", () => {
      const restrictions = getPermissionRestrictions(
        User.ROLES.PROVIDER,
        Module.DATA_ANALYSIS,
        PermissionOperation.VIEW,
      );
      expect(restrictions.some((r) => r.includes("patients"))).toBe(true);
    });
  });

  describe("hasAnyPermission helper", () => {
    it("registrar should not have access to settings", () => {
      expect(hasAnyPermission(User.ROLES.REGISTRAR, Module.SETTINGS)).toBe(false);
    });

    it("provider should have access to patients", () => {
      expect(hasAnyPermission(User.ROLES.PROVIDER, Module.PATIENTS)).toBe(true);
    });

    it("admin should have access to all modules", () => {
      Object.values(Module).forEach((module) => {
        expect(hasAnyPermission(User.ROLES.ADMIN, module)).toBe(true);
      });
    });
  });

  describe("Specific Permission Rules from Matrix", () => {
    it("registrar can view prescriptions but not create them", () => {
      expect(hasPermission(User.ROLES.REGISTRAR, Module.PRESCRIPTIONS, PermissionOperation.VIEW)).toBe(
        true,
      );
      expect(hasPermission(User.ROLES.REGISTRAR, Module.PRESCRIPTIONS, PermissionOperation.ADD)).toBe(
        false,
      );
    });

    it("admin cannot add prescriptions", () => {
      expect(hasPermission(User.ROLES.ADMIN, Module.PRESCRIPTIONS, PermissionOperation.ADD)).toBe(
        false,
      );
    });

    it("admin can view but not add to data analysis", () => {
      expect(hasPermission(User.ROLES.ADMIN, Module.DATA_ANALYSIS, PermissionOperation.VIEW)).toBe(
        true,
      );
      expect(hasPermission(User.ROLES.ADMIN, Module.DATA_ANALYSIS, PermissionOperation.ADD)).toBe(
        false,
      );
    });

    it("provider has no access to user management", () => {
      expect(hasAnyPermission(User.ROLES.PROVIDER, Module.USERS)).toBe(false);
    });

    it("provider has no access to settings", () => {
      expect(hasAnyPermission(User.ROLES.PROVIDER, Module.SETTINGS)).toBe(false);
    });

    it("provider has no access to clinic permissions", () => {
      expect(hasAnyPermission(User.ROLES.PROVIDER, Module.CLINIC_PERMISSIONS)).toBe(false);
    });
  });
});

