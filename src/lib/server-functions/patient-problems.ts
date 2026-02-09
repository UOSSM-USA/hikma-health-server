import { createServerFn } from "@tanstack/react-start";
import PatientProblem from "@/models/patient-problem";
import User from "@/models/user";
import { userRoleTokenHasCapability } from "../auth/request";
import type { Pagination } from "./builders";
import * as Sentry from "@sentry/tanstackstart-react";

/**
 * Get paginated problems for a patient, most recently updated first.
 */
const getPatientProblems = createServerFn({ method: "GET" })
  .validator(
    (data: { patientId: string; offset?: number; limit?: number }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<{
      items: PatientProblem.EncodedT[];
      pagination: Pagination;
      error: string | null;
    }> => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getPatientProblems",
        });
      }

      try {
        const result = await PatientProblem.getByPatientIdPaginated({
          patientId: data.patientId,
          limit: data.limit ?? 5,
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
          pagination: { offset: 0, limit: 5, total: 0, hasMore: false },
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch patient problems",
        };
      }
    },
  );

export { getPatientProblems };
