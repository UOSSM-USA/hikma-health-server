import { createServerFn } from "@tanstack/react-start";
import EventForm from "@/models/event-form";
import { permissionsMiddleware } from "@/middleware/auth";
import ClinicEventForm from "@/models/clinic-event-form";
import User from "@/models/user";

/**
 * Get all event forms (filtered by clinic assignments for non-super admins)
 * @returns {Promise<EventForm.EncodedT[]>} - The list of event forms
 */
export const getEventForms = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator(() => {})
  .handler(async ({ context }): Promise<EventForm.EncodedT[]> => {
    // Super admins can see all forms
    if (context.isSuperAdmin || context.role === User.ROLES.SUPER_ADMIN_2) {
      return await EventForm.API.getAll();
    }

    // Non-super admins can only see forms assigned to their clinics
    if (context.clinicIds.length === 0) {
      return []; // No clinic access = no forms
    }

    const assignedFormIds = await ClinicEventForm.API.getFormIdsByClinics(context.clinicIds);
    
    if (assignedFormIds.length === 0) {
      return []; // No forms assigned to their clinics
    }

    // Get all forms and filter to only assigned ones
    const allForms = await EventForm.API.getAll();
    return allForms.filter((form) => assignedFormIds.includes(form.id));
  });

/**
 * Get an event form by ID
 * @param id - The ID of the event form
 * @returns {Promise<EventForm.EncodedT | null>} - The event form or null if not found
 */
export const getEventFormById = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<EventForm.EncodedT | null> => {
    const form = await EventForm.API.getById(data.id);
    if (!form) return null;

    // Super admins can access any form
    if (context.isSuperAdmin || context.role === User.ROLES.SUPER_ADMIN_2) {
      return form;
    }

    // Non-super admins can only access forms assigned to their clinics
    if (context.clinicIds.length === 0) {
      return null;
    }

    const assignedFormIds = await ClinicEventForm.API.getFormIdsByClinics(context.clinicIds);
    if (assignedFormIds.includes(data.id)) {
      return form;
    }

    return null; // Form not assigned to user's clinics
  });

/**
 * Assign event forms to a clinic (super admin only)
 * @param clinicId - The clinic ID
 * @param eventFormIds - Array of event form IDs to assign
 */
export const assignFormsToClinic = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((data: { clinicId: string; eventFormIds: string[] }) => data)
  .handler(async ({ data, context }): Promise<void> => {
    // Only super admins can assign forms
    if (!context.isSuperAdmin && context.role !== User.ROLES.SUPER_ADMIN_2) {
      throw new Error("Unauthorized: Only super admins can assign forms to clinics");
    }

    try {
      await ClinicEventForm.API.assignFormsToClinic(data.clinicId, data.eventFormIds);
    } catch (error: any) {
      // Check if it's a migration error
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        throw new Error(
          "Database migration required. Please run: pnpm run db:migrate. " +
          "The clinic_event_forms table does not exist."
        );
      }
      throw error;
    }
  });

/**
 * Unassign event forms from a clinic (super admin only)
 * @param clinicId - The clinic ID
 * @param eventFormIds - Array of event form IDs to unassign
 */
export const unassignFormsFromClinic = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((data: { clinicId: string; eventFormIds: string[] }) => data)
  .handler(async ({ data, context }): Promise<void> => {
    // Only super admins can unassign forms
    if (!context.isSuperAdmin && context.role !== User.ROLES.SUPER_ADMIN_2) {
      throw new Error("Unauthorized: Only super admins can unassign forms from clinics");
    }

    try {
      await ClinicEventForm.API.unassignFormsFromClinic(data.clinicId, data.eventFormIds);
    } catch (error: any) {
      // Check if it's a migration error
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        throw new Error(
          "Database migration required. Please run: pnpm run db:migrate. " +
          "The clinic_event_forms table does not exist."
        );
      }
      throw error;
    }
  });

/**
 * Get all event forms assigned to a clinic
 * @param clinicId - The clinic ID
 * @returns {Promise<EventForm.EncodedT[]>} - The list of assigned event forms
 */
export const getFormsByClinic = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator((data: { clinicId: string }) => data)
  .handler(async ({ data, context }): Promise<EventForm.EncodedT[]> => {
    // Only super admins can query forms by clinic
    if (!context.isSuperAdmin && context.role !== User.ROLES.SUPER_ADMIN_2) {
      throw new Error("Unauthorized: Only super admins can query forms by clinic");
    }

    const assignedFormIds = await ClinicEventForm.API.getFormIdsByClinic(data.clinicId);
    if (assignedFormIds.length === 0) {
      return [];
    }

    const allForms = await EventForm.API.getAll();
    return allForms.filter((form) => assignedFormIds.includes(form.id));
  });
