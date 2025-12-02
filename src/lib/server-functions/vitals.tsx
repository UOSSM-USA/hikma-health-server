import { createServerFn } from "@tanstack/react-start";
import PatientVital from "@/models/patient-vital";
import { userRoleTokenHasCapability } from "../auth/request";
import User from "@/models/user";
import * as Sentry from "@sentry/tanstackstart-react";

export const getPatientVitals = createServerFn({
  method: "GET",
})
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data }): Promise<PatientVital.EncodedT[]> => {
    return Sentry.startSpan({ name: "getPatientVitals" }, async () => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getPatientVitals",
        });
      }

      try {
        const vitals = await PatientVital.API.getByPatientId(data.patientId);
        return vitals;
      } catch (error) {
        console.error("Failed to fetch patient vitals:", error);
        return Promise.reject({
          message: "Failed to fetch patient vitals",
        });
      }
    });
  });

export const getMostRecentVital = createServerFn({
  method: "GET",
})
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "getMostRecentVital" }, async () => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getMostRecentVital",
        });
      }

      try {
        const vital = await PatientVital.API.getMostRecent(data.patientId);
        return vital;
      } catch (error) {
        console.error("Failed to fetch most recent vital:", error);
        return Promise.reject({
          message: "Failed to fetch most recent vital",
        });
      }
    });
  });

export const getVitalsByDateRange = createServerFn({
  method: "GET",
})
  .validator(
    (data: { patientId: string; startDate: string; endDate: string }) => data,
  )
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "getVitalsByDateRange" }, async () => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.READ_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "getVitalsByDateRange",
        });
      }

      try {
        const vitals = await PatientVital.API.getByDateRange(
          data.patientId,
          new Date(data.startDate),
          new Date(data.endDate),
        );
        return vitals;
      } catch (error) {
        console.error("Failed to fetch vitals by date range:", error);
        return Promise.reject({
          message: "Failed to fetch vitals by date range",
        });
      }
    });
  });

export const createPatientVital = createServerFn({
  method: "POST",
})
  .validator((data: PatientVital.Table.NewPatientVitals) => data)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "createPatientVital" }, async () => {
      // Check for UPDATE_PATIENT capability since adding vitals is part of updating patient records
      // Providers, admins, and registrars all have this capability
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.UPDATE_PATIENT,
        User.CAPABILITIES.UPDATE_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "createPatientVital",
        });
      }

      try {
        const vital = await PatientVital.API.save(data);
        return vital;
      } catch (error) {
        console.error("Failed to create patient vital:", error);
        return Promise.reject({
          message: "Failed to create patient vital",
        });
      }
    });
  });

export const updatePatientVital = createServerFn({
  method: "POST",
})
  .validator(
    (data: {
      id: string;
      updates: {
        systolic_bp?: number | null;
        diastolic_bp?: number | null;
        heart_rate?: number | null;
        temperature_celsius?: number | null;
        oxygen_saturation?: number | null;
        respiratory_rate?: number | null;
        weight_kg?: number | null;
        height_cm?: number | null;
        pain_level?: number | null;
        bmi?: number | null;
      };
    }) => data,
  )
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "updatePatientVital" }, async () => {
      const authorized = await userRoleTokenHasCapability([
        User.CAPABILITIES.UPDATE_PATIENT,
        User.CAPABILITIES.UPDATE_ALL_PATIENT,
      ]);

      if (!authorized) {
        return Promise.reject({
          message: "Unauthorized: Insufficient permissions",
          source: "updatePatientVital",
        });
      }

      try {
        const vital = await PatientVital.API.update(
          data.id,
          data.updates as PatientVital.Table.PatientVitalsUpdate,
        );
        return vital;
      } catch (error) {
        console.error("Failed to update patient vital:", error);
        return Promise.reject({
          message: "Failed to update patient vital",
        });
      }
    });
  });
