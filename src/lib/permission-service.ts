/**
 * Permission Service
 * Provides permission checking with context awareness (role, clinic, ownership)
 */

import {
  Module,
  PermissionOperation,
  PermissionScope,
  hasPermission,
  getPermissionScope,
} from "@/models/permissions";
import User from "@/models/user";
import { serverOnly } from "@tanstack/react-start";
import db from "@/db";

/**
 * Context for permission checks
 */
export interface PermissionContext {
  userId: string;
  role: User.RoleT;
  clinicIds: string[];         // Clinics the user has access to
  isSuperAdmin: boolean;
  isClinicAdmin: boolean;
}

/**
 * Resource context for permission checks
 */
export interface ResourceContext {
  clinicId?: string | null;
  ownerId?: string | null;      // The user who created/owns the resource
  providerId?: string | null;   // For provider-assigned resources
  patientId?: string | null;    // For checking provider-patient assignments
  patientClinicId?: string | null; // For patient-related resources
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Permission Service
 */
export class PermissionService {
  /**
   * Check if a user has permission to perform an operation on a module
   * This is the main permission checking function that considers scope and context
   */
  static check(
    context: PermissionContext,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): PermissionCheckResult {
    // First, check if the role has the permission at all
    if (!hasPermission(context.role, module, operation)) {
      return {
        allowed: false,
        reason: `Role ${context.role} does not have ${operation} permission for ${module}`,
      };
    }

    // Get the permission scope
    const scope = getPermissionScope(context.role, module, operation);

    // Check scope-specific requirements
    switch (scope) {
      case PermissionScope.NONE:
        return {
          allowed: false,
          reason: "No permission scope",
        };

      case PermissionScope.ALL:
        // Super admin has unrestricted access
        return { allowed: true };

      case PermissionScope.OWN:
        // User can only access their own resources
        if (!resource?.ownerId) {
          // If no owner specified, assume checking for creation (allowed)
          return { allowed: true };
        }
        if (resource.ownerId !== context.userId) {
          return {
            allowed: false,
            reason: "Can only access own resources",
          };
        }
        return { allowed: true };

      case PermissionScope.ASSIGNED:
        // For providers: can access assigned patients
        // Providers are "assigned" to patients through visits, appointments, or prescriptions
        
        // If no provider or patient ID specified, allow (for creation scenarios)
        if (!resource?.providerId && !resource?.patientId) {
          return { allowed: true };
        }
        
        // If providerId is explicitly specified (e.g., on a prescription/appointment),
        // check if it matches the current user
        if (resource.providerId && resource.providerId !== context.userId) {
          return {
            allowed: false,
            reason: "Can only access resources assigned to you",
          };
        }
        
        // If patientId is specified, check if provider has treated this patient
        // This checks visits, appointments, or prescriptions tables for assignment
        if (resource.patientId) {
          // For now, we trust the explicit providerId check above
          // In stricter mode, you could query DB to verify assignment:
          // const isAssigned = await this.checkProviderPatientAssignment(
          //   context.userId, resource.patientId
          // );
          // if (!isAssigned) return { allowed: false, reason: "Not assigned to this patient" };
          return { allowed: true };
        }
        
        return { allowed: true };

      case PermissionScope.CLINIC:
        // User can access resources within their clinic(s)
        if (!resource?.clinicId && !resource?.patientClinicId) {
          // If no clinic specified, assume checking for creation (allowed)
          return { allowed: true };
        }
        const resourceClinic = resource.clinicId || resource.patientClinicId;
        if (resourceClinic && !context.clinicIds.includes(resourceClinic)) {
          return {
            allowed: false,
            reason: "Resource belongs to a different clinic",
          };
        }
        return { allowed: true };

      case PermissionScope.CLINIC_ADMIN:
        // Admin access within assigned clinics
        if (!context.isClinicAdmin && !context.isSuperAdmin) {
          return {
            allowed: false,
            reason: "Requires clinic admin privileges",
          };
        }
        // Check clinic scope
        if (!resource?.clinicId && !resource?.patientClinicId) {
          return { allowed: true };
        }
        const adminResourceClinic = resource.clinicId || resource.patientClinicId;
        if (
          !context.isSuperAdmin &&
          adminResourceClinic &&
          !context.clinicIds.includes(adminResourceClinic)
        ) {
          return {
            allowed: false,
            reason: "Resource belongs to a different clinic",
          };
        }
        return { allowed: true };

      default:
        return {
          allowed: false,
          reason: "Unknown permission scope",
        };
    }
  }

  /**
   * Check permission and throw error if not allowed
   */
  static checkOrThrow(
    context: PermissionContext,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): void {
    const result = this.check(context, module, operation, resource);
    if (!result.allowed) {
      throw new Error(result.reason || "Permission denied");
    }
  }

  /**
   * Check if user can view a module (shorthand)
   */
  static canView(
    context: PermissionContext,
    module: Module,
    resource?: ResourceContext,
  ): boolean {
    return this.check(context, module, PermissionOperation.VIEW, resource)
      .allowed;
  }

  /**
   * Check if user can add to a module (shorthand)
   */
  static canAdd(
    context: PermissionContext,
    module: Module,
    resource?: ResourceContext,
  ): boolean {
    return this.check(context, module, PermissionOperation.ADD, resource)
      .allowed;
  }

  /**
   * Check if user can edit in a module (shorthand)
   */
  static canEdit(
    context: PermissionContext,
    module: Module,
    resource?: ResourceContext,
  ): boolean {
    return this.check(context, module, PermissionOperation.EDIT, resource)
      .allowed;
  }

  /**
   * Check if user can delete from a module (shorthand)
   */
  static canDelete(
    context: PermissionContext,
    module: Module,
    resource?: ResourceContext,
  ): boolean {
    return this.check(context, module, PermissionOperation.DELETE, resource)
      .allowed;
  }

  /**
   * Get all modules a user has access to
   */
  static getAccessibleModules(context: PermissionContext): Module[] {
    return Object.values(Module).filter((module) =>
      this.canView(context, module),
    );
  }

  /**
   * Create a permission context from user data
   */
  static async createContext(
    userId: string,
    role: User.RoleT,
    clinicIds: string[],
    isClinicAdmin: boolean,
  ): Promise<PermissionContext> {
    return {
      userId,
      role,
      clinicIds,
      isSuperAdmin: role === User.ROLES.SUPER_ADMIN || role === User.ROLES.SUPER_ADMIN_2,
      isClinicAdmin,
    };
  }

  /**
   * Check if a provider is assigned to a patient
   * A provider is considered "assigned" if they have any visits, appointments, or prescriptions for the patient
   * 
   * @param providerId - The provider's user ID
   * @param patientId - The patient's ID
   * @returns Promise<boolean> - True if provider has treated this patient
   */
  static async checkProviderPatientAssignment(
    providerId: string,
    patientId: string,
  ): Promise<boolean> {
    // Check if provider has any visits with this patient
    const visit = await db
      .selectFrom("visits")
      .where("provider_id", "=", providerId)
      .where("patient_id", "=", patientId)
      .where("is_deleted", "=", false)
      .select("id")
      .limit(1)
      .executeTakeFirst();

    if (visit) return true;

    // Check if provider has any appointments with this patient
    const appointment = await db
      .selectFrom("appointments")
      .where("provider_id", "=", providerId)
      .where("patient_id", "=", patientId)
      .where("is_deleted", "=", false)
      .select("id")
      .limit(1)
      .executeTakeFirst();

    if (appointment) return true;

    // Check if provider has any prescriptions for this patient
    const prescription = await db
      .selectFrom("prescriptions")
      .where("provider_id", "=", providerId)
      .where("patient_id", "=", patientId)
      .where("is_deleted", "=", false)
      .select("id")
      .limit(1)
      .executeTakeFirst();

    return !!prescription;
  }

  /**
   * Check permission with strict provider-patient assignment verification
   * This is an enhanced version that queries the database to verify assignments
   * 
   * Use this for sensitive operations that require strict verification
   */
  static async checkWithAssignmentVerification(
    context: PermissionContext,
    module: Module,
    operation: PermissionOperation,
    resource?: ResourceContext,
  ): Promise<PermissionCheckResult> {
    // First do basic permission check
    const basicCheck = this.check(context, module, operation, resource);
    if (!basicCheck.allowed) {
      return basicCheck;
    }

    // If ASSIGNED scope and patientId provided, verify actual assignment
    const scope = getPermissionScope(context.role, module, operation);
    if (
      scope === PermissionScope.ASSIGNED &&
      resource?.patientId &&
      !context.isSuperAdmin
    ) {
      const isAssigned = await this.checkProviderPatientAssignment(
        context.userId,
        resource.patientId,
      );

      if (!isAssigned) {
        return {
          allowed: false,
          reason:
            "Provider not assigned to this patient (no visits, appointments, or prescriptions)",
        };
      }
    }

    return { allowed: true };
  }
}

/**
 * Permission checking decorator for server functions
 * Usage: @requirePermission(Module.PATIENTS, PermissionOperation.VIEW)
 */
export function requirePermission(
  module: Module,
  operation: PermissionOperation,
) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = serverOnly(async function (this: any, ...args: any[]) {
      // Assume first arg contains context
      const context = args[0]?.context as PermissionContext;
      if (!context) {
        throw new Error("Permission context not found");
      }

      PermissionService.checkOrThrow(context, module, operation);

      return originalMethod.apply(this, args);
    });

    return descriptor;
  };
}

export default PermissionService;

