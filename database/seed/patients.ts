// Per-patient fixture data: the patient row and every clinical, pharmacy and
// audit record that hangs off it. Built one patient at a time and merged into
// chunk-sized write batches so memory stays flat no matter how many patients a
// run asks for.

import { createHash } from "node:crypto";
import type { Insertable } from "kysely";
import {
  ALLERGENS,
  ALLERGY_REACTIONS,
  APPOINTMENT_REASONS,
  APPOINTMENT_STATUSES,
  ATTRIBUTE_LANGUAGES,
  CAMPS,
  CODE_SYSTEM,
  COUNTRIES,
  DEPARTMENT_VISIT_STATUSES,
  DOSAGE_INSTRUCTIONS,
  EVENT_LOG_ACTIONS,
  FREE_TEXT_NOTES,
  GIVEN_NAMES,
  ICD11_PROBLEMS,
  OBSERVATION_TYPES,
  PRESCRIPTION_ITEM_STATUSES,
  PRESCRIPTION_PRIORITIES,
  PRESCRIPTION_STATUS,
  PROBLEM_CLINICAL_STATUS,
  PROBLEM_VERIFICATION_STATUSES,
  SEXES,
  SMOKING_STATUSES,
  SURNAMES,
  TOBACCO_TYPES,
} from "./catalog.js";
import {
  SOFT_DELETE_RATE,
  type SeedDB,
  type WriteBatch,
  batch,
  deletedAt,
  jsonb,
  notDeleted,
  seedMetadata,
  stamps,
} from "./common.js";
import type {
  BuiltField,
  ClinicRef,
  DrugRef,
  SeedContext,
  UserRef,
} from "./foundation.js";
import {
  type Rng,
  addDays,
  addMinutes,
  chance,
  dateBetween,
  floatBetween,
  intBetween,
  pick,
  pickSome,
  uuid,
} from "./random.js";

type Row<T extends keyof SeedDB & string> = Insertable<SeedDB[T]>;

type Bundle = {
  patients: Row<"patients">[];
  visits: Row<"visits">[];
  events: Row<"events">[];
  patient_vitals: Row<"patient_vitals">[];
  patient_problems: Row<"patient_problems">[];
  patient_allergies: Row<"patient_allergies">[];
  patient_allergy_reactions: Row<"patient_allergy_reactions">[];
  patient_observations: Row<"patient_observations">[];
  patient_tobacco_history: Row<"patient_tobacco_history">[];
  patient_additional_attributes: Row<"patient_additional_attributes">[];
  appointments: Row<"appointments">[];
  prescriptions: Row<"prescriptions">[];
  prescription_items: Row<"prescription_items">[];
  dispensing_records: Row<"dispensing_records">[];
  event_logs: Row<"event_logs">[];
  hh_unique: Row<"hh_unique">[];
};

const emptyBundle = (): Bundle => ({
  patients: [],
  visits: [],
  events: [],
  patient_vitals: [],
  patient_problems: [],
  patient_allergies: [],
  patient_allergy_reactions: [],
  patient_observations: [],
  patient_tobacco_history: [],
  patient_additional_attributes: [],
  appointments: [],
  prescriptions: [],
  prescription_items: [],
  dispensing_records: [],
  event_logs: [],
  hh_unique: [],
});

type VisitRef = {
  readonly id: string;
  readonly clinic: ClinicRef;
  readonly provider: UserRef;
  readonly at: Date;
};

const ageInYears = (birth: Date, now: Date): number =>
  Math.floor((now.getTime() - birth.getTime()) / (365.25 * 86_400_000));

const phoneNumber = (rng: Rng): string =>
  `+${intBetween(rng, 20, 998)}${intBetween(rng, 100000000, 999999999)}`;

const latest = (left: Date, right: Date): Date => (left > right ? left : right);

// Keeps a generated moment inside the window it has to belong to. Clinical
// history is drawn by looking backwards from a visit, which without this puts
// onset dates before the patient was born and quit dates in the future.
const within = (value: Date, from: Date, to: Date): Date => {
  if (value < from) return from;
  if (value > to) return to;
  return value;
};

// Skew young: most patients in these clinics are children and adults of working
// age, not the uniform 0-90 a flat draw would give.
const buildBirthDate = (rng: Rng, now: Date): Date => {
  const age = chance(rng, 0.55)
    ? intBetween(rng, 0, 35)
    : intBetween(rng, 36, 92);
  return addDays(now, -age * 365 - intBetween(rng, 0, 364));
};

const buildPatient = (
  rng: Rng,
  context: SeedContext,
  clinic: ClinicRef,
  registrar: UserRef,
  birthDate: Date,
  createdAt: Date,
): Row<"patients"> => {
  const place = pick(rng, COUNTRIES);

  return {
    id: uuid(rng),
    given_name: pick(rng, GIVEN_NAMES),
    surname: pick(rng, SURNAMES),
    date_of_birth: birthDate,
    citizenship: place.country,
    hometown: pick(rng, place.cities),
    phone: phoneNumber(rng),
    sex: pick(rng, SEXES),
    camp: chance(rng, 0.4) ? pick(rng, CAMPS) : null,
    additional_data: jsonb({}),
    image_timestamp: null,
    photo_url: null,
    government_id: chance(rng, 0.5)
      ? `${context.runTag.toUpperCase()}-${intBetween(rng, 100000, 999999)}`
      : null,
    external_patient_id: chance(rng, 0.3)
      ? `EXT-${context.runTag}-${intBetween(rng, 1000, 99999)}`
      : null,
    primary_clinic_id: clinic.id,
    last_modified_by: registrar.id,
    metadata: jsonb(seedMetadata(context.runTag)),
    ...notDeleted,
    ...stamps(rng, createdAt, context.now),
  };
};

const buildVisits = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  clinic: ClinicRef,
  registeredAt: Date,
): { rows: Row<"visits">[]; refs: VisitRef[] } => {
  const rows: Row<"visits">[] = [];
  const refs: VisitRef[] = [];
  const visitCount = chance(rng, 0.12) ? 0 : intBetween(rng, 1, 6);

  for (let index = 0; index < visitCount; index += 1) {
    const provider = pick(rng, context.providers);
    const at = dateBetween(rng, registeredAt, context.now);
    const id = uuid(rng);

    rows.push({
      id,
      patient_id: patientId,
      clinic_id: clinic.id,
      provider_id: provider.id,
      provider_name: provider.name,
      check_in_timestamp: at,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    });

    refs.push({ id, clinic, provider, at });
  }

  return { rows, refs };
};

const medicineValue = (rng: Rng, context: SeedContext): unknown[] => {
  const drug = pick(rng, context.drugs);
  return [
    {
      id: uuid(rng),
      name: drug.genericName,
      dose: drug.dosageQuantity,
      doseUnits: drug.dosageUnits,
      route: drug.route,
      form: drug.form,
      frequency: pick(rng, ["1x1", "1x2", "1x3", "1x3x5"]),
      intervals: "",
      duration: intBetween(rng, 0, 14),
      durationUnits: "days",
    },
  ];
};

const fieldValue = (
  rng: Rng,
  context: SeedContext,
  field: BuiltField,
  at: Date,
): unknown => {
  switch (field.tag) {
    case "free-text": {
      if (field.inputType !== "number") return pick(rng, FREE_TEXT_NOTES);
      const [min, max] = field.range ?? [1, 100];
      return String(floatBetween(rng, min, max, 1));
    }
    case "date":
      return addDays(at, -intBetween(rng, 1, 400)).toISOString();
    // Matches how the form renderer stores checkboxes: a JSON boolean when
    // ticked, an empty string when not.
    case "binary":
      return chance(rng, 0.5) ? true : "";
    case "options": {
      const options = field.options ?? [];
      if (options.length === 0) return "";
      // Multi-select values are stored as one "; "-joined string, matching what
      // the form renderer writes.
      return field.multi === true
        ? pickSome(rng, options, intBetween(rng, 1, options.length)).join("; ")
        : pick(rng, options);
    }
    case "medicine":
      return medicineValue(rng, context);
    case "diagnosis": {
      const problem = pick(rng, ICD11_PROBLEMS);
      return [{ code: problem.code, desc: problem.label }];
    }
  }
};

const buildEvents = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  visits: readonly VisitRef[],
): { rows: Row<"events">[]; byVisit: Map<string, string> } => {
  const rows: Row<"events">[] = [];
  const byVisit = new Map<string, string>();

  for (const visit of visits) {
    const forms = pickSome(rng, context.forms, intBetween(rng, 1, 3));
    for (const form of forms) {
      const id = uuid(rng);
      rows.push({
        id,
        patient_id: patientId,
        visit_id: visit.id,
        form_id: form.id,
        event_type: form.name,
        form_data: jsonb(
          form.fields
            .filter((field) => field.required || chance(rng, 0.7))
            .map((field) => ({
              name: field.name,
              value: fieldValue(rng, context, field, visit.at),
              fieldId: field.id,
              fieldType: field.tag,
              inputType: field.inputType,
            })),
        ),
        recorded_by_user_id: visit.provider.id,
        metadata: jsonb(seedMetadata(context.runTag)),
        ...notDeleted,
        ...stamps(rng, visit.at, context.now),
      });
      if (!byVisit.has(visit.id)) byVisit.set(visit.id, id);
    }
  }

  return { rows, byVisit };
};

const buildVitals = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  visits: readonly VisitRef[],
  eventByVisit: Map<string, string>,
): Row<"patient_vitals">[] =>
  visits.filter(() => chance(rng, 0.8)).map((visit) => {
    // Weight is derived from height and a plausible BMI rather than drawn
    // independently: independent draws produce impossible pairs, and `bmi` is
    // numeric(4,2), so a 130kg half-metre patient overflows the column.
    const heightCm = floatBetween(rng, 50, 195, 1);
    const heightMetres = heightCm / 100;
    const bmi = floatBetween(rng, 12, 42, 1);
    const weightKg =
      Math.round(bmi * heightMetres * heightMetres * 10) / 10;

    return {
      id: uuid(rng),
      patient_id: patientId,
      visit_id: visit.id,
      event_id: eventByVisit.get(visit.id) ?? null,
      timestamp: visit.at,
      systolic_bp: intBetween(rng, 90, 175),
      diastolic_bp: intBetween(rng, 55, 110),
      bp_position: pick(rng, ["sitting", "standing", "supine"]),
      height_cm: heightCm,
      weight_kg: weightKg,
      bmi,
      waist_circumference_cm: floatBetween(rng, 40, 130, 1),
      heart_rate: intBetween(rng, 50, 130),
      pulse_rate: intBetween(rng, 50, 130),
      oxygen_saturation: floatBetween(rng, 88, 100, 1),
      respiratory_rate: intBetween(rng, 10, 40),
      temperature_celsius: floatBetween(rng, 35.2, 40.5, 1),
      pain_level: intBetween(rng, 0, 10),
      recorded_by_user_id: visit.provider.id,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, visit.at, context.now),
    };
  });

const buildProblems = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  visits: readonly VisitRef[],
  birthDate: Date,
  registeredAt: Date,
): Row<"patient_problems">[] =>
  pickSome(rng, ICD11_PROBLEMS, intBetween(rng, 0, 3)).map((problem) => {
    const visit = visits.length > 0 ? pick(rng, visits) : null;
    const at = visit?.at ?? dateBetween(rng, registeredAt, context.now);
    const resolved = chance(rng, 0.35);
    const onset = within(addDays(at, -intBetween(rng, 10, 1500)), birthDate, at);

    return {
      id: uuid(rng),
      patient_id: patientId,
      visit_id: visit?.id ?? null,
      problem_code_system: CODE_SYSTEM.ICD11,
      problem_code: problem.code,
      problem_label: problem.label,
      clinical_status: resolved
        ? PROBLEM_CLINICAL_STATUS.RESOLVED
        : pick(rng, [
            PROBLEM_CLINICAL_STATUS.ACTIVE,
            PROBLEM_CLINICAL_STATUS.REMISSION,
          ]),
      verification_status: pick(rng, PROBLEM_VERIFICATION_STATUSES),
      severity_score: intBetween(rng, 1, 10),
      onset_date: onset,
      end_date: resolved
        ? within(addDays(onset, intBetween(rng, 5, 400)), onset, context.now)
        : null,
      recorded_by_user_id: visit?.provider.id ?? pick(rng, context.providers).id,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    };
  });

const buildAllergies = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  birthDate: Date,
  registeredAt: Date,
): {
  allergies: Row<"patient_allergies">[];
  reactions: Row<"patient_allergy_reactions">[];
} => {
  const allergies: Row<"patient_allergies">[] = [];
  const reactions: Row<"patient_allergy_reactions">[] = [];

  for (const allergen of pickSome(rng, ALLERGENS, intBetween(rng, 0, 2))) {
    const id = uuid(rng);
    const at = dateBetween(rng, registeredAt, context.now);
    const recordedBy = pick(rng, context.providers);

    allergies.push({
      id,
      patient_id: patientId,
      allergen_code_system: CODE_SYSTEM.SNOMED,
      allergen_code: allergen.code,
      allergen_label: allergen.label,
      allergy_type: allergen.type,
      clinical_status: pick(rng, ["active", "inactive"]),
      verification_status: pick(rng, ["confirmed", "unconfirmed"]),
      severity: pick(rng, ["mild", "moderate", "severe"]),
      onset_date: within(addDays(at, -intBetween(rng, 30, 3000)), birthDate, at),
      end_date: null,
      recorded_by_user_id: recordedBy.id,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    });

    for (const reaction of pickSome(rng, ALLERGY_REACTIONS, intBetween(rng, 1, 3))) {
      reactions.push({
        id: uuid(rng),
        allergy_id: id,
        reaction_manifestation_code: reaction.code,
        reaction_manifestation_label: reaction.label,
        description: pick(rng, FREE_TEXT_NOTES),
        severity: pick(rng, ["mild", "moderate", "severe"]),
        metadata: jsonb(seedMetadata(context.runTag)),
        ...notDeleted,
        ...stamps(rng, at, context.now),
      });
    }
  }

  return { allergies, reactions };
};

const buildObservations = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  visits: readonly VisitRef[],
): Row<"patient_observations">[] => {
  if (visits.length === 0) return [];

  const rows: Row<"patient_observations">[] = [];
  for (const visit of visits) {
    if (!chance(rng, 0.5)) continue;
    for (const type of pickSome(rng, OBSERVATION_TYPES, intBetween(rng, 1, 3))) {
      rows.push({
        id: uuid(rng),
        patient_id: patientId,
        visit_id: visit.id,
        timestamp: visit.at,
        observation_code_system: CODE_SYSTEM.LOINC,
        observation_code: type.code,
        observation_label: type.label,
        value_string: null,
        value_numeric: floatBetween(rng, type.min, type.max, type.decimals),
        value_boolean: null,
        value_datetime: null,
        value_code: null,
        value_unit: type.unit,
        recorded_by_user_id: visit.provider.id,
        metadata: jsonb(seedMetadata(context.runTag)),
        ...notDeleted,
        ...stamps(rng, visit.at, context.now),
      });
    }
  }

  return rows;
};

const buildTobaccoHistory = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  birthDate: Date,
  registeredAt: Date,
): Row<"patient_tobacco_history">[] => {
  const age = ageInYears(birthDate, context.now);
  if (age < 15 || !chance(rng, 0.35)) return [];

  const status = pick(rng, SMOKING_STATUSES);
  const at = dateBetween(rng, registeredAt, context.now);
  const startDate =
    status === "never"
      ? null
      : within(addDays(at, -intBetween(rng, 400, 9000)), birthDate, at);

  return [
    {
      id: uuid(rng),
      patient_id: patientId,
      smoking_status: status,
      type: status === "never" ? null : pick(rng, TOBACCO_TYPES),
      packs_per_day: status === "current" ? floatBetween(rng, 0.1, 2.5, 2) : null,
      start_date: startDate,
      quit_date:
        status === "former" && startDate !== null
          ? within(
              addDays(startDate, intBetween(rng, 100, 4000)),
              startDate,
              context.now,
            )
          : null,
      recorded_by_user_id: pick(rng, context.providers).id,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    },
  ];
};

const attributeValue = (
  rng: Rng,
  kind: "string" | "number" | "boolean" | "date",
  now: Date,
): Pick<
  Row<"patient_additional_attributes">,
  "string_value" | "number_value" | "boolean_value" | "date_value"
> => {
  const empty = {
    string_value: null,
    number_value: null,
    boolean_value: null,
    date_value: null,
  };
  switch (kind) {
    case "string":
      return { ...empty, string_value: pick(rng, ATTRIBUTE_LANGUAGES) };
    case "number":
      return { ...empty, number_value: intBetween(rng, 1, 14) };
    case "boolean":
      return { ...empty, boolean_value: chance(rng, 0.6) };
    case "date":
      return { ...empty, date_value: addDays(now, -intBetween(rng, 1, 900)) };
  }
};

const buildAttributes = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  registeredAt: Date,
): Row<"patient_additional_attributes">[] =>
  pickSome(
    rng,
    context.attributeFields,
    intBetween(rng, 0, context.attributeFields.length),
  ).map((field) => ({
    id: uuid(rng),
    patient_id: patientId,
    attribute_id: field.id,
    attribute: field.label,
    ...attributeValue(rng, field.valueKind, context.now),
    metadata: jsonb(seedMetadata(context.runTag)),
    ...notDeleted,
    ...stamps(rng, registeredAt, context.now),
  }));

const buildAppointments = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  visits: readonly VisitRef[],
): Row<"appointments">[] => {
  if (visits.length === 0) return [];

  const rows: Row<"appointments">[] = [];
  const count = intBetween(rng, 0, 2);

  for (let index = 0; index < count; index += 1) {
    const visit = pick(rng, visits);
    const scheduledFor = addDays(visit.at, intBetween(rng, 1, 120));
    // An appointment can only be completed once its time has passed and some
    // visit exists to have fulfilled it; a still-future one is pending at best.
    const fulfilledBy = visits.filter((candidate) => candidate.at >= scheduledFor);
    const status =
      scheduledFor > context.now
        ? pick(rng, ["pending", "confirmed", "cancelled"])
        : fulfilledBy.length > 0
          ? pick(rng, APPOINTMENT_STATUSES)
          : pick(rng, ["checked_in", "cancelled"]);
    const fulfilled = status === "completed" ? pick(rng, fulfilledBy) : null;

    rows.push({
      id: uuid(rng),
      patient_id: patientId,
      clinic_id: visit.clinic.id,
      provider_id: visit.provider.id,
      user_id: visit.provider.id,
      current_visit_id: visit.id,
      fulfilled_visit_id: fulfilled?.id ?? null,
      timestamp: scheduledFor,
      duration: pick(rng, [15, 30, 45, 60]),
      reason: pick(rng, APPOINTMENT_REASONS),
      notes: pick(rng, FREE_TEXT_NOTES),
      status,
      is_walk_in: chance(rng, 0.25),
      departments: jsonb(
        pickSome(rng, visit.clinic.departments, intBetween(rng, 1, 2)).map(
          (department) => ({
            id: department.id,
            name: department.name,
            seen_at: null,
            seen_by: null,
            status: pick(rng, DEPARTMENT_VISIT_STATUSES),
          }),
        ),
      ),
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, visit.at, context.now),
    });
  }

  return rows;
};

type PharmacyRows = {
  prescriptions: Row<"prescriptions">[];
  items: Row<"prescription_items">[];
  dispensing: Row<"dispensing_records">[];
};

const buildPrescriptionItem = (
  rng: Rng,
  context: SeedContext,
  input: {
    prescriptionId: string;
    patientId: string;
    clinic: ClinicRef;
    provider: UserRef;
    drug: DrugRef;
    at: Date;
    filled: boolean;
  },
): { item: Row<"prescription_items">; dispensed: number } => {
  const quantityPrescribed = intBetween(rng, 4, 90);
  const dispensed = input.filled ? quantityPrescribed : 0;

  return {
    dispensed,
    item: {
      id: uuid(rng),
      prescription_id: input.prescriptionId,
      patient_id: input.patientId,
      drug_id: input.drug.id,
      clinic_id: input.clinic.id,
      dosage_instructions: pick(rng, DOSAGE_INSTRUCTIONS),
      quantity_prescribed: quantityPrescribed,
      quantity_dispensed: dispensed,
      refills_authorized: intBetween(rng, 0, 3),
      refills_used: 0,
      item_status: input.filled
        ? PRESCRIPTION_ITEM_STATUSES.COMPLETED
        : PRESCRIPTION_ITEM_STATUSES.ACTIVE,
      notes: null,
      recorded_by_user_id: input.provider.id,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, input.at, context.now),
    },
  };
};

const buildPharmacy = (
  rng: Rng,
  context: SeedContext,
  patientId: string,
  clinic: ClinicRef,
  visits: readonly VisitRef[],
  registeredAt: Date,
): PharmacyRows => {
  const rows: PharmacyRows = { prescriptions: [], items: [], dispensing: [] };
  const prescriptionCount = chance(rng, 0.45) ? intBetween(rng, 1, 2) : 0;

  for (let index = 0; index < prescriptionCount; index += 1) {
    const visit = visits.length > 0 ? pick(rng, visits) : null;
    const provider = visit?.provider ?? pick(rng, context.providers);
    const at = visit?.at ?? dateBetween(rng, registeredAt, context.now);
    const prescriptionId = uuid(rng);
    const filled = chance(rng, 0.55);
    const drugs = pickSome(rng, context.drugs, intBetween(rng, 1, 3));

    const built = drugs.map((drug) =>
      buildPrescriptionItem(rng, context, {
        prescriptionId,
        patientId,
        clinic,
        provider,
        drug,
        at,
        filled,
      }),
    );

    rows.prescriptions.push({
      id: prescriptionId,
      patient_id: patientId,
      provider_id: provider.id,
      filled_by: filled ? provider.id : null,
      pickup_clinic_id: clinic.id,
      visit_id: visit?.id ?? null,
      priority: pick(rng, PRESCRIPTION_PRIORITIES),
      expiration_date: addDays(at, 90),
      prescribed_at: at,
      filled_at: filled ? addMinutes(at, intBetween(rng, 10, 2880)) : null,
      status: filled
        ? PRESCRIPTION_STATUS.PICKED_UP
        : pick(rng, [
            PRESCRIPTION_STATUS.PENDING,
            PRESCRIPTION_STATUS.PREPARED,
            PRESCRIPTION_STATUS.CANCELLED,
          ]),
      items: jsonb(
        built.map(({ item }) => ({
          drug_id: item.drug_id,
          quantity: item.quantity_prescribed,
          dosage_instructions: item.dosage_instructions,
        })),
      ),
      notes: pick(rng, FREE_TEXT_NOTES),
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    });

    built.forEach(({ item, dispensed }, drugIndex) => {
      rows.items.push(item);
      if (dispensed === 0) return;

      const drug = drugs[drugIndex] as DrugRef;
      const dispensedAt = addMinutes(at, intBetween(rng, 10, 2880));
      rows.dispensing.push({
        id: uuid(rng),
        clinic_id: clinic.id,
        drug_id: drug.id,
        // Always the batch this clinic holds stock of: the AFTER INSERT trigger
        // deducts from `clinic_inventory` and `drug_batches` for exactly this
        // (clinic, drug, batch) triple.
        batch_id: drug.stockBatchId,
        prescription_item_id: item.id as string,
        patient_id: patientId,
        quantity_dispensed: dispensed,
        dosage_instructions: item.dosage_instructions as string,
        days_supply: intBetween(rng, 3, 90),
        dispensed_by: provider.id,
        dispensed_at: dispensedAt,
        recorded_by_user_id: provider.id,
        metadata: jsonb(seedMetadata(context.runTag)),
        ...notDeleted,
        ...stamps(rng, dispensedAt, context.now),
      });
    });
  }

  return rows;
};

const buildEventLog = (
  rng: Rng,
  context: SeedContext,
  patient: Row<"patients">,
  actor: UserRef,
): Row<"event_logs">[] => {
  if (!chance(rng, 0.25)) return [];

  const action = pick(rng, EVENT_LOG_ACTIONS);
  const changes = {
    action,
    table: "patients",
    after: {
      id: patient.id,
      primary_clinic_id: patient.primary_clinic_id,
      sex: patient.sex,
    },
  };
  const serialised = JSON.stringify(changes);
  const at = patient.created_at as Date;

  return [
    {
      id: uuid(rng),
      transaction_id: uuid(rng),
      action_type: action,
      table_name: "patients",
      row_id: patient.id as string,
      changes: jsonb(changes),
      device_id: `seed-device-${context.runTag}`,
      app_id: "hikma-seed",
      user_id: actor.id,
      ip_address: `10.${intBetween(rng, 0, 255)}.${intBetween(rng, 0, 255)}.${intBetween(rng, 1, 254)}`,
      hash: createHash("sha256").update(serialised).digest("hex"),
      // Honest default: the hash covers this seeder's own `changes` shape, not
      // whatever the application considers canonical.
      hash_verified: false,
      metadata: jsonb(seedMetadata(context.runTag)),
      ...notDeleted,
      ...stamps(rng, at, context.now),
    },
  ];
};

// Shaped like the key the spreadsheet importer derives in
// `apps/server/src/routes/api/entries.backfill.ts`. The `old_new` component of
// that key has no observed value to copy, so "new" is a stand-in: a re-import
// may or may not match these rows, exactly as it would not match an empty
// table.
const buildUniquenessKey = (
  context: SeedContext,
  patient: Row<"patients">,
): Row<"hh_unique">[] => {
  const name = `${patient.given_name} ${patient.surname}`.toLowerCase().trim();
  const age = ageInYears(patient.date_of_birth as Date, context.now);
  return [
    {
      tag: "patient_id",
      key: `${name}.${patient.sex}.new${age}`,
      value: patient.id as string,
    },
  ];
};

const markDeleted = <T extends { is_deleted?: unknown; deleted_at?: unknown }>(
  rows: T[],
  at: Date,
): T[] => rows.map((row) => ({ ...row, ...deletedAt(at) }));

// A patient's records never outlive the patient: when the patient row is soft
// deleted every child row is too, so sync never hands a device an orphan.
const cascadeDelete = (bundle: Bundle, at: Date): Bundle => ({
  ...bundle,
  patients: markDeleted(bundle.patients, at),
  visits: markDeleted(bundle.visits, at),
  events: markDeleted(bundle.events, at),
  patient_vitals: markDeleted(bundle.patient_vitals, at),
  patient_problems: markDeleted(bundle.patient_problems, at),
  patient_allergies: markDeleted(bundle.patient_allergies, at),
  patient_allergy_reactions: markDeleted(bundle.patient_allergy_reactions, at),
  patient_observations: markDeleted(bundle.patient_observations, at),
  patient_tobacco_history: markDeleted(bundle.patient_tobacco_history, at),
  patient_additional_attributes: markDeleted(
    bundle.patient_additional_attributes,
    at,
  ),
  appointments: markDeleted(bundle.appointments, at),
  prescriptions: markDeleted(bundle.prescriptions, at),
  prescription_items: markDeleted(bundle.prescription_items, at),
  dispensing_records: markDeleted(bundle.dispensing_records, at),
});

const buildOnePatient = (rng: Rng, context: SeedContext): Bundle => {
  const bundle = emptyBundle();
  const clinic = pick(rng, context.clinics);
  const staff = context.users.filter((user) => user.clinicId === clinic.id);
  const registrar = staff.length > 0 ? pick(rng, staff) : pick(rng, context.users);
  // Registration cannot predate birth, which a flat draw over the history
  // window would allow for anyone under about two years old.
  const birthDate = buildBirthDate(rng, context.now);
  const registeredAt = dateBetween(
    rng,
    latest(context.historyStart, birthDate),
    context.now,
  );

  const patient = buildPatient(
    rng,
    context,
    clinic,
    registrar,
    birthDate,
    registeredAt,
  );
  const patientId = patient.id as string;
  const visits = buildVisits(rng, context, patientId, clinic, registeredAt);
  const events = buildEvents(rng, context, patientId, visits.refs);
  const allergies = buildAllergies(
    rng,
    context,
    patientId,
    birthDate,
    registeredAt,
  );
  const pharmacy = buildPharmacy(
    rng,
    context,
    patientId,
    clinic,
    visits.refs,
    registeredAt,
  );

  bundle.patients.push(patient);
  bundle.visits.push(...visits.rows);
  bundle.events.push(...events.rows);
  bundle.patient_vitals.push(
    ...buildVitals(rng, context, patientId, visits.refs, events.byVisit),
  );
  bundle.patient_problems.push(
    ...buildProblems(
      rng,
      context,
      patientId,
      visits.refs,
      birthDate,
      registeredAt,
    ),
  );
  bundle.patient_allergies.push(...allergies.allergies);
  bundle.patient_allergy_reactions.push(...allergies.reactions);
  bundle.patient_observations.push(
    ...buildObservations(rng, context, patientId, visits.refs),
  );
  bundle.patient_tobacco_history.push(
    ...buildTobaccoHistory(rng, context, patientId, birthDate, registeredAt),
  );
  bundle.patient_additional_attributes.push(
    ...buildAttributes(rng, context, patientId, registeredAt),
  );
  bundle.appointments.push(
    ...buildAppointments(rng, context, patientId, visits.refs),
  );
  bundle.prescriptions.push(...pharmacy.prescriptions);
  bundle.prescription_items.push(...pharmacy.items);
  bundle.dispensing_records.push(...pharmacy.dispensing);
  bundle.event_logs.push(...buildEventLog(rng, context, patient, registrar));
  bundle.hh_unique.push(...buildUniquenessKey(context, patient));

  return chance(rng, SOFT_DELETE_RATE)
    ? cascadeDelete(bundle, dateBetween(rng, registeredAt, context.now))
    : bundle;
};

const mergeInto = (target: Bundle, source: Bundle): void => {
  for (const key of Object.keys(target) as (keyof Bundle)[]) {
    (target[key] as unknown[]).push(...source[key]);
  }
};

// Ordered by foreign key, and by the dispensing trigger's requirements:
// prescriptions before their items, items before the dispensing records that
// reference them.
export const buildPatientChunk = (
  rng: Rng,
  context: SeedContext,
  count: number,
): WriteBatch[] => {
  const chunk = emptyBundle();
  for (let index = 0; index < count; index += 1) {
    mergeInto(chunk, buildOnePatient(rng, context));
  }

  return [
    batch("patients", chunk.patients),
    batch("visits", chunk.visits),
    batch("events", chunk.events),
    batch("patient_vitals", chunk.patient_vitals),
    batch("patient_problems", chunk.patient_problems),
    batch("patient_allergies", chunk.patient_allergies),
    batch("patient_allergy_reactions", chunk.patient_allergy_reactions),
    batch("patient_observations", chunk.patient_observations),
    batch("patient_tobacco_history", chunk.patient_tobacco_history),
    batch("patient_additional_attributes", chunk.patient_additional_attributes),
    batch("appointments", chunk.appointments),
    batch("prescriptions", chunk.prescriptions),
    batch("prescription_items", chunk.prescription_items),
    batch("dispensing_records", chunk.dispensing_records),
    batch("event_logs", chunk.event_logs),
    batch("hh_unique", chunk.hh_unique),
  ];
};
