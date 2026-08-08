/**
 * Appointment query procedures (nested under `appointments.*`).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure, createTRPCRouter } from "../../init";
import db from "@/db";
import { flexTimestamp } from "@/lib/rpc-utils";
import * as Sentry from "@sentry/tanstackstart-react";

export const appointmentsQueryRouter = createTRPCRouter({
  /** Retrieve a single appointment by ID */
  get: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        const row = await db
          .selectFrom("appointments")
          .selectAll()
          .where("id", "=", input.id)
          .where("is_deleted", "=", false)
          .executeTakeFirst();
        return row ?? null;
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch appointment",
        });
      }
    }),

  /** Retrieve all appointments for a patient */
  by_patient: authedProcedure
    .input(z.object({ patient_id: z.string() }))
    .query(async ({ input }) => {
      try {
        const data = await db
          .selectFrom("appointments")
          .selectAll()
          .where("patient_id", "=", input.patient_id)
          .where("is_deleted", "=", false)
          .orderBy("timestamp", "desc")
          .execute();
        return { data };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch patient appointments",
        });
      }
    }),

  /**
   * List appointments within a date range with optional filters and pagination.
   *
   * The date range applies to the `timestamp` column. Returns paginated
   * `{ data, total, limit, offset }`.
   */
  list: authedProcedure
    .input(
      z.object({
        start_date: flexTimestamp,
        end_date: flexTimestamp,
        clinic_id: z.string().nullish(),
        status: z.string().nullish(),
        limit: z.number().int().positive().max(200).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
    )
    .query(async () => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "appointments.list: not yet implemented",
      });
    }),

  /**
   * Search appointments by text query with filters.
   *
   * Searching patient name means joining `patients`; `department_ids` is a JSONB
   * overlap (`departments::jsonb ?| array[...]`), not an equality filter.
   * Returns paginated `{ data, total, limit, offset }`.
   */
  search: authedProcedure
    .input(
      z.object({
        search_query: z.string(),
        clinic_id: z.string(),
        department_ids: z.array(z.string()).optional(),
        status: z.array(z.string()).optional(),
        date: flexTimestamp.optional(),
        limit: z.number().int().positive().max(200).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
    )
    .query(async () => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "appointments.search: not yet implemented",
      });
    }),
});
