import { createServerFn } from "@tanstack/react-start";
import Prescription from "@/models/prescription";
import Patient from "@/models/patient";
import Clinic from "@/models/clinic";
import User from "@/models/user";
import { userRoleTokenHasCapability } from "../auth/request";
import type { Pagination } from "./builders";
import * as Sentry from "@sentry/tanstackstart-react";

/**
 * Get all prescriptions
 * @returns {Promise<Prescription.EncodedT[]>} - The list of prescriptions
 */
const getAllPrescriptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const res = await Prescription.API.getAll();
    return res;
  },
);

/**
 * Get all prescriptions with their patients, clinics, and providers information
 * @returns {Promise<{prescription: Prescription.EncodedT, patient: Patient.EncodedT, clinic: Clinic.EncodedT, provider: User.EncodedT}[]>} - The list of prescriptions with their patients, clinics, and providers information
 */
const getAllPrescriptionsWithDetails = createServerFn({
  method: "GET",
}).handler(
  async () => {
    const res = await Prescription.API.getAllWithDetails();
    return res;
  },
);

/**
 * Get all prescriptions by patient ID with patient, provider, and clinic details
 * @param {string} patientId - The ID of the patient
 * @returns {Promise<{prescription: Prescription.EncodedT, patient: Patient.EncodedT, clinic: Clinic.EncodedT, provider: User.EncodedT}[]>} - The list of prescriptions with details
 */
export const getPrescriptionsByPatientId = createServerFn({ method: "GET" })
  .validator((data: { patientId: string }) => data)
  .handler(
    async ({ data }) => {
      const res = await Prescription.API.getByPatientIdWithDetails(data.patientId);
      return res as any;
    }
  );

/**
 * Toggle the status of a prescription
 * @param {string} id - The ID of the prescription
 * @param {string} status - The new status of the prescription
 * @returns {Promise<void>}
 */
const togglePrescriptionStatus = createServerFn({ method: "POST" })
  .validator((data: { id: string; status: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    await Prescription.API.toggleStatus(data.id, data.status);
  });

/**
 * Get paginated prescriptions for a patient.
 */
const getPatientPrescriptions = createServerFn({ method: "GET" })
  .validator(
    (data: { patientId: string; offset?: number; limit?: number }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<{
      items: Prescription.EncodedT[];
      pagination: Pagination;
      error: string | null;
    }> => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getPatientPrescriptions",
        });
      }

      try {
        const result = await Prescription.API.getByPatientId({
          patientId: data.patientId,
          limit: data.limit ?? 10,
          offset: data.offset ?? 0,
          includeCount: true,
        });

        return {
          items: result.items,
          pagination: result.pagination,
          error: null,
        };
      } catch (error) {
        Sentry.captureException(error);
        return {
          items: [],
          pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch prescriptions",
        };
      }
    },
  );

export {
  getAllPrescriptions,
  getAllPrescriptionsWithDetails,
  togglePrescriptionStatus,
  getPatientPrescriptions,
};
