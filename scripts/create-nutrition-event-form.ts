#!/usr/bin/env tsx

/**
 * Script to create Nutrition Services event form
 *
 * Usage:
 *   npx tsx scripts/create-nutrition-event-form.ts
 *
 * Notes:
 * - Form is defined in English (source language).
 * - We tag it with metadata.category = "nutrition" so it can be filtered later.
 * - Field labels are bilingual (ar/en) inside form_fields so they render in the UI language.
 * - This script is idempotent - it will update the form if it already exists.
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";

// Label type that supports bilingual labels
type BilingualLabel = {
  ar: string;
  en: string;
};

type SkipCondition = {
  fieldId: string;
  operator: "equals" | "notEquals" | "contains" | "notContains";
  value: string | string[];
};

type SkipLogic = {
  showWhen?: SkipCondition[];
  hideWhen?: SkipCondition[];
};

type SimpleField =
  | {
      id: string;
      type: "text" | "textarea" | "number" | "date";
      name?: string; // Optional unique name for form editor (if not provided, will be derived from label)
      label: BilingualLabel;
      required: boolean;
      placeholder?: string;
      skipLogic?: SkipLogic;
    }
  | {
      id: string;
      type: "select";
      name?: string; // Optional unique name for form editor (if not provided, will be derived from label)
      label: BilingualLabel;
      required: boolean;
      multi?: boolean; // For multi-select
      options: { value: string; label: string }[]; // Simple string labels for options
      skipLogic?: SkipLogic;
    }
  | {
      id: string;
      type: "checkbox";
      name?: string; // Optional unique name for form editor (if not provided, will be derived from label)
      label: BilingualLabel;
      required: boolean;
      multi: true; // Checkboxes are always multi-select
      options: { value: string; label: string }[]; // Simple string labels for options
      skipLogic?: SkipLogic;
    };

type SimpleForm = {
  name: string; // stored in English as canonical name
  description: string; // stored in English
  language: "ar" | "en";
  isEditable: boolean;
  isSnapshotForm: boolean;
  category: "nutrition";
  formFields: SimpleField[];
};

// Generate field IDs upfront so we can reference them for skip logic
const fieldIds = {
  // Section 1
  transferredFromTFU: uuidv1(),
  nutritionServiceType: uuidv1(),
  // Section 3
  screeningProvidedFor: uuidv1(),
  mothersNameScreening: uuidv1(),
  motherAgeScreening: uuidv1(),
  childsNameScreening: uuidv1(),
  childAgeGroupScreening: uuidv1(),
  screeningServicesChild: uuidv1(),
  screeningServicesMother: uuidv1(),
  referredAfterScreening: uuidv1(),
  referralTypeScreening: uuidv1(),
  // Section 4 - IYCF-E
  iycfESupportType: uuidv1(),
  iycfEServicesProvided: uuidv1(),
  relactationSupportProvided: uuidv1(),
  relactationOutcome: uuidv1(),
  sessionNumber: uuidv1(),
  referredAfterIYCFE: uuidv1(),
  referralTypeIYCFE: uuidv1(),
  otpTreatmentTypes: uuidv1(), // 16.a
  iycfETreatmentTypes: uuidv1(), // 16.b
  supplementsReceived: uuidv1(),
  // Section 5 - Treatment
  treatmentProvidedFor: uuidv1(),
  childNutritionalStatus: uuidv1(),
  childReceivedRUTF: uuidv1(),
  rutfQuantity: uuidv1(),
  childReceivedOther: uuidv1(),
  childOtherQuantity: uuidv1(),
  pbwReceived: uuidv1(),
  pbwQuantity: uuidv1(),
  mothersNameTreatment: uuidv1(),
  motherAgeTreatment: uuidv1(),
  childsNameTreatment: uuidv1(),
  childAgeGroupTreatment: uuidv1(),
  referredAfterTreatment: uuidv1(),
  referralTypeTreatment: uuidv1(),
  // Section 6
  enumeratorName: uuidv1(),
  dataCollectionDate: uuidv1(),
  siteFacilityName: uuidv1(),
};

const nutritionForm: SimpleForm = {
  name: "Nutrition Services Form",
  description:
    "Comprehensive form for documenting nutrition services including screening, treatment, and IYCF-E (Infant and Young Child Feeding in Emergencies) services.",
  language: "en",
  isEditable: true,
  isSnapshotForm: false,
  category: "nutrition",
  formFields: [
    // Section 1: Admission & Transfer Information
    {
      id: fieldIds.transferredFromTFU,
      type: "select",
      label: {
        ar: "هل تم نقل المريض من وحدة التغذية العلاجية (TFU)؟",
        en: "Is the patient transferred from TFU (Therapeutic Feeding Unit)?",
      },
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    // Section 2: Type of Nutrition Service Received
    {
      id: fieldIds.nutritionServiceType,
      type: "select",
      label: {
        ar: "أي خدمة تغذية يتم تقديمها اليوم؟",
        en: "Which nutrition service is provided today?",
      },
      required: true,
      options: [
        { value: "screening", label: "Screening" },
        { value: "treatment", label: "Treatment" },
        { value: "iycf_e", label: "IYCF-E" },
      ],
    },
    // Section 3: Screening Services
    {
      id: fieldIds.screeningProvidedFor,
      type: "select",
      label: {
        ar: "يتم تقديم الفحص لـ:",
        en: "Screening is provided for:",
      },
      required: false,
      options: [
        { value: "child", label: "Child" },
        {
          value: "pbw",
          label: "Pregnant or Breastfeeding Woman (PBW)",
        },
      ],
    },
    // Section 3A: Demographic Information (Screening) - Mother
    {
      id: fieldIds.mothersNameScreening,
      type: "text",
      name: "Mother's name (Screening)", // Unique name for form editor
      label: {
        ar: "اسم الأم",
        en: "Mother's name",
      },
      required: false,
      placeholder: "Enter mother's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.motherAgeScreening,
      type: "number",
      name: "Mother age (Screening)", // Unique name for form editor
      label: {
        ar: "عمر الأم",
        en: "Mother age",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    // Section 3A: Demographic Information (Screening) - Child
    {
      id: fieldIds.childsNameScreening,
      type: "text",
      name: "Child's name (Screening)", // Unique name for form editor
      label: {
        ar: "اسم الطفل",
        en: "Child's name",
      },
      required: false,
      placeholder: "Enter child's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.childAgeGroupScreening,
      type: "select",
      name: "Age group of the child (Screening)", // Unique name for form editor
      label: {
        ar: "الفئة العمرية للطفل",
        en: "Age group of the child",
      },
      required: false,
      options: [
        {
          value: "less_than_6_months",
          label: "Less than 6 months",
        },
        {
          value: "6_59_months",
          label: "6–59 months",
        },
        {
          value: "more_than_59_months",
          label: "More than 59 months",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    // Section 3B: Screening Services Provided
    {
      id: fieldIds.screeningServicesChild,
      type: "checkbox",
      label: {
        ar: "خدمات الفحص المقدمة للطفل (اختر كل ما ينطبق)",
        en: "Screening services provided to the child (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "muac_measurement",
          label: "MUAC measurement",
        },
        {
          value: "oedema_check",
          label: "Oedema check",
        },
        {
          value: "weight_measurement",
          label: "Weight measurement",
        },
        {
          value: "nutrition_counseling",
          label: "Nutrition counseling",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.screeningServicesMother,
      type: "checkbox",
      label: {
        ar: "خدمات الفحص المقدمة للأم (اختر كل ما ينطبق)",
        en: "Screening services provided to the mother (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "muac_measurement",
          label: "MUAC measurement",
        },
        {
          value: "nutrition_counseling",
          label: "Nutrition counseling",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.referredAfterScreening,
      type: "select",
      label: {
        ar: "هل تم إحالة المريض بعد الفحص؟",
        en: "Was the patient referred after screening?",
      },
      required: false,
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
    },
    {
      id: fieldIds.referralTypeScreening,
      type: "checkbox",
      name: "Type of referral (Screening)", // Unique name for form editor
      label: {
        ar: "نوع الإحالة (إذا كانت الإجابة نعم)",
        en: "Type of referral (if yes)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "advanced_nutrition_care",
          label: "Advanced level care related to nutrition",
        },
        {
          value: "otp_not_nutrition",
          label: "OTP (not related to nutrition)",
        },
        {
          value: "inpatient_not_nutrition",
          label: "Inpatient care (not related to nutrition)",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.referredAfterScreening, operator: "equals", value: "yes" },
        ],
      },
    },
    // Section 4: IYCF-E Services
    {
      id: fieldIds.iycfESupportType,
      type: "select",
      label: {
        ar: "نوع دعم IYCF-E المقدم:",
        en: "Type of IYCF-E support provided:",
      },
      required: false,
      options: [
        {
          value: "group_counselling",
          label: "Group counselling",
        },
        {
          value: "one_on_one_counselling",
          label: "One on one counselling",
        },
      ],
    },
    {
      id: fieldIds.iycfEServicesProvided,
      type: "checkbox",
      label: {
        ar: "نوع الخدمات المقدمة (اختر كل ما ينطبق)",
        en: "Type of services provided (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "iycf_counseling",
          label: "Infant and Young Child Feeding (IYCF) counseling",
        },
        {
          value: "breastfeeding_support",
          label: "Breastfeeding support",
        },
        {
          value: "complementary_feeding_counseling",
          label: "Complementary feeding counseling",
        },
        {
          value: "relactation_support",
          label: "Relactation support",
        },
      ],
    },
    {
      id: fieldIds.relactationSupportProvided,
      type: "select",
      label: {
        ar: "هل تم تقديم دعم إعادة الإرضاع؟",
        en: "Was relactation support provided?",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: fieldIds.relactationOutcome,
      type: "select",
      label: {
        ar: "نتيجة جهود إعادة الإرضاع",
        en: "Outcome of relactation efforts",
      },
      required: false,
      options: [
        { value: "successful", label: "Successful" },
        {
          value: "not_successful",
          label: "Not successful",
        },
        { value: "ongoing", label: "Ongoing" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.relactationSupportProvided, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.sessionNumber,
      type: "select",
      label: {
        ar: "رقم الجلسة",
        en: "Session number",
      },
      required: false,
      options: [
        { value: "session_1", label: "Session 1" },
        { value: "session_2", label: "Session 2" },
        { value: "session_3", label: "Session 3" },
        {
          value: "session_4_or_more",
          label: "Session 4 or more",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.relactationSupportProvided, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.referredAfterIYCFE,
      type: "select",
      label: {
        ar: "هل تم إحالة المريض بعد خدمات IYCF-E؟",
        en: "Was the patient referred after IYCF-E services?",
      },
      required: false,
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
    },
    {
      id: fieldIds.referralTypeIYCFE,
      type: "checkbox",
      label: {
        ar: "نوع الإحالة بعد IYCF-E (إذا كانت الإجابة نعم)",
        en: "Type of referral after IYCF-E (if yes)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "advanced_nutrition_care",
          label: "Advanced level care related to nutrition",
        },
        {
          value: "otp_not_nutrition",
          label: "OTP (not related to nutrition)",
        },
        {
          value: "inpatient_not_nutrition",
          label: "Inpatient care (not related to nutrition)",
        },
        {
          value: "iycf_e",
          label: "IYCF-e",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.referredAfterIYCFE, operator: "equals", value: "yes" },
        ],
      },
    },
    // Section 16.a: Type of treatment (If select OTP - not related to nutrition)
    {
      id: fieldIds.otpTreatmentTypes,
      type: "checkbox",
      label: {
        ar: "نوع العلاج (إذا تم اختيار OTP - غير متعلق بالتغذية)",
        en: "Type of treatment (If select OTP - not related to nutrition)",
      },
      required: false,
      multi: true,
      options: [
        { value: "rutf", label: "Ready-to-Use Therapeutic Food (RUTF)" },
        { value: "medical_examination", label: "Medical examination" },
        { value: "muac_monitoring", label: "MUAC monitoring" },
        { value: "nutritional_counseling_caregiver", label: "Nutritional counselling for the caregiver" },
        { value: "referral_health_facility", label: "Referral to a health facility (in case of deterioration)" },
        { value: "deworming_medication", label: "Deworming medication" },
        { value: "vitamin_a_supplementation", label: "Vitamin A supplementation" },
        { value: "iron_folic_acid", label: "Iron and folic acid supplementation" },
        { value: "growth_monitoring", label: "Growth monitoring and recording on growth charts" },
        { value: "psychosocial_screening", label: "Psychosocial screening and support" },
        { value: "completion_vaccinations", label: "Completion of vaccinations" },
        { value: "hygiene_sanitation", label: "Hygiene and sanitation awareness" },
        { value: "malaria_prevention", label: "Malaria prevention and treatment (when required)" },
        { value: "follow_up_appointment", label: "Scheduling a follow-up appointment" },
        { value: "monitoring_feeding_practices", label: "Monitoring feeding practices and challenges" },
        { value: "education_dietary_diversity", label: "Education on dietary diversity and complementary feeding" },
        { value: "guidance_childhood_illnesses", label: "Guidance on managing common childhood illnesses" },
        { value: "referral_specialized_care", label: "Referral to specialized child care services" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.referredAfterIYCFE, operator: "equals", value: "yes" },
          { fieldId: fieldIds.referralTypeIYCFE, operator: "contains", value: "otp_not_nutrition" },
        ],
      },
    },
    // Section 16.b: Type of treatment (If IYCF-e)
    {
      id: fieldIds.iycfETreatmentTypes,
      type: "checkbox",
      label: {
        ar: "نوع العلاج (إذا تم اختيار IYCF-e)",
        en: "Type of treatment (If IYCF-e)",
      },
      required: false,
      multi: true,
      options: [
        { value: "breastfeeding_counseling", label: "Breastfeeding counselling" },
        { value: "relactation_support_sessions", label: "Relactation support sessions" },
        { value: "breast_milk_expression", label: "Guidance on breast milk expression" },
        { value: "breastfeeding_difficulties", label: "Support for breastfeeding difficulties (e.g., tongue-tie, poor latch)" },
        { value: "support_maternal_illness", label: "Support during maternal illness" },
        { value: "hygiene_safe_feeding", label: "Awareness on hygiene and safe feeding practices" },
        { value: "psychosocial_support_feeding", label: "Psychosocial support related to infant feeding" },
        { value: "family_community_support", label: "Facilitation of family or community support" },
        { value: "referral_specialized_support", label: "Referral for specialized support (e.g., lactation consultant)" },
        { value: "maternal_nutrition_breastfeeding", label: "Guidance on maternal nutrition during breastfeeding" },
        { value: "nutritional_supplementation_mothers", label: "Nutritional supplementation for mothers (vitamins/minerals)" },
        { value: "safe_infant_formula", label: "Guidance on the safe use of infant formula" },
        { value: "exclusive_breastfeeding_emergencies", label: "Support for exclusive breastfeeding in emergencies" },
        { value: "monitoring_growth_development", label: "Monitoring of child growth and development" },
        { value: "referral_mental_health", label: "Referral to mental health services" },
        { value: "feeding_special_needs", label: "Support for feeding infants with special needs" },
        { value: "education_complementary_feeding", label: "Education on complementary feeding for older infants" },
        { value: "breastfeeding_support_groups", label: "Access to breastfeeding support groups or peer counsellors" },
        { value: "none", label: "None" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.referredAfterIYCFE, operator: "equals", value: "yes" },
          { fieldId: fieldIds.referralTypeIYCFE, operator: "contains", value: "iycf_e" },
        ],
      },
    },
    {
      id: fieldIds.supplementsReceived,
      type: "checkbox",
      label: {
        ar: "هل تلقى المريض أيًا من هذه المكملات؟ (اختر كل ما ينطبق)",
        en: "Did the patient receive any of these supplements? (Select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "lns_lq", label: "LNS-LQ" },
        { value: "cereals", label: "Cereals" },
        { value: "heb", label: "HEB" },
        { value: "pb5", label: "PB5" },
        { value: "none", label: "None" },
      ],
    },
    // Section 5: Treatment Services
    {
      id: fieldIds.treatmentProvidedFor,
      type: "select",
      label: {
        ar: "يتم تقديم العلاج لـ:",
        en: "Treatment provided for:",
      },
      required: false,
      options: [
        { value: "child", label: "Child" },
        {
          value: "pbw",
          label: "Pregnant or Breastfeeding Woman (PBW)",
        },
      ],
    },
    // Section 5A: If Patient is a Child
    {
      id: fieldIds.childNutritionalStatus,
      type: "select",
      label: {
        ar: "الحالة التغذوية للطفل",
        en: "Nutritional status of the child",
      },
      required: false,
      options: [
        { value: "sam", label: "SAM" },
        { value: "mam", label: "MAM" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.childReceivedRUTF,
      type: "select",
      label: {
        ar: "هل تلقى الطفل RUTF؟",
        en: "Did the child receive RUTF?",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "sam" },
        ],
      },
    },
    {
      id: fieldIds.rutfQuantity,
      type: "text",
      name: "Quantity of RUTF provided", // Unique name
      label: {
        ar: "كمية RUTF المقدمة",
        en: "Quantity of RUTF provided",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childReceivedRUTF, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.childReceivedOther,
      type: "select",
      label: {
        ar: "هل تلقى الطفل:",
        en: "Did the child receive:",
      },
      required: false,
      options: [
        { value: "ruif", label: "RUIF" },
        { value: "heb", label: "HEB" },
        { value: "none", label: "None" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "mam" },
        ],
      },
    },
    {
      id: fieldIds.childOtherQuantity,
      type: "text",
      name: "Quantity provided (Child Treatment)", // Unique name for form editor
      label: {
        ar: "الكمية المقدمة",
        en: "Quantity provided",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childReceivedOther, operator: "notEquals", value: "none" },
        ],
      },
    },
    // Section 5B: If Patient is PBW
    {
      id: fieldIds.pbwReceived,
      type: "checkbox",
      label: {
        ar: "هل تلقى PBW (اختر كل ما ينطبق):",
        en: "Did the PBW receive (select all that apply):",
      },
      required: false,
      multi: true,
      options: [
        { value: "lns_lq", label: "LNS-LQ" },
        { value: "cereal", label: "Cereal" },
        { value: "heb", label: "HEB" },
        { value: "pb5", label: "PB5" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.pbwQuantity,
      type: "text",
      name: "Quantity provided (PBW Treatment)", // Unique name for form editor
      label: {
        ar: "الكمية المقدمة",
        en: "Quantity provided",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    // Section 5C: Demographic Information (Treatment)
    {
      id: fieldIds.mothersNameTreatment,
      type: "text",
      name: "Mother's name (Treatment)", // Unique name for form editor
      label: {
        ar: "اسم الأم",
        en: "Mother's name",
      },
      required: false,
      placeholder: "Enter mother's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.motherAgeTreatment,
      type: "number",
      name: "Mother age (Treatment)", // Unique name for form editor
      label: {
        ar: "عمر الأم",
        en: "Mother age",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.childsNameTreatment,
      type: "text",
      name: "Child's name (Treatment)", // Unique name for form editor
      label: {
        ar: "اسم الطفل",
        en: "Child's name",
      },
      required: false,
      placeholder: "Enter child's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.childAgeGroupTreatment,
      type: "select",
      name: "Age group of the child (Treatment)", // Unique name for form editor
      label: {
        ar: "الفئة العمرية للطفل",
        en: "Age group of the child",
      },
      required: false,
      options: [
        {
          value: "less_than_6_months",
          label: "Less than 6 months",
        },
        {
          value: "6_59_months",
          label: "6–59 months",
        },
        {
          value: "more_than_59_months",
          label: "More than 59 months",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    // Section 5D: Referrals (Treatment)
    {
      id: fieldIds.referredAfterTreatment,
      type: "select",
      label: {
        ar: "هل تم إحالة المريض؟",
        en: "Was the patient referred?",
      },
      required: false,
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
    },
    {
      id: fieldIds.referralTypeTreatment,
      type: "checkbox",
      name: "Type of referral (Treatment)", // Unique name for form editor
      label: {
        ar: "نوع الإحالة (إذا كانت الإجابة نعم)",
        en: "Type of referral (if yes)",
      },
      required: false,
      multi: true,
      options: [
        {
          value: "advanced_nutrition_care",
          label: "Advanced level care related to nutrition",
        },
        { value: "otp", label: "OTP" },
        {
          value: "inpatient_care",
          label: "Inpatient care",
        },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.referredAfterTreatment, operator: "equals", value: "yes" },
        ],
      },
    },
    // Section 6: Enumerator Information
    {
      id: fieldIds.enumeratorName,
      type: "text",
      label: {
        ar: "اسم المعداد",
        en: "Enumerator name",
      },
      required: true,
      placeholder: "Enter enumerator name",
    },
    {
      id: fieldIds.dataCollectionDate,
      type: "date",
      label: {
        ar: "تاريخ جمع البيانات",
        en: "Date of data collection",
      },
      required: true,
    },
    {
      id: fieldIds.siteFacilityName,
      type: "text",
      label: {
        ar: "اسم الموقع/المنشأة",
        en: "Site/Facility name",
      },
      required: true,
      placeholder: "Enter site/facility name",
    },
  ],
};

async function main() {
  console.log("Creating or updating nutrition event form and clinic (idempotent)...");

  // Step 1: Create or get the Nutrition clinic
  console.log("\n1. Creating or finding Nutrition clinic...");
  let nutritionClinic = await db
    .selectFrom("clinics")
    .selectAll()
    .where("name", "=", "Nutrition")
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  if (!nutritionClinic) {
    const clinicId = uuidv1();
    const now = new Date();
    await db
      .insertInto("clinics")
      .values({
        id: clinicId,
        name: "Nutrition",
        is_deleted: false,
        created_at: now as any,
        updated_at: now as any,
        last_modified: now as any,
        server_created_at: now as any,
        deleted_at: null,
        is_archived: false,
      })
      .execute();
    // Fetch the created clinic to ensure we have all fields
    nutritionClinic = await db
      .selectFrom("clinics")
      .selectAll()
      .where("id", "=", clinicId)
      .executeTakeFirst();
    if (!nutritionClinic) {
      throw new Error("Failed to create Nutrition clinic");
    }
    console.log(`   ✅ Created clinic "Nutrition" with id=${clinicId}`);
  } else {
    console.log(`   ✅ Found existing clinic "Nutrition" with id=${nutritionClinic.id}`);
  }

  // Ensure nutritionClinic is defined
  if (!nutritionClinic) {
    throw new Error("Failed to create or find Nutrition clinic");
  }

  // Step 2: Create or update the nutrition form
  console.log("\n2. Creating or updating nutrition event form...");
  const existing = await db
    .selectFrom("event_forms")
    .selectAll()
    .where("name", "=", nutritionForm.name)
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  let formId: string;

  if (existing) {
    console.log(
      `   - Updating form_fields for existing form "${nutritionForm.name}" (id=${existing.id})`,
    );
    await db
      .updateTable("event_forms")
      .set({
        form_fields: JSON.stringify(nutritionForm.formFields) as any,
        description: nutritionForm.description,
      })
      .where("id", "=", existing.id)
      .execute();
    formId = existing.id;
    console.log(`   ✅ Form updated.`);
  } else {
    formId = uuidv1();
    const now = new Date();
    await db
      .insertInto("event_forms")
      .values({
        id: formId,
        name: nutritionForm.name,
        description: nutritionForm.description,
        language: nutritionForm.language,
        is_editable: nutritionForm.isEditable,
        is_snapshot_form: nutritionForm.isSnapshotForm,
        form_fields: JSON.stringify(nutritionForm.formFields) as any,
        metadata: JSON.stringify({
          category: nutritionForm.category,
        }) as any,
        is_deleted: false,
        created_at: now as any,
        updated_at: now as any,
        last_modified: now as any,
        server_created_at: now as any,
        deleted_at: null,
      })
      .execute();
    console.log(`   ✅ Created form "${nutritionForm.name}" with id=${formId}`);
  }

  // Step 3: Attach the form to the Nutrition clinic
  console.log("\n3. Attaching form to Nutrition clinic...");
  const existingAssignment = await db
    .selectFrom("clinic_event_forms")
    .selectAll()
    .where("clinic_id", "=", nutritionClinic.id)
    .where("event_form_id", "=", formId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  if (existingAssignment) {
    console.log(`   ✅ Form is already attached to Nutrition clinic.`);
  } else {
    // Check if soft-deleted assignment exists and restore it
    const deletedAssignment = await db
      .selectFrom("clinic_event_forms")
      .selectAll()
      .where("clinic_id", "=", nutritionClinic.id)
      .where("event_form_id", "=", formId)
      .where("is_deleted", "=", true)
      .executeTakeFirst();

    if (deletedAssignment) {
      await db
        .updateTable("clinic_event_forms")
        .set({
          is_deleted: false,
          updated_at: new Date() as any,
          deleted_at: null,
        })
        .where("id", "=", deletedAssignment.id)
        .execute();
      console.log(`   ✅ Restored form assignment to Nutrition clinic.`);
    } else {
      // Create new assignment
      const assignmentId = uuidv1();
      const now = new Date();
      await db
        .insertInto("clinic_event_forms")
        .values({
          id: assignmentId,
          clinic_id: nutritionClinic.id,
          event_form_id: formId,
          is_deleted: false,
          created_at: now as any,
          updated_at: now as any,
          deleted_at: null,
        })
        .execute();
      console.log(`   ✅ Attached form to Nutrition clinic.`);
    }
  }

  console.log("\n✅ Done! Nutrition clinic and form are ready.");
  console.log(`   - Clinic: Nutrition (id=${nutritionClinic.id})`);
  console.log(`   - Form: ${nutritionForm.name} (id=${formId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create/update nutrition event form:", err);
  process.exit(1);
});
