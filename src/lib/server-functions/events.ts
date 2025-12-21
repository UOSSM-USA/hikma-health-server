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

// Helper to check if a role is a caseworker
const isCaseworkerRole = (role: string | null): boolean => {
  if (!role) return false;
  return [
    User.ROLES.CASEWORKER_1,
    User.ROLES.CASEWORKER_2,
    User.ROLES.CASEWORKER_3,
    User.ROLES.CASEWORKER_4,
  ].includes(role as any);
};

// Helper to check if a role has full access (can see all events)
const hasFullAccess = (role: string | null): boolean => {
  if (!role) return false;
  return [
    User.ROLES.PROJECT_MANAGER,
    User.ROLES.TECHNICAL_ADVISOR,
    User.ROLES.TEAM_LEADER,
    User.ROLES.ME_OFFICER,
    User.ROLES.IM_ASSOCIATE,
    User.ROLES.ADMIN,
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

      // Filter events based on role: caseworkers can only see their own events
      if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
        result = result.filter((event) => {
          const createdBy = event.metadata?.created_by;
          return createdBy === context.userId;
        });
      }
      // Full access roles (Project Manager, Technical Advisor, etc.) can see all events

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

    // Filter events based on role: caseworkers can only see their own events
    if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
      events = events.filter((event) => {
        const createdBy = event.metadata?.created_by;
        return createdBy === context.userId;
      });
    }
    // Full access roles (Project Manager, Technical Advisor, etc.) can see all events

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
      // Caseworkers can only edit their own events
      if (isCaseworkerRole(context.role) && !hasFullAccess(context.role)) {
        const createdBy = existingEvent.metadata?.created_by;
        if (createdBy !== context.userId) {
          throw new Error("You do not have permission to edit this event. You can only edit events you created.");
        }
      }

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

    // Store creator user_id in metadata for access control (caseworkers can only see their own events)
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
