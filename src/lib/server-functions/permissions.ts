/**
 * Permission helper functions for server functions
 * These functions integrate with the permission service and middleware context
 */

import { serverOnly } from "@tanstack/react-start";
import PermissionService, {
  type PermissionContext,
  type ResourceContext,
} from "@/lib/permission-service";
import {
  Module,
  PermissionOperation,
} from "@/models/permissions";
import type User from "@/models/user";

/**
 * Create a permission context from middleware context
 */
export const createPermissionContext = serverOnly(
  (context: {
    userId: string | null;
    role: User.RoleT | null;
    clinicIds: string[];
    isClinicAdmin: boolean;
    isSuperAdmin: boolean;
  }): PermissionContext | null => {
    if (!context.userId || !context.role) {
      return null;
    }

    return {
      userId: context.userId,
      role: context.role,
      clinicIds: context.clinicIds,
      isClinicAdmin: context.isClinicAdmin,
      isSuperAdmin: context.isSuperAdmin,
    };
  },
);

/**
 * Check permission or throw error
 */
export const checkPermission = serverOnly(
  (
    context: PermissionContext | null,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    if (!context) {
      throw new Error("Unauthorized: No permission context");
    }

    PermissionService.checkOrThrow(context, module, operation, resource);
  },
);

/**
 * Check if user has permission (returns boolean)
 */
export const hasPermission = serverOnly(
  (
    context: PermissionContext | null,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): boolean => {
    if (!context) {
      return false;
    }

    return PermissionService.check(context, module, operation, resource).allowed;
  },
);

/**
 * Check permission with strict database verification of assignments
 * Use this for sensitive operations that require verification of provider-patient assignments
 */
export const checkPermissionStrict = serverOnly(
  async (
    context: PermissionContext | null,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): Promise<void> => {
    if (!context) {
      throw new Error("Unauthorized: No permission context");
    }

    const result = await PermissionService.checkWithAssignmentVerification(
      context,
      module,
      operation,
      resource,
    );

    if (!result.allowed) {
      throw new Error(result.reason || "Permission denied");
    }
  },
);

/**
 * Module-specific permission checkers
 */

// Patients
export const checkPatientPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.PATIENTS, operation, resource);
  },
);

// Event Forms
export const checkEventFormPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.EVENT_FORMS, operation, resource);
  },
);

// Users
export const checkUserPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.USERS, operation, resource);
  },
);

// Clinics
export const checkClinicPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.CLINICS, operation, resource);
  },
);

// Appointments
export const checkAppointmentPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.APPOINTMENTS, operation, resource);
  },
);

// Prescriptions
export const checkPrescriptionPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.PRESCRIPTIONS, operation, resource);
  },
);

// Data Analysis
export const checkDataAnalysisPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.DATA_ANALYSIS, operation, resource);
  },
);

// Settings
export const checkSettingsPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.SETTINGS, operation, resource);
  },
);

// Clinic Permissions
export const checkClinicPermissionsPermission = serverOnly(
  (
    context: PermissionContext | null,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void => {
    checkPermission(context, Module.CLINIC_PERMISSIONS, operation, resource);
  },
);

/**
 * Batch permission check - check multiple permissions at once
 */
export const checkMultiplePermissions = serverOnly(
  (
    context: PermissionContext | null,
    checks: Array<{
      module: Module;
      operation: PermissionOperation;
      resource?: ResourceContext;
    }>,
  ): void => {
    for (const check of checks) {
      checkPermission(context, check.module, check.operation, check.resource);
    }
  },
);

/**
 * Get accessible modules for a user
 */
export const getAccessibleModules = serverOnly(
  (context: PermissionContext | null): Module[] => {
    if (!context) {
      return [];
    }

    return PermissionService.getAccessibleModules(context);
  },
);

export default {
  createPermissionContext,
  checkPermission,
  checkPermissionStrict,
  hasPermission,
  checkPatientPermission,
  checkEventFormPermission,
  checkUserPermission,
  checkClinicPermission,
  checkAppointmentPermission,
  checkPrescriptionPermission,
  checkDataAnalysisPermission,
  checkSettingsPermission,
  checkClinicPermissionsPermission,
  checkMultiplePermissions,
  getAccessibleModules,
};

