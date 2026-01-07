import { createServerFn } from "@tanstack/react-start";
import Event from "@/models/event";
import Patient from "@/models/patient";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkEventFormPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import User from "@/models/user";
import db from "@/db";

// Configuration: Form editing window in days (3 months = 90 days)
const FORM_EDIT_WINDOW_DAYS = 90;

// Helper to check if an event is within the editing window
const isWithinEditWindow = (createdAt: Date | string): boolean => {
  const createdDate = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = new Date();
  const daysSinceCreation = Math.floor(
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceCreation <= FORM_EDIT_WINDOW_DAYS;
};

// Helper to check if user can edit event directly (within 3 months) or needs approval
const canEditDirectly = (
  event: Event.EncodedT,
  userId: string | null,
  role: string | null
): { canEdit: boolean; requiresApproval: boolean; reason?: string } => {
  // Super admins and supervisors can always edit
  if (hasFullAccess(role)) {
    return { canEdit: true, requiresApproval: false };
  }

  // Check if user is the creator
  const createdBy = event.metadata?.created_by;
  const isCreator = createdBy === userId;

  if (!isCreator) {
    // Non-creators need approval (for health facility roles, this is handled by permission checks)
    return {
      canEdit: false,
      requiresApproval: true,
      reason: "You can only edit forms you created",
    };
  }

  // Creator can edit if within 3-month window
  const withinWindow = isWithinEditWindow(event.created_at);
  if (withinWindow) {
    return { canEdit: true, requiresApproval: false };
  }

  // After 3 months, creator needs approval
  return {
    canEdit: false,
    requiresApproval: true,
    reason: "This form is older than 3 months. Please request approval to edit.",
  };
};

// Helper to check if a role is a caseworker (Orphan Project)
const isCaseworkerRole = (role: string | null): boolean => {
  if (!role) return false;
  return [
    User.ROLES.CASEWORKER_1,
    User.ROLES.CASEWORKER_2,
    User.ROLES.CASEWORKER_3,
    User.ROLES.CASEWORKER_4,
  ].includes(role as any);
};

// Helper to check if a role is a health facility role (doctors, nurses, pharmacists)
// Health facility staff should have shared access to all forms within their clinic
const isHealthFacilityRole = (role: string | null): boolean => {
  if (!role) return false;
  return [
    User.ROLES.PROVIDER,
    User.ROLES.REGISTRAR,
    User.ROLES.ADMIN,
  ].includes(role as any);
};

// Helper to check if a role has full access (can see all events)
// Includes: Supervisors (Orphan Project), Health Facility roles, and Super Admins
const hasFullAccess = (role: string | null): boolean => {
  if (!role) return false;
  return [
    // Orphan Project Supervisors
    User.ROLES.PROJECT_MANAGER,
    User.ROLES.TECHNICAL_ADVISOR,
    User.ROLES.TEAM_LEADER,
    User.ROLES.ME_OFFICER,
    User.ROLES.IM_ASSOCIATE,
    // Health Facility Roles (shared access within clinic)
    User.ROLES.PROVIDER,
    User.ROLES.REGISTRAR,
    User.ROLES.ADMIN,
    // Super Admins
    User.ROLES.SUPER_ADMIN,
    User.ROLES.SUPER_ADMIN_2,
  ].includes(role as any);
};

/**
 * Get all events by form id with pagination
 * @returns {Promise<{ events: Event.EncodedT[], pagination: { total: number, offset: number, limit: number, hasMore: boolean } }>} - The list of events and pagination info
 */
export const getEventsByFormId = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator(
    (data: { form_id: string; limit?: number; offset?: number }) => data,
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      events: Event.EncodedT[];
      pagination: {
        total: number;
        offset: number;
        limit: number;
        hasMore: boolean;
      };
    }> => {
      const limit = data.limit || 50;
      const offset = data.offset || 0;
      let result = await Event.API.getAllByFormId(data.form_id, {
        limit,
        offset,
        includeCount: true,
      });

      // Form Visibility & Access Control (5.2):
      // - Health Facility roles (PROVIDER, REGISTRAR, ADMIN): See all events within their clinic (shared access)
      // - Orphan Project Caseworkers (CASEWORKER_1-4): Only see their own events
      // - Orphan Project Supervisors (TEAM_LEADER, ME_OFFICER, IM_ASSOCIATE, etc.): See all events
      // - Super Admins: See all events
      if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
        // Orphan Project caseworkers can only see their own events
        result = result.filter((event) => {
          const createdBy = event.metadata?.created_by;
          return createdBy === context.userId;
        });
      }
      // Health facility roles and supervisors have full access (no filtering needed)

      return {
        events: result,
        pagination: {
          total: result.length,
          offset,
          limit,
          hasMore: result.length >= limit,
        },
      };
    },
  );

/**
 * Get all events by patient id
 * @returns {Promise<Event.EncodedT[]>} - The list of events for the patient
 */
export const getEventsByPatientId = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator((data: { patient_id: string }) => data)
  .handler(async ({ data, context }): Promise<Event.EncodedT[]> => {
    let events = await Event.API.getByPatientId(data.patient_id);

    // Form Visibility & Access Control (5.2):
    // - Health Facility roles (PROVIDER, REGISTRAR, ADMIN): See all events within their clinic (shared access)
    // - Orphan Project Caseworkers (CASEWORKER_1-4): Only see their own events
    // - Orphan Project Supervisors (TEAM_LEADER, ME_OFFICER, IM_ASSOCIATE, etc.): See all events
    // - Super Admins: See all events
    if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
      // Orphan Project caseworkers can only see their own events
      events = events.filter((event) => {
        const createdBy = event.metadata?.created_by;
        return createdBy === context.userId;
      });
    }
    // Health facility roles and supervisors have full access (no filtering needed)

    return events;
  });

/**
 * Save an event for a patient
 * @returns {Promise<Event.EncodedT>} - The saved event
 */
export const saveEvent = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((data: { event: Event.EncodedT }) => data)
  .handler(async ({ data, context }): Promise<Event.EncodedT> => {
    // Check permissions for event forms
    const permContext = createPermissionContext(context);
    
    // Get patient to check clinic context
    const patient = await Patient.API.getById(data.event.patient_id);
    if (!patient) {
      throw new Error("Patient not found");
    }

    // Check if this is an edit operation (event already exists)
    let existingEvent: Event.EncodedT | null = null;
    if (data.event.id) {
      try {
        const result = await db
          .selectFrom(Event.Table.name)
          .selectAll()
          .where("id", "=", data.event.id)
          .where("is_deleted", "=", false)
          .executeTakeFirst();
        existingEvent = result as unknown as Event.EncodedT | null;
      } catch (err) {
        // Event doesn't exist, treat as new
        existingEvent = null;
      }
    }
    
    const isEdit = !!existingEvent;
    
    if (isEdit && existingEvent) {
      // Form Visibility & Access Control (5.2):
      // - Orphan Project Caseworkers can only edit their own events
      // - Health Facility roles and supervisors can edit events within their clinic
      if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
        const createdBy = existingEvent.metadata?.created_by;
        if (createdBy !== context.userId) {
          throw new Error("You do not have permission to edit this event. You can only edit events you created.");
        }
      }

      // Form Editing Capabilities (5.3): 3-month editing window
      const editCheck = canEditDirectly(existingEvent, context.userId || null, context.role);
      if (!editCheck.canEdit) {
        if (editCheck.requiresApproval) {
          throw new Error(
            editCheck.reason || "This form requires approval to edit. Please contact your supervisor."
          );
        }
        throw new Error("You do not have permission to edit this event.");
      }

      // Track edit history in metadata
      const editHistory = existingEvent.metadata?.edit_history || [];
      editHistory.push({
        edited_by: context.userId,
        edited_by_role: context.role,
        edited_at: new Date().toISOString(),
        previous_form_data: existingEvent.form_data, // Store previous version for audit
      });

      // Update metadata with edit history
      data.event.metadata = {
        ...data.event.metadata,
        edit_history: editHistory,
        last_edited_by: context.userId,
        last_edited_by_role: context.role,
        last_edited_at: new Date().toISOString(),
      };

      // Check EDIT permission
      checkEventFormPermission(permContext, PermissionOperation.EDIT, {
        clinicId: patient.primary_clinic_id,
        providerId: context.userId,
      });
    } else {
      // For new events, check ADD permission
      checkEventFormPermission(permContext, PermissionOperation.ADD, {
        clinicId: patient.primary_clinic_id,
        providerId: context.userId,
      });
    }

    // Store creator user_id in metadata for access control
    // - Orphan Project caseworkers can only see/edit their own events
    // - Health Facility roles have shared access within clinic
    // If editing, preserve the original creator
    const eventWithCreator = {
      ...data.event,
      metadata: {
        ...data.event.metadata,
        created_by: isEdit 
          ? (data.event.metadata?.created_by || context.userId || null)
          : (context.userId || null),
        created_by_role: isEdit
          ? (data.event.metadata?.created_by_role || context.role || null)
          : (context.role || null),
      },
    };

    await Event.API.save(null, eventWithCreator);
    
    // Return the event data (save is upsert, so event should exist)
    return eventWithCreator;
  });

/**
 * Check if a user can edit an event (for UI display)
 * @returns {Promise<{ canEdit: boolean; requiresApproval: boolean; reason?: string }>} - Edit permission info
 */
export const checkEventEditPermission = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator((data: { event_id: string }) => data)
  .handler(async ({ data, context }): Promise<{
    canEdit: boolean;
    requiresApproval: boolean;
    reason?: string;
  }> => {
    const event = await Event.API.getById(data.event_id);
    if (!event) {
      return {
        canEdit: false,
        requiresApproval: false,
        reason: "Event not found",
      };
    }

    // Form Visibility & Access Control (5.2): Check if user can see the event
    if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
      const createdBy = event.metadata?.created_by;
      if (createdBy !== context.userId) {
        return {
          canEdit: false,
          requiresApproval: false,
          reason: "You can only edit events you created",
        };
      }
    }

    // Form Editing Capabilities (5.3): Check 3-month window
    return canEditDirectly(event, context.userId || null, context.role);
  });
