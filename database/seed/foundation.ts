// Reference data every patient hangs off: clinics, staff, forms, the drug
// catalogue and its stock, devices, content and reports. Built once per run and
// handed to `patients.ts` as a `SeedContext` of ids to draw from.

import type { Insertable } from "kysely";
import type { DB } from "../types/schema/hh.js";
import {
  CLINIC_NAMES,
  COUNTRIES,
  DEPARTMENT_TEMPLATES,
  DEVICE_TYPES,
  DRUGS,
  EDUCATION_TOPICS,
  EDUCATION_VISIBILITY,
  EVENT_FORM_TEMPLATES,
  FREE_TEXT_NOTES,
  GIVEN_NAMES,
  REGISTRATION_FIELD_TEMPLATES,
  REPORT_COMPONENT_TEMPLATES,
  REPORT_TEMPLATES,
  RESOURCE_MIMETYPES,
  SEEDED_ROLES,
  SUPPLIERS,
  SURNAMES,
  type EventFieldTemplate,
} from "./catalog.js";
import {
  type WriteBatch,
  batch,
  jsonb,
  notDeleted,
  seedMetadata,
  stamps,
} from "./common.js";
import {
  type Rng,
  addDays,
  dateBetween,
  floatBetween,
  hexString,
  intBetween,
  nanoId,
  pick,
  pickSome,
  uuid,
} from "./random.js";

export type ClinicRef = {
  readonly id: string;
  readonly name: string;
  readonly departments: readonly { id: string; name: string }[];
};

export type UserRef = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly clinicId: string;
};

export type BuiltField = EventFieldTemplate & {
  readonly id: string;
  readonly optionIds: readonly string[];
};

export type FormRef = {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly BuiltField[];
};

export type DrugRef = {
  readonly id: string;
  readonly genericName: string;
  readonly form: string;
  readonly route: string;
  readonly dosageQuantity: number;
  readonly dosageUnits: string;
  // The batch each clinic holds stock of. Dispensing draws from this one so the
  // `dispensing_records` trigger deducts against a real inventory row.
  readonly stockBatchId: string;
};

export type AttributeFieldRef = {
  readonly id: string;
  readonly label: string;
  readonly valueKind: "string" | "number" | "boolean" | "date";
};

export type SeedContext = {
  readonly runTag: string;
  readonly now: Date;
  readonly historyStart: Date;
  readonly clinics: readonly ClinicRef[];
  readonly users: readonly UserRef[];
  readonly providers: readonly UserRef[];
  readonly forms: readonly FormRef[];
  readonly drugs: readonly DrugRef[];
  readonly attributeFields: readonly AttributeFieldRef[];
};

export type FoundationOptions = {
  readonly runTag: string;
  readonly now: Date;
  readonly historyStart: Date;
  readonly clinicCount: number;
  readonly usersPerClinic: number;
  readonly drugCount: number;
  readonly passwordHash: string | null;
  // Reuse the registration form already in the database when there is one; the
  // app reads every row in that table, so a second form would change which one
  // it shows.
  readonly existingAttributeFields: readonly AttributeFieldRef[] | null;
};

export type Foundation = {
  readonly batches: readonly WriteBatch[];
  readonly context: SeedContext;
};

const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  registrar: {
    can_register_patients: true,
    can_view_history: true,
  },
  provider: {
    can_register_patients: true,
    can_view_history: true,
    can_edit_records: true,
    can_download_patient_reports: true,
    can_prescribe_medications: true,
  },
  admin: {
    can_register_patients: true,
    can_view_history: true,
    can_edit_records: true,
    can_delete_records: true,
    can_edit_other_provider_event: true,
    can_download_patient_reports: true,
    can_prescribe_medications: true,
    can_dispense_medications: true,
    can_delete_patient_visits: true,
    can_delete_patient_records: true,
    is_clinic_admin: true,
  },
};

const PERMISSION_KEYS: readonly string[] = [
  "can_register_patients",
  "can_view_history",
  "can_edit_records",
  "can_delete_records",
  "can_edit_other_provider_event",
  "can_download_patient_reports",
  "can_prescribe_medications",
  "can_dispense_medications",
  "can_delete_patient_visits",
  "can_delete_patient_records",
  "is_clinic_admin",
];

const BCRYPT_ALPHABET =
  "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// A well-formed bcrypt digest with no known preimage: `bcrypt.compare` returns
// false for every input rather than throwing on a malformed hash. Seeded
// accounts are therefore data, not credentials.
const unusablePasswordHash = (rng: Rng): string => {
  let body = "";
  for (let index = 0; index < 53; index += 1) {
    body += BCRYPT_ALPHABET[Math.floor(rng() * BCRYPT_ALPHABET.length)];
  }
  return `$2b$10$${body}`;
};

const buildClinics = (
  rng: Rng,
  options: FoundationOptions,
): {
  rows: Insertable<DB["clinics"]>[];
  departmentRows: Insertable<DB["clinic_departments"]>[];
  refs: ClinicRef[];
} => {
  const rows: Insertable<DB["clinics"]>[] = [];
  const departmentRows: Insertable<DB["clinic_departments"]>[] = [];
  const refs: ClinicRef[] = [];

  for (let index = 0; index < options.clinicCount; index += 1) {
    const id = uuid(rng);
    const place = pick(rng, COUNTRIES);
    const baseName = CLINIC_NAMES[index % CLINIC_NAMES.length] as string;
    const name = `${baseName} (${options.runTag})`;
    const createdAt = dateBetween(rng, options.historyStart, options.now);

    rows.push({
      id,
      name,
      address: `${intBetween(rng, 1, 200)} ${pick(rng, ["Market", "Station", "Hospital", "Union"])} Road`,
      city: pick(rng, place.cities),
      country: place.country,
      attributes: ["seed", index % 3 === 0 ? "mobile" : "fixed"],
      metadata: jsonb(seedMetadata(options.runTag)),
      is_archived: false,
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    const departments = pickSome(
      rng,
      DEPARTMENT_TEMPLATES,
      intBetween(rng, 3, DEPARTMENT_TEMPLATES.length),
    ).map((template) => ({ template, id: uuid(rng) }));

    for (const { template, id: departmentId } of departments) {
      departmentRows.push({
        id: departmentId,
        clinic_id: id,
        name: template.name,
        code: template.code,
        description: `${template.name} services at ${name}`,
        status: "active",
        can_dispense_medications: template.dispense,
        can_perform_labs: template.labs,
        can_perform_imaging: template.imaging,
        additional_capabilities: jsonb([]),
        metadata: jsonb(seedMetadata(options.runTag)),
        ...notDeleted,
        ...stamps(rng, createdAt, options.now),
      });
    }

    refs.push({
      id,
      name,
      departments: departments.map((d) => ({ id: d.id, name: d.template.name })),
    });
  }

  return { rows, departmentRows, refs };
};

const buildUsers = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  options: FoundationOptions,
): {
  rows: Insertable<DB["users"]>[];
  permissionRows: Insertable<DB["user_clinic_permissions"]>[];
  refs: UserRef[];
} => {
  const rows: Insertable<DB["users"]>[] = [];
  const permissionRows: Insertable<DB["user_clinic_permissions"]>[] = [];
  const refs: UserRef[] = [];

  clinics.forEach((clinic, clinicIndex) => {
    for (let index = 0; index < options.usersPerClinic; index += 1) {
      const id = uuid(rng);
      const role = SEEDED_ROLES[index % SEEDED_ROLES.length] as string;
      const name = `${pick(rng, GIVEN_NAMES)} ${pick(rng, SURNAMES)}`;
      const createdAt = dateBetween(rng, options.historyStart, options.now);
      const ordinal = clinicIndex * options.usersPerClinic + index;

      rows.push({
        id,
        name,
        role,
        email: `seed.${role}.${ordinal}.${options.runTag}@seed.invalid`,
        hashed_password: options.passwordHash ?? unusablePasswordHash(rng),
        instance_url: null,
        clinic_id: clinic.id,
        ...notDeleted,
        ...stamps(rng, createdAt, options.now),
      });

      const granted = ROLE_PERMISSIONS[role] ?? {};
      const permissions = Object.fromEntries(
        PERMISSION_KEYS.map((key) => [key, granted[key] === true]),
      );

      permissionRows.push({
        id: uuid(rng),
        user_id: id,
        clinic_id: clinic.id,
        created_by: null,
        last_modified_by: null,
        created_at: createdAt,
        updated_at: createdAt,
        ...permissions,
      });

      refs.push({ id, name, role, clinicId: clinic.id });
    }
  });

  return { rows, permissionRows, refs };
};

const buildFormField = (rng: Rng, template: EventFieldTemplate): BuiltField => ({
  ...template,
  id: nanoId(rng),
  optionIds: (template.options ?? []).map(() => nanoId(rng)),
});

const fieldToJson = (field: BuiltField): Record<string, unknown> => ({
  id: field.id,
  _tag: field.tag,
  name: field.name,
  fieldType: field.tag,
  inputType: field.inputType,
  required: field.required,
  description: field.description,
  ...(field.length ? { length: field.length } : {}),
  ...(field.units ? { units: field.units } : {}),
  ...(field.options
    ? {
        multi: field.multi === true,
        options: field.options.map((label, index) => ({
          id: field.optionIds[index],
          label,
          value: label,
        })),
      }
    : {}),
});

const buildEventForms = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  options: FoundationOptions,
): { rows: Insertable<DB["event_forms"]>[]; refs: FormRef[] } => {
  const rows: Insertable<DB["event_forms"]>[] = [];
  const refs: FormRef[] = [];

  for (const template of EVENT_FORM_TEMPLATES) {
    const id = uuid(rng);
    const name = `${template.name} (${options.runTag})`;
    const fields = template.fields.map((field) => buildFormField(rng, field));
    const createdAt = dateBetween(rng, options.historyStart, options.now);

    rows.push({
      id,
      name,
      description: template.description,
      language: "en",
      is_editable: true,
      is_snapshot_form: template.isSnapshot,
      form_fields: jsonb(fields.map(fieldToJson)),
      clinic_ids: jsonb(clinics.map((clinic) => clinic.id)),
      translations: jsonb([]),
      metadata: jsonb(seedMetadata(options.runTag)),
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    refs.push({ id, name, fields });
  }

  return { rows, refs };
};

const registrationFieldToJson = (
  field: (typeof REGISTRATION_FIELD_TEMPLATES)[number],
  id: string,
): Record<string, unknown> => ({
  id,
  label: field.label,
  column: field.column,
  unique: false,
  deleted: false,
  options: field.options ?? [],
  visible: true,
  position: field.position,
  required: field.required,
  baseField: field.baseFieldId !== undefined,
  fieldType: field.fieldType,
  isSearchField: field.isSearchField,
  showsInSummary: field.position <= 4,
});

// The custom (non-base) half of a registration form. Exported because a
// database that already has a form may have no custom fields at all, and
// `patient_additional_attributes` rows are meaningless without one to point at.
export const buildCustomRegistrationFields = (
  rng: Rng,
): { json: Record<string, unknown>[]; refs: AttributeFieldRef[] } => {
  const refs: AttributeFieldRef[] = [];
  const json = REGISTRATION_FIELD_TEMPLATES.filter(
    (field) => field.attributeValue !== undefined,
  ).map((field) => {
    const id = uuid(rng);
    refs.push({
      id,
      label: field.label.en,
      valueKind: field.attributeValue as AttributeFieldRef["valueKind"],
    });
    return registrationFieldToJson(field, id);
  });
  return { json, refs };
};

const buildRegistrationForm = (
  rng: Rng,
  options: FoundationOptions,
): {
  rows: Insertable<DB["patient_registration_forms"]>[];
  attributeFields: AttributeFieldRef[];
} => {
  if (options.existingAttributeFields !== null) {
    return { rows: [], attributeFields: [...options.existingAttributeFields] };
  }

  const baseFields = REGISTRATION_FIELD_TEMPLATES.filter(
    (field) => field.baseFieldId !== undefined,
  ).map((field) => registrationFieldToJson(field, field.baseFieldId as string));
  const custom = buildCustomRegistrationFields(rng);
  const fields = [...baseFields, ...custom.json];
  const attributeFields = custom.refs;

  const createdAt = dateBetween(rng, options.historyStart, options.now);

  return {
    rows: [
      {
        id: uuid(rng),
        clinic_id: null,
        name: "Patient Registration Form",
        fields: jsonb(fields),
        metadata: jsonb(seedMetadata(options.runTag)),
        ...notDeleted,
        ...stamps(rng, createdAt, options.now),
      },
    ],
    attributeFields,
  };
};

const buildPharmacy = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  users: readonly UserRef[],
  options: FoundationOptions,
): {
  drugRows: Insertable<DB["drug_catalogue"]>[];
  batchRows: Insertable<DB["drug_batches"]>[];
  inventoryRows: Insertable<DB["clinic_inventory"]>[];
  refs: DrugRef[];
} => {
  const drugRows: Insertable<DB["drug_catalogue"]>[] = [];
  const batchRows: Insertable<DB["drug_batches"]>[] = [];
  const inventoryRows: Insertable<DB["clinic_inventory"]>[] = [];
  const refs: DrugRef[] = [];

  for (let index = 0; index < options.drugCount; index += 1) {
    const drug = DRUGS[index % DRUGS.length] as (typeof DRUGS)[number];
    const id = uuid(rng);
    const createdAt = dateBetween(rng, options.historyStart, options.now);
    const recordedBy = pick(rng, users);

    drugRows.push({
      id,
      barcode: `SEED-${options.runTag}-${index.toString().padStart(4, "0")}`,
      generic_name: drug.generic,
      brand_name: drug.brand,
      form: drug.form,
      route: drug.route,
      dosage_quantity: drug.dosageQuantity,
      dosage_units: drug.dosageUnits,
      manufacturer: drug.manufacturer,
      sale_price: floatBetween(rng, 0.2, 45, 2),
      sale_currency: "USD",
      min_stock_level: intBetween(rng, 20, 100),
      max_stock_level: intBetween(rng, 2000, 8000),
      is_controlled: drug.controlled,
      requires_refrigeration: drug.refrigerated,
      is_active: true,
      notes: null,
      recorded_by_user_id: recordedBy.id,
      metadata: jsonb(seedMetadata(options.runTag)),
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    const batchIds: string[] = [];
    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const batchId = uuid(rng);
      const receivedDate = dateBetween(rng, options.historyStart, options.now);
      batchIds.push(batchId);
      batchRows.push({
        id: batchId,
        drug_id: id,
        batch_number: `B-${options.runTag}-${index}-${batchIndex}`,
        expiry_date: addDays(receivedDate, intBetween(rng, 120, 900)),
        manufacture_date: addDays(receivedDate, -intBetween(rng, 30, 400)),
        quantity_received: 20_000,
        quantity_remaining: 20_000,
        supplier_name: pick(rng, SUPPLIERS),
        purchase_price: floatBetween(rng, 0.1, 30, 2),
        purchase_currency: "USD",
        received_date: receivedDate,
        is_quarantined: false,
        recorded_by_user_id: recordedBy.id,
        metadata: jsonb(seedMetadata(options.runTag)),
        ...notDeleted,
        ...stamps(rng, receivedDate, options.now),
      });
    }

    const stockBatchId = batchIds[0] as string;
    const stockBatch = batchRows[batchRows.length - 3] as Insertable<
      DB["drug_batches"]
    >;

    for (const clinic of clinics) {
      inventoryRows.push({
        id: uuid(rng),
        clinic_id: clinic.id,
        drug_id: id,
        batch_id: stockBatchId,
        quantity_available: 10_000,
        reserved_quantity: 0,
        last_counted_at: dateBetween(rng, options.historyStart, options.now),
        recorded_by_user_id: recordedBy.id,
        batch_number: stockBatch.batch_number as string,
        batch_expiry_date: stockBatch.expiry_date as Date,
        metadata: jsonb(seedMetadata(options.runTag)),
        ...notDeleted,
        ...stamps(rng, createdAt, options.now),
      });
    }

    refs.push({
      id,
      genericName: drug.generic,
      form: drug.form,
      route: drug.route,
      dosageQuantity: drug.dosageQuantity,
      dosageUnits: drug.dosageUnits,
      stockBatchId,
    });
  }

  return { drugRows, batchRows, inventoryRows, refs };
};

const buildDevices = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  users: readonly UserRef[],
  options: FoundationOptions,
): {
  deviceRows: Insertable<DB["devices"]>[];
  pinRows: Insertable<DB["device_pin_codes"]>[];
} => {
  const deviceRows: Insertable<DB["devices"]>[] = [];
  const pinRows: Insertable<DB["device_pin_codes"]>[] = [];

  clinics.forEach((clinic, index) => {
    const profile = pick(rng, DEVICE_TYPES);
    const id = uuid(rng);
    const createdAt = dateBetween(rng, options.historyStart, options.now);
    const owner = pick(rng, users);

    deviceRows.push({
      id,
      name: `Seed ${profile.type} ${index} (${options.runTag})`,
      device_type: profile.type,
      hardware_id: `seed-${options.runTag}-${index}`,
      hardware_id_type: profile.os === "ios" ? "identifier_for_vendor" : "android_id",
      os_type: profile.os,
      app_version: `2026.${intBetween(rng, 1, 8)}.0`,
      api_key_hash: hexString(rng, 64),
      status: "active",
      clinic_ids: [clinic.id],
      max_pin_attempts: 3,
      failed_pin_attempts: 0,
      last_seen_at: dateBetween(rng, createdAt, options.now),
      specifications: jsonb({ os: profile.os, storage_gb: intBetween(rng, 16, 256) }),
      recorded_by_user_id: owner.id,
      metadata: jsonb(seedMetadata(options.runTag)),
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    // PIN hashes are random: like seeded passwords, no PIN unlocks these.
    pinRows.push({
      id: uuid(rng),
      device_id: id,
      pin_hash: hexString(rng, 64),
      label: `Shift PIN ${index}`,
      issued_to_user_id: owner.id,
      issued_by_user_id: owner.id,
      status: "active",
      expires_at: addDays(options.now, intBetween(rng, 30, 180)),
      last_used_at: dateBetween(rng, createdAt, options.now),
      metadata: jsonb(seedMetadata(options.runTag)),
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });
  });

  return { deviceRows, pinRows };
};

const buildContent = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  users: readonly UserRef[],
  options: FoundationOptions,
): {
  resourceRows: Insertable<DB["resources"]>[];
  educationRows: Insertable<DB["education_content"]>[];
} => {
  const resourceRows: Insertable<DB["resources"]>[] = [];
  const educationRows: Insertable<DB["education_content"]>[] = [];

  EDUCATION_TOPICS.forEach((topic, index) => {
    const resourceId = uuid(rng);
    const author = pick(rng, users);
    const clinic = pick(rng, clinics);
    const createdAt = dateBetween(rng, options.historyStart, options.now);

    resourceRows.push({
      id: resourceId,
      description: `Attachment for "${topic}"`,
      store: "seed",
      store_version: "1",
      uri: `seed/${options.runTag}/education-${index}`,
      hash: hexString(rng, 32),
      mimetype: pick(rng, RESOURCE_MIMETYPES),
      clinic_id: clinic.id,
      created_by_user_id: author.id,
      source: "education",
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    educationRows.push({
      id: uuid(rng),
      title: topic,
      description: pick(rng, FREE_TEXT_NOTES),
      content_type: "article",
      tiptap_content: jsonb({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: pick(rng, FREE_TEXT_NOTES) }],
          },
        ],
      }),
      resource_id: resourceId,
      status: "published",
      // Mostly "public": `EducationContent.listPublic` filters on it, and it
      // also gates whether the linked resource's bytes can be fetched at all.
      visibility:
        index % 3 === 0
          ? EDUCATION_VISIBILITY.PRIVATE
          : EDUCATION_VISIBILITY.PUBLIC,
      language: "en",
      tags: jsonb(["seed", "patient-education"]),
      author_id: author.id,
      published_at: createdAt,
      metadata: jsonb(seedMetadata(options.runTag)),
      is_deleted: false,
      deleted_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
  });

  return { resourceRows, educationRows };
};

const buildReports = (
  rng: Rng,
  clinics: readonly ClinicRef[],
  users: readonly UserRef[],
  options: FoundationOptions,
): {
  reportRows: Insertable<DB["reports"]>[];
  componentRows: Insertable<DB["report_components"]>[];
} => {
  const reportRows: Insertable<DB["reports"]>[] = [];
  const componentRows: Insertable<DB["report_components"]>[] = [];

  REPORT_TEMPLATES.forEach((template, index) => {
    const id = uuid(rng);
    const createdAt = dateBetween(rng, options.historyStart, options.now);
    const clinic = clinics[index % clinics.length] as ClinicRef;

    reportRows.push({
      id,
      name: `${template.name} (${options.runTag})`,
      description: template.description,
      time_range: jsonb({ type: "Rolling", windowDays: 60 }),
      layout: jsonb({ columns: 12 }),
      clinic_id: clinic.id,
      created_by: pick(rng, users).id,
      ...notDeleted,
      ...stamps(rng, createdAt, options.now),
    });

    for (const component of REPORT_COMPONENT_TEMPLATES) {
      componentRows.push({
        id: uuid(rng),
        report_id: id,
        title: component.title,
        description: component.description,
        prql_source: component.prql,
        compiled_sql: component.sql,
        compiled_at: createdAt,
        compiler_version: "0.1.0",
        position: jsonb(component.position),
        display: jsonb({
          TAG: "StatCard",
          _0: {
            label: component.label,
            format: "Number",
            valueField: component.valueField,
          },
        }),
        time_range: null,
        is_deleted: false,
        deleted_at: null,
        created_at: createdAt,
        updated_at: createdAt,
        last_modified: createdAt,
      });
    }
  });

  return { reportRows, componentRows };
};

const buildSystemRows = (
  rng: Rng,
  users: readonly UserRef[],
  options: FoundationOptions,
): {
  appConfigRows: Insertable<DB["app_config"]>[];
  serverVariableRows: Insertable<DB["server_variables"]>[];
  tokenRows: Insertable<DB["tokens"]>[];
} => {
  const author = pick(rng, users);

  // Namespaced under `seed` so nothing here collides with — or overrides — the
  // keys the application actually reads.
  const appConfigRows: Insertable<DB["app_config"]>[] = [
    {
      id: uuid(rng),
      namespace: `seed:${options.runTag}`,
      key: "dataset_size",
      value: String(options.clinicCount),
      data_type: "number",
      display_name: "Seeded clinic count",
      last_modified_by: author.id,
    },
    {
      id: uuid(rng),
      namespace: `seed:${options.runTag}`,
      key: "generated_at",
      value: options.now.toISOString(),
      data_type: "string",
      display_name: "Seed run timestamp",
      last_modified_by: author.id,
    },
  ];

  const serverVariableRows: Insertable<DB["server_variables"]>[] = [
    {
      id: uuid(rng),
      key: `seed_run_${options.runTag}`,
      description: "Marker written by the test-data seeder",
      value_type: "string",
      value_data: Buffer.from(options.runTag, "utf8"),
      value_hash: hexString(rng, 32),
    },
  ];

  // Already expired, so a leaked fixture row cannot authenticate anything.
  const tokenRows: Insertable<DB["tokens"]>[] = users
    .slice(0, Math.min(users.length, 5))
    .map((user) => ({
      user_id: user.id,
      token: hexString(rng, 64),
      expiry: addDays(options.now, -intBetween(rng, 1, 30)),
    }));

  return { appConfigRows, serverVariableRows, tokenRows };
};

export const buildFoundation = (
  rng: Rng,
  options: FoundationOptions,
): Foundation => {
  const clinics = buildClinics(rng, options);
  const users = buildUsers(rng, clinics.refs, options);
  const forms = buildEventForms(rng, clinics.refs, options);
  const registration = buildRegistrationForm(rng, options);
  const pharmacy = buildPharmacy(rng, clinics.refs, users.refs, options);
  const devices = buildDevices(rng, clinics.refs, users.refs, options);
  const content = buildContent(rng, clinics.refs, users.refs, options);
  const reports = buildReports(rng, clinics.refs, users.refs, options);
  const system = buildSystemRows(rng, users.refs, options);

  const providers = users.refs.filter((user) => user.role !== "registrar");

  return {
    // Ordered by foreign key: clinics before staff, staff before anything that
    // records who touched it, drugs before batches before stock.
    batches: [
      batch("clinics", clinics.rows),
      batch("users", users.rows),
      batch("user_clinic_permissions", users.permissionRows),
      batch("clinic_departments", clinics.departmentRows),
      batch("event_forms", forms.rows),
      batch("patient_registration_forms", registration.rows),
      batch("drug_catalogue", pharmacy.drugRows),
      batch("drug_batches", pharmacy.batchRows),
      batch("clinic_inventory", pharmacy.inventoryRows),
      batch("devices", devices.deviceRows),
      batch("device_pin_codes", devices.pinRows),
      batch("resources", content.resourceRows),
      batch("education_content", content.educationRows),
      batch("reports", reports.reportRows),
      batch("report_components", reports.componentRows),
      batch("app_config", system.appConfigRows),
      batch("server_variables", system.serverVariableRows),
      batch("tokens", system.tokenRows),
    ],
    context: {
      runTag: options.runTag,
      now: options.now,
      historyStart: options.historyStart,
      clinics: clinics.refs,
      users: users.refs,
      providers: providers.length > 0 ? providers : users.refs,
      forms: forms.refs,
      drugs: pharmacy.refs,
      attributeFields: registration.attributeFields,
    },
  };
};
