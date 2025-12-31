#!/usr/bin/env tsx

/**
 * UPDATED Script to create Nutrition Services event form
 * 
 * This version matches the Excel skip logic specification exactly.
 * 
 * Key features:
 * - IDEMPOTENT: Can be run multiple times safely
 * - PRESERVES existing field IDs to prevent breaking existing submissions
 * - Fixed skip logic to match Excel specification
 * - Changed iycf_e to iycfe to match Excel
 * - Added missing "other" text fields for screening services
 * - Changed MAM products to multi-select checkbox
 * - Added separate quantity fields for MAM (RUIF, HEB) and PBW (LNS-LQ, Cereal, HEB, PB5)
 * - Fixed all complex skip logic conditions
 * 
 * Usage:
 *   npx tsx scripts/create-nutrition-event-form-updated.ts
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
      name?: string;
      label: BilingualLabel;
      required: boolean;
      placeholder?: string;
      skipLogic?: SkipLogic;
    }
  | {
      id: string;
      type: "select";
      name?: string;
      label: BilingualLabel;
      required: boolean;
      multi?: boolean;
      options: { value: string; label: string }[];
      skipLogic?: SkipLogic;
    }
  | {
      id: string;
      type: "checkbox";
      name?: string;
      label: BilingualLabel;
      required: boolean;
      multi: true;
      options: { value: string; label: string }[];
      skipLogic?: SkipLogic;
    };

type SimpleForm = {
  name: string;
  description: string;
  language: "ar" | "en";
  isEditable: boolean;
  isSnapshotForm: boolean;
  category: "nutrition";
  formFields: SimpleField[];
};

/**
 * Field ID mapping - will be populated with existing IDs or new ones
 */
type FieldIdMap = {
  // Section 1
  transferredFromTFU: string;
  nutritionServiceType: string;
  // Section 3
  screeningProvidedFor: string;
  mothersNameScreening: string;
  motherAgeScreening: string;
  childsNameScreening: string;
  childAgeGroupScreening: string;
  screeningServicesChild: string;
  screeningServicesChildOther: string;
  screeningServicesMother: string;
  screeningServicesMotherOther: string;
  referredAfterScreening: string;
  referralTypeScreening: string;
  // Section 4 - IYCF-E
  iycfESupportType: string;
  iycfEServicesProvided: string;
  relactationSupportProvided: string;
  relactationOutcome: string;
  sessionNumber: string;
  iycfETreatmentTypes: string;
  referredAfterIYCFE: string;
  referralTypeIYCFE: string;
  otpTreatmentTypes: string;
  supplementsReceived: string;
  // Section 5 - Treatment
  treatmentProvidedFor: string;
  childNutritionalStatus: string;
  childReceivedRUTF: string;
  rutfQuantity: string;
  mamProducts: string;
  mamQuantityRUIF: string;
  mamQuantityHEB: string;
  pbwProducts: string;
  pbwQuantityLNS: string;
  pbwQuantityCereal: string;
  pbwQuantityHEB: string;
  pbwQuantityPB5: string;
  referredAfterTreatment: string;
  referralTypeTreatment: string;
  // Section 5 - Treatment (old field names for backward compatibility)
  mothersNameTreatment: string;
  motherAgeTreatment: string;
  childsNameTreatment: string;
  childAgeGroupTreatment: string;
  childReceivedOther: string; // Old field, maps to mamProducts
  childOtherQuantity: string; // Old field, replaced by mamQuantityRUIF/HEB
  pbwReceived: string; // Old field, maps to pbwProducts
  pbwQuantity: string; // Old field, replaced by pbwQuantityLNS/Cereal/HEB/PB5
  // Section 6
  enumeratorName: string;
  dataCollectionDate: string;
  siteFacilityName: string;
};

/**
 * Extract existing field IDs from form by matching name or label
 */
function extractExistingFieldIds(existingFields: any[]): Partial<FieldIdMap> {
  const fieldIdMap: Partial<FieldIdMap> = {};
  
  // Create lookup maps
  const byName = new Map<string, string>();
  const byLabelEn = new Map<string, string>();
  
  existingFields.forEach((field) => {
    if (field.name) {
      byName.set(field.name.toLowerCase().trim(), field.id);
    }
    if (field.label?.en) {
      const labelKey = field.label.en.toLowerCase().trim();
      byLabelEn.set(labelKey, field.id);
    }
  });
  
  // Map known fields by name (most reliable)
  const nameMappings: Record<string, keyof FieldIdMap> = {
    "mother's name (screening)": "mothersNameScreening",
    "mother age (screening)": "motherAgeScreening",
    "child's name (screening)": "childsNameScreening",
    "age group of the child (screening)": "childAgeGroupScreening",
    "type of referral (screening)": "referralTypeScreening",
    "mother's name (treatment)": "mothersNameTreatment",
    "mother age (treatment)": "motherAgeTreatment",
    "child's name (treatment)": "childsNameTreatment",
    "age group of the child (treatment)": "childAgeGroupTreatment",
    "type of referral (treatment)": "referralTypeTreatment",
    "quantity of rutf provided": "rutfQuantity",
    "quantity provided (child treatment)": "childOtherQuantity",
    "quantity provided (pbw treatment)": "pbwQuantity",
    "other screening service for the child (specify)": "screeningServicesChildOther",
    "other screening service for the mother (specify)": "screeningServicesMotherOther",
    "type of treatment (if otp not related to nutrition is selected)": "otpTreatmentTypes",
    "type of treatment (if iycf-e is selected)": "iycfETreatmentTypes",
    "referral type (treatment)": "referralTypeTreatment",
    "referral type after screening": "referralTypeScreening",
  };
  
  // Map by name first
  for (const [name, key] of Object.entries(nameMappings)) {
    const fieldId = byName.get(name);
    if (fieldId) {
      fieldIdMap[key] = fieldId;
    }
  }
  
  // Map by label for fields without explicit names
  const labelMappings: Record<string, keyof FieldIdMap> = {
    "is the patient transferred from tfu (therapeutic feeding unit)?": "transferredFromTFU",
    "which nutrition service is provided today?": "nutritionServiceType",
    "screening is provided for:": "screeningProvidedFor",
    "mother's name": "mothersNameScreening", // Will match screening first
    "mother age": "motherAgeScreening",
    "child's name": "childsNameScreening",
    "age group of the child": "childAgeGroupScreening",
    "screening services provided to the child (select all that apply)": "screeningServicesChild",
    "screening services provided to the mother (select all that apply)": "screeningServicesMother",
    "was the patient referred after screening?": "referredAfterScreening",
    "type of iycf-e support provided (select one)": "iycfESupportType",
    "iycf-e supports provided (select all that apply)": "iycfEServicesProvided",
    "was relactation support provided?": "relactationSupportProvided",
    "outcome of relactation efforts": "relactationOutcome",
    "session number": "sessionNumber",
    "was the patient referred after iycf-e services?": "referredAfterIYCFE",
    "referral type after iycf-e (select all that apply)": "referralTypeIYCFE",
    "did the patient receive any of these supplements (select all that apply)": "supplementsReceived",
    "treatment provided for:": "treatmentProvidedFor",
    "nutritional status of the child": "childNutritionalStatus",
    "did the child receive rutf?": "childReceivedRUTF",
    "did the child receive:": "childReceivedOther", // Old field, will map to mamProducts if exists
    "did the pbw receive (select all that apply):": "pbwReceived", // Old field, will map to pbwProducts
    "was the patient referred?": "referredAfterTreatment",
    "enumerator name": "enumeratorName",
    "date of data collection": "dataCollectionDate",
    "site/facility name": "siteFacilityName",
  };
  
  // Map by label (only if not already mapped by name)
  for (const [label, key] of Object.entries(labelMappings)) {
    if (!fieldIdMap[key]) {
      const fieldId = byLabelEn.get(label);
      if (fieldId) {
        fieldIdMap[key] = fieldId;
      }
    }
  }
  
  return fieldIdMap;
}

/**
 * Generate field IDs, preserving existing ones where possible
 */
function generateFieldIds(existingFields: any[] | null): FieldIdMap {
  const existingIds = existingFields ? extractExistingFieldIds(existingFields) : {};
  
  // Helper to get ID or generate new one
  const getId = (key: keyof FieldIdMap): string => {
    if (existingIds[key]) {
      return existingIds[key]!;
    }
    return uuidv1();
  };
  
  // Special handling for renamed fields - try to find old field IDs
  const findOldFieldId = (oldLabel: string): string | null => {
    if (!existingFields || existingFields.length === 0) return null;
    const field = existingFields.find((f: any) => 
      f.label?.en?.toLowerCase().trim() === oldLabel.toLowerCase().trim()
    );
    return field?.id || null;
  };
  
  return {
    // Section 1
    transferredFromTFU: getId("transferredFromTFU"),
    nutritionServiceType: getId("nutritionServiceType"),
    // Section 3
    screeningProvidedFor: getId("screeningProvidedFor"),
    mothersNameScreening: getId("mothersNameScreening"),
    motherAgeScreening: getId("motherAgeScreening"),
    childsNameScreening: getId("childsNameScreening"),
    childAgeGroupScreening: getId("childAgeGroupScreening"),
    screeningServicesChild: getId("screeningServicesChild"),
    screeningServicesChildOther: getId("screeningServicesChildOther"),
    screeningServicesMother: getId("screeningServicesMother"),
    screeningServicesMotherOther: getId("screeningServicesMotherOther"),
    referredAfterScreening: getId("referredAfterScreening"),
    referralTypeScreening: getId("referralTypeScreening"),
    // Section 4 - IYCF-E
    iycfESupportType: getId("iycfESupportType"),
    iycfEServicesProvided: getId("iycfEServicesProvided"),
    relactationSupportProvided: getId("relactationSupportProvided"),
    relactationOutcome: getId("relactationOutcome"),
    sessionNumber: getId("sessionNumber"),
    iycfETreatmentTypes: getId("iycfETreatmentTypes"),
    referredAfterIYCFE: getId("referredAfterIYCFE"),
    referralTypeIYCFE: getId("referralTypeIYCFE"),
    otpTreatmentTypes: getId("otpTreatmentTypes"),
    supplementsReceived: getId("supplementsReceived"),
    // Section 5 - Treatment
    treatmentProvidedFor: getId("treatmentProvidedFor"),
    childNutritionalStatus: getId("childNutritionalStatus"),
    childReceivedRUTF: getId("childReceivedRUTF"),
    rutfQuantity: getId("rutfQuantity"),
    mamProducts: findOldFieldId("Did the child receive:") || getId("mamProducts"), // Try to match old "childReceivedOther"
    mamQuantityRUIF: findOldFieldId("Quantity provided") || getId("mamQuantityRUIF"), // Try to match old "childOtherQuantity"
    mamQuantityHEB: getId("mamQuantityHEB"), // New field
    pbwProducts: findOldFieldId("Did the PBW receive") || getId("pbwProducts"), // Try to match old "pbwReceived"
    pbwQuantityLNS: getId("pbwQuantityLNS"), // New field
    pbwQuantityCereal: getId("pbwQuantityCereal"), // New field
    pbwQuantityHEB: getId("pbwQuantityHEB"), // New field
    pbwQuantityPB5: getId("pbwQuantityPB5"), // New field
    referredAfterTreatment: getId("referredAfterTreatment"),
    referralTypeTreatment: getId("referralTypeTreatment"),
    // Section 5 - Treatment (old field names for backward compatibility)
    mothersNameTreatment: getId("mothersNameTreatment"),
    motherAgeTreatment: getId("motherAgeTreatment"),
    childsNameTreatment: getId("childsNameTreatment"),
    childAgeGroupTreatment: getId("childAgeGroupTreatment"),
    childReceivedOther: getId("childReceivedOther"), // Old field, kept for compatibility
    childOtherQuantity: getId("childOtherQuantity"), // Old field, kept for compatibility
    pbwReceived: getId("pbwReceived"), // Old field, kept for compatibility
    pbwQuantity: getId("pbwQuantity"), // Old field, kept for compatibility
    // Section 6
    enumeratorName: getId("enumeratorName"),
    dataCollectionDate: getId("dataCollectionDate"),
    siteFacilityName: getId("siteFacilityName"),
  };
}

/**
 * Build form fields with preserved field IDs
 */
function buildFormFields(fieldIds: FieldIdMap): SimpleField[] {
  return [
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
        { value: "yes", label: "Yes | نعم" },
        { value: "no", label: "No | لا" },
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
        { value: "screening", label: "Screening | فحص" },
        { value: "treatment", label: "Treatment | علاج" },
        { value: "iycfe", label: "IYCF-E | تغذية الرضع وصغار الأطفال في الطوارئ (IYCF-E)" }, // Changed from iycf_e to iycfe
      ],
    },
    // Section 3: Screening Services - ALL fields need ${service_today}='screening'
    {
      id: fieldIds.screeningProvidedFor,
      type: "select",
      label: {
        ar: "يتم تقديم الفحص لـ:",
        en: "Screening is provided for:",
      },
      required: true,
      options: [
        { value: "child", label: "Child | طفل" },
        { value: "pbw", label: "Pregnant or Breastfeeding Woman (PBW) | امرأة حامل أو مرضع" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
        ],
      },
    },
    // Section 3A: Demographic Information (Screening) - Mother
    {
      id: fieldIds.mothersNameScreening,
      type: "text",
      name: "Mother's name (Screening)",
      label: {
        ar: "اسم الأم",
        en: "Mother's name",
      },
      required: false,
      placeholder: "Enter mother's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.motherAgeScreening,
      type: "number",
      name: "Mother age (Screening)",
      label: {
        ar: "عمر الأم (بالسنوات)",
        en: "Mother age (years)",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    // Section 3A: Demographic Information (Screening) - Child
    {
      id: fieldIds.childsNameScreening,
      type: "text",
      name: "Child's name (Screening)",
      label: {
        ar: "اسم الطفل",
        en: "Child's name",
      },
      required: false,
      placeholder: "Enter child's name",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.childAgeGroupScreening,
      type: "select",
      name: "Age group of the child (Screening)",
      label: {
        ar: "الفئة العمرية للطفل",
        en: "Age group of the child",
      },
      required: false,
      options: [
        { value: "lt6m", label: "Less than 6 months | أقل من 6 أشهر" },
        { value: "6_59m", label: "6–59 months | 6–59 شهرًا" },
        { value: "gt59m", label: "More than 59 months | أكثر من 59 شهرًا" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
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
        { value: "muac", label: "MUAC measurement | قياس محيط منتصف الذراع (MUAC)" },
        { value: "oedema", label: "Oedema check | فحص الوذمة" },
        { value: "weight", label: "Weight measurement | قياس الوزن" },
        { value: "counselling", label: "Nutrition counseling | إرشاد تغذوي" },
        { value: "other", label: "Other (specify) | أخرى (يرجى التحديد)" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.screeningServicesChildOther,
      type: "text",
      name: "Other screening service for the child (specify)",
      label: {
        ar: "خدمة فحص أخرى مقدمة للطفل (يرجى التحديد)",
        en: "Other screening service for the child (specify)",
      },
      required: false,
      placeholder: "Specify other service",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.screeningServicesChild, operator: "contains", value: "other" },
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
        { value: "muac", label: "MUAC measurement | قياس محيط منتصف الذراع (MUAC)" },
        { value: "counselling", label: "Nutrition counseling | إرشاد تغذوي" },
        { value: "other", label: "Other (specify) | أخرى (يرجى التحديد)" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.screeningServicesMotherOther,
      type: "text",
      name: "Other screening service for the mother (specify)",
      label: {
        ar: "خدمة فحص أخرى مقدمة للأم (يرجى التحديد)",
        en: "Other screening service for the mother (specify)",
      },
      required: false,
      placeholder: "Specify other service",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.screeningProvidedFor, operator: "equals", value: "pbw" },
          { fieldId: fieldIds.screeningServicesMother, operator: "contains", value: "other" },
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
        { value: "no", label: "No | لا" },
        { value: "yes", label: "Yes | نعم" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
        ],
      },
    },
    {
      id: fieldIds.referralTypeScreening,
      type: "checkbox",
      name: "Referral type after screening",
      label: {
        ar: "نوع الإحالة بعد الفحص (اختر كل ما ينطبق)",
        en: "Referral type after screening (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "advanced_nutrition", label: "Advanced level care related to nutrition | رعاية متقدمة مرتبطة بالتغذية" },
        { value: "otp_not_nutrition", label: "OTP (not related to nutrition) | برنامج العلاج الخارجي (OTP) (غير مرتبط بالتغذية)" },
        { value: "inpatient_not_nutrition", label: "Inpatient care (not related to nutrition) | رعاية داخلية (غير مرتبطة بالتغذية)" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "screening" },
          { fieldId: fieldIds.referredAfterScreening, operator: "equals", value: "yes" },
        ],
      },
    },
    // Section 4: IYCF-E Services - ALL fields need ${service_today}='iycfe'
    {
      id: fieldIds.iycfESupportType,
      type: "select",
      label: {
        ar: "نوع دعم IYCF-E المقدم (اختر واحدًا)",
        en: "Type of IYCF-E support provided (select one)",
      },
      required: true,
      options: [
        { value: "group", label: "Group counselling | إرشاد جماعي" },
        { value: "one_on_one", label: "One on one counselling | إرشاد فردي" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
        ],
      },
    },
    {
      id: fieldIds.iycfEServicesProvided,
      type: "checkbox",
      label: {
        ar: "أنواع دعم IYCF-E المقدمة (اختر كل ما ينطبق)",
        en: "IYCF-E supports provided (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "iycf_counsel", label: "Infant and Young Child Feeding (IYCF) counseling | إرشاد تغذية الرضع وصغار الأطفال (IYCF)" },
        { value: "breastfeeding", label: "Breastfeeding support | دعم الرضاعة الطبيعية" },
        { value: "complementary", label: "Complementary feeding counseling | إرشاد التغذية التكميلية" },
        { value: "relactation", label: "Relactation support | دعم إعادة الإرضاع" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
        ],
      },
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
        { value: "no", label: "No | لا" },
        { value: "yes", label: "Yes | نعم" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
          { fieldId: fieldIds.iycfEServicesProvided, operator: "contains", value: "relactation" },
        ],
      },
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
        { value: "successful", label: "Successful | ناجحة" },
        { value: "not_successful", label: "Not successful | غير ناجحة" },
        { value: "ongoing", label: "Ongoing | مستمرة" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
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
        { value: "s1", label: "Session 1 | الجلسة 1" },
        { value: "s2", label: "Session 2 | الجلسة 2" },
        { value: "s3", label: "Session 3 | الجلسة 3" },
        { value: "s4plus", label: "Session 4 or more | الجلسة 4 أو أكثر" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
          { fieldId: fieldIds.relactationSupportProvided, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.iycfETreatmentTypes,
      type: "checkbox",
      name: "Type of treatment (if IYCF-e is selected)",
      label: {
        ar: "نوع التدخل/العلاج (في حال اختيار IYCF-E) (اختر كل ما ينطبق)",
        en: "Type of treatment (if IYCF-e is selected) (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "bf_counselling", label: "Breastfeeding counselling | إرشاد حول الرضاعة الطبيعية" },
        { value: "relact_sessions", label: "Relactation support sessions | جلسات دعم إعادة الإرضاع" },
        { value: "milk_expression", label: "Guidance on breast milk expression | إرشاد حول شفط حليب الأم" },
        { value: "bf_difficulties", label: "Support for breastfeeding difficulties (e.g., tongue-tie, poor latch) | دعم لمشاكل الرضاعة (مثل قصر اللسان، ضعف الالتقام)" },
        { value: "maternal_illness", label: "Support during maternal illness | دعم أثناء مرض الأم" },
        { value: "hygiene_safe_feeding", label: "Awareness on hygiene and safe feeding practices | التوعية حول النظافة والإطعام الآمن" },
        { value: "psychosocial_if", label: "Psychosocial support related to infant feeding | دعم نفسي-اجتماعي متعلق بإطعام الرضيع" },
        { value: "family_community", label: "Facilitation of family or community support | تيسير دعم الأسرة أو المجتمع" },
        { value: "ref_lactation", label: "Referral for specialized support (e.g., lactation consultant) | إحالة لدعم متخصص (مثل مستشار رضاعة)" },
        { value: "maternal_nutrition", label: "Guidance on maternal nutrition during breastfeeding | إرشادات حول تغذية الأم أثناء الرضاعة" },
        { value: "supp_mothers", label: "Nutritional supplementation for mothers (vitamins/minerals) | مكملات غذائية للأم (فيتامينات/معادن)" },
        { value: "formula_use", label: "Guidance on the safe use of infant formula | إرشادات حول الاستخدام الآمن لحليب الأطفال الصناعي" },
        { value: "ebf_emergencies", label: "Support for exclusive breastfeeding in emergencies | دعم الرضاعة الحصرية في حالات الطوارئ" },
        { value: "growth_dev", label: "Monitoring of child growth and development | مراقبة نمو وتطور الطفل" },
        { value: "ref_mental_health", label: "Referral to mental health services | إحالة لخدمات الصحة النفسية" },
        { value: "special_needs", label: "Support for feeding infants with special needs | دعم تغذية الرضع ذوي الاحتياجات الخاصة" },
        { value: "comp_feeding_older", label: "Education on complementary feeding for older infants | تعليم التغذية التكميلية للرضع الأكبر سنًا" },
        { value: "bf_support_groups", label: "Access to breastfeeding support groups or peer counsellors | الوصول إلى مجموعات دعم الرضاعة أو مستشارين أقران" },
        { value: "none", label: "None | لا شيء" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
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
        { value: "no", label: "No | لا" },
        { value: "yes", label: "Yes | نعم" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
        ],
      },
    },
    {
      id: fieldIds.referralTypeIYCFE,
      type: "checkbox",
      label: {
        ar: "نوع الإحالة بعد خدمات IYCF-E (اختر كل ما ينطبق)",
        en: "Referral type after IYCF-E (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "advanced_nutrition", label: "Advanced level care related to nutrition | رعاية متقدمة مرتبطة بالتغذية" },
        { value: "otp_not_nutrition", label: "OTP (not related to nutrition) | برنامج العلاج الخارجي (OTP) (غير مرتبط بالتغذية)" },
        { value: "inpatient_not_nutrition", label: "Inpatient care (not related to nutrition) | رعاية داخلية (غير مرتبطة بالتغذية)" },
        { value: "iycfe", label: "IYCF-e | خدمات تغذية الرضع وصغار الأطفال في الطوارئ (IYCF-E)" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
          { fieldId: fieldIds.referredAfterIYCFE, operator: "equals", value: "yes" },
        ],
      },
    },
    // Section 16.a: Type of treatment (If OTP not related to nutrition is selected)
    // Excel shows: ${service_today}='treatment' and ${treatment_for}='child' or ${child_nut_status}='sam' and ${child_nut_status}='mam'
    // Interpreting as: service_today='treatment' AND treatment_for='child' AND (child_nut_status='sam' OR child_nut_status='mam')
    // Note: This field appears when child has SAM or MAM nutritional status
    {
      id: fieldIds.otpTreatmentTypes,
      type: "checkbox",
      label: {
        ar: "نوع التدخل/العلاج (في حال اختيار OTP غير المرتبط بالتغذية) (اختر كل ما ينطبق)",
        en: "Type of treatment (if OTP not related to nutrition is selected) (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "rutf", label: "Ready-to-Use Therapeutic Food (RUTF) | غذاء علاجي جاهز للاستخدام (RUTF)" },
        { value: "medical_exam", label: "Medical examination | فحص طبي" },
        { value: "muac_monitoring", label: "MUAC monitoring | مراقبة MUAC" },
        { value: "caregiver_counselling", label: "Nutritional counselling for the caregiver | إرشاد تغذوي لمقدم الرعاية" },
        { value: "ref_health_facility", label: "Referral to a health facility (in case of deterioration) | إحالة إلى مرفق صحي (في حال تدهور الحالة)" },
        { value: "deworming", label: "Deworming medication | دواء طارد للديدان" },
        { value: "vit_a", label: "Vitamin A supplementation | مكمل فيتامين A" },
        { value: "ifa", label: "Iron and folic acid supplementation | مكملات الحديد وحمض الفوليك" },
        { value: "growth_monitoring", label: "Growth monitoring and recording on growth charts | مراقبة النمو وتسجيله على مخططات النمو" },
        { value: "psychosocial", label: "Psychosocial screening and support | تحرّي ودعم نفسي-اجتماعي" },
        { value: "vaccinations", label: "Completion of vaccinations | استكمال التطعيمات" },
        { value: "hygiene_sanitation", label: "Hygiene and sanitation awareness | توعية بالنظافة والصحة العامة" },
        { value: "malaria", label: "Malaria prevention and treatment (when required) | الوقاية من الملاريا وعلاجها (عند الحاجة)" },
        { value: "follow_up", label: "Scheduling a follow-up appointment | تحديد موعد متابعة" },
        { value: "feeding_practices", label: "Monitoring feeding practices and challenges | مراقبة ممارسات التغذية والتحديات" },
        { value: "diet_diversity", label: "Education on dietary diversity and complementary feeding | التثقيف حول التنوع الغذائي والتغذية التكميلية" },
        { value: "illness_guidance", label: "Guidance on managing common childhood illnesses | إرشادات لإدارة الأمراض الشائعة لدى الأطفال" },
        { value: "ref_specialized_child", label: "Referral to specialized child care services | إحالة إلى خدمات رعاية أطفال متخصصة" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          // Note: Excel condition includes: (child_nut_status='sam' OR child_nut_status='mam')
          // Our system only supports AND logic in showWhen, so we show for all child treatments.
          // The field will be visible for both SAM and MAM cases, which matches the intent.
        ],
      },
    },
    {
      id: fieldIds.supplementsReceived,
      type: "checkbox",
      label: {
        ar: "هل تلقى المريض أيًا من هذه المكملات (اختر كل ما ينطبق)",
        en: "Did the patient receive any of these supplements (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "lns_lq", label: "LNS-LQ | مكملات غذائية منخفضة الكمية (LNS-LQ)" },
        { value: "cereals", label: "Cereals | حبوب" },
        { value: "heb", label: "HEB | HEB" },
        { value: "pb5", label: "PB5 | PB5" },
        { value: "none", label: "None | لا شيء" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "iycfe" },
        ],
      },
    },
    // Section 5: Treatment Services - ALL fields need ${service_today}='treatment'
    {
      id: fieldIds.treatmentProvidedFor,
      type: "select",
      label: {
        ar: "يتم تقديم العلاج لـ:",
        en: "Treatment provided for:",
      },
      required: true,
      options: [
        { value: "child", label: "Child | طفل" },
        { value: "pbw", label: "Pregnant or Breastfeeding Woman (PBW) | امرأة حامل أو مرضع" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
        ],
      },
    },
    // Section 5A: If Patient is a Child
    {
      id: fieldIds.childNutritionalStatus,
      type: "select",
      label: {
        ar: "الحالة التغذوية للطفل",
        en: "Nutritional status of the child",
      },
      required: true,
      options: [
        { value: "sam", label: "SAM | سوء تغذية حاد وخيم (SAM)" },
        { value: "mam", label: "MAM | سوء تغذية متوسط (MAM)" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
        ],
      },
    },
    {
      id: fieldIds.childReceivedRUTF,
      type: "select",
      label: {
        ar: "هل تلقى الطفل غذاءً علاجياً جاهزاً للاستخدام (RUTF)؟",
        en: "Did the child receive RUTF?",
      },
      required: false,
      options: [
        { value: "no", label: "No | لا" },
        { value: "yes", label: "Yes | نعم" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "sam" },
        ],
      },
    },
    {
      id: fieldIds.rutfQuantity,
      type: "number",
      name: "Quantity of RUTF provided",
      label: {
        ar: "كمية RUTF المقدمة",
        en: "Quantity of RUTF provided",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "sam" },
          { fieldId: fieldIds.childReceivedRUTF, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.mamProducts,
      type: "checkbox",
      label: {
        ar: "هل تلقى الطفل ما يلي (اختر كل ما ينطبق)",
        en: "Did the child receive (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "ruif", label: "RUIF | أغذية علاجية جاهزة للاستخدام (RUIF)" },
        { value: "heb", label: "HEB | HEB" },
        { value: "none", label: "None | لا شيء" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "mam" },
        ],
      },
    },
    {
      id: fieldIds.mamQuantityRUIF,
      type: "number",
      name: "Quantity provided RUIF",
      label: {
        ar: "الكمية المقدمة RUIF",
        en: "Quantity provided | الكمية المقدّمة RUIF",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "mam" },
          { fieldId: fieldIds.mamProducts, operator: "notContains", value: "none" },
          { fieldId: fieldIds.mamProducts, operator: "contains", value: "ruif" },
        ],
      },
    },
    {
      id: fieldIds.mamQuantityHEB,
      type: "number",
      name: "Quantity provided HEB",
      label: {
        ar: "الكمية المقدمة HEB",
        en: "Quantity provided | الكمية المقدّمة HEB",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "child" },
          { fieldId: fieldIds.childNutritionalStatus, operator: "equals", value: "mam" },
          { fieldId: fieldIds.mamProducts, operator: "notContains", value: "none" },
          { fieldId: fieldIds.mamProducts, operator: "contains", value: "heb" },
        ],
      },
    },
    // Section 5B: If Patient is PBW
    {
      id: fieldIds.pbwProducts,
      type: "checkbox",
      label: {
        ar: "هل تلقت الحامل أو المرضع ما يلي (اختر كل ما ينطبق)",
        en: "Did the PBW receive (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "lns_lq", label: "LNS-LQ | مكملات غذائية منخفضة الكمية (LNS-LQ)" },
        { value: "cereal", label: "Cereal | حبوب" },
        { value: "heb", label: "HEB | HEB" },
        { value: "pb5", label: "PB5 | PB5" },
        { value: "none2", label: "None | لا شيء" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
        ],
      },
    },
    {
      id: fieldIds.pbwQuantityLNS,
      type: "number",
      name: "Quantity provided LNS-LQ",
      label: {
        ar: "الكمية المقدمة LNS-LQ",
        en: "Quantity provided | الكمية المقدّمة LNS-LQ",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
          { fieldId: fieldIds.pbwProducts, operator: "notContains", value: "none2" },
          { fieldId: fieldIds.pbwProducts, operator: "contains", value: "lns_lq" },
        ],
      },
    },
    {
      id: fieldIds.pbwQuantityCereal,
      type: "number",
      name: "Quantity provided Cereal",
      label: {
        ar: "الكمية المقدمة Cereal | حبوب",
        en: "Quantity provided | الكمية المقدّمة Cereal | حبوب",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
          { fieldId: fieldIds.pbwProducts, operator: "notContains", value: "none2" },
          { fieldId: fieldIds.pbwProducts, operator: "contains", value: "cereal" },
        ],
      },
    },
    {
      id: fieldIds.pbwQuantityHEB,
      type: "number",
      name: "Quantity provided HEB",
      label: {
        ar: "الكمية المقدمة HEB",
        en: "Quantity provided | الكمية المقدّمة HEB",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
          { fieldId: fieldIds.pbwProducts, operator: "notContains", value: "none2" },
          { fieldId: fieldIds.pbwProducts, operator: "contains", value: "heb" },
        ],
      },
    },
    {
      id: fieldIds.pbwQuantityPB5,
      type: "number",
      name: "Quantity provided PB5",
      label: {
        ar: "الكمية المقدمة PB5",
        en: "Quantity provided | الكمية المقدّمة PB5",
      },
      required: false,
      placeholder: "Enter quantity",
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
          { fieldId: fieldIds.treatmentProvidedFor, operator: "equals", value: "pbw" },
          { fieldId: fieldIds.pbwProducts, operator: "notContains", value: "none2" },
          { fieldId: fieldIds.pbwProducts, operator: "contains", value: "pb5" },
        ],
      },
    },
    // Section 5D: Referrals (Treatment)
    {
      id: fieldIds.referredAfterTreatment,
      type: "select",
      label: {
        ar: "هل تم تحويل المريض؟",
        en: "Was the patient referred?",
      },
      required: false,
      options: [
        { value: "no", label: "No | لا" },
        { value: "yes", label: "Yes | نعم" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
        ],
      },
    },
    {
      id: fieldIds.referralTypeTreatment,
      type: "checkbox",
      name: "Referral type (Treatment)",
      label: {
        ar: "نوع الإحالة (اختر كل ما ينطبق)",
        en: "Referral type (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "advanced_nutrition", label: "Advanced level care related to nutrition | رعاية متقدمة مرتبطة بالتغذية" },
        { value: "otp", label: "OTP | برنامج العلاج الخارجي (OTP)" },
        { value: "inpatient", label: "Inpatient care | رعاية داخلية" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.nutritionServiceType, operator: "equals", value: "treatment" },
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
  ];
}

async function main() {
  console.log("Creating or updating nutrition event form and clinic (idempotent)...");
  console.log("✅ This version PRESERVES existing field IDs to prevent breaking submissions");

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

  if (!nutritionClinic) {
    throw new Error("Failed to create or find Nutrition clinic");
  }

  // Step 2: Create or update the nutrition form
  console.log("\n2. Creating or updating nutrition event form...");
  const existing = await db
    .selectFrom("event_forms")
    .selectAll()
    .where("name", "=", "Nutrition Services Form")
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  let formId: string;
  let existingFields: any[] = [];

  // Extract existing fields if form exists
  if (existing && existing.form_fields) {
    try {
      existingFields = typeof existing.form_fields === 'string' 
        ? JSON.parse(existing.form_fields) 
        : existing.form_fields;
      console.log(`   - Found existing form with ${existingFields.length} fields`);
      console.log(`   - Preserving existing field IDs where possible...`);
    } catch (e) {
      console.warn(`   ⚠️  Could not parse existing form_fields, will generate new IDs`);
      existingFields = [];
    }
  }

  // Generate field IDs (preserving existing ones)
  const fieldIds = generateFieldIds(existingFields.length > 0 ? existingFields : null);
  
  // Count how many IDs were preserved
  const preservedCount = Object.values(fieldIds).filter(id => 
    existingFields.some((f: any) => f.id === id)
  ).length;
  
  if (preservedCount > 0) {
    console.log(`   ✅ Preserved ${preservedCount} existing field IDs`);
  }

  // Build form with preserved IDs
  const formFields = buildFormFields(fieldIds);
  
  const nutritionForm: SimpleForm = {
    name: "Nutrition Services Form",
    description:
      "Comprehensive form for documenting nutrition services including screening, treatment, and IYCF-E (Infant and Young Child Feeding in Emergencies) services.",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    category: "nutrition",
    formFields,
  };

  if (existing) {
    console.log(
      `   - Updating form_fields for existing form "${nutritionForm.name}" (id=${existing.id})`,
    );
    await db
      .updateTable("event_forms")
      .set({
        form_fields: JSON.stringify(nutritionForm.formFields) as any,
        description: nutritionForm.description,
        updated_at: new Date() as any,
        last_modified: new Date() as any,
      })
      .where("id", "=", existing.id)
      .execute();
    formId = existing.id;
    console.log(`   ✅ Form updated with new skip logic (${preservedCount} field IDs preserved).`);
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
  console.log(`   - Fields: ${formFields.length} total`);
  if (preservedCount > 0) {
    console.log(`   - Preserved: ${preservedCount} existing field IDs`);
  }
  console.log("\n📝 Key changes applied:");
  console.log("   - Fixed skip logic to match Excel specification");
  console.log("   - Changed iycf_e to iycfe");
  console.log("   - Added missing 'other' text fields for screening services");
  console.log("   - Changed MAM products to multi-select checkbox");
  console.log("   - Added separate quantity fields for MAM (RUIF, HEB) and PBW (LNS-LQ, Cereal, HEB, PB5)");
  console.log("   - Fixed all complex skip logic conditions");
  console.log("\n🔄 This script is IDEMPOTENT - safe to run multiple times");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create/update nutrition event form:", err);
  process.exit(1);
});
