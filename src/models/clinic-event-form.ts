import { Option, Schema } from "effect";
import {
  type ColumnType,
  type Generated,
  type Selectable,
  type Insertable,
  type Updateable,
  sql,
} from "kysely";
import db from "@/db";
import { serverOnly } from "@tanstack/react-start";
import { v1 as uuidV1 } from "uuid";
import Clinic from "./clinic";
import EventForm from "./event-form";

namespace ClinicEventForm {
  export const ClinicEventFormSchema = Schema.Struct({
    id: Schema.String,
    clinic_id: Schema.String,
    event_form_id: Schema.String,
    is_deleted: Schema.Boolean,
    created_at: Schema.DateFromSelf,
    updated_at: Schema.DateFromSelf,
    deleted_at: Schema.OptionFromNullOr(Schema.DateFromSelf),
  });

  export type T = typeof ClinicEventFormSchema.Type;
  export type EncodedT = typeof ClinicEventFormSchema.Encoded;

  export const fromDbEntry = (
    entry: ClinicEventForm.Table.ClinicEventForms,
  ): Option.Option<ClinicEventForm.T> => {
    const result = Schema.decodeUnknownEither(ClinicEventFormSchema)(entry);
    return Option.fromEither(result);
  };

  export namespace Table {
    export const ALWAYS_PUSH_TO_MOBILE = false;
    export const name = "clinic_event_forms";
    export const mobileName = "clinic_event_forms";

    export const columns = {
      id: "id",
      clinic_id: "clinic_id",
      event_form_id: "event_form_id",
      is_deleted: "is_deleted",
      created_at: "created_at",
      updated_at: "updated_at",
      deleted_at: "deleted_at",
    };

    export interface T {
      id: string;
      clinic_id: string;
      event_form_id: string;
      is_deleted: Generated<boolean>;
      created_at: Generated<ColumnType<Date, string | undefined, never>>;
      updated_at: Generated<
        ColumnType<Date, string | undefined, string | undefined>
      >;
      deleted_at: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
    }

    export type ClinicEventForms = Selectable<T>;
    export type NewClinicEventForms = Insertable<T>;
    export type ClinicEventFormsUpdate = Updateable<T>;
  }

  export namespace API {
    /**
     * Assign an event form to a clinic
     */
    export const assignFormToClinic = serverOnly(
      async (clinicId: string, eventFormId: string): Promise<void> => {
        // Check if assignment already exists
        const existing = await db
          .selectFrom(Table.name)
          .selectAll()
          .where("clinic_id", "=", clinicId)
          .where("event_form_id", "=", eventFormId)
          .where("is_deleted", "=", false)
          .executeTakeFirst();

        if (existing) {
          // Already assigned, no-op
          return;
        }

        // Check if soft-deleted assignment exists and restore it
        const deleted = await db
          .selectFrom(Table.name)
          .selectAll()
          .where("clinic_id", "=", clinicId)
          .where("event_form_id", "=", eventFormId)
          .where("is_deleted", "=", true)
          .executeTakeFirst();

        if (deleted) {
          await db
            .updateTable(Table.name)
            .set({
              is_deleted: false,
              updated_at: sql`now()`,
              deleted_at: null,
            })
            .where("id", "=", deleted.id)
            .execute();
          return;
        }

        // Create new assignment
        await db
          .insertInto(Table.name)
          .values({
            id: uuidV1(),
            clinic_id: clinicId,
            event_form_id: eventFormId,
            is_deleted: false,
            created_at: sql`now()`,
            updated_at: sql`now()`,
            deleted_at: null,
          })
          .execute();
      },
    );

    /**
     * Unassign an event form from a clinic (soft delete)
     */
    export const unassignFormFromClinic = serverOnly(
      async (clinicId: string, eventFormId: string): Promise<void> => {
        await db
          .updateTable(Table.name)
          .set({
            is_deleted: true,
            updated_at: sql`now()`,
            deleted_at: sql`now()`,
          })
          .where("clinic_id", "=", clinicId)
          .where("event_form_id", "=", eventFormId)
          .where("is_deleted", "=", false)
          .execute();
      },
    );

    /**
     * Get all event form IDs assigned to a clinic
     */
    export const getFormIdsByClinic = serverOnly(
      async (clinicId: string): Promise<string[]> => {
        const result = await db
          .selectFrom(Table.name)
          .select("event_form_id")
          .where("clinic_id", "=", clinicId)
          .where("is_deleted", "=", false)
          .execute();

        return result.map((r) => r.event_form_id);
      },
    );

    /**
     * Get all clinic IDs assigned to an event form
     */
    export const getClinicIdsByForm = serverOnly(
      async (eventFormId: string): Promise<string[]> => {
        const result = await db
          .selectFrom(Table.name)
          .select("clinic_id")
          .where("event_form_id", "=", eventFormId)
          .where("is_deleted", "=", false)
          .execute();

        return result.map((r) => r.clinic_id);
      },
    );

    /**
     * Get all assignments for multiple clinics
     */
    export const getFormIdsByClinics = serverOnly(
      async (clinicIds: string[]): Promise<string[]> => {
        if (clinicIds.length === 0) return [];

        const result = await db
          .selectFrom(Table.name)
          .select("event_form_id")
          .where("clinic_id", "in", clinicIds)
          .where("is_deleted", "=", false)
          .execute();

        // Return unique form IDs
        return [...new Set(result.map((r) => r.event_form_id))];
      },
    );

    /**
     * Assign multiple forms to a clinic
     */
    export const assignFormsToClinic = serverOnly(
      async (clinicId: string, eventFormIds: string[]): Promise<void> => {
        for (const formId of eventFormIds) {
          await assignFormToClinic(clinicId, formId);
        }
      },
    );

    /**
     * Unassign multiple forms from a clinic
     */
    export const unassignFormsFromClinic = serverOnly(
      async (clinicId: string, eventFormIds: string[]): Promise<void> => {
        for (const formId of eventFormIds) {
          await unassignFormFromClinic(clinicId, formId);
        }
      },
    );
  }
}

export default ClinicEventForm;
