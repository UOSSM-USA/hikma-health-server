// Reference pools the seeder draws from. Pure data: no randomness, no ids, no
// database access. Ids are minted in `foundation.ts` and `patients.ts` so a run
// stays reproducible from its seed alone.
//
// Clinical codes are real code-system values used with invented patients so the
// generated data exercises the same shapes production sees (ICD-11 for
// problems, SNOMED CT for allergies and reactions, LOINC for observations).

export const GIVEN_NAMES: readonly string[] = [
  "Amina", "Yusuf", "Fatima", "Omar", "Layla", "Ibrahim", "Zainab", "Hassan",
  "Mariam", "Khalid", "Noor", "Tariq", "Sofia", "Mateo", "Valentina", "Diego",
  "Camila", "Santiago", "Lucia", "Andres", "Grace", "Emmanuel", "Neema",
  "Baraka", "Asha", "Juma", "Rehema", "Daniel", "Sarah", "Michael", "Hannah",
  "Joseph", "Esther", "Peter", "Ruth", "Samuel", "Aisha", "Musa", "Halima",
  "Idris", "Chen", "Mei", "Priya", "Arjun", "Ananya", "Rohan",
];

export const SURNAMES: readonly string[] = [
  "Al-Amin", "Haddad", "Nasser", "Rahman", "Karim", "Farouk", "Mansour",
  "Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Mwangi", "Otieno", "Kamau", "Wanjiru", "Achieng", "Mutua", "Njoroge",
  "Okonkwo", "Adeyemi", "Bello", "Eze", "Okafor", "Abubakar",
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Davis",
  "Sharma", "Patel", "Singh", "Kumar", "Reddy",
];

export const SEXES: readonly string[] = ["male", "female"];

export const COUNTRIES: readonly { country: string; cities: readonly string[] }[] = [
  { country: "Kenya", cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"] },
  { country: "Jordan", cities: ["Amman", "Irbid", "Zarqa", "Mafraq"] },
  { country: "Colombia", cities: ["Bogota", "Medellin", "Cali", "Cartagena"] },
  { country: "Nigeria", cities: ["Lagos", "Abuja", "Kano", "Ibadan"] },
  { country: "Bangladesh", cities: ["Dhaka", "Chittagong", "Coxs Bazar"] },
];

export const CAMPS: readonly string[] = [
  "Zone A", "Zone B", "Zone C", "North Settlement", "South Settlement",
  "Transit Block 4", "Block 12",
];

export const CLINIC_NAMES: readonly string[] = [
  "Central Community Clinic",
  "Northside Health Post",
  "Riverside Primary Care",
  "Hillside Mobile Unit",
  "Lakeview Family Clinic",
  "Eastgate Health Centre",
];

export const DEPARTMENT_TEMPLATES: readonly {
  name: string;
  code: string;
  dispense: boolean;
  labs: boolean;
  imaging: boolean;
}[] = [
  { name: "General Outpatient", code: "OPD", dispense: false, labs: false, imaging: false },
  { name: "Pharmacy", code: "PHARM", dispense: true, labs: false, imaging: false },
  { name: "Laboratory", code: "LAB", dispense: false, labs: true, imaging: false },
  { name: "Radiology", code: "RAD", dispense: false, labs: false, imaging: true },
  { name: "Maternal Health", code: "MCH", dispense: true, labs: true, imaging: false },
  { name: "Triage", code: "TRI", dispense: false, labs: false, imaging: false },
];

// Vocabularies the application defines, hand-copied from the modules named
// against each one. They are copied rather than imported because they live in
// `apps/server/src/models/`, which this package does not depend on and which
// pulls in Effect. A value invented here instead of copied is not merely odd
// data: filters and pickers built from the app's own lists cannot reach it. If
// a vocabulary changes over there, this block is what has to follow.

// user.ts (User.roles). `super_admin` is deliberately absent: seeded accounts
// never hold the highest-privilege role.
export const SEEDED_ROLES: readonly string[] = ["registrar", "provider", "admin"];

// appointment.ts (Appointment.StatusSchema)
export const APPOINTMENT_STATUSES: readonly string[] = [
  "pending", "confirmed", "checked_in", "completed", "cancelled",
];

// appointment.ts (Appointment.DepartmentStatusSchema)
export const DEPARTMENT_VISIT_STATUSES: readonly string[] = [
  "pending", "in_progress", "checked_in", "completed", "cancelled",
];

// prescription.ts (Prescription.statusValues)
export const PRESCRIPTION_STATUS = {
  PENDING: "pending",
  PREPARED: "prepared",
  PICKED_UP: "picked-up",
  NOT_PICKED_UP: "not-picked-up",
  PARTIALLY_PICKED_UP: "partially-picked-up",
  CANCELLED: "cancelled",
  OTHER: "other",
} as const;

// prescription.ts (Prescription.priorityValues)
export const PRESCRIPTION_PRIORITIES: readonly string[] = [
  "high", "low", "normal", "emergency",
];

// prescription-items.ts — no enum; these are the values its queries filter on.
export const PRESCRIPTION_ITEM_STATUSES = {
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

// patient-problem.ts (PatientProblem.ClinicalStatus)
export const PROBLEM_CLINICAL_STATUS = {
  ACTIVE: "active",
  REMISSION: "remission",
  RESOLVED: "resolved",
} as const;

// patient-problem.ts (PatientProblem.VerificationStatus)
export const PROBLEM_VERIFICATION_STATUSES: readonly string[] = [
  "provisional", "confirmed", "refuted", "unconfirmed",
];

// patient-problem.ts (PatientProblem.ProblemCodeSystem). Allergies and
// observations have no equivalent constant; they follow the same lowercase
// convention.
export const CODE_SYSTEM = {
  ICD11: "icd11",
  SNOMED: "snomed",
  LOINC: "loinc",
} as const;

// education-content.ts (EducationContent.Status, and the visibility values its
// queries filter on — `listPublic` requires "public").
export const EDUCATION_VISIBILITY = {
  PUBLIC: "public",
  PRIVATE: "private",
} as const;

export const APPOINTMENT_REASONS: readonly string[] = [
  "Routine follow-up",
  "Medication review",
  "Antenatal check",
  "Wound dressing",
  "Blood pressure review",
  "Nutrition counselling",
  "Vaccination",
];

export const ICD11_PROBLEMS: readonly { code: string; label: string }[] = [
  { code: "1F40", label: "Malaria due to Plasmodium falciparum" },
  { code: "CA23", label: "Chronic obstructive pulmonary disease" },
  { code: "5A11", label: "Type 2 diabetes mellitus" },
  { code: "BA00", label: "Essential hypertension" },
  { code: "CA40", label: "Pneumonia, organism unspecified" },
  { code: "1A00", label: "Cholera" },
  { code: "6A70", label: "Single episode depressive disorder" },
  { code: "DA42", label: "Gastro-oesophageal reflux disease" },
  { code: "8A80", label: "Migraine" },
  { code: "FA20", label: "Osteoarthritis of knee" },
  { code: "5B50", label: "Undernutrition" },
  { code: "1B10", label: "Typhoid fever" },
  { code: "CA08", label: "Allergic rhinitis" },
  { code: "ME24", label: "Acute abdominal pain" },
];

export const ALLERGENS: readonly {
  code: string;
  label: string;
  type: string;
}[] = [
  { code: "372687004", label: "Amoxicillin", type: "medication" },
  { code: "387207008", label: "Ibuprofen", type: "medication" },
  { code: "7947003", label: "Aspirin", type: "medication" },
  { code: "256349002", label: "Peanut", type: "food" },
  { code: "102263004", label: "Eggs", type: "food" },
  { code: "3829006", label: "Dust mite", type: "environment" },
  { code: "256277009", label: "Grass pollen", type: "environment" },
  { code: "111088007", label: "Latex", type: "environment" },
];

export const ALLERGY_REACTIONS: readonly { code: string; label: string }[] = [
  { code: "247472004", label: "Hives" },
  { code: "418363000", label: "Itching of skin" },
  { code: "267036007", label: "Shortness of breath" },
  { code: "422587007", label: "Nausea" },
  { code: "39579001", label: "Anaphylaxis" },
  { code: "418290006", label: "Rash" },
  { code: "45108003", label: "Swelling of lips" },
];

export const OBSERVATION_TYPES: readonly {
  code: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
}[] = [
  { code: "2339-0", label: "Glucose, blood", unit: "mg/dL", min: 60, max: 260, decimals: 0 },
  { code: "4548-4", label: "Haemoglobin A1c", unit: "%", min: 4.5, max: 12.5, decimals: 1 },
  { code: "718-7", label: "Haemoglobin", unit: "g/dL", min: 7, max: 17, decimals: 1 },
  { code: "2093-3", label: "Cholesterol, total", unit: "mg/dL", min: 120, max: 300, decimals: 0 },
  { code: "6690-2", label: "Leukocytes", unit: "10*3/uL", min: 3, max: 16, decimals: 1 },
  { code: "77606-2", label: "Weight-for-age Z-score", unit: "{z-score}", min: -3.5, max: 2.5, decimals: 2 },
  { code: "9843-4", label: "Head circumference", unit: "cm", min: 32, max: 58, decimals: 1 },
];

export const SMOKING_STATUSES: readonly string[] = [
  "never", "former", "current", "unknown",
];

export const TOBACCO_TYPES: readonly string[] = [
  "cigarettes", "shisha", "chewing tobacco", "pipe",
];

export const DRUGS: readonly {
  generic: string;
  brand: string;
  form: string;
  route: string;
  dosageQuantity: number;
  dosageUnits: string;
  manufacturer: string;
  controlled: boolean;
  refrigerated: boolean;
}[] = [
  { generic: "Paracetamol", brand: "Panadol", form: "tablet", route: "oral", dosageQuantity: 500, dosageUnits: "mg", manufacturer: "GSK", controlled: false, refrigerated: false },
  { generic: "Amoxicillin", brand: "Amoxil", form: "capsule", route: "oral", dosageQuantity: 250, dosageUnits: "mg", manufacturer: "Sandoz", controlled: false, refrigerated: false },
  { generic: "Metformin", brand: "Glucophage", form: "tablet", route: "oral", dosageQuantity: 500, dosageUnits: "mg", manufacturer: "Merck", controlled: false, refrigerated: false },
  { generic: "Amlodipine", brand: "Norvasc", form: "tablet", route: "oral", dosageQuantity: 5, dosageUnits: "mg", manufacturer: "Pfizer", controlled: false, refrigerated: false },
  { generic: "Salbutamol", brand: "Ventolin", form: "inhaler", route: "inhalation", dosageQuantity: 100, dosageUnits: "mcg", manufacturer: "GSK", controlled: false, refrigerated: false },
  { generic: "Artemether/Lumefantrine", brand: "Coartem", form: "tablet", route: "oral", dosageQuantity: 20, dosageUnits: "mg", manufacturer: "Novartis", controlled: false, refrigerated: false },
  { generic: "Oral Rehydration Salts", brand: "ORS", form: "sachet", route: "oral", dosageQuantity: 20.5, dosageUnits: "g", manufacturer: "UNICEF", controlled: false, refrigerated: false },
  { generic: "Ferrous Sulphate", brand: "Feospan", form: "tablet", route: "oral", dosageQuantity: 200, dosageUnits: "mg", manufacturer: "Teva", controlled: false, refrigerated: false },
  { generic: "Insulin Glargine", brand: "Lantus", form: "injection", route: "subcutaneous", dosageQuantity: 100, dosageUnits: "IU/mL", manufacturer: "Sanofi", controlled: false, refrigerated: true },
  { generic: "Morphine Sulphate", brand: "MST", form: "tablet", route: "oral", dosageQuantity: 10, dosageUnits: "mg", manufacturer: "Napp", controlled: true, refrigerated: false },
  { generic: "Ceftriaxone", brand: "Rocephin", form: "injection", route: "intravenous", dosageQuantity: 1, dosageUnits: "g", manufacturer: "Roche", controlled: false, refrigerated: false },
  { generic: "Albendazole", brand: "Zentel", form: "tablet", route: "oral", dosageQuantity: 400, dosageUnits: "mg", manufacturer: "GSK", controlled: false, refrigerated: false },
  { generic: "Azithromycin", brand: "Zithromax", form: "tablet", route: "oral", dosageQuantity: 500, dosageUnits: "mg", manufacturer: "Pfizer", controlled: false, refrigerated: false },
  { generic: "Hydrocortisone Cream", brand: "Cortaid", form: "cream", route: "topical", dosageQuantity: 1, dosageUnits: "%", manufacturer: "Bayer", controlled: false, refrigerated: false },
  { generic: "Vitamin A", brand: "Retinol", form: "capsule", route: "oral", dosageQuantity: 200000, dosageUnits: "IU", manufacturer: "UNICEF", controlled: false, refrigerated: false },
];

export const DOSAGE_INSTRUCTIONS: readonly string[] = [
  "1 tablet three times daily for 5 days",
  "1 tablet twice daily with food",
  "2 puffs as needed for shortness of breath",
  "1 sachet in 1 litre of water after each loose stool",
  "1 capsule daily for 14 days",
  "Apply thinly to affected area twice daily",
];

export const SUPPLIERS: readonly string[] = [
  "Global Health Supply Co", "Regional Medical Depot", "Ministry of Health Stores",
  "UNICEF Supply Division", "Meds4All Distributors",
];

export const FREE_TEXT_NOTES: readonly string[] = [
  "Patient reports gradual improvement since last visit.",
  "No new complaints. Continue current management.",
  "Referred from the community health worker.",
  "Adherence to medication discussed with caregiver.",
  "Follow-up scheduled in two weeks.",
  "Symptoms began roughly four days ago.",
  "Advised on fluid intake and rest.",
];

export const RESOURCE_MIMETYPES: readonly string[] = [
  "image/jpeg", "image/png", "application/pdf", "audio/mpeg", "video/mp4",
];

export const EDUCATION_TOPICS: readonly string[] = [
  "Managing Type 2 Diabetes at Home",
  "Safe Drinking Water Practices",
  "Recognising the Danger Signs in Pregnancy",
  "Childhood Immunisation Schedule",
  "Living with High Blood Pressure",
  "Preventing Malaria in the Household",
];

export type EventFieldTemplate = {
  readonly key: string;
  readonly name: string;
  readonly tag:
    | "free-text"
    | "date"
    | "options"
    | "binary"
    | "medicine"
    | "diagnosis";
  readonly inputType: string;
  readonly required: boolean;
  readonly description: string;
  readonly multi?: boolean;
  readonly options?: readonly string[];
  readonly length?: "short" | "long";
  readonly units?: readonly string[];
  // Plausible bounds for a numeric free-text field, so a gestational age never
  // reads 120 weeks.
  readonly range?: readonly [number, number];
};

export type EventFormTemplate = {
  readonly name: string;
  readonly description: string;
  readonly isSnapshot: boolean;
  readonly fields: readonly EventFieldTemplate[];
};

export const EVENT_FORM_TEMPLATES: readonly EventFormTemplate[] = [
  {
    name: "Symptomatic Presentation",
    description: "Primary complaint intake used at triage.",
    isSnapshot: false,
    fields: [
      { key: "complaint", name: "Presenting Complaint", tag: "free-text", inputType: "text", required: true, description: "In the patient's own words", length: "long" },
      { key: "onset", name: "Date of Onset", tag: "date", inputType: "date", required: false, description: "" },
      { key: "severity", name: "Severity", tag: "options", inputType: "radio", required: true, description: "", multi: false, options: ["mild", "moderate", "severe"] },
      { key: "symptoms", name: "Associated Symptoms", tag: "options", inputType: "select", required: false, description: "", multi: true, options: ["fever", "cough", "vomiting", "diarrhoea", "headache", "rash"] },
      { key: "diagnosis", name: "ICD 11 Diagnosis", tag: "diagnosis", inputType: "input-group", required: false, description: "" },
      { key: "prescription", name: "Medicine", tag: "medicine", inputType: "input-group", required: false, description: "" },
      { key: "referred", name: "Referred to Higher Level Care", tag: "binary", inputType: "checkbox", required: false, description: "" },
    ],
  },
  {
    name: "Nutrition Assessment",
    description: "Anthropometry and feeding history.",
    isSnapshot: true,
    fields: [
      { key: "height", name: "Height", tag: "free-text", inputType: "number", required: true, description: "Height in cm", length: "short", units: ["cm"], range: [45, 195] },
      { key: "weight", name: "Weight", tag: "free-text", inputType: "number", required: true, description: "Weight in kg", length: "short", units: ["kg"], range: [3, 140] },
      { key: "muac", name: "MUAC", tag: "free-text", inputType: "number", required: false, description: "Mid-upper arm circumference in cm", length: "short", units: ["cm"], range: [8, 38] },
      { key: "deficiencies", name: "Known Deficiencies", tag: "options", inputType: "select", required: false, description: "", multi: true, options: ["Vit. A", "Vit. B", "Iron", "Calcium", "None"] },
      { key: "supplement", name: "Supplement Provided", tag: "binary", inputType: "checkbox", required: false, description: "" },
      { key: "counselled_on", name: "Date Counselled", tag: "date", inputType: "date", required: false, description: "" },
    ],
  },
  {
    name: "Antenatal Visit",
    description: "Routine antenatal follow-up.",
    isSnapshot: false,
    fields: [
      { key: "gestation", name: "Gestational Age (weeks)", tag: "free-text", inputType: "number", required: true, description: "", length: "short", units: ["weeks"], range: [4, 42] },
      { key: "lmp", name: "Last Menstrual Period", tag: "date", inputType: "date", required: false, description: "" },
      { key: "risk", name: "Risk Factors", tag: "options", inputType: "select", required: false, description: "", multi: true, options: ["anaemia", "hypertension", "previous caesarean", "multiple gestation", "none"] },
      { key: "iron_given", name: "Iron Supplement Dispensed", tag: "binary", inputType: "checkbox", required: false, description: "" },
      { key: "notes", name: "Midwife Notes", tag: "free-text", inputType: "text", required: false, description: "", length: "long" },
    ],
  },
  {
    name: "Chronic Care Follow-up",
    description: "Ongoing management of chronic conditions.",
    isSnapshot: false,
    fields: [
      { key: "condition", name: "Condition Under Review", tag: "options", inputType: "select", required: true, description: "", multi: false, options: ["hypertension", "diabetes", "asthma", "epilepsy"] },
      { key: "adherence", name: "Medication Adherence", tag: "options", inputType: "radio", required: true, description: "", multi: false, options: ["good", "partial", "poor"] },
      { key: "last_refill", name: "Date of Last Refill", tag: "date", inputType: "date", required: false, description: "" },
      { key: "plan", name: "Management Plan", tag: "free-text", inputType: "text", required: false, description: "", length: "long" },
      { key: "medicine", name: "Medicine", tag: "medicine", inputType: "input-group", required: false, description: "" },
    ],
  },
];

export type RegistrationFieldTemplate = {
  readonly key: string;
  readonly label: { readonly en: string; readonly ar: string; readonly es: string };
  readonly column: string;
  readonly fieldType: string;
  readonly position: number;
  readonly required: boolean;
  readonly isSearchField: boolean;
  // Base fields carry the ids the server merges in from
  // `apps/server/src/data/registration-form-base-fields.ts`. Reusing them keeps
  // a seeded form from duplicating every base field on read.
  readonly baseFieldId?: string;
  readonly options?: readonly { en: string; ar: string; es: string }[];
  // Custom (non-base) fields become `patient_additional_attributes` rows; the
  // value kind decides which typed column of that table is filled.
  readonly attributeValue?: "string" | "number" | "boolean" | "date";
};

export const REGISTRATION_FIELD_TEMPLATES: readonly RegistrationFieldTemplate[] = [
  { key: "given_name", label: { en: "First Name", ar: "الاسم المعطى", es: "Nombre" }, column: "given_name", fieldType: "text", position: 1, required: true, isSearchField: true, baseFieldId: "e3d7615c-6ee6-11ee-b962-0242ac120002" },
  { key: "surname", label: { en: "Last Name", ar: "الكنية", es: "Apellido" }, column: "surname", fieldType: "text", position: 2, required: true, isSearchField: true, baseFieldId: "128faebe-6ee7-11ee-b962-0242ac120002" },
  { key: "date_of_birth", label: { en: "Date of Birth", ar: "تاريخ الولادة", es: "Fecha de nacimiento" }, column: "date_of_birth", fieldType: "date", position: 3, required: true, isSearchField: true, baseFieldId: "417d5df8-6eeb-11ee-b962-0242ac120002" },
  {
    key: "sex",
    label: { en: "Sex", ar: "جنس", es: "Sexo" },
    column: "sex",
    fieldType: "select",
    position: 4,
    required: true,
    isSearchField: false,
    baseFieldId: "4b9190de-6eeb-11ee-b962-0242ac120002",
    options: [
      { en: "male", ar: "ذكر", es: "masculino" },
      { en: "female", ar: "أنثى", es: "femenino" },
    ],
  },
  { key: "citizenship", label: { en: "Citizenship", ar: "المواطنة", es: "Ciudadanía" }, column: "citizenship", fieldType: "text", position: 5, required: false, isSearchField: false, baseFieldId: "33282fe0-6f76-11ee-b962-0242ac120002" },
  { key: "hometown", label: { en: "Hometown", ar: "مسقط رأس", es: "Ciudad natal" }, column: "hometown", fieldType: "text", position: 6, required: false, isSearchField: false, baseFieldId: "06108a10-bc84-11ee-a506-0242ac120002" },
  { key: "phone", label: { en: "Phone", ar: "هاتف", es: "Teléfono" }, column: "phone", fieldType: "text", position: 7, required: false, isSearchField: true, baseFieldId: "fd328808-bc83-11ee-a506-0242ac120002" },
  { key: "camp", label: { en: "Camp / Block", ar: "مخيم", es: "Campamento" }, column: "camp", fieldType: "text", position: 8, required: false, isSearchField: false, baseFieldId: "f6024866-bc83-11ee-a506-0242ac120002" },
  { key: "government_id", label: { en: "Government ID", ar: "الهوية الحكومية", es: "Identificación" }, column: "government_id", fieldType: "text", position: 9, required: false, isSearchField: true, baseFieldId: "be6e53d6-120a-11ef-9262-0242ac120002" },
  { key: "external_patient_id", label: { en: "External Patient ID", ar: "معرف المريض الخارجي", es: "ID externo" }, column: "external_patient_id", fieldType: "text", position: 10, required: false, isSearchField: true, baseFieldId: "b7671870-120a-11ef-9262-0242ac120002" },
  { key: "household_size", label: { en: "Household Size", ar: "حجم الأسرة", es: "Tamaño del hogar" }, column: "", fieldType: "number", position: 20, required: false, isSearchField: false, attributeValue: "number" },
  { key: "preferred_language", label: { en: "Preferred Language", ar: "اللغة المفضلة", es: "Idioma preferido" }, column: "", fieldType: "text", position: 21, required: false, isSearchField: false, attributeValue: "string" },
  { key: "consent_to_contact", label: { en: "Consent to Contact", ar: "الموافقة على الاتصال", es: "Consentimiento de contacto" }, column: "", fieldType: "checkbox", position: 22, required: false, isSearchField: false, attributeValue: "boolean" },
  { key: "last_screening", label: { en: "Last Screening Date", ar: "تاريخ آخر فحص", es: "Última evaluación" }, column: "", fieldType: "date", position: 23, required: false, isSearchField: false, attributeValue: "date" },
];

export const ATTRIBUTE_LANGUAGES: readonly string[] = [
  "English", "Arabic", "Spanish", "Swahili", "Bengali",
];

// Read-only aggregates only. `compiled_sql` is executed verbatim by the reports
// feature, so nothing here may write, lock, or read a patient-identifying
// column.
export const REPORT_COMPONENT_TEMPLATES: readonly {
  title: string;
  description: string;
  prql: string;
  sql: string;
  valueField: string;
  label: string;
  position: { x: number; y: number; w: number; h: number };
}[] = [
  {
    title: "New Patient Registrations (Past 60 Days)",
    description: "Patients registered in the rolling window.",
    prql: "from patients\nfilter is_deleted == false\naggregate {\n  total_registrations = count this\n}\n",
    sql: "SELECT\n  COUNT(*) AS total_registrations\nFROM\n  patients\nWHERE\n  is_deleted = false\n  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '60 days'\n",
    valueField: "total_registrations",
    label: "New Registrations (60 Days)",
    position: { x: 0, y: 0, w: 3, h: 2 },
  },
  {
    title: "Total Visits (Past 60 Days)",
    description: "Visits recorded in the rolling window.",
    prql: "from visits\nfilter is_deleted == false\naggregate {\n  total_visits = count this\n}\n",
    sql: "SELECT\n  COUNT(*) AS total_visits\nFROM\n  visits\nWHERE\n  is_deleted = false\n  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '60 days'\n",
    valueField: "total_visits",
    label: "Total Visits (60 Days)",
    position: { x: 3, y: 0, w: 3, h: 2 },
  },
  {
    title: "Active Prescriptions",
    description: "Prescriptions not yet filled or cancelled.",
    prql: "from prescriptions\nfilter is_deleted == false\naggregate {\n  active_prescriptions = count this\n}\n",
    sql: "SELECT\n  COUNT(*) AS active_prescriptions\nFROM\n  prescriptions\nWHERE\n  is_deleted = false\n  AND status = 'pending'\n",
    valueField: "active_prescriptions",
    label: "Active Prescriptions",
    position: { x: 6, y: 0, w: 3, h: 2 },
  },
  {
    title: "Events Recorded (Past 30 Days)",
    description: "Clinical form submissions in the last 30 days.",
    prql: "from events\nfilter is_deleted == false\naggregate {\n  total_events = count this\n}\n",
    sql: "SELECT\n  COUNT(*) AS total_events\nFROM\n  events\nWHERE\n  is_deleted = false\n  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'\n",
    valueField: "total_events",
    label: "Events (30 Days)",
    position: { x: 9, y: 0, w: 3, h: 2 },
  },
];

export const REPORT_TEMPLATES: readonly { name: string; description: string }[] = [
  { name: "Clinic Activity Summary", description: "Headline activity counters for the clinic." },
  { name: "Pharmacy Overview", description: "Dispensing and stock movement at a glance." },
];

export const EVENT_LOG_ACTIONS: readonly string[] = ["create", "update", "delete"];

// device.ts (Device.DEVICE_TYPE) — the type doubles as the platform, so `os`
// only adds detail for the hardware-id kind.
export const DEVICE_TYPES: readonly { type: string; os: string }[] = [
  { type: "android", os: "android" },
  { type: "ios", os: "ios" },
  { type: "laptop", os: "macos" },
  { type: "sync_hub", os: "linux" },
];
