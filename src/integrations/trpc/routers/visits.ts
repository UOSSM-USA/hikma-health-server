/**
 * tRPC router for visit CRUD operations.
 * These procedures mirror the TanStack Start server functions but are callable
 * from React Native clients via Bearer token auth.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { TRPCRouterRecord } from "@trpc/server";
import { authedProcedure } from "../init";
import Visit from "@/models/visit";
import db from "@/db";
import { sql } from "kysely";
import * as Sentry from "@sentry/tanstackstart-react";
import { buildVisitInsertValues } from "@/lib/server-functions/builders";
import { logAuditEvent } from "@/lib/server-functions/audit";

const getPatientVisitsSchema = z.object({
  patientId: z.string(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

const createVisitSchema = z.object({
  patientId: z.string(),
  clinicId: z.string(),
  providerId: z.string(),
  providerName: z.string().nullish(),
  checkInTimestamp: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const visitsRouter = {
  /** Get paginated visits for a patient, ordered by most recent first */
  getByPatient: authedProcedure
    .input(getPatientVisitsSchema)
    .query(async ({ input }) => {
      try {
        const result = await Visit.API.getByPatientId({
          patientId: input.patientId,
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
          includeCount: true,
        });

        return {
          items: result.items,
          pagination: result.pagination,
        };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch visits",
        });
      }
    }),

  /** Create a new visit record for a patient */
  create: authedProcedure
    .input(createVisitSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const values = buildVisitInsertValues(input);
        const visitId = values.id;

        await db
          .insertInto(Visit.Table.name)
          .values({
            id: values.id,
            patient_id: values.patient_id,
            clinic_id: values.clinic_id,
            provider_id: values.provider_id,
            provider_name: values.provider_name,
            check_in_timestamp: values.check_in_timestamp
              ? sql`${values.check_in_timestamp}::timestamp with time zone`
              : null,
            metadata: sql`${JSON.stringify(values.metadata)}::jsonb`,
            is_deleted: false,
            created_at: sql`now()::timestamp with time zone`,
            updated_at: sql`now()::timestamp with time zone`,
            last_modified: sql`now()::timestamp with time zone`,
            server_created_at: sql`now()::timestamp with time zone`,
            deleted_at: null,
          })
          .executeTakeFirstOrThrow();

        await logAuditEvent({
          actionType: "CREATE",
          tableName: "visits",
          rowId: visitId,
          changes: input,
          userId: ctx.userId,
        });

        return { success: true as const, id: visitId };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create visit",
        });
      }
    }),
} satisfies TRPCRouterRecord;
