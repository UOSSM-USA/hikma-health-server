/**
 * tRPC router for patient CRUD operations.
 * These procedures mirror the TanStack Start server functions but are callable
 * from React Native clients via Bearer token auth.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { TRPCRouterRecord } from "@trpc/server";
import { authedProcedure } from "../init";
import Patient from "@/models/patient";
import PatientAdditionalAttribute from "@/models/patient-additional-attribute";
import db from "@/db";
import { sql } from "kysely";
import * as Sentry from "@sentry/tanstackstart-react";
import {
  buildPatientInsertValues,
  buildPatientAttributeInsertValues,
} from "@/lib/server-functions/builders";
import { logAuditEvent } from "@/lib/server-functions/audit";

const additionalAttributeSchema = z.object({
  attribute_id: z.string(),
  attribute: z.string(),
  number_value: z.number().nullish(),
  string_value: z.string().nullish(),
  date_value: z.string().nullish(),
  boolean_value: z.boolean().nullish(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const createPatientSchema = z.object({
  patient: z.object({
    given_name: z.string().nullish(),
    surname: z.string().nullish(),
    date_of_birth: z.string().nullish(),
    sex: z.string().nullish(),
    citizenship: z.string().nullish(),
    hometown: z.string().nullish(),
    phone: z.string().nullish(),
    camp: z.string().nullish(),
    government_id: z.string().nullish(),
    external_patient_id: z.string().nullish(),
    additional_data: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    photo_url: z.string().nullish(),
    primary_clinic_id: z.string().nullish(),
  }),
  additionalAttributes: z.array(additionalAttributeSchema).optional(),
});

const updatePatientSchema = z.object({
  id: z.string(),
  fields: z.object({
    given_name: z.string().nullish(),
    surname: z.string().nullish(),
    date_of_birth: z.string().nullish(),
    sex: z.string().nullish(),
    citizenship: z.string().nullish(),
    hometown: z.string().nullish(),
    phone: z.string().nullish(),
    camp: z.string().nullish(),
    government_id: z.string().nullish(),
    external_patient_id: z.string().nullish(),
    additional_data: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    photo_url: z.string().nullish(),
    primary_clinic_id: z.string().nullish(),
  }).partial(),
});

export const patientsRouter = {
  /** Create a new patient with optional additional attributes in an atomic transaction */
  create: authedProcedure
    .input(createPatientSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const values = buildPatientInsertValues(input.patient);
        const patientId = values.id;

        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto(Patient.Table.name)
            .values({
              id: values.id,
              given_name: values.given_name,
              surname: values.surname,
              date_of_birth: values.date_of_birth
                ? sql`${values.date_of_birth}::date`
                : null,
              citizenship: values.citizenship,
              hometown: values.hometown,
              phone: values.phone,
              sex: values.sex,
              camp: values.camp,
              additional_data: sql`${JSON.stringify(values.additional_data)}::jsonb`,
              metadata: sql`${JSON.stringify(values.metadata)}::jsonb`,
              photo_url: values.photo_url,
              government_id: values.government_id,
              external_patient_id: values.external_patient_id,
              primary_clinic_id: values.primary_clinic_id,
              last_modified_by: ctx.userId,
              is_deleted: false,
              created_at: sql`now()::timestamp with time zone`,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
              server_created_at: sql`now()::timestamp with time zone`,
              deleted_at: null,
            })
            .executeTakeFirstOrThrow();

          const attrs = input.additionalAttributes ?? [];
          if (attrs.length > 0) {
            const attrValues = buildPatientAttributeInsertValues(
              patientId,
              attrs,
            );
            for (const attr of attrValues) {
              await trx
                .insertInto(PatientAdditionalAttribute.Table.name)
                .values({
                  id: attr.id,
                  patient_id: attr.patient_id,
                  attribute_id: attr.attribute_id,
                  attribute: attr.attribute,
                  number_value: attr.number_value,
                  string_value: attr.string_value,
                  date_value: attr.date_value
                    ? sql`${attr.date_value}::timestamp with time zone`
                    : null,
                  boolean_value: attr.boolean_value,
                  metadata: sql`${JSON.stringify(attr.metadata)}::jsonb`,
                  is_deleted: false,
                  created_at: sql`now()::timestamp with time zone`,
                  updated_at: sql`now()::timestamp with time zone`,
                  last_modified: sql`now()::timestamp with time zone`,
                  server_created_at: sql`now()::timestamp with time zone`,
                  deleted_at: null,
                })
                .executeTakeFirst();
            }
          }
        });

        await logAuditEvent({
          actionType: "CREATE",
          tableName: "patients",
          rowId: patientId,
          changes: {
            ...input.patient,
            additionalAttributes: input.additionalAttributes ?? [],
          },
          userId: ctx.userId,
        });

        return { success: true as const, id: patientId };
      } catch (error) {
        Sentry.captureException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create patient",
        });
      }
    }),

  /** Update an existing patient's fields. Only provided fields are updated. */
  update: authedProcedure
    .input(updatePatientSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const updateSet: Record<string, any> = {};
        const { fields } = input;

        if (fields.given_name !== undefined)
          updateSet.given_name = fields.given_name;
        if (fields.surname !== undefined) updateSet.surname = fields.surname;
        if (fields.date_of_birth !== undefined) {
          updateSet.date_of_birth = fields.date_of_birth
            ? sql`${fields.date_of_birth}::date`
            : null;
        }
        if (fields.sex !== undefined) updateSet.sex = fields.sex;
        if (fields.citizenship !== undefined)
          updateSet.citizenship = fields.citizenship;
        if (fields.hometown !== undefined) updateSet.hometown = fields.hometown;
        if (fields.phone !== undefined) updateSet.phone = fields.phone;
        if (fields.camp !== undefined) updateSet.camp = fields.camp;
        if (fields.government_id !== undefined)
          updateSet.government_id = fields.government_id;
        if (fields.external_patient_id !== undefined)
          updateSet.external_patient_id = fields.external_patient_id;
        if (fields.additional_data !== undefined)
          updateSet.additional_data = sql`${JSON.stringify(fields.additional_data)}::jsonb`;
        if (fields.metadata !== undefined)
          updateSet.metadata = sql`${JSON.stringify(fields.metadata)}::jsonb`;
        if (fields.photo_url !== undefined)
          updateSet.photo_url = fields.photo_url;
        if (fields.primary_clinic_id !== undefined)
          updateSet.primary_clinic_id = fields.primary_clinic_id;

        updateSet.updated_at = sql`now()::timestamp with time zone`;
        updateSet.last_modified = sql`now()::timestamp with time zone`;
        updateSet.last_modified_by = ctx.userId;

        await db
          .updateTable(Patient.Table.name)
          .set(updateSet)
          .where("id", "=", input.id)
          .where("is_deleted", "=", false)
          .execute();

        await logAuditEvent({
          actionType: "UPDATE",
          tableName: "patients",
          rowId: input.id,
          changes: input.fields,
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
              : "Failed to update patient",
        });
      }
    }),
} satisfies TRPCRouterRecord;
