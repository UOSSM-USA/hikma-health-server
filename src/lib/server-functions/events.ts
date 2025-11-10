import { createServerFn } from "@tanstack/react-start";
import Event from "@/models/event";
import Patient from "@/models/patient";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkEventFormPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";

/**
 * Get all events by form id with pagination
 * @returns {Promise<{ events: Event.EncodedT[], pagination: { total: number, offset: number, limit: number, hasMore: boolean } }>} - The list of events and pagination info
 */
export const getEventsByFormId = createServerFn({ method: "GET" })
  .validator(
    (data: { form_id: string; limit?: number; offset?: number }) => data,
  )
  .handler(
    async ({
      data,
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
      const result = await Event.API.getAllByFormId(data.form_id, {
        limit,
        offset,
        includeCount: true,
      });

      // console.log({ result, form_id: data.form_id });
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
  .validator((data: { patient_id: string }) => data)
  .handler(async ({ data }): Promise<Event.EncodedT[]> => {
    return await Event.API.getByPatientId(data.patient_id);
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

    checkEventFormPermission(permContext, PermissionOperation.ADD, {
      clinicId: patient.primary_clinic_id,
      providerId: context.userId,
    });

    await Event.API.save(null, data.event);
    
    // Return the event data (save is upsert, so event should exist)
    return data.event;
  });
