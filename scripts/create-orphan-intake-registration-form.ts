/**
 * Script to create or update the Orphan Intake Registration Form
 * This form replaces the existing registration form for the Orphan Location clinic
 * 
 * Run with: pnpm tsx scripts/create-orphan-intake-registration-form.ts
 */

import db from "../src/db";
import { v1 as uuidv1 } from "uuid";
import PatientRegistrationForm from "../src/models/patient-registration-form";
import { Option } from "effect";

type BilingualLabel = {
  en: string;
  ar: string;
};

type SkipLogic = {
  showWhen?: Array<{
    fieldColumn: string;
    operator: PatientRegistrationForm.SkipConditionOperator;
    value: any;
  }>;
  hideWhen?: Array<{
    fieldColumn: string;
    operator: PatientRegistrationForm.SkipConditionOperator;
    value: any;
  }>;
};

type FieldDefinition = {
  id: string;
  column: string;
  position: number;
  label: BilingualLabel;
  fieldType: PatientRegistrationForm.InputType;
  options: BilingualLabel[];
  required: boolean;
  skipLogic?: SkipLogic;
  hint?: BilingualLabel;
};

// Generate unique field IDs
function generateFieldIds(): Record<string, string> {
  return {
    primaryClinicId: uuidv1(),
    patientName: uuidv1(),
    dob: uuidv1(),
    nationalId: uuidv1(),
    phone: uuidv1(),
    residence: uuidv1(),
    gender: uuidv1(),
    visitDate: uuidv1(),
    hasDisability: uuidv1(),
    disabilityTypes: uuidv1(),
    educationGrade: uuidv1(),
    educationClarify: uuidv1(),
    caregiverEducation: uuidv1(),
    levelEducationNote: uuidv1(),
    orphanCircumstances: uuidv1(),
    caregiverInfo: uuidv1(),
    householdMembers: uuidv1(),
    passions: uuidv1(),
    hopesDreams: uuidv1(),
    struggles: uuidv1(),
    livingConditionsChild: uuidv1(),
    situationChild: uuidv1(),
  };
}

function buildFormFields(fieldIds: Record<string, string>): FieldDefinition[] {
  return [
    {
      id: fieldIds.primaryClinicId,
      column: "primary_clinic_id",
      position: 0, // First field - clinic selector
      label: {
        en: "Primary Clinic",
        ar: "العيادة الأساسية",
      },
      fieldType: "select",
      options: [], // Will be populated dynamically with clinic list
      required: true,
      hint: {
        en: "Select Orphan Location to use this specialized intake form",
        ar: "اختر موقع الأيتام لاستخدام هذا النموذج المتخصص",
      },
    },
    {
      id: fieldIds.patientName,
      column: "patient_name",
      position: 12, // After base fields (which go up to position 11)
      label: {
        en: "Orphan Name",
        ar: "اسم اليتيم",
      },
      fieldType: "text",
      options: [],
      required: true,
    },
    {
      id: fieldIds.dob,
      column: "dob",
      position: 13,
      label: {
        en: "Date of birth",
        ar: "تاريخ الميلاد",
      },
      fieldType: "date",
      options: [],
      required: true,
    },
    {
      id: fieldIds.nationalId,
      column: "national_id",
      position: 14,
      label: {
        en: "National ID",
        ar: "رقم الهوية",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "Enter ID number if available",
        ar: "أدخل رقم الهوية إن وجد",
      },
    },
    {
      id: fieldIds.phone,
      column: "phone",
      position: 15,
      label: {
        en: "Phone number",
        ar: "رقم الهاتف",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "Digits only",
        ar: "أرقام فقط",
      },
    },
    {
      id: fieldIds.residence,
      column: "residence",
      position: 16,
      label: {
        en: "Place of residence",
        ar: "مكان السكن",
      },
      fieldType: "text",
      options: [],
      required: false,
      hint: {
        en: "Enter area/city name",
        ar: "اكتب اسم المنطقة/المدينة",
      },
    },
    {
      id: fieldIds.gender,
      column: "gender",
      position: 17,
      label: {
        en: "Gender",
        ar: "الجنس",
      },
      fieldType: "select",
      options: [
        { en: "male", ar: "ذكر" },
        { en: "female", ar: "أنثى" },
      ],
      required: false,
    },
    {
      id: fieldIds.visitDate,
      column: "visit_date",
      position: 18,
      label: {
        en: "Registration date",
        ar: "تاريخ التسجيل",
      },
      fieldType: "date",
      options: [],
      required: true,
    },
    {
      id: fieldIds.hasDisability,
      column: "has_disability",
      position: 19,
      label: {
        en: "Any disability?",
        ar: "هل توجد إعاقة؟",
      },
      fieldType: "select",
      options: [
        { en: "yes", ar: "نعم" },
        { en: "no", ar: "لا" },
      ],
      required: true,
    },
    {
      id: fieldIds.disabilityTypes,
      column: "disability_types",
      position: 20,
      label: {
        en: "If yes, select type(s)",
        ar: "إذا نعم، حدد نوع الإعاقة",
      },
      fieldType: "select", // Note: select_multiple not directly supported, may need to handle as comma-separated
      options: [
        { en: "vision", ar: "الرؤيا" },
        { en: "hearing", ar: "السمع" },
        { en: "physical", ar: "الحركة" },
        { en: "cognitive", ar: "إدراكية" },
        { en: "selfcare", ar: "العناية بالنفس" },
        { en: "communication", ar: "التواصل" },
      ],
      required: true,
      skipLogic: {
        showWhen: [
          {
            fieldColumn: "has_disability",
            operator: "equals",
            value: "yes",
          },
        ],
      },
      hint: {
        en: "Select disability type(s)",
        ar: "اختر نوع/أنواع الإعاقة",
      },
    },
    {
      id: fieldIds.educationGrade,
      column: "education_grade",
      position: 21,
      label: {
        en: "Education level",
        ar: "المرحلة التعليمية",
      },
      fieldType: "select",
      options: [
        { en: "Primary Stage", ar: "المرحلة الابتدائية" },
        { en: "Basic Education Stage", ar: "المرحلة الأساسية" },
        { en: "Secondary Education Stage", ar: "المرحلة الثانوية" },
        { en: "Not Studying", ar: "لا يدرس" },
      ],
      required: true,
    },
    {
      id: fieldIds.educationClarify,
      column: "education_clarify",
      position: 22,
      label: {
        en: "Clarify",
        ar: "للتوضيح:",
      },
      fieldType: "select",
      options: [
        { en: "Dropped out of school", ar: "منقطع عن التعليم" },
        { en: "Below school age", ar: "دون سن الدراسة" },
      ],
      required: true,
      skipLogic: {
        showWhen: [
          {
            fieldColumn: "education_grade",
            operator: "equals",
            value: "Not Studying",
          },
        ],
      },
    },
    {
      id: fieldIds.caregiverEducation,
      column: "caregiver_education",
      position: 23,
      label: {
        en: "Education grade",
        ar: "الصف الدراسي",
      },
      fieldType: "select",
      options: [
        { en: "First", ar: "الصف الأول" },
        { en: "Second", ar: "الصف الثاني" },
        { en: "Third", ar: "الصف الثالث" },
        { en: "Fourth", ar: "الصف الرابع" },
        { en: "Fifth", ar: "الصف الخامس" },
        { en: "Sixth", ar: "الصف السادس" },
        { en: "Seventh", ar: "الصف السابع" },
        { en: "Eighth", ar: "الصف الثامن" },
        { en: "Ninth", ar: "الصف التاسع" },
        { en: "Tenth", ar: "الصف العاشر" },
        { en: "Eleventh", ar: "الصف الحادي عشر" },
        { en: "Twelfth", ar: "الصف الثاني عشر" },
        { en: "Thirteenth", ar: "الصف الثالث عشر" },
      ],
      required: true,
      skipLogic: {
        hideWhen: [
          {
            fieldColumn: "education_grade",
            operator: "equals",
            value: "Not Studying",
          },
          {
            fieldColumn: "education_grade",
            operator: "isEmpty",
            value: "",
          },
        ],
      },
    },
    {
      id: fieldIds.levelEducationNote,
      column: "level_education_note",
      position: 24,
      label: {
        en: "Education clarification",
        ar: "توضيح عن المستوى التعليمي",
      },
      fieldType: "text",
      options: [],
      required: true,
      skipLogic: {
        // Show when education_grade is Primary, Secondary, High, or when education_clarify is '____'
        // Hide when education_grade is empty OR (education_grade is 'لا_يدرس' AND education_clarify is not '____')
        hideWhen: [
          {
            fieldColumn: "education_grade",
            operator: "isEmpty",
            value: "",
          },
        ],
        showWhen: [
          {
            fieldColumn: "education_grade",
            operator: "isNotEmpty",
            value: "",
          },
        ],
      },
    },
    {
      id: fieldIds.orphanCircumstances,
      column: "orphan_circumstances",
      position: 25,
      label: {
        en: "Circumstances of Child Becoming Orphan",
        ar: "ظروف تيتم الطفل",
      },
      fieldType: "text",
      options: [],
      required: true,
    },
    {
      id: fieldIds.caregiverInfo,
      column: "caregiver_info",
      position: 26,
      label: {
        en: "Caregiver Info",
        ar: "معلومات مقدم الرعاية",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "Name + relationship + contact (if available)",
        ar: "الاسم + صلة القرابة + رقم تواصل إن وجد",
      },
    },
    {
      id: fieldIds.householdMembers,
      column: "household_members",
      position: 27,
      label: {
        en: "Members of Household",
        ar: "عدد أفراد الأسرة",
      },
      fieldType: "number",
      options: [],
      required: true,
      hint: {
        en: "Enter number of household members",
        ar: "أدخل العدد",
      },
    },
    {
      id: fieldIds.passions,
      column: "passions",
      position: 28,
      label: {
        en: "Passions",
        ar: "الاهتمامات والشغف",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "What does the child enjoy doing?",
        ar: "ما الذي يحب الطفل القيام به؟",
      },
    },
    {
      id: fieldIds.hopesDreams,
      column: "hopes_dreams",
      position: 29,
      label: {
        en: "Hopes and Dreams",
        ar: "الآمال والأحلام",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "What does the child hope for in the future?",
        ar: "ما الذي يتمناه الطفل للمستقبل؟",
      },
    },
    {
      id: fieldIds.struggles,
      column: "struggles",
      position: 30,
      label: {
        en: "Struggles",
        ar: "التحديات والصعوبات",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "What main difficulties does the child face?",
        ar: "ما أبرز الصعوبات التي يواجهها الطفل؟",
      },
    },
    {
      id: fieldIds.livingConditionsChild,
      column: "living_conditions_child",
      position: 31,
      label: {
        en: "Living Conditions",
        ar: "ظروف المعيشة",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "Describe current living conditions briefly",
        ar: "صف الظروف الحالية بإيجاز",
      },
    },
    {
      id: fieldIds.situationChild,
      column: "situation_child",
      position: 32,
      label: {
        en: "Situation",
        ar: "الوضع العام",
      },
      fieldType: "text",
      options: [],
      required: true,
      hint: {
        en: "Brief overall situation summary",
        ar: "ملخص موجز عن الحالة",
      },
    },
  ];
}

async function main() {
  console.log("Creating or updating Orphan Intake Registration Form (idempotent)...");
  console.log("✅ This will replace the existing registration form for Orphan Location clinic");

  // Step 1: Find the Orphan clinic
  console.log("\n1. Finding Orphan Location clinic...");
  const orphanClinic = await db
    .selectFrom("clinics")
    .selectAll()
    .where("name", "ilike", "%orphan%")
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  if (!orphanClinic) {
    throw new Error("Orphan Location clinic not found. Please create it first.");
  }
  console.log(`   ✅ Found clinic "${orphanClinic.name}" with id=${orphanClinic.id}`);

  // Step 2: Check for existing registration form for this clinic
  console.log("\n2. Checking for existing registration form...");
  const existingForm = await db
    .selectFrom("patient_registration_forms")
    .selectAll()
    .where("clinic_id", "=", orphanClinic.id)
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  let formId: string;
  if (existingForm) {
    formId = existingForm.id;
    console.log(`   ✅ Found existing form with id=${formId}, will replace it`);
  } else {
    formId = uuidv1();
    console.log(`   ✅ Creating new form with id=${formId}`);
  }

  // Step 3: Generate field IDs and build form fields
  console.log("\n3. Building form fields...");
  const fieldIds = generateFieldIds();
  const customFields = buildFormFields(fieldIds);

  // Convert to PatientRegistrationForm.Field format
  const formFields: PatientRegistrationForm.Field[] = customFields.map((field) => ({
    id: field.id,
    position: field.position,
    column: field.column,
    label: field.label,
    fieldType: field.fieldType,
    options: field.options.map((opt) => ({
      en: opt.en,
      ar: opt.ar,
      es: opt.en, // Fallback to English for Spanish
    })),
    required: field.required,
    baseField: false,
    visible: true,
    deleted: false,
    showsInSummary: false,
    isSearchField: false,
    skipLogic: field.skipLogic
      ? {
          showWhen: field.skipLogic.showWhen,
          hideWhen: field.skipLogic.hideWhen,
        }
      : undefined,
  }));

  console.log(`   ✅ Created ${formFields.length} custom fields`);

  // Step 4: Create the form (base fields will be merged automatically by getAll())
  console.log("\n4. Saving form to database...");
  const now = new Date();
  const form: PatientRegistrationForm.EncodedT = {
    id: formId,
    clinic_id: orphanClinic.id,
    name: "Orphan Intake Registration Form",
    fields: formFields,
    metadata: {},
    is_deleted: false,
    created_at: existingForm ? new Date(existingForm.created_at) : now,
    updated_at: now,
    last_modified: now,
    server_created_at: existingForm ? new Date(existingForm.server_created_at) : now,
    deleted_at: null,
  };

  await PatientRegistrationForm.upsertPatientRegistrationForm(form);

  console.log(`\n✅ Successfully created/updated Orphan Intake Registration Form!`);
  console.log(`   Form ID: ${formId}`);
  console.log(`   Clinic: ${orphanClinic.name} (${orphanClinic.id})`);
  console.log(`   Custom Fields: ${formFields.length}`);
  console.log(`   Note: This is a self-contained form for Orphan Location clinic`);
}

main()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
