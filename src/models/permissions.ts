/**
 * Comprehensive Role-Based Permission System
 * Based on UOSSM Hikma Role-Based Permission Matrix
 * 
 * This module defines all permissions across the system for each role.
 * Permissions are organized by module and operation (View, Add, Edit, Delete).
 */

import User from "./user";

/**
 * Permission operations (CRUD)
 */
export enum PermissionOperation {
  VIEW = "view",
  ADD = "add",
  EDIT = "edit",
  DELETE = "delete",
}

/**
 * System modules
 */
export enum Module {
  PATIENTS = "patients",
  EVENT_FORMS = "event_forms",
  USERS = "users",
  CLINICS = "clinics",
  APPOINTMENTS = "appointments",
  PRESCRIPTIONS = "prescriptions",
  DATA_ANALYSIS = "data_analysis",
  SETTINGS = "settings",
  CLINIC_PERMISSIONS = "clinic_permissions",
}

/**
 * Permission scope - defines the boundaries of a permission
 */
export enum PermissionScope {
  NONE = "none",                      // No access
  OWN = "own",                        // Only own records
  ASSIGNED = "assigned",              // Only assigned records (e.g., assigned patients)
  CLINIC = "clinic",                  // Within assigned clinic(s)
  CLINIC_ADMIN = "clinic_admin",      // Admin access within clinic
  ALL = "all",                        // System-wide access
}

/**
 * Permission definition with scope and restrictions
 */
export interface Permission {
  operation: PermissionOperation;
  scope: PermissionScope;
  restrictions?: string[];            // Additional restrictions or notes
}

/**
 * Module permissions for a specific role
 */
export type ModulePermissions = {
  [key in PermissionOperation]?: {
    scope: PermissionScope;
    restrictions?: string[];
  };
};

/**
 * Complete permission matrix
 * Maps each role to their permissions per module
 */
export const PERMISSION_MATRIX: Record<
  User.RoleT,
  Record<Module, ModulePermissions>
> = {
  /**
   * REGISTRAR PERMISSIONS
   * - Limited to patient registration and demographic data
   * - Can schedule appointments
   * - Can view prescriptions (read-only)
   * - No access to clinical data, user management, or system settings
   */
  registrar: {
    [Module.PATIENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can view patients within assigned clinic"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can register new patients"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.OWN,
        restrictions: [
          "Can edit only demographic and registration info they entered",
          "Cannot edit clinical data",
        ],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete patients"],
      },
    },
    [Module.EVENT_FORMS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.NONE,
        restrictions: [
          "No access to clinical event forms",
          "Limited to intake/registration events only",
        ],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot create clinical forms"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot modify provider forms"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
      },
    },
    [Module.USERS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.NONE,
        restrictions: ["No access to user management"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.CLINICS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.NONE,
        restrictions: ["No access to clinic information"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.APPOINTMENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can view appointments within assigned clinic"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can schedule appointments"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can update and cancel appointments"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete appointments (use cancel instead)"],
      },
    },
    [Module.PRESCRIPTIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["View only after provider submits prescription"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.DATA_ANALYSIS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.NONE,
        restrictions: ["No access to reports or dashboards"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.SETTINGS]: {
      [PermissionOperation.VIEW]: { scope: PermissionScope.NONE },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.CLINIC_PERMISSIONS]: {
      [PermissionOperation.VIEW]: { scope: PermissionScope.NONE },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
  },

  /**
   * PROVIDER PERMISSIONS
   * - Full access to assigned patients' clinical data
   * - Can create and edit clinical event forms
   * - Can manage prescriptions for assigned patients
   * - Can view limited analytics for their patients
   * - Can manage clinic information
   * - No access to user management or system settings
   */
  provider: {
    [Module.PATIENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can view assigned patients"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can add patients within clinic"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can update assigned patients' clinical notes only"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete patients"],
      },
    },
    [Module.EVENT_FORMS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can view clinical forms for assigned patients"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: [
          "Can create clinical encounter forms for assigned patients",
        ],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can edit clinical forms for assigned patients"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete event forms"],
      },
    },
    [Module.USERS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.NONE,
        restrictions: ["No access to user management"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.CLINICS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can view clinic information"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can add clinic information"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC,
        restrictions: ["Can edit clinic information"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.APPOINTMENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.OWN,
        restrictions: ["Can view their own appointments"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.OWN,
        restrictions: ["Can create their own appointments"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.OWN,
        restrictions: ["Can update their own appointments"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.PRESCRIPTIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can view prescriptions for assigned patients"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can issue prescriptions for assigned patients"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ASSIGNED,
        restrictions: ["Can update prescriptions for assigned patients"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.DATA_ANALYSIS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.OWN,
        restrictions: ["Can view limited dashboards related to their patients"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.SETTINGS]: {
      [PermissionOperation.VIEW]: { scope: PermissionScope.NONE },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.CLINIC_PERMISSIONS]: {
      [PermissionOperation.VIEW]: { scope: PermissionScope.NONE },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
  },

  /**
   * ADMIN PERMISSIONS
   * - Full access to patients within assigned clinic(s)
   * - Can review all event forms (but not create new ones per matrix)
   * - Can manage users within their clinic
   * - Can manage clinic information and assign providers
   * - Can manage appointments for their clinic
   * - Can review and approve prescriptions
   * - Can view analytics and export reports
   * - Can manage settings and clinic permissions
   * - Clinic-scoped, not system-wide
   */
  admin: {
    [Module.PATIENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view all patients in assigned clinic(s)"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can add patients in assigned clinic(s)"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can merge or correct duplicate records"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete patients"],
      },
    },
    [Module.EVENT_FORMS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can review all forms in assigned clinic(s)"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can add event forms"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can edit event forms in assigned clinic(s)"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.USERS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view users within their clinic"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: [
          "Can create users within their clinic",
          "Cannot create super_admin users",
        ],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: [
          "Can edit users within their clinic",
          "Cannot edit super_admin users",
        ],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Cannot delete users"],
      },
    },
    [Module.CLINICS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view assigned clinic(s)"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can add clinic information"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Manage clinic information and assign providers"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.APPOINTMENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: [
          "Full control over appointments for assigned clinic(s)",
          "Not all clinics, unless assigned to multiple clinics",
        ],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can create appointments in assigned clinic(s)"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can edit appointments in assigned clinic(s)"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.PRESCRIPTIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view prescriptions in assigned clinic(s)"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Review and approve if needed"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.DATA_ANALYSIS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view analytics and export reports"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.SETTINGS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Manage reference lists and form visibility per clinic"],
      },
      [PermissionOperation.ADD]: { scope: PermissionScope.NONE },
      [PermissionOperation.EDIT]: { scope: PermissionScope.NONE },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
    [Module.CLINIC_PERMISSIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can view clinic permissions"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can assign users to clinics"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.CLINIC_ADMIN,
        restrictions: ["Can modify clinic permissions"],
      },
      [PermissionOperation.DELETE]: { scope: PermissionScope.NONE },
    },
  },

  /**
   * SUPER ADMIN 2 PERMISSIONS
   * - Full system-wide access to all modules
   * - Can View, Add, and Edit but NOT Delete
   * - Same as Super Admin except no deletion privileges
   */
  super_admin_2: {
    [Module.PATIENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete patients"],
      },
    },
    [Module.EVENT_FORMS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete event forms"],
      },
    },
    [Module.USERS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full system-wide user control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Can create users except super_admin role"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Can edit users except super_admin role"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete users"],
      },
    },
    [Module.CLINICS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete clinics"],
      },
    },
    [Module.APPOINTMENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete appointments"],
      },
    },
    [Module.PRESCRIPTIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete prescriptions"],
      },
    },
    [Module.DATA_ANALYSIS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete analytics data"],
      },
    },
    [Module.SETTINGS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete settings"],
      },
    },
    [Module.CLINIC_PERMISSIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.NONE,
        restrictions: ["Super Admin 2 cannot delete permissions"],
      },
    },
  },

  /**
   * SUPER ADMIN PERMISSIONS
   * - Full system-wide access to all modules
   * - Can perform all operations (View, Add, Edit, Delete)
   * - No restrictions except for safety measures (e.g., cannot delete self)
   */
  super_admin: {
    [Module.PATIENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["System-wide access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control; can delete patients if required"],
      },
    },
    [Module.EVENT_FORMS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to all event data"],
      },
    },
    [Module.USERS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full system-wide user control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full system-wide user control"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full system-wide user control"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full system-wide user control"],
      },
    },
    [Module.CLINICS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
    },
    [Module.APPOINTMENTS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
    },
    [Module.PRESCRIPTIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access"],
      },
    },
    [Module.DATA_ANALYSIS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full access to analytical modules and configurations"],
      },
    },
    [Module.SETTINGS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control of system parameters"],
      },
    },
    [Module.CLINIC_PERMISSIONS]: {
      [PermissionOperation.VIEW]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.ADD]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.EDIT]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
      [PermissionOperation.DELETE]: {
        scope: PermissionScope.ALL,
        restrictions: ["Full control"],
      },
    },
  },
};

/**
 * Check if a role has permission for a specific operation on a module
 * @param role - The user's role
 * @param module - The module to check
 * @param operation - The operation to check
 * @returns true if the role has permission, false otherwise
 */
export function hasPermission(
  role: User.RoleT,
  module: Module,
  operation: PermissionOperation,
): boolean {
  const modulePermissions = PERMISSION_MATRIX[role]?.[module];
  if (!modulePermissions) return false;

  const permission = modulePermissions[operation];
  if (!permission) return false;

  return permission.scope !== PermissionScope.NONE;
}

/**
 * Get the permission scope for a specific role, module, and operation
 * @param role - The user's role
 * @param module - The module to check
 * @param operation - The operation to check
 * @returns The permission scope, or NONE if no permission exists
 */
export function getPermissionScope(
  role: User.RoleT,
  module: Module,
  operation: PermissionOperation,
): PermissionScope {
  const modulePermissions = PERMISSION_MATRIX[role]?.[module];
  if (!modulePermissions) return PermissionScope.NONE;

  const permission = modulePermissions[operation];
  if (!permission) return PermissionScope.NONE;

  return permission.scope;
}

/**
 * Get all restrictions for a specific role, module, and operation
 * @param role - The user's role
 * @param module - The module to check
 * @param operation - The operation to check
 * @returns Array of restriction strings, or empty array if no restrictions
 */
export function getPermissionRestrictions(
  role: User.RoleT,
  module: Module,
  operation: PermissionOperation,
): string[] {
  const modulePermissions = PERMISSION_MATRIX[role]?.[module];
  if (!modulePermissions) return [];

  const permission = modulePermissions[operation];
  if (!permission || !permission.restrictions) return [];

  return permission.restrictions;
}

/**
 * Get all permissions for a specific role and module
 * @param role - The user's role
 * @param module - The module to check
 * @returns Object with all operations and their scopes
 */
export function getModulePermissions(
  role: User.RoleT,
  module: Module,
): ModulePermissions {
  return PERMISSION_MATRIX[role]?.[module] || {};
}

/**
 * Check if a role can perform any operation on a module
 * @param role - The user's role
 * @param module - The module to check
 * @returns true if the role has any permission on the module
 */
export function hasAnyPermission(role: User.RoleT, module: Module): boolean {
  const modulePermissions = PERMISSION_MATRIX[role]?.[module];
  if (!modulePermissions) return false;

  return Object.values(modulePermissions).some(
    (permission) => permission.scope !== PermissionScope.NONE,
  );
}

/**
 * Get a human-readable description of a permission
 * @param role - The user's role
 * @param module - The module
 * @param operation - The operation
 * @returns A human-readable description
 */
export function getPermissionDescription(
  role: User.RoleT,
  module: Module,
  operation: PermissionOperation,
): string {
  const scope = getPermissionScope(role, module, operation);
  const restrictions = getPermissionRestrictions(role, module, operation);

  if (scope === PermissionScope.NONE) {
    return "No access";
  }

  let description = `Can ${operation} ${module}`;

  switch (scope) {
    case PermissionScope.OWN:
      description += " (own records only)";
      break;
    case PermissionScope.ASSIGNED:
      description += " (assigned records only)";
      break;
    case PermissionScope.CLINIC:
      description += " (within clinic)";
      break;
    case PermissionScope.CLINIC_ADMIN:
      description += " (clinic admin access)";
      break;
    case PermissionScope.ALL:
      description += " (system-wide)";
      break;
  }

  if (restrictions.length > 0) {
    description += `. Restrictions: ${restrictions.join("; ")}`;
  }

  return description;
}

export default {
  Module,
  PermissionOperation,
  PermissionScope,
  PERMISSION_MATRIX,
  hasPermission,
  getPermissionScope,
  getPermissionRestrictions,
  getModulePermissions,
  hasAnyPermission,
  getPermissionDescription,
};

