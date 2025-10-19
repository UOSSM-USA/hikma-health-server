import { Either, Option, Schema } from "effect";
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
  JSONColumnType,
  CompiledQuery,
} from "kysely";
import db from "@/db";
import { sql } from "kysely";
import { serverOnly } from "@tanstack/react-start";
import { v1 as uuidv1 } from "uuid";
import PatientAdditionalAttribute from "./patient-additional-attribute";
import Appointment from "./appointment";
import Prescription from "./prescription";
import Visit from "./visit";
import Event from "./event";
import { safeJSONParse, safeStringify, toSafeDateString } from "@/lib/utils";
import UserClinicPermissions from "./user-clinic-permissions";

namespace Patient {
  // export type T = {
  //   id: string;
  //   given_name: Option.Option<string>;
  //   surname: Option.Option<string>;
  //   date_of_birth: Option.Option<Date>;
  //   citizenship: Option.Option<string>;
  //   hometown: Option.Option<string>;
  //   phone: Option.Option<string>;
  //   sex: Option.Option<string>;
  //   camp: Option.Option<string>;
  //   additional_data: Record<string, any>;
  //   image_timestamp: Option.Option<Date>;
  //   metadata: Record<string, any>;
  //   photo_url: Option.Option<string>;
  //   government_id: Option.Option<string>;
  //   external_patient_id: Option.Option<string>;
  //   is_deleted: boolean;
  //   created_at: Date;
  //   updated_at: Date;
  //   last_modified: Date;
  //   server_created_at: Date;
  //   deleted_at: Option.Option<Date>;
  // };

  // export type WithAttributes = T & {
  //   additional_attributes: {
  //     [uuid: string]: {
  //       attribute: string;
  //       boolean_value: Option.Option<boolean | string>;
  //       date_value: Option.Option<Date | string>;
  //       number_value: Option.Option<number | string>;
  //       string_value: Option.Option<string>;
  //     };
  //   };
  // };

  export type RenderedRows = {
    columns: string[];
    values: Array<Record<string, string | number | Date | boolean>>;
  };

  export const PatientSchema = Schema.Struct({
    id: Schema.String,
    given_name: Schema.OptionFromNonEmptyTrimmedString,
    surname: Schema.OptionFromNonEmptyTrimmedString,
    date_of_birth: Schema.OptionFromNullOr(Schema.DateFromSelf),
    citizenship: Schema.OptionFromNonEmptyTrimmedString,
    hometown: Schema.OptionFromNonEmptyTrimmedString,
    phone: Schema.OptionFromNonEmptyTrimmedString,
    sex: Schema.OptionFromNonEmptyTrimmedString,
    camp: Schema.OptionFromNonEmptyTrimmedString,
    additional_data: Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
    image_timestamp: Schema.OptionFromNullOr(Schema.Date),
    metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    photo_url: Schema.OptionFromNullOr(Schema.String),
    government_id: Schema.OptionFromNullOr(Schema.String),
    external_patient_id: Schema.OptionFromNullOr(Schema.String),
    is_deleted: Schema.Boolean,
    created_at: Schema.DateFromSelf,
    updated_at: Schema.DateFromSelf,
    last_modified: Schema.DateFromSelf,
    server_created_at: Schema.DateFromSelf,
    deleted_at: Schema.OptionFromNullOr(Schema.DateFromSelf),
    primary_clinic_id: Schema.OptionFromNullOr(Schema.String),
    last_modified_by: Schema.OptionFromNullOr(Schema.String),
  });

  // Define the additional attributes schema
  export const AttributeValueSchema = Schema.Struct({
    attribute: Schema.String,
    boolean_value: Schema.OptionFromNullOr(
      Schema.Union(Schema.Boolean, Schema.String),
    ),
    date_value: Schema.OptionFromNullOr(
      Schema.Union(Schema.Date, Schema.String),
    ),
    number_value: Schema.OptionFromNullOr(
      Schema.Union(Schema.Number, Schema.String),
    ),
    string_value: Schema.OptionFromNullOr(Schema.String),
  });

  // Define the patient with attributes schema
  export const PatientWithAttributesSchema = Schema.extend(
    PatientSchema,
    Schema.Struct({
      additional_attributes: Schema.Record({
        key: Schema.String,
        value: AttributeValueSchema,
      }),
    }),
  );

  export type T = typeof PatientWithAttributesSchema.Type;
  export type EncodedT = typeof PatientWithAttributesSchema.Encoded;
  export type Attributes = typeof AttributeValueSchema.Type;

  //   export type T = Schema.Type<typeof PatientSchema>;
  //   export type WithAttributes = Schema.Type<typeof PatientWithAttributesSchema>;

  /**
   * Convert a database entry into a T entry
   * @param entry The database entry
   * @returns {Either.Either<Patient.T, Error>} entry
   */
  export const fromDbEntry = (
    entry: Table.Patients & { additional_attributes: Record<string, any> },
  ): Either.Either<Patient.T, Error> => {
    const additional_attributes = Object.entries(
      entry.additional_attributes,
    ).reduce((acc, [key, value]) => {
      acc[key as keyof Patient.Attributes] =
        Schema.decodeUnknownEither(AttributeValueSchema)(value);
      // acc[key as keyof Patient.Attributes] = {
      //   attribute: value.attribute,
      //   boolean_value: Option.fromNullable(value.boolean_value),
      //   date_value: Option.fromNullable(value.date_value),
      //   number_value: Option.fromNullable(value.number_value),
      //   string_value: Option.fromNullable(value.string_value),
      // };
      return acc;
    }, {}) as Patient.Attributes;
    // entry.additional_attributes
    const patient = Schema.decodeUnknownEither(PatientSchema)({
      ...entry,
      date_of_birth: entry.date_of_birth,
    }).pipe(
      Either.map(
        (patient) =>
          ({
            ...patient,

            additional_attributes,
          }) as unknown as Patient.T,
      ),
    );

    return patient;
  };

  export namespace Table {
    export const ALWAYS_PUSH_TO_MOBILE = false;
    export const name = "patients";
    /** The name of the table in the mobile database */
    export const mobileName = "patients";
    export const columns = {
      id: "id",
      given_name: "given_name",
      surname: "surname",
      date_of_birth: "date_of_birth",
      citizenship: "citizenship",
      hometown: "hometown",
      phone: "phone",
      sex: "sex",
      camp: "camp",
      additional_data: "additional_data",
      image_timestamp: "image_timestamp",
      metadata: "metadata",
      photo_url: "photo_url",
      government_id: "government_id",
      external_patient_id: "external_patient_id",
      is_deleted: "is_deleted",
      created_at: "created_at",
      updated_at: "updated_at",
      last_modified: "last_modified",
      server_created_at: "server_created_at",
      deleted_at: "deleted_at",
      primary_clinic_id: "primary_clinic_id",
      last_modified_by: "last_modified_by",
    };

    export interface T {
      id: string;
      given_name: string | null;
      surname: string | null;
      date_of_birth: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
      citizenship: string | null;
      hometown: string | null;
      phone: string | null;
      sex: string | null;
      camp: string | null;
      additional_data: JSONColumnType<Record<string, any>>;
      image_timestamp: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
      metadata: JSONColumnType<Record<string, any>>;
      photo_url: string | null;
      government_id: string | null;
      external_patient_id: string | null;
      is_deleted: Generated<boolean>;
      created_at: Generated<ColumnType<Date, string | undefined, never>>;
      updated_at: Generated<
        ColumnType<Date, string | undefined, string | undefined>
      >;
      last_modified: Generated<ColumnType<Date, string | undefined, never>>;
      server_created_at: Generated<ColumnType<Date, string | undefined, never>>;
      deleted_at: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
      primary_clinic_id: string | null;
      last_modified_by: string | null;
    }

    export type Patients = Selectable<T>;
    export type NewPatients = Insertable<T>;
    export type PatientsUpdate = Updateable<T>;
  }

  // METHODS START HERE:

  /**
   * Register a new patient
   * @param {{baseFields: Patient.T, additionalAttributes: PatientAdditionalAttribute.T[]}} patient
   */
  export const register = serverOnly(
    async ({
      baseFields,
      additionalAttributes,
    }: {
      baseFields: Patient.T;
      additionalAttributes: PatientAdditionalAttribute.T[];
    }) => {
      // PermissionsCheck
      const clinicIds =
        await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
          "can_register_patients",
        );

      const primaryClinicId = Option.getOrElse(
        baseFields.primary_clinic_id,
        () => null,
      );

      if (primaryClinicId && !clinicIds.includes(primaryClinicId)) {
        throw new Error("Unauthorized");
      }

      const patientId = uuidv1();

      const ptObject = {
        id: patientId,
        given_name: Option.getOrElse(baseFields.given_name, () => null),
        surname: Option.getOrElse(baseFields.surname, () => null),
        date_of_birth: Option.getOrElse(
          Option.map(
            baseFields.date_of_birth,
            (date) => sql`${date.toISOString()}::date`,
          ),
          () => null,
        ),
        citizenship: Option.getOrElse(baseFields.citizenship, () => null),
        hometown: Option.getOrElse(baseFields.hometown, () => null),
        phone: Option.getOrElse(baseFields.phone, () => null),
        sex: Option.getOrElse(baseFields.sex, () => null),
        camp: Option.getOrElse(baseFields.camp, () => null),
        additional_data: sql`${JSON.stringify(
          baseFields.additional_data,
        )}::jsonb`,
        image_timestamp: Option.getOrElse(
          Option.map(
            baseFields.image_timestamp,
            (date) => sql`${date.toISOString()}::timestamp with time zone`,
          ),
          () => null,
        ),
        metadata: sql`${JSON.stringify(baseFields.metadata)}::jsonb`,
        photo_url: Option.getOrElse(baseFields.photo_url, () => null),
        government_id: Option.getOrElse(baseFields.government_id, () => null),
        external_patient_id: Option.getOrElse(
          baseFields.external_patient_id,
          () => null,
        ),
        is_deleted: baseFields.is_deleted,
        created_at: sql`now()::timestamp with time zone`,
        updated_at: sql`now()::timestamp with time zone`,
        last_modified: sql`now()::timestamp with time zone`,
        server_created_at: sql`now()::timestamp with time zone`,
        deleted_at: Option.getOrElse(
          Option.map(
            baseFields.deleted_at,
            (date) => sql`${date.toISOString()}::timestamp with time zone`,
          ),
          () => null,
        ),
        primary_clinic_id: primaryClinicId,
        last_modified_by: Option.getOrElse(
          baseFields.last_modified_by,
          () => null,
        ),
      };

      const patientAttributes = additionalAttributes.map((attr) => ({
        id: uuidv1(),
        patient_id: patientId,
        attribute_id: attr.attribute_id,
        attribute: attr.attribute,
        number_value: Option.getOrElse(attr.number_value, () => null),
        string_value: Option.getOrElse(attr.string_value, () => null),
        date_value: Option.getOrElse(
          Option.map(attr.date_value, (date) => new Date(date)),
          () => null,
        ),
        boolean_value: Option.getOrElse(attr.boolean_value, () => null),
        metadata: attr.metadata,
        is_deleted: baseFields.is_deleted,
        created_at: sql`now()::timestamp with time zone`,
        updated_at: sql`now()::timestamp with time zone`,
        last_modified: sql`now()::timestamp with time zone`,
        server_created_at: sql`now()::timestamp with time zone`,
        deleted_at: Option.getOrElse(
          Option.map(
            baseFields.deleted_at,
            (date) => sql`${date.toISOString()}::timestamp with time zone`,
          ),
          () => null,
        ),
      }));

      return await db.transaction().execute(async (trx) => {
        const patient = await trx
          .insertInto(Patient.Table.name)
          .values(ptObject)
          .returning("id")
          .executeTakeFirstOrThrow();

        // Only insert additional attributes if there are any
        if (patientAttributes.length > 0) {
          await trx
            .insertInto(PatientAdditionalAttribute.Table.name)
            .values(patientAttributes)
            .execute();
        }

        return patient;
      });
    },
  );

  /**
   * Format date fields in a patient record to ISO strings
   * @param patient Patient record with potential Date objects
   * @returns Patient record with dates formatted as ISO strings
   */
  const formatPatientDates = <T extends Partial<Table.Patients>>(
    patient: T,
  ) => ({
    ...patient,
    created_at:
      patient.created_at instanceof Date
        ? patient.created_at.toISOString()
        : patient.created_at,
    updated_at:
      patient.updated_at instanceof Date
        ? patient.updated_at.toISOString()
        : patient.updated_at,
    last_modified:
      patient.last_modified instanceof Date
        ? patient.last_modified.toISOString()
        : patient.last_modified,
    deleted_at:
      patient.deleted_at instanceof Date
        ? patient.deleted_at.toISOString()
        : patient.deleted_at,
    date_of_birth:
      patient.date_of_birth instanceof Date
        ? patient.date_of_birth.toISOString()
        : patient.date_of_birth,
  });

  /**
   * Build the base SQL query for retrieving patients with their additional attributes
   * @returns SQL query template
   */
  const buildPatientAttributesBaseQuery = (clinicIds: string[]) => sql`
    SELECT
      p.*,
      COALESCE(json_object_agg(
        pa.attribute_id,
        json_build_object(
          'attribute', pa.attribute,
          'number_value', pa.number_value,
          'string_value', pa.string_value,
          'date_value', pa.date_value,
          'boolean_value', pa.boolean_value
        )
      ) FILTER (WHERE pa.attribute_id IS NOT NULL), '{}') AS additional_attributes
    FROM patients p
    LEFT JOIN patient_additional_attributes pa ON p.id = pa.patient_id
    WHERE p.is_deleted = false
    AND (${clinicIds.length > 0 ? sql`p.primary_clinic_id IN (${sql.join(clinicIds)})  OR p.primary_clinic_id IS NULL` : sql`p.primary_clinic_id IS NULL`})
  `;

  /**
   * Build the base SQL for retrieving patients by a given list of ids and their additional attributes
   * @param ids List of patient ids
   * @returns SQL query template
   */
  const buildPatientAttributesByIdQuery = (
    clinicIds: string[],
    patientIds: string[],
  ) => sql`
    SELECT
      p.*,
      COALESCE(json_object_agg(
        pa.attribute_id,
        json_build_object(
          'attribute', pa.attribute,
          'number_value', pa.number_value,
          'string_value', pa.string_value,
          'date_value', pa.date_value,
          'boolean_value', pa.boolean_value
        )
      ) FILTER (WHERE pa.attribute_id IS NOT NULL), '{}') AS additional_attributes
    FROM patients p
    LEFT JOIN patient_additional_attributes pa ON p.id = pa.patient_id
    WHERE p.is_deleted = false
    AND (p.primary_clinic_id IN (${sql.join(clinicIds)}) OR p.primary_clinic_id IS NULL)
    AND p.id IN (${sql.join(patientIds)})
    GROUP BY p.id
  `;

  /**
   * Execute a patient query and format the results
   * @param query The SQL query to execute
   * @returns Formatted patient records
   */
  const executePatientQuery = async <T extends { rows: any[] }>(
    query: CompiledQuery<unknown>,
  ) => {
    const result = await db.executeQuery<
      Table.Patients & { additional_attributes: Record<string, any> }
    >(query);

    return result.rows.map(formatPatientDates);
  };

  type PatientsQueryResult = {
    patients: Patient.EncodedT[];
    pagination: {
      offset: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };

  export namespace API {
    export const getById = serverOnly(
      async (patientId: string): Promise<Patient.EncodedT> => {
        // permissions check
        const clinicIds =
          await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
            "can_view_history",
          );
        // ${patientIds.length > 0 ? sql`AND p.id IN (${sql.join(patientIds)})` : ""}
        //

        // Build the query using the base query and adding pagination
        const query = sql`
        ${buildPatientAttributesByIdQuery(clinicIds, [patientId])}
      `.compile(db);

        const patient = await executePatientQuery(query);

        return patient?.[0];
      },
    );
    /**
     * Get all patients with their additional attributes
     * @param {Object} options - Pagination and filter options
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {number} [options.offset=0] - Number of records to skip
     * @param {boolean} [options.includeCount=false] - Whether to include total count in response
     * @returns Object containing patients array and pagination metadata
     */
    export const getAllWithAttributes = serverOnly(
      async (options?: {
        limit?: number;
        offset?: number;
        includeCount?: boolean;
      }): Promise<PatientsQueryResult> => {
        const { limit, offset = 0, includeCount = false } = options || {};

        // permissions check
        const clinicIds =
          await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
            "can_view_history",
          );

        // Build the query using the base query and adding pagination
        const query = sql`
        ${buildPatientAttributesBaseQuery(clinicIds)}
        GROUP BY p.id
        ORDER BY p.updated_at DESC
        ${offset ? sql`OFFSET ${offset}` : sql``}
        ${limit ? sql`LIMIT ${limit}` : sql``}
      `.compile(db);

        // Execute the query and get formatted patients
        const patients = await executePatientQuery(query);

        // Get total count if requested
        let totalCount = 0;
        if (includeCount) {
          const countQuery = sql`
          SELECT COUNT(*) as total
          FROM patients
          WHERE is_deleted = false
        `.compile(db);

          const countResult = await db.executeQuery<{ total: number }>(
            countQuery,
          );
          totalCount = countResult.rows[0]?.total || 0;
        }

        // Return both the patients and pagination metadata
        return {
          // @ts-expect-error issue with dates being turned into iso strings
          patients,
          pagination: {
            offset,
            limit: limit ?? 0,
            total: totalCount,
            hasMore: limit ? patients.length === limit : false,
          },
        };
      },
    );

    /**
     * Search for patients by name and other fields
     * @param options Search and pagination options
     * @param {string} options.searchQuery The search string to look for in patient fields
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {number} [options.offset=0] - Number of records to skip
     * @param {boolean} [options.includeCount=false] - Whether to include total count in response
     * @returns Object containing matching patients array and pagination metadata
     */
    export const search = serverOnly(
      async ({
        searchQuery,
        offset = 0,
        limit,
        includeCount = false,
      }: {
        searchQuery: string;
        offset?: number;
        limit?: number;
        includeCount?: boolean;
      }): Promise<PatientsQueryResult> => {
        const searchPattern = `%${searchQuery}%`;

        // permissions check
        const clinicIds =
          await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
            "can_view_history",
          );

        // Build the query using the base query and adding search condition with pagination
        // Search across multiple patient fields and additional attributes
        const query = sql`
      ${buildPatientAttributesBaseQuery(clinicIds)}
      AND (
        LOWER(p.given_name) LIKE LOWER(${searchPattern})
        OR LOWER(p.surname) LIKE LOWER(${searchPattern})
        OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(${searchPattern})
        OR LOWER(COALESCE(p.camp, '')) LIKE LOWER(${searchPattern})
        OR LOWER(COALESCE(p.citizenship, '')) LIKE LOWER(${searchPattern})
        OR LOWER(COALESCE(p.hometown, '')) LIKE LOWER(${searchPattern})
        OR LOWER(CAST(p.id AS TEXT)) = LOWER(${searchQuery})
        OR EXISTS (
          SELECT 1
          FROM patient_additional_attributes paa
          WHERE paa.patient_id = p.id
          AND (
            LOWER(COALESCE(paa.string_value, '')) LIKE LOWER(${searchPattern})
            OR CAST(paa.number_value AS TEXT) LIKE ${searchPattern}
            OR CASE WHEN paa.boolean_value = true AND LOWER(${searchQuery}) IN ('true', 'yes', '1') THEN true
                WHEN paa.boolean_value = false AND LOWER(${searchQuery}) IN ('false', 'no', '0') THEN true
                ELSE false
               END
            OR LOWER(COALESCE(paa.attribute, '')) LIKE LOWER(${searchPattern})
          )
        )
      )
      GROUP BY p.id
      ORDER BY p.updated_at DESC
      ${offset ? sql`OFFSET ${offset}` : sql``}
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `.compile(db);

        // Execute the query and get formatted patients
        const patients = await executePatientQuery(query);

        // Get total count if requested
        let totalCount = 0;
        if (includeCount) {
          const countQuery = sql`
          SELECT COUNT(*) as total
          FROM patients p
          WHERE p.is_deleted = false
          AND (
            LOWER(p.given_name) LIKE LOWER(${searchPattern})
            OR LOWER(p.surname) LIKE LOWER(${searchPattern})
            OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(${searchPattern})
            OR LOWER(COALESCE(p.camp, '')) LIKE LOWER(${searchPattern})
            OR LOWER(COALESCE(p.citizenship, '')) LIKE LOWER(${searchPattern})
            OR LOWER(COALESCE(p.hometown, '')) LIKE LOWER(${searchPattern})
            OR LOWER(CAST(p.id AS TEXT)) = LOWER(${searchQuery})
            OR EXISTS (
              SELECT 1
              FROM patient_additional_attributes paa
              WHERE paa.patient_id = p.id
              AND (
                LOWER(COALESCE(paa.string_value, '')) LIKE LOWER(${searchPattern})
                OR CAST(paa.number_value AS TEXT) LIKE ${searchPattern}
                OR CASE WHEN paa.boolean_value = true AND LOWER(${searchQuery}) IN ('true', 'yes', '1') THEN true
                    WHEN paa.boolean_value = false AND LOWER(${searchQuery}) IN ('false', 'no', '0') THEN true
                    ELSE false
                   END
                OR LOWER(COALESCE(paa.attribute, '')) LIKE LOWER(${searchPattern})
              )
            )
          )
        `.compile(db);

          const countResult = await db.executeQuery<{ total: number }>(
            countQuery,
          );
          totalCount = countResult.rows[0]?.total || 0;
        }

        // Return both the patients and pagination metadata
        return {
          patients,
          pagination: {
            offset,
            limit: limit ?? 0,
            total: totalCount,
            hasMore: limit ? patients.length === limit : false,
          },
        };
      },
    );

    /**
     * Upsert a patient record without the additional patient attributes
     */
    export const upsert = serverOnly(async (patient: Patient.EncodedT) => {
      // permissions check
      await UserClinicPermissions.API.isAuthorizedWithClinic(
        patient.primary_clinic_id,
        "can_register_patients",
      );
      // const clinicIds =
      //   await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
      //     "can_register_patients",
      //   );

      // if (
      //   patient.primary_clinic_id &&
      //   !clinicIds.includes(patient.primary_clinic_id)
      // ) {
      //   throw new Error("Unauthorized");
      // }
      return await upsert_core(patient);
    });

    /**
     * Upsert a patient record without the additional patient attributes
     * SYNC ONLY METHOD
     */
    export const DANGEROUS_SYNC_ONLY_upsert = serverOnly(
      async (patient: Patient.EncodedT) => {
        return await upsert_core(patient);
      },
    );

    /**
     * The core logic for upserting a patient record without the additional patient attributes
     * without any authentication or authorization checks
     * DO NOT EXPORT OR CALL THIS OUTSIDE OF SYNC FUNCTIONS
     */
    const upsert_core = serverOnly(async (patient: Patient.EncodedT) => {
      try {
        return await db
          .insertInto(Patient.Table.name)
          .values({
            id: patient.id,
            given_name: patient.given_name,
            surname: patient.surname,
            date_of_birth: patient.date_of_birth
              ? sql`${patient.date_of_birth}::timestamp with time zone`
              : null,
            citizenship: patient.citizenship,
            photo_url: patient.photo_url || null,
            image_timestamp: patient.image_timestamp || null,
            hometown: patient.hometown,
            additional_data: sql`${JSON.stringify(
              safeJSONParse(patient.additional_data, {}),
            )}::jsonb`,
            government_id: patient.government_id,
            external_patient_id: patient.external_patient_id,
            primary_clinic_id: patient.primary_clinic_id,
            last_modified_by: patient.last_modified_by,
            phone: patient.phone,
            sex: patient.sex,
            camp: patient.camp,
            metadata: sql`${JSON.stringify(
              safeJSONParse(patient.metadata, {}),
            )}::jsonb`,
            is_deleted: patient.is_deleted,
            created_at: sql`${toSafeDateString(
              patient.created_at,
            )}::timestamp with time zone`,
            updated_at: sql`${toSafeDateString(
              patient.updated_at,
            )}::timestamp with time zone`,
            last_modified: sql`now()::timestamp with time zone`,
            server_created_at: sql`now()::timestamp with time zone`,
            deleted_at: null,
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              given_name: (eb) => eb.ref("excluded.given_name"),
              surname: (eb) => eb.ref("excluded.surname"),
              date_of_birth: (eb) => eb.ref("excluded.date_of_birth"),
              citizenship: (eb) => eb.ref("excluded.citizenship"),
              photo_url: (eb) => eb.ref("excluded.photo_url"),
              image_timestamp: (eb) => eb.ref("excluded.image_timestamp"),
              hometown: (eb) => eb.ref("excluded.hometown"),
              additional_data: (eb) => eb.ref("excluded.additional_data"),
              government_id: (eb) => eb.ref("excluded.government_id"),
              external_patient_id: (eb) =>
                eb.ref("excluded.external_patient_id"),
              primary_clinic_id: (eb) => eb.ref("excluded.primary_clinic_id"),
              last_modified_by: (eb) => eb.ref("excluded.last_modified_by"),
              phone: (eb) => eb.ref("excluded.phone"),
              sex: (eb) => eb.ref("excluded.sex"),
              camp: (eb) => eb.ref("excluded.camp"),
              metadata: (eb) => eb.ref("excluded.metadata"),
              is_deleted: (eb) => eb.ref("excluded.is_deleted"),
              updated_at: sql`${toSafeDateString(
                patient.updated_at,
              )}::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            }),
          )
          .executeTakeFirstOrThrow();
      } catch (error) {
        console.error("Patient upsert operation failed:", {
          operation: "patient_upsert",
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.constructor.name : "Unknown",
            stack: error instanceof Error ? error.stack : undefined,
          },
          context: {
            patientId: patient.id,
          },
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    });

    /**
     * Soft Delete a patient record without the additional patient attributes
     * DO NOT EXPORT OR USE THIS FUNCTION DIRECTLY
     */
    export const softDelete = serverOnly(async (id: string) => {
      // permissions check
      const clinicIds =
        await UserClinicPermissions.API.getClinicIdsWithPermissionFromToken(
          "can_delete_records",
        );

      const patient = await db
        .selectFrom("patients")
        .where("id", "=", id)
        .select("primary_clinic_id")
        .executeTakeFirst();

      if (!patient) {
        throw new Error("Patient not found");
      }

      if (
        patient.primary_clinic_id &&
        !clinicIds.includes(patient.primary_clinic_id)
      ) {
        throw new Error("Unauthorized");
      }

      return await softDelete_core(id);
    });

    /**
     * ❌ DO NOT USE
     */
    export const DANGEROUS_SYNC_ONLY_softDelete = serverOnly(
      async (id: string) => {
        return softDelete_core(id);
      },
    );

    /**
     * Soft Delete a patient record without the additional patient attributes
     * DO NOT EXPORT OR USE THIS FUNCTION DIRECTLY
     */
    const softDelete_core = serverOnly(async (id: string) => {
      // NOTE: Could easily call something like Appointment.API.softDelete(id, trx) - but we
      // still dont know how the tanstackstart api calling convention for "server only" will
      // evolve with respect to transactions.
      try {
        await db.transaction().execute(async (trx) => {
          // Soft delete the patient
          await trx
            .updateTable(Patient.Table.name)
            .set({
              is_deleted: true,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("id", "=", id)
            .execute();

          // Soft delete the patient additional attributes
          await trx
            .updateTable(PatientAdditionalAttribute.Table.name)
            .set({
              is_deleted: true,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("patient_id", "=", id)
            .execute();

          // Soft delete the appointments
          await trx
            .updateTable(Appointment.Table.name)
            .set({
              is_deleted: true,
              deleted_at: sql`now()::timestamp with time zone`,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("patient_id", "=", id)
            .execute();

          // Soft delete the prescriptions
          await trx
            .updateTable(Prescription.Table.name)
            .set({
              is_deleted: true,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("patient_id", "=", id)
            .execute();

          // Soft delete the visits
          await trx
            .updateTable(Visit.Table.name)
            .set({
              is_deleted: true,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("id", "=", id)
            .execute();

          // Soft delete the events
          await trx
            .updateTable(Event.Table.name)
            .set({
              is_deleted: true,
              updated_at: sql`now()::timestamp with time zone`,
              last_modified: sql`now()::timestamp with time zone`,
            })
            .where("id", "=", id)
            .execute();
        });
      } catch (error) {
        console.error("Patient soft delete operation failed:", {
          operation: "patient_soft_delete",
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.constructor.name : "Unknown",
            stack: error instanceof Error ? error.stack : undefined,
          },
          context: {
            patientId: id,
          },
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    });

    export const DANGEROUSLY_GET_CLINIC_ID_BY_ID = serverOnly(
      async (id: string) => {
        const patient = await db
          .selectFrom("patients")
          .select("primary_clinic_id")
          .where("id", "=", id)
          .executeTakeFirst();
        return patient?.primary_clinic_id;
      },
    );
  }

  export const getPatientClinicId = serverOnly(async (id: string) => {
    const patient = await db
      .selectFrom("patients")
      .select("primary_clinic_id")
      .where("id", "=", id)
      .executeTakeFirst();
    return patient?.primary_clinic_id;
  });

  // export const ignorePatientRowFields = [
  //   "metadata",
  //   "deleted_at",
  //   "additional_attributes",
  //   "is_deleted",
  //   "last_modified",
  //   "photo_url",
  //   "server_created_at",
  //   "image_timestamp",
  //   "additional_data",
  // ];

  // const allIgnoredFields = [
  //   ...ignorePatientRowFields,
  //   "created_at",
  //   "updated_at",
  // ];

  export namespace Sync {
    export const upsertFromDelta = serverOnly(
      async (delta: Patient.EncodedT) => {
        await API.DANGEROUS_SYNC_ONLY_upsert(delta);
      },
    );
    export const deleteFromDelta = serverOnly(async (id: string) => {
      await API.DANGEROUS_SYNC_ONLY_softDelete(id);
    });
  }
}

export default Patient;
