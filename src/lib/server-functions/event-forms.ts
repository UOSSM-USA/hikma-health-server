import { createServerFn } from "@tanstack/react-start";
import EventForm from "@/models/event-form";
import { permissionsMiddleware } from "@/middleware/auth";
import ClinicEventForm from "@/models/clinic-event-form";
import User from "@/models/user";
import { normalizeFormFields } from "./event-form-editor";

/**
 * Get all event forms (filtered by clinic assignments for non-super admins)
 * @returns {Promise<EventForm.EncodedT[]>} - The list of event forms
 */
export const getEventForms = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .validator(() => {})
  .handler(async ({ context }): Promise<EventForm.EncodedT[]> => {
    let forms: EventForm.EncodedT[];
    
    // Super admins can see all forms
    if (context.isSuperAdmin || context.role === User.ROLES.SUPER_ADMIN_2) {
      forms = await EventForm.API.getAll();
    } else {
      // Non-super admins can only see forms assigned to their clinics
      if (context.clinicIds.length === 0) {
        return []; // No clinic access = no forms
      }

      // Role-based clinic restrictions: Orphan project roles should not see Nutrition clinic
      let filteredClinicIds = context.clinicIds;
      if (context.role) {
        const orphanProjectRoles = [
          User.ROLES.TECHNICAL_ADVISOR,
          User.ROLES.TEAM_LEADER,
          User.ROLES.ME_OFFICER,
          User.ROLES.IM_ASSOCIATE,
          User.ROLES.PROJECT_MANAGER,
          User.ROLES.CASEWORKER_1,
          User.ROLES.CASEWORKER_2,
          User.ROLES.CASEWORKER_3,
          User.ROLES.CASEWORKER_4,
        ];
        
        if (orphanProjectRoles.includes(context.role)) {
          // Exclude Nutrition clinic for Orphan project roles
          const ClinicModel = (await import("@/models/clinic")).default;
          const allClinics = await ClinicModel.API.getAll();
          const nutritionClinicIds = allClinics
            .filter(c => c.name?.toLowerCase().includes("nutrition"))
            .map(c => c.id);
          
          filteredClinicIds = context.clinicIds.filter(
            id => !nutritionClinicIds.includes(id)
          );
        }
      }

      if (filteredClinicIds.length === 0) {
        return []; // No accessible clinics after filtering
      }

      const assignedFormIds = await ClinicEventForm.API.getFormIdsByClinics(filteredClinicIds);
      
      if (assignedFormIds.length === 0) {
        return []; // No forms assigned to their clinics
      }

      // Get all forms and filter to only assigned ones
      const allForms = await EventForm.API.getAll();
      forms = allForms.filter((form) => assignedFormIds.includes(form.id));
    }

    // Normalize all forms to ensure label objects are preserved and fields are properly structured
    return forms.map((form) => normalizeFormFields(form));
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

    // Check permissions first
    let hasAccess = false;
    if (context.isSuperAdmin || context.role === User.ROLES.SUPER_ADMIN_2) {
      hasAccess = true;
    } else {
      // Non-super admins can only access forms assigned to their clinics
      if (context.clinicIds.length > 0) {
        // Role-based clinic restrictions: Orphan project roles should not see Nutrition clinic
        let filteredClinicIds = context.clinicIds;
        if (context.role) {
          const orphanProjectRoles = [
            User.ROLES.TECHNICAL_ADVISOR,
            User.ROLES.TEAM_LEADER,
            User.ROLES.ME_OFFICER,
            User.ROLES.IM_ASSOCIATE,
            User.ROLES.PROJECT_MANAGER,
            User.ROLES.CASEWORKER_1,
            User.ROLES.CASEWORKER_2,
            User.ROLES.CASEWORKER_3,
            User.ROLES.CASEWORKER_4,
          ];
          
          if (orphanProjectRoles.includes(context.role)) {
            // Exclude Nutrition clinic for Orphan project roles
            const ClinicModel = (await import("@/models/clinic")).default;
            const allClinics = await ClinicModel.API.getAll();
            const nutritionClinicIds = allClinics
              .filter(c => c.name?.toLowerCase().includes("nutrition"))
              .map(c => c.id);
            
            filteredClinicIds = context.clinicIds.filter(
              id => !nutritionClinicIds.includes(id)
            );
          }
        }

        if (filteredClinicIds.length > 0) {
          const assignedFormIds = await ClinicEventForm.API.getFormIdsByClinics(filteredClinicIds);
          hasAccess = assignedFormIds.includes(data.id);
        }
      }
    }

    if (!hasAccess) {
      return null; // Form not accessible
    }

    // Always normalize the form before returning (preserves label objects and sets name)
    return normalizeFormFields(form);
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
