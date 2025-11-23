import { createServerFn } from "@tanstack/react-start";
import Visit from "@/models/visit";
import { userRoleTokenHasCapability } from "../auth/request";
import User from "@/models/user";
import * as Sentry from "@sentry/tanstackstart-react";

/**
 * Get all visits for a patient
 * @param {string} patientId - the ID of the patient
 * @returns {Promise<Visit.EncodedT[]>} - the list of visits for the patient, sorted by date from most recent to oldest
 */
export const getVisitsByPatientId = createServerFn({ method: "GET" })
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data }): Promise<Visit.EncodedT[]> => {
    return Sentry.startSpan({ name: "getVisitsByPatientId" }, async () => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getVisitsByPatientId",
        });
      }

      try {
        const visits = await Visit.API.getByPatientId(data.patientId);
        return visits;
      } catch (error) {
        console.error("Failed to fetch patient visits:", error);
        return Promise.reject({
          message: "Failed to fetch patient visits",
        });
      }
    });
  });

