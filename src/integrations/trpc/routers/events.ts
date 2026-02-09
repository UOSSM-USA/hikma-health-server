/**
 * tRPC router for event CRUD operations.
 * These procedures mirror the TanStack Start server functions but are callable
 * from React Native clients via Bearer token auth.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { TRPCRouterRecord } from "@trpc/server";
import { authedProcedure } from "../init";
import Event from "@/models/event";
import db from "@/db";
import { sql } from "kysely";
import * as Sentry from "@sentry/tanstackstart-react";
import { buildEventInsertValues } from "@/lib/server-functions/builders";
import { logAuditEvent } from "@/lib/server-functions/audit";

const getVisitEventsSchema = z.object({
  visitId: z.string(),
});

const createEventSchema = z.object({
  patientId: z.string(),
  visitId: z.string(),
  eventType: z.string().nullish(),
  formId: z.string().nullish(),
  formData: z.array(z.record(z.string(), z.any())),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateEventSchema = z.object({
  id: z.string(),
  formData: z.array(z.record(z.string(), z.any())),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const eventsRouter = {
  /** Get all non-deleted events for a visit, ordered by most recent first */
  getByVisit: authedProcedure
    .input(getVisitEventsSchema)
    .query(async ({ input }) => {
      try {
        const items = await Event.API.getByVisitId(input.visitId);
        return { items };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch events",
        });
      }
    }),

  /** Create a new event within an existing visit */
  create: authedProcedure
    .input(createEventSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const values = buildEventInsertValues(input, {
          recordedByUserId: ctx.userId,
        });
        const eventId = values.id;

        await db
          .insertInto(Event.Table.name)
          .values({
            id: values.id,
            patient_id: values.patient_id,
            visit_id: values.visit_id,
            form_id: values.form_id,
            event_type: values.event_type,
            form_data: sql`${JSON.stringify(values.form_data)}::jsonb`,
            metadata: sql`${JSON.stringify(values.metadata)}::jsonb`,
            recorded_by_user_id: values.recorded_by_user_id,
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
          tableName: "events",
          rowId: eventId,
          changes: { ...input, recorded_by_user_id: ctx.userId },
          userId: ctx.userId,
        });

        return { success: true as const, id: eventId };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create event",
        });
      }
    }),

  /** Update the form data and optionally metadata for an existing event */
  update: authedProcedure
    .input(updateEventSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await Event.API.updateFormData(input.id, input.formData, input.metadata);

        await logAuditEvent({
          actionType: "UPDATE",
          tableName: "events",
          rowId: input.id,
          changes: { formData: input.formData, metadata: input.metadata },
          userId: ctx.userId,
        });

        return { success: true as const };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update event",
        });
      }
    }),
} satisfies TRPCRouterRecord;
