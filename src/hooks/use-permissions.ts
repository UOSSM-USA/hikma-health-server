/**
 * React hooks for permission checking in UI components
 * Provides easy-to-use hooks for checking permissions based on user context
 */

import { useMemo } from "react";
import {
  Module,
  PermissionOperation,
  hasPermission,
  getPermissionScope,
  hasAnyPermission,
  getModulePermissions,
  type ModulePermissions,
} from "@/models/permissions";
import type User from "@/models/user";

/**
 * Hook to check if current user has a specific permission
 * @param role - User's role
 * @param module - Module to check
 * @param operation - Operation to check
 * @returns boolean indicating if user has permission
 */
export function useHasPermission(
  role: User.RoleT | null | undefined,
  module: Module,
  operation: PermissionOperation,
): boolean {
  return useMemo(() => {
    if (!role) return false;
    return hasPermission(role, module, operation);
  }, [role, module, operation]);
}

/**
 * Hook to check if current user has any permission on a module
 * @param role - User's role
 * @param module - Module to check
 * @returns boolean indicating if user has any access to the module
 */
export function useHasAnyPermission(
  role: User.RoleT | null | undefined,
  module: Module,
): boolean {
  return useMemo(() => {
    if (!role) return false;
    return hasAnyPermission(role, module);
  }, [role, module]);
}

/**
 * Hook to get all permissions for a module
 * @param role - User's role
 * @param module - Module to check
 * @returns ModulePermissions object with all operations and their scopes
 */
export function useModulePermissions(
  role: User.RoleT | null | undefined,
  module: Module,
): ModulePermissions {
  return useMemo(() => {
    if (!role) return {};
    return getModulePermissions(role, module);
  }, [role, module]);
}

/**
 * Hook to get comprehensive permission checks for a module
 * Returns an object with boolean flags for each CRUD operation
 * @param role - User's role
 * @param module - Module to check
 * @returns Object with canView, canAdd, canEdit, canDelete flags
 */
export function useModuleCRUD(
  role: User.RoleT | null | undefined,
  module: Module,
): {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
} {
  return useMemo(() => {
    if (!role) {
      return {
        canView: false,
        canAdd: false,
        canEdit: false,
        canDelete: false,
      };
    }

    return {
      canView: hasPermission(role, module, PermissionOperation.VIEW),
      canAdd: hasPermission(role, module, PermissionOperation.ADD),
      canEdit: hasPermission(role, module, PermissionOperation.EDIT),
      canDelete: hasPermission(role, module, PermissionOperation.DELETE),
    };
  }, [role, module]);
}

/**
 * Hook to get all accessible modules for current user
 * @param role - User's role
 * @returns Array of modules the user has access to
 */
export function useAccessibleModules(
  role: User.RoleT | null | undefined,
): Module[] {
  return useMemo(() => {
    if (!role) return [];
    return Object.values(Module).filter((module) =>
      hasAnyPermission(role, module),
    );
  }, [role]);
}

/**
 * Hook for patient module permissions
 * @param role - User's role
 * @returns CRUD permissions for patients
 */
export function usePatientPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.PATIENTS);
}

/**
 * Hook for event forms module permissions
 * @param role - User's role
 * @returns CRUD permissions for event forms
 */
export function useEventFormPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.EVENT_FORMS);
}

/**
 * Hook for users module permissions
 * @param role - User's role
 * @returns CRUD permissions for users
 */
export function useUserPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.USERS);
}

/**
 * Hook for clinics module permissions
 * @param role - User's role
 * @returns CRUD permissions for clinics
 */
export function useClinicPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.CLINICS);
}

/**
 * Hook for appointments module permissions
 * @param role - User's role
 * @returns CRUD permissions for appointments
 */
export function useAppointmentPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.APPOINTMENTS);
}

/**
 * Hook for prescriptions module permissions
 * @param role - User's role
 * @returns CRUD permissions for prescriptions
 */
export function usePrescriptionPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.PRESCRIPTIONS);
}

/**
 * Hook for data analysis module permissions
 * @param role - User's role
 * @returns CRUD permissions for data analysis
 */
export function useDataAnalysisPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.DATA_ANALYSIS);
}

/**
 * Hook for settings module permissions
 * @param role - User's role
 * @returns CRUD permissions for settings
 */
export function useSettingsPermissions(role: User.RoleT | null | undefined) {
  return useModuleCRUD(role, Module.SETTINGS);
}

/**
 * Hook for clinic permissions module permissions
 * @param role - User's role
 * @returns CRUD permissions for clinic permissions
 */
export function useClinicPermissionsPermissions(
  role: User.RoleT | null | undefined,
) {
  return useModuleCRUD(role, Module.CLINIC_PERMISSIONS);
}

/**
 * Hook to check if user is admin or super admin
 * @param role - User's role
 * @returns boolean indicating if user is admin or super admin
 */
export function useIsAdmin(role: User.RoleT | null | undefined): boolean {
  return useMemo(() => {
    if (!role) return false;
    return role === "admin" || role === "super_admin" || role === "super_admin_2";
  }, [role]);
}

/**
 * Hook to check if user is super admin (including super_admin_2)
 * @param role - User's role
 * @returns boolean indicating if user is super admin
 */
export function useIsSuperAdmin(role: User.RoleT | null | undefined): boolean {
  return useMemo(() => {
    if (!role) return false;
    return role === "super_admin" || role === "super_admin_2";
  }, [role]);
}

/**
 * Hook to check if user is full super admin (can delete)
 * @param role - User's role
 * @returns boolean indicating if user is full super admin
 */
export function useIsFullSuperAdmin(role: User.RoleT | null | undefined): boolean {
  return useMemo(() => {
    if (!role) return false;
    return role === "super_admin";
  }, [role]);
}

/**
 * Hook to get permission scope for a specific operation
 * @param role - User's role
 * @param module - Module to check
 * @param operation - Operation to check
 * @returns The permission scope (NONE, OWN, ASSIGNED, CLINIC, CLINIC_ADMIN, ALL)
 */
export function usePermissionScope(
  role: User.RoleT | null | undefined,
  module: Module,
  operation: PermissionOperation,
) {
  return useMemo(() => {
    if (!role) return null;
    return getPermissionScope(role, module, operation);
  }, [role, module, operation]);
}

