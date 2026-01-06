import { createServerFn } from "@tanstack/react-start";
import Patient from "@/models/patient";
import { userRoleTokenHasCapability } from "../auth/request";
import User from "@/models/user";
import * as Sentry from "@sentry/tanstackstart-react";
import z from "zod";

type Pagination = {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export const getAllPatients = createServerFn({
  method: "GET",
})
  .validator((data?: { offset?: number; limit?: number }) => data || {})
  .handler(
    async ({
      data,
    }): Promise<{
      patients: (typeof Patient.PatientWithAttributesSchema.Encoded)[];
      pagination: Pagination;
      error: { message: string } | null;
    }> => {
      return Sentry.startSpan({ name: "getAllPatients" }, async () => {
        // Check for READ_PATIENT capability (provider, caseworker, etc.) instead of READ_ALL_PATIENT
        // The getAllWithAttributes query already handles permissions correctly by checking
        // clinic permissions and last_modified_by, so we don't need the stricter READ_ALL_PATIENT check
        const authorized = await userRoleTokenHasCapability([
          User.CAPABILITIES.READ_PATIENT,
        ]);

        if (!authorized) {
          return {
            patients: [],
            pagination: {
              offset: 0,
              limit: 50,
              total: 0,
              hasMore: false,
            },
            error: {
              message: "Unauthorized: Insufficient permissions",
              source: "getAllPatients",
            },
          };
        }
        
        const { patients, pagination } = await Patient.API.getAllWithAttributes(
          {
            limit: data?.limit || 50,
            offset: data?.offset || 0,
            includeCount: true,
          },
        );
        return { patients: patients, pagination, error: null };
      });
    },
  );

// Update the searchPatients function to accept pagination parameters
export const searchPatients = createServerFn({ method: "GET" })
  .validator(
    (data: { searchQuery: string; offset?: number; limit?: number }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<{
      patients: (typeof Patient.PatientWithAttributesSchema.Encoded)[];
      pagination: Pagination;
      error: { message: string } | null;
    }> => {
      console.log("Calling searchPatients");
      return Sentry.startSpan({ name: "searchPatients" }, async () => {
        // Check for READ_PATIENT capability instead of READ_ALL_PATIENT
        // The search query already handles permissions correctly
        const authorized = await userRoleTokenHasCapability([
          User.CAPABILITIES.READ_PATIENT,
        ]);

        if (!authorized) {
          return {
            patients: [],
            pagination: {
              offset: 0,
              limit: data.limit || 10,
              total: 0,
              hasMore: false,
            },
            error: {
              message: "Unauthorized: Insufficient permissions",
              source: "searchPatients",
            },
          };
        }

        const offset = data.offset || 0;
        const limit = data.limit || 10;

        // If search query is empty, use getAllWithAttributes for better performance
        if (!data.searchQuery || data.searchQuery.trim() === "") {
          const result = await Patient.API.getAllWithAttributes({
            offset,
            limit,
            includeCount: true,
          });
          return {
            patients: result.patients,
            pagination: result.pagination,
            error: null,
          };
        }

        // Use the search API with proper pagination parameters
        const result = await Patient.API.search({
          searchQuery: data.searchQuery,
          offset,
          limit,
          includeCount: true,
        });

        return {
          patients: result.patients,
          pagination: result.pagination,
          error: null,
        };
      });
    },
  );

export const getPatientById = createServerFn({
  method: "GET",
})
  .validator((data: { id: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      patient: Patient.EncodedT;
      error: { message: string } | null;
    }> => {
      const patient = await Patient.API.getById(data.id);

      return {
        patient,
        error: null,
      };
    },
  );

/**
 * Check if a patient with the given government_id already exists
 * Note: If government_id is empty/null, returns no match (allows registration)
 */
export const checkDuplicateGovernmentId = createServerFn({
  method: "GET",
})
  .validator((data: { government_id: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      patient: Patient.EncodedT | null;
      exists: boolean;
      error: { message: string } | null;
    }> => {
      return Sentry.startSpan({ name: "checkDuplicateGovernmentId" }, async () => {
        try {
          // If government_id is empty or null, don't check for duplicates
          if (!data.government_id || !data.government_id.trim()) {
            return {
              patient: null,
              exists: false,
              error: null,
            };
          }

          const patient = await Patient.API.getByGovernmentId(data.government_id.trim());
          return {
            patient: patient || null,
            exists: !!patient,
            error: null,
          };
        } catch (error) {
          console.error("Error checking duplicate government ID:", error);
          return {
            patient: null,
            exists: false,
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
            },
          };
        }
      });
    },
  );

/**
 * Check for potential duplicate patients using multiple criteria
 * Checks: Government ID, Name + DOB, Phone number
 */
export const checkPotentialDuplicates = createServerFn({
  method: "GET",
})
  .validator((data: {
    government_id?: string;
    given_name?: string;
    surname?: string;
    date_of_birth?: string;
    phone?: string;
  }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      duplicates: Patient.EncodedT[];
      matchReasons: string[];
      error: { message: string } | null;
    }> => {
      return Sentry.startSpan({ name: "checkPotentialDuplicates" }, async () => {
        try {
          const duplicates: Patient.EncodedT[] = [];
          const matchReasons: string[] = [];
          const foundIds = new Set<string>();

          // 1. Check by Government ID (if provided)
          if (data.government_id && data.government_id.trim()) {
            const govIdPatient = await Patient.API.getByGovernmentId(data.government_id.trim());
            if (govIdPatient && !foundIds.has(govIdPatient.id)) {
              duplicates.push(govIdPatient);
              foundIds.add(govIdPatient.id);
              matchReasons.push(`Government ID: ${data.government_id.trim()}`);
            }
          }

          // 2. Check by Name + Date of Birth (if both provided)
          if (data.given_name && data.surname && data.date_of_birth) {
            const nameDobMatches = await Patient.API.findByNameAndDOB({
              given_name: data.given_name.trim(),
              surname: data.surname.trim(),
              date_of_birth: data.date_of_birth,
            });
            nameDobMatches.forEach((patient) => {
              if (!foundIds.has(patient.id)) {
                duplicates.push(patient);
                foundIds.add(patient.id);
                matchReasons.push(`Name + Date of Birth: ${data.given_name} ${data.surname}, DOB: ${data.date_of_birth}`);
              }
            });
          }

          // 3. Check by Phone number (if provided)
          if (data.phone && data.phone.trim()) {
            const phoneMatches = await Patient.API.findByPhone(data.phone.trim());
            phoneMatches.forEach((patient) => {
              if (!foundIds.has(patient.id)) {
                duplicates.push(patient);
                foundIds.add(patient.id);
                matchReasons.push(`Phone: ${data.phone}`);
              }
            });
          }

          return {
            duplicates,
            matchReasons: matchReasons.length > 0 ? matchReasons : [],
            error: null,
          };
        } catch (error) {
          console.error("Error checking potential duplicates:", error);
          return {
            duplicates: [],
            matchReasons: [],
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
            },
          };
        }
      });
    },
  );

/**
 * Generate the next Patient ID in PID-000-0001 format
 */
export const generateNextPatientId = createServerFn({
  method: "GET",
}).handler(async (): Promise<{
  patientId: string;
  error: { message: string } | null;
}> => {
  return Sentry.startSpan({ name: "generateNextPatientId" }, async () => {
    try {
      const patientId = await Patient.API.generateNextPatientId();
      return {
        patientId,
        error: null,
      };
    } catch (error) {
      console.error("Error generating Patient ID:", error);
      return {
        patientId: "",
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  });
});
