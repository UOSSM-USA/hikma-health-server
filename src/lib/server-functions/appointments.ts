import { createServerFn } from "@tanstack/react-start";
import Appointment from "@/models/appointment";
import type User from "@/models/user";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkAppointmentPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";

/**
 * Get all appointments
 * @returns {Promise<Appointment.EncodedT[]>} - The list of appointments
 */
export const getAllAppointments = createServerFn({ method: "GET" }).handler(
  async (): Promise<Appointment.EncodedT[]> => {
    const res = await Appointment.API.getAll();
    return res;
  },
);

/**
 * Get an appointment by ID
 * @param {string} id - The ID of the appointment
 * @returns {Promise<Appointment.EncodedT | null>} - The appointment or null if not found
 */
export const getAppointmentById = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<Appointment.EncodedT | null> => {
    const res = await Appointment.API.getById(data.id);

    return res;
  });

/**
 * Get all a patient's appointments
 * @param {string} patientId - the ID of the patient
 * @returns {Promise<Appointment.EncodedT[]>} - the list of appointments for the patient, sorted by date from earliest to latest
 */
export const getAppointmentsByPatientId = createServerFn({ method: "GET" })
  .validator((data: { patientId: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<
      WithError<{
        data: {
          appointment: Appointment.EncodedT;
          patient: Patient.EncodedT;
          clinic: Clinic.EncodedT;
          provider: User.EncodedT | null;
        }[];
      }>
    > => {
      try {
        const res = await Appointment.API.getByPatientId(data.patientId);
        return {
          data: res || [],
          error: null,
        };
      } catch (error) {
        return {
          data: [],
          error: error as Error,
        };
      }
    },
  );

/**
 * Get all appointments with their patients, clinics, and providers information
 * @returns {Promise<{appointment: Appointment.EncodedT, patient: Patient.EncodedT, clinic: Clinic.EncodedT, provider: User.EncodedT | null}[]>} - The list of appointments with their patients, clinics, and providers information
 */
export const getAllAppointmentsWithDetails = createServerFn({
  method: "GET",
}).handler(
  async (): Promise<
    {
      appointment: Appointment.EncodedT;
      patient: Patient.EncodedT;
      clinic: Clinic.EncodedT;
      provider: User.EncodedT | null;
    }[]
  > => {
    const res = await Appointment.API.getAllWithDetails();
    return res;
  },
);

/**
 * Toggle the status of an appointment
 * @param {string} id - The ID of the appointment
 * @param {string} status - The new status of the appointment
 * @returns {Promise<void>}
 */
export const toggleAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((data: { id: string; status: string }) => data)
  .handler(async ({ data, context }): Promise<void> => {
    // Check permissions - editing appointment requires edit permission
    const permContext = createPermissionContext(context);
    
    // Get appointment to check clinic context
    const appointment = await Appointment.API.getById(data.id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    checkAppointmentPermission(permContext, PermissionOperation.EDIT, {
      clinicId: appointment.clinic_id,
      providerId: appointment.provider_id,
      ownerId: appointment.user_id,
    });

    await Appointment.API.toggleStatus(data.id, data.status);
  });
