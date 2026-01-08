#!/usr/bin/env tsx

/**
 * Script to create Orphan Sponsorship Followup Form
 * 
 * This script is IDEMPOTENT - can be run multiple times safely.
 * It preserves existing field IDs to prevent breaking existing submissions.
 * 
 * Usage:
 *   npx tsx scripts/create-orphan-sponsorship-followup-form.ts
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";
import { sql } from "kysely";

// Label type that supports bilingual labels
type BilingualLabel = {
  ar: string;
  en: string;
};

type SkipCondition = {
  fieldId: string;
  operator: "equals" | "notEquals" | "contains" | "notContains" | "selected";
  value: string | string[];
};

type SkipLogic = {
  showWhen?: SkipCondition[];
  hideWhen?: SkipCondition[];
};

type SimpleField =
  | {
      id: string;
      type: "text" | "textarea" | "number" | "date" | "integer";
      name?: string;
      description?: string;
      label: BilingualLabel;
      required: boolean;
      placeholder?: string;
      skipLogic?: SkipLogic;
    }
  | {
      id: string;
      type: "select";
      name?: string;
      description?: string;
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
      description?: string;
      label: BilingualLabel;
      required: boolean;
      multi: true;
      options: { value: string; label: string }[];
      skipLogic?: SkipLogic;
    };

/**
 * Parse Excel skip logic condition to our format
 * Note: Multiple showWhen conditions are treated as OR in the UI
 */
function parseSkipCondition(
  condition: string,
  fieldIdMap: Record<string, string>
): SkipCondition[] {
  if (!condition || condition.trim() === "") {
    return [];
  }

  const conditions: SkipCondition[] = [];

  // Handle OR conditions - split by 'or' (case insensitive)
  const orParts = condition.split(/\s+or\s+/i);
  
  for (const part of orParts) {
    const trimmed = part.trim();
    
    // Handle selected() function: selected(${field},'value')=false
    const selectedMatch = trimmed.match(/selected\([^,]+,\s*['"]([^'"]+)['"]\)\s*=\s*(true|false)/i);
    if (selectedMatch) {
      const fieldMatch = trimmed.match(/\$\{([^}]+)\}/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        if (fieldIdMap[fieldName]) {
          conditions.push({
            fieldId: fieldIdMap[fieldName],
            operator: selectedMatch[2].toLowerCase() === "false" ? "notContains" : "contains",
            value: selectedMatch[1],
          });
          continue;
        }
      }
    }

    // Handle equals: ${field} = 'value'
    const equalsMatch = trimmed.match(/\$\{([^}]+)\}\s*=\s*['"]([^'"]+)['"]/);
    if (equalsMatch) {
      const fieldName = equalsMatch[1];
      const value = equalsMatch[2];
      if (fieldIdMap[fieldName]) {
        conditions.push({
          fieldId: fieldIdMap[fieldName],
          operator: "equals",
          value: value,
        });
        continue;
      }
    }

    // Handle not equals: ${field} != 'value'
    const notEqualsMatch = trimmed.match(/\$\{([^}]+)\}\s*!=\s*['"]([^'"]+)['"]/);
    if (notEqualsMatch) {
      const fieldName = notEqualsMatch[1];
      const value = notEqualsMatch[2];
      if (fieldIdMap[fieldName]) {
        conditions.push({
          fieldId: fieldIdMap[fieldName],
          operator: "notEquals",
          value: value,
        });
        continue;
      }
    }
  }

  return conditions;
}

/**
 * Field ID mapping - will be populated with existing IDs or new ones
 */
type FieldIdMap = {
  // Section 1
  donorId: string;
  orphanName: string;
  orphanId: string;
  project: string;
  period: string;
  date: string;
  // Section 2
  age: string;
  educationGrade: string;
  specify: string;
  caregiverEducation: string;
  levelEducationNote: string;
  attendance: string;
  attendanceReason: string;
  academic: string;
  academicReason: string;
  nutritionStatus: string;
  nutritionReason: string;
  nutritionFollowup: string;
  healthStatus: string;
  healthFollowup: string;
  healthDetails: string;
  pssState: string;
  pssType: string;
  pssImpact: string;
  pssImpactReason: string;
  // Section 3
  residence: string;
  other: string;
  housingImpact: string;
  housingImpactReason: string;
  familyImpact: string;
  familyImpactReason: string;
  residenceChange: string;
  residenceChangeReason: string;
  housingCondition: string;
  basicNeeds: string;
  basicNeedsShortage: string;
  // Section 4
  activities: string;
  activitiesYes: string;
  activitiesNo: string;
  changes: string;
  achievements: string;
  challenges: string;
  // Section 5
  photo: string;
  video: string;
  staff: string;
  // Section 6
  comparison: string;
  comparisonReason: string;
  summary: string;
  impactSummary: string;
  improvementArea: string;
  recommendations: string;
};

/**
 * Extract existing field IDs from form by matching name or label
 */
function extractExistingFieldIds(existingFields: any[]): Partial<FieldIdMap> {
  const fieldIdMap: Partial<FieldIdMap> = {};
  
  const byName = new Map<string, string>();
  const byLabelEn = new Map<string, string>();
  const byLabelAr = new Map<string, string>();
  
  for (const field of existingFields) {
    if (field.name) {
      byName.set(field.name.toLowerCase().trim(), field.id);
    }
    if (field.label?.en) {
      byLabelEn.set(field.label.en.toLowerCase().trim(), field.id);
    }
    if (field.label?.ar) {
      byLabelAr.set(field.label.ar.toLowerCase().trim(), field.id);
    }
  }
  
  // Map by name
  const nameMappings: Record<string, keyof FieldIdMap> = {
    "donor_id": "donorId",
    "orphan_name": "orphanName",
    "orphan_id": "orphanId",
    "project": "project",
    "period": "period",
    "date": "date",
    "age": "age",
    "education_grade": "educationGrade",
    "specify": "specify",
    "caregiver_education": "caregiverEducation",
    "level_education_note": "levelEducationNote",
    "attendance": "attendance",
    "attendance_reason": "attendanceReason",
    "academic": "academic",
    "academic_reason": "academicReason",
    "nutrition_status": "nutritionStatus",
    "nutrition_reason": "nutritionReason",
    "nutrition_followup": "nutritionFollowup",
    "health_status": "healthStatus",
    "health_followup": "healthFollowup",
    "health_details": "healthDetails",
    "pss_state": "pssState",
    "pss_type": "pssType",
    "pss_impact": "pssImpact",
    "pss_impact_reason": "pssImpactReason",
    "residence": "residence",
    "other": "other",
    "housing_impact": "housingImpact",
    "housing_impact_reason": "housingImpactReason",
    "family_impact": "familyImpact",
    "family_impact_reason": "familyImpactReason",
    "residence_change": "residenceChange",
    "residence_change_reason": "residenceChangeReason",
    "housing_condition": "housingCondition",
    "basic_needs": "basicNeeds",
    "basic_needs_shortage": "basicNeedsShortage",
    "activities": "activities",
    "activities_yes": "activitiesYes",
    "activities_no": "activitiesNo",
    "changes": "changes",
    "achievements": "achievements",
    "challenges": "challenges",
    "photo": "photo",
    "video": "video",
    "staff": "staff",
    "comparison": "comparison",
    "comparison_reason": "comparisonReason",
    "summary": "summary",
    "impact_summary": "impactSummary",
    "improvement_area": "improvementArea",
    "recommendations": "recommendations",
  };
  
  for (const [name, key] of Object.entries(nameMappings)) {
    const fieldId = byName.get(name.toLowerCase());
    if (fieldId) {
      fieldIdMap[key] = fieldId;
    }
  }
  
  return fieldIdMap;
}

/**
 * Generate field IDs, preserving existing ones where possible
 */
function generateFieldIds(existingFields: any[] | null): FieldIdMap {
  const existingIds = existingFields ? extractExistingFieldIds(existingFields) : {};
  
  const getId = (key: keyof FieldIdMap): string => {
    if (existingIds[key]) {
      return existingIds[key]!;
    }
    return uuidv1();
  };
  
  return {
    donorId: getId("donorId"),
    orphanName: getId("orphanName"),
    orphanId: getId("orphanId"),
    project: getId("project"),
    period: getId("period"),
    date: getId("date"),
    age: getId("age"),
    educationGrade: getId("educationGrade"),
    specify: getId("specify"),
    caregiverEducation: getId("caregiverEducation"),
    levelEducationNote: getId("levelEducationNote"),
    attendance: getId("attendance"),
    attendanceReason: getId("attendanceReason"),
    academic: getId("academic"),
    academicReason: getId("academicReason"),
    nutritionStatus: getId("nutritionStatus"),
    nutritionReason: getId("nutritionReason"),
    nutritionFollowup: getId("nutritionFollowup"),
    healthStatus: getId("healthStatus"),
    healthFollowup: getId("healthFollowup"),
    healthDetails: getId("healthDetails"),
    pssState: getId("pssState"),
    pssType: getId("pssType"),
    pssImpact: getId("pssImpact"),
    pssImpactReason: getId("pssImpactReason"),
    residence: getId("residence"),
    other: getId("other"),
    housingImpact: getId("housingImpact"),
    housingImpactReason: getId("housingImpactReason"),
    familyImpact: getId("familyImpact"),
    familyImpactReason: getId("familyImpactReason"),
    residenceChange: getId("residenceChange"),
    residenceChangeReason: getId("residenceChangeReason"),
    housingCondition: getId("housingCondition"),
    basicNeeds: getId("basicNeeds"),
    basicNeedsShortage: getId("basicNeedsShortage"),
    activities: getId("activities"),
    activitiesYes: getId("activitiesYes"),
    activitiesNo: getId("activitiesNo"),
    changes: getId("changes"),
    achievements: getId("achievements"),
    challenges: getId("challenges"),
    photo: getId("photo"),
    video: getId("video"),
    staff: getId("staff"),
    comparison: getId("comparison"),
    comparisonReason: getId("comparisonReason"),
    summary: getId("summary"),
    impactSummary: getId("impactSummary"),
    improvementArea: getId("improvementArea"),
    recommendations: getId("recommendations"),
  };
}

/**
 * Helper to create bilingual description string from label object
 */
function createDescription(label: BilingualLabel): string {
  return `${label.en} | ${label.ar}`;
}

/**
 * Build form fields with preserved field IDs
 */
function buildFormFields(fieldIds: FieldIdMap): SimpleField[] {
  return [
    // Section 1: Basic Information
    {
      id: fieldIds.donorId,
      type: "text",
      name: "donor_id",
      description: "Donor Name / ID | اسم المتبرع / الرقم التعريفي للمتبرع",
      label: {
        ar: "اسم المتبرع / الرقم التعريفي للمتبرع",
        en: "Donor Name / ID",
      },
      required: true,
    },
    {
      id: fieldIds.orphanName,
      type: "text",
      name: "orphan_name",
      description: "Orphan Name | اسم اليتيم",
      label: {
        ar: "اسم اليتيم",
        en: "Orphan Name",
      },
      required: true,
    },
    {
      id: fieldIds.orphanId,
      type: "text",
      name: "orphan_id",
      description: "ID | الرقم التعريفي",
      label: {
        ar: "الرقم التعريفي",
        en: "ID",
      },
      required: true,
    },
    {
      id: fieldIds.project,
      type: "text",
      name: "project",
      description: "Location | الموقع",
      label: {
        ar: "الموقع",
        en: "Location",
      },
      required: true,
    },
    {
      id: fieldIds.period,
      type: "text",
      name: "period",
      description: "Reporting Period (e.g., January – March 2026) | فترة التقرير (مثال: يناير – مارس 2026)",
      label: {
        ar: "فترة التقرير (مثال: يناير – مارس 2026)",
        en: "Reporting Period (e.g., January – March 2026)",
      },
      required: true,
    },
    {
      id: fieldIds.date,
      type: "date",
      name: "date",
      description: "Date | التاريخ",
      label: {
        ar: "التاريخ",
        en: "Date",
      },
      required: false,
    },
    
    // Section 2: General Update on the Orphan
    {
      id: fieldIds.age,
      type: "integer",
      name: "age",
      description: "Age | العمر",
      label: {
        ar: "العمر",
        en: "Age",
      },
      required: false,
    },
    {
      id: fieldIds.educationGrade,
      type: "select",
      name: "education_grade",
      description: "Education Grade | المرحلة التعليمية",
      label: {
        ar: "المرحلة التعليمية",
        en: "Education Grade",
      },
      required: false,
      options: [
        { value: "Primary", label: "Primary Stage | المرحلة الابتدائية" },
        { value: "Secondary", label: "Basic Education Stage | المرحلة الأساسية" },
        { value: "High", label: "Secondary Education Stage | المرحلة الثانوية" },
        { value: "لا_يدرس", label: "Not Studying | لا يدرس" },
      ],
    },
    {
      id: fieldIds.specify,
      type: "select",
      name: "specify",
      description: "Why | لماذا",
      label: {
        ar: "لماذا",
        en: "Why",
      },
      required: false,
      options: [
        { value: "____", label: "Dropped Out of School | منقطع عن التعليم" },
        { value: "_____1", label: "Below School Age | دون سن الدراسة" },
      ],
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.educationGrade, operator: "equals", value: "لا_يدرس" },
        ],
      },
    },
    {
      id: fieldIds.caregiverEducation,
      type: "select",
      name: "caregiver_education",
      description: "Education Level | الصف الدراسي",
      label: {
        ar: "الصف الدراسي",
        en: "Education Level",
      },
      required: false,
      options: [
        { value: "First", label: "Grade 1 | الصف الأول" },
        { value: "Second", label: "Grade 2 | الصف الثاني" },
        { value: "Third", label: "Grade 3 | الصف الثالث" },
        { value: "Fourth", label: "Grade 4 | الصف الرابع" },
        { value: "Fifth", label: "Grade 5 | الصف الخامس" },
        { value: "Sixth", label: "Grade 6 | الصف السادس" },
        { value: "Seventh", label: "Grade 7 | الصف السابع" },
        { value: "Eighth", label: "Grade 8 | الصف الثامن" },
        { value: "Ninth", label: "Grade 9 | الصف التاسع" },
        { value: "Tenth", label: "Grade 10 | الصف العاشر" },
        { value: "Eleventh", label: "Grade 11 | الصف الحادي عشر" },
        { value: "Twelfth", label: "Grade 12 | الصف الثاني عشر" },
        { value: "Thirteenth", label: "Grade 13 | الصف الثالث عشر" },
      ],
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.educationGrade, operator: "equals", value: "لا_يدرس" },
          { fieldId: fieldIds.educationGrade, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.levelEducationNote,
      type: "textarea",
      name: "level_education_note",
      description: "Explanation about the Education Grade | توضيح عن المستوى التعليمي",
      label: {
        ar: "توضيح عن المستوى التعليمي",
        en: "Explanation about the Education Grade",
      },
      required: false,
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.educationGrade, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.attendance,
      type: "select",
      name: "attendance",
      description: "School Attendance | الحضور المدرسي",
      label: {
        ar: "الحضور المدرسي",
        en: "School Attendance",
      },
      required: true,
      options: [
        { value: "regular", label: "Regular | منتظم" },
        { value: "irregular", label: "Irregular | غير منتظم" },
      ],
    },
    {
      id: fieldIds.attendanceReason,
      type: "textarea",
      name: "attendance_reason",
      description: "If irregular, explain why | إذا كان غير منتظم، يرجى توضيح السبب",
      label: {
        ar: "إذا كان غير منتظم، يرجى توضيح السبب",
        en: "If irregular, explain why",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.attendance, operator: "equals", value: "irregular" },
        ],
      },
    },
    {
      id: fieldIds.academic,
      type: "select",
      name: "academic",
      description: "Academic Performance | الأداء الأكاديمي",
      label: {
        ar: "الأداء الأكاديمي",
        en: "Academic Performance",
      },
      required: true,
      options: [
        { value: "excellent", label: "Excellent | ممتاز" },
        { value: "good", label: "Good | جيد" },
        { value: "average", label: "Average | متوسط" },
        { value: "needs_improvement", label: "Needs Improvement | يحتاج لتحسين" },
      ],
    },
    {
      id: fieldIds.academicReason,
      type: "textarea",
      name: "academic_reason",
      description: "If not good or excellent, explain why | إذا لم يكن جيدًا أو ممتازًا، يرجى توضيح السبب",
      label: {
        ar: "إذا لم يكن جيدًا أو ممتازًا، يرجى توضيح السبب",
        en: "If not good or excellent, explain why",
      },
      required: false,
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.academic, operator: "equals", value: "excellent" },
          { fieldId: fieldIds.academic, operator: "equals", value: "good" },
          { fieldId: fieldIds.academic, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.nutritionStatus,
      type: "select",
      name: "nutrition_status",
      description: "Nutritional Status | الحالة التغذوية",
      label: {
        ar: "الحالة التغذوية",
        en: "Nutritional Status",
      },
      required: false,
      options: [
        { value: "excellent", label: "Excellent | ممتاز" },
        { value: "good", label: "Good | جيد" },
        { value: "average", label: "Average | متوسط" },
        { value: "needs_support", label: "Needs Support | يحتاج دعم" },
      ],
    },
    {
      id: fieldIds.nutritionReason,
      type: "textarea",
      name: "nutrition_reason",
      description: "If not good or excellent, explain why | إذا لم تكن جيدة أو ممتازة، يرجى توضيح السبب",
      label: {
        ar: "إذا لم تكن جيدة أو ممتازة، يرجى توضيح السبب",
        en: "If not good or excellent, explain why",
      },
      required: false,
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.nutritionStatus, operator: "equals", value: "excellent" },
          { fieldId: fieldIds.nutritionStatus, operator: "equals", value: "good" },
          { fieldId: fieldIds.nutritionStatus, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.nutritionFollowup,
      type: "textarea",
      name: "nutrition_followup",
      description: "If medical follow-up is needed, explain type | إذا كانت هناك حاجة لمتابعة طبية، يرجى تحديد النوع",
      label: {
        ar: "إذا كانت هناك حاجة لمتابعة طبية، يرجى تحديد النوع",
        en: "If medical follow-up is needed, explain type",
      },
      required: false,
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.nutritionStatus, operator: "equals", value: "excellent" },
          { fieldId: fieldIds.nutritionStatus, operator: "equals", value: "good" },
          { fieldId: fieldIds.nutritionStatus, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.healthStatus,
      type: "select",
      name: "health_status",
      description: "Health Status | الحالة الصحية",
      label: {
        ar: "الحالة الصحية",
        en: "Health Status",
      },
      required: false,
      options: [
        { value: "excellent", label: "Excellent | ممتاز" },
        { value: "good", label: "Good | جيد" },
        { value: "average", label: "Average | متوسط" },
        { value: "needs_support", label: "Needs Support | يحتاج دعم" },
      ],
    },
    {
      id: fieldIds.healthFollowup,
      type: "textarea",
      name: "health_followup",
      description: "If medical follow-up is needed, explain type | إذا كانت هناك حاجة لمتابعة طبية، يرجى تحديد النوع",
      label: {
        ar: "إذا كانت هناك حاجة لمتابعة طبية، يرجى تحديد النوع",
        en: "If medical follow-up is needed, explain type",
      },
      required: false,
      skipLogic: {
        hideWhen: [
          { fieldId: fieldIds.healthStatus, operator: "equals", value: "excellent" },
          { fieldId: fieldIds.healthStatus, operator: "equals", value: "good" },
          { fieldId: fieldIds.healthStatus, operator: "isEmpty", value: "" },
        ],
      },
    },
    {
      id: fieldIds.healthDetails,
      type: "textarea",
      name: "health_details",
      description: "Details of recent check-ups or treatments | تفاصيل الفحوصات أو العلاجات الأخيرة",
      label: {
        ar: "تفاصيل الفحوصات أو العلاجات الأخيرة",
        en: "Details of recent check-ups or treatments",
      },
      required: false,
    },
    {
      id: fieldIds.pssState,
      type: "select",
      name: "pss_state",
      description: "Psychological / Emotional State | الحالة النفسية / العاطفية",
      label: {
        ar: "الحالة النفسية / العاطفية",
        en: "Psychological / Emotional State",
      },
      required: false,
      options: [
        { value: "stable", label: "Stable and happy | مستقر وسعيد" },
        { value: "anxious", label: "Sometimes anxious or withdrawn | أحيانًا قلق أو منسحب" },
        { value: "needs_pss", label: "Needs psychological support | يحتاج دعم نفسي" },
      ],
    },
    {
      id: fieldIds.pssType,
      type: "textarea",
      name: "pss_type",
      description: "If PSS needed, specify type | إذا كانت هناك حاجة لدعم نفسي-اجتماعي، يرجى تحديد النوع",
      label: {
        ar: "إذا كانت هناك حاجة لدعم نفسي-اجتماعي، يرجى تحديد النوع",
        en: "If PSS needed, specify type",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.pssState, operator: "equals", value: "needs_pss" },
        ],
      },
    },
    {
      id: fieldIds.pssImpact,
      type: "checkbox",
      name: "pss_impact",
      description: "Has PSS affected the following (select all that apply) | هل أثّرت جلسات الدعم النفسي على ما يلي (اختر كل ما ينطبق)",
      label: {
        ar: "هل أثّرت جلسات الدعم النفسي على ما يلي (اختر كل ما ينطبق)",
        en: "Has PSS affected the following (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "school", label: "School | المدرسة" },
        { value: "attendance", label: "Attendance | الحضور" },
        { value: "performance", label: "Performance | الأداء" },
        { value: "behavior", label: "Behavior | السلوك" },
        { value: "relationships", label: "Relationships with others | العلاقات مع الآخرين" },
        { value: "health", label: "Health | الصحة" },
        { value: "nutrition", label: "Nutritional Status | الحالة التغذوية" },
        { value: "none", label: "None | لا شيء" },
      ],
    },
    {
      id: fieldIds.pssImpactReason,
      type: "textarea",
      name: "pss_impact_reason",
      description: "Explain how PSS affected the child | اشرح كيف أثّرت جلسات الدعم النفسي على الطفل",
      label: {
        ar: "اشرح كيف أثّرت جلسات الدعم النفسي على الطفل",
        en: "Explain how PSS affected the child",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.pssImpact, operator: "notContains", value: "none" },
        ],
      },
    },
    
    // Section 3: Living and Family Conditions
    {
      id: fieldIds.residence,
      type: "select",
      name: "residence",
      description: "Place of Residence | مكان الإقامة",
      label: {
        ar: "مكان الإقامة",
        en: "Place of Residence",
      },
      required: false,
      options: [
        { value: "relatives", label: "With relatives | مع الأقارب" },
        { value: "center", label: "In orphan care center | في مركز رعاية الأيتام" },
        { value: "foster", label: "With foster family | مع أسرة حاضنة" },
        { value: "other", label: "Other | أخرى" },
      ],
    },
    {
      id: fieldIds.other,
      type: "text",
      name: "other",
      description: "If other, please specify | اذا اخرى اذكرها",
      label: {
        ar: "اذا اخرى اذكرها",
        en: "If other, please specify",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.residence, operator: "equals", value: "other" },
        ],
      },
    },
    {
      id: fieldIds.housingImpact,
      type: "checkbox",
      name: "housing_impact",
      description: "Housing condition affecting child (select all that apply) | هل أثّرت حالة السكن على الطفل (اختر كل ما ينطبق)",
      label: {
        ar: "هل أثّرت حالة السكن على الطفل (اختر كل ما ينطبق)",
        en: "Housing condition affecting child (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "school", label: "School | المدرسة" },
        { value: "attendance", label: "Attendance | الحضور" },
        { value: "performance", label: "Performance | الأداء" },
        { value: "behavior", label: "Behavior | السلوك" },
        { value: "relationships", label: "Relationships with others | العلاقات مع الآخرين" },
        { value: "health", label: "Health | الصحة" },
        { value: "nutrition", label: "Nutritional Status | الحالة التغذوية" },
        { value: "none", label: "None | لا شيء" },
      ],
    },
    {
      id: fieldIds.housingImpactReason,
      type: "textarea",
      name: "housing_impact_reason",
      description: "Explain housing condition effect | اشرح كيف أثّرت حالة السكن",
      label: {
        ar: "اشرح كيف أثّرت حالة السكن",
        en: "Explain housing condition effect",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.housingImpact, operator: "contains", value: "none" },
        ],
      },
    },
    {
      id: fieldIds.familyImpact,
      type: "checkbox",
      name: "family_impact",
      description: "Family conditions affecting child (select all that apply) | هل أثّرت ظروف الأسرة على الطفل (اختر كل ما ينطبق)",
      label: {
        ar: "هل أثّرت ظروف الأسرة على الطفل (اختر كل ما ينطبق)",
        en: "Family conditions affecting child (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "school", label: "School | المدرسة" },
        { value: "attendance", label: "Attendance | الحضور" },
        { value: "performance", label: "Performance | الأداء" },
        { value: "behavior", label: "Behavior | السلوك" },
        { value: "relationships", label: "Relationships with others | العلاقات مع الآخرين" },
        { value: "health", label: "Health | الصحة" },
        { value: "nutrition", label: "Nutritional Status | الحالة التغذوية" },
        { value: "none", label: "None | لا شيء" },
      ],
    },
    {
      id: fieldIds.familyImpactReason,
      type: "textarea",
      name: "family_impact_reason",
      description: "Explain family condition effect | اشرح كيف أثّرت ظروف الأسرة",
      label: {
        ar: "اشرح كيف أثّرت ظروف الأسرة",
        en: "Explain family condition effect",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.familyImpact, operator: "contains", value: "none" },
        ],
      },
    },
    {
      id: fieldIds.residenceChange,
      type: "select",
      name: "residence_change",
      description: "Any change in residence since last report? | هل حدث تغيير في مكان الإقامة منذ التقرير السابق؟",
      label: {
        ar: "هل حدث تغيير في مكان الإقامة منذ التقرير السابق؟",
        en: "Any change in residence since last report?",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes | نعم" },
        { value: "no", label: "No | لا" },
      ],
    },
    {
      id: fieldIds.residenceChangeReason,
      type: "textarea",
      name: "residence_change_reason",
      description: "Explain change | اشرح التغيير",
      label: {
        ar: "اشرح التغيير",
        en: "Explain change",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.residenceChange, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.housingCondition,
      type: "select",
      name: "housing_condition",
      description: "Housing Condition | حالة السكن",
      label: {
        ar: "حالة السكن",
        en: "Housing Condition",
      },
      required: false,
      options: [
        { value: "safe", label: "Safe and adequate | آمن ومناسب" },
        { value: "maintenance", label: "Needs maintenance | يحتاج صيانة" },
        { value: "temporary", label: "Inadequate / Temporary | غير مناسب / مؤقت" },
      ],
    },
    {
      id: fieldIds.basicNeeds,
      type: "checkbox",
      name: "basic_needs",
      description: "Availability of Basic Needs (select all that apply) | توفر الاحتياجات الأساسية (اختر كل ما ينطبق)",
      label: {
        ar: "توفر الاحتياجات الأساسية (اختر كل ما ينطبق)",
        en: "Availability of Basic Needs (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "education", label: "Education | التعليم" },
        { value: "living", label: "Living conditions | ظروف المعيشة" },
        { value: "health", label: "Health | الصحة" },
        { value: "mental", label: "Mental Health | الصحة النفسية" },
        { value: "nutrition", label: "Nutrition | التغذية" },
      ],
    },
    {
      id: fieldIds.basicNeedsShortage,
      type: "textarea",
      name: "basic_needs_shortage",
      description: "Explain shortages | اشرح النواقص/النقص إن وجد",
      label: {
        ar: "اشرح النواقص/النقص إن وجد",
        en: "Explain shortages",
      },
      required: false,
    },
    
    // Section 4: Personal Development
    {
      id: fieldIds.activities,
      type: "select",
      name: "activities",
      description: "Activities participated in | هل شارك في أنشطة؟",
      label: {
        ar: "هل شارك في أنشطة؟",
        en: "Activities participated in",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes | نعم" },
        { value: "no", label: "No | لا" },
      ],
    },
    {
      id: fieldIds.activitiesYes,
      type: "textarea",
      name: "activities_yes",
      description: "If yes, explain | إذا نعم، يرجى الشرح",
      label: {
        ar: "إذا نعم، يرجى الشرح",
        en: "If yes, explain",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.activities, operator: "equals", value: "yes" },
        ],
      },
    },
    {
      id: fieldIds.activitiesNo,
      type: "textarea",
      name: "activities_no",
      description: "If no, explain | إذا لا، يرجى الشرح",
      label: {
        ar: "إذا لا، يرجى الشرح",
        en: "If no, explain",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.activities, operator: "equals", value: "no" },
        ],
      },
    },
    {
      id: fieldIds.changes,
      type: "textarea",
      name: "changes",
      description: "Any changes from last visit | هل توجد تغييرات منذ الزيارة السابقة؟",
      label: {
        ar: "هل توجد تغييرات منذ الزيارة السابقة؟",
        en: "Any changes from last visit",
      },
      required: false,
    },
    {
      id: fieldIds.achievements,
      type: "textarea",
      name: "achievements",
      description: "Notable achievements or improvements | إنجازات أو تحسّنات ملحوظة",
      label: {
        ar: "إنجازات أو تحسّنات ملحوظة",
        en: "Notable achievements or improvements",
      },
      required: false,
    },
    {
      id: fieldIds.challenges,
      type: "textarea",
      name: "challenges",
      description: "Explain 3 major challenges or needs | اشرح 3 تحديات أو احتياجات رئيسية",
      label: {
        ar: "اشرح 3 تحديات أو احتياجات رئيسية",
        en: "Explain 3 major challenges or needs",
      },
      required: false,
    },
    
    // Section 5: Attachments and Media
    {
      id: fieldIds.photo,
      type: "select",
      name: "photo",
      description: "Recent photo attached | هل أُرفقت صورة حديثة؟",
      label: {
        ar: "هل أُرفقت صورة حديثة؟",
        en: "Recent photo attached",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes | نعم" },
        { value: "no", label: "No | لا" },
      ],
    },
    {
      id: fieldIds.video,
      type: "select",
      name: "video",
      description: "Video message from orphan | هل توجد رسالة فيديو من اليتيم؟",
      label: {
        ar: "هل توجد رسالة فيديو من اليتيم؟",
        en: "Video message from orphan",
      },
      required: false,
      options: [
        { value: "yes", label: "Yes | نعم" },
        { value: "no", label: "No | لا" },
      ],
    },
    {
      id: fieldIds.staff,
      type: "text",
      name: "staff",
      description: "Field staff name and visit date | اسم موظف الميدان وتاريخ الزيارة",
      label: {
        ar: "اسم موظف الميدان وتاريخ الزيارة",
        en: "Field staff name and visit date",
      },
      required: false,
    },
    
    // Section 6: Summary for Donor
    {
      id: fieldIds.comparison,
      type: "select",
      name: "comparison",
      description: "Compare this report with last report | قارن هذا التقرير بالتقرير السابق",
      label: {
        ar: "قارن هذا التقرير بالتقرير السابق",
        en: "Compare this report with last report",
      },
      required: false,
      options: [
        { value: "same", label: "Same | نفس الوضع" },
        { value: "improved", label: "Improved | تحسّن" },
        { value: "declined", label: "Declined | تراجع" },
      ],
    },
    {
      id: fieldIds.comparisonReason,
      type: "textarea",
      name: "comparison_reason",
      description: "Explain change | اشرح التغيير",
      label: {
        ar: "اشرح التغيير",
        en: "Explain change",
      },
      required: false,
      skipLogic: {
        showWhen: [
          { fieldId: fieldIds.comparison, operator: "notEquals", value: "same" },
        ],
      },
    },
    {
      id: fieldIds.summary,
      type: "textarea",
      name: "summary",
      description: "General summary (2–3 sentences) | ملخص عام (جملتان إلى ثلاث)",
      label: {
        ar: "ملخص عام (جملتان إلى ثلاث)",
        en: "General summary (2–3 sentences)",
      },
      required: false,
    },
    {
      id: fieldIds.impactSummary,
      type: "textarea",
      name: "impact_summary",
      description: "How is sponsorship helping the child? | كيف تساعد الكفالة الطفل؟",
      label: {
        ar: "كيف تساعد الكفالة الطفل؟",
        en: "How is sponsorship helping the child?",
      },
      required: false,
    },
    {
      id: fieldIds.improvementArea,
      type: "checkbox",
      name: "improvement_area",
      description: "Major improvement in last period (select all that apply) | أكبر تحسّن في الفترة الماضية (اختر كل ما ينطبق)",
      label: {
        ar: "أكبر تحسّن في الفترة الماضية (اختر كل ما ينطبق)",
        en: "Major improvement in last period (select all that apply)",
      },
      required: false,
      multi: true,
      options: [
        { value: "education", label: "Education | التعليم" },
        { value: "living", label: "Living conditions | ظروف المعيشة" },
        { value: "health", label: "Health | الصحة" },
        { value: "mental", label: "Mental Health | الصحة النفسية" },
        { value: "nutrition", label: "Nutrition | التغذية" },
      ],
    },
    {
      id: fieldIds.recommendations,
      type: "textarea",
      name: "recommendations",
      description: "Recommendations or future needs | توصيات أو احتياجات مستقبلية",
      label: {
        ar: "توصيات أو احتياجات مستقبلية",
        en: "Recommendations or future needs",
      },
      required: false,
    },
  ];
}

async function main() {
  console.log("Creating or updating Orphan Sponsorship Followup Form (idempotent)...");
  console.log("✅ This version PRESERVES existing field IDs to prevent breaking submissions");

  // Step 1: Find the Orphan clinic (should already exist)
  console.log("\n1. Finding Orphan clinic...");
  const orphanClinic = await db
    .selectFrom("clinics")
    .selectAll()
    .where("name", "ilike", "%orphan%")
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  if (!orphanClinic) {
    throw new Error("Orphan clinic not found. Please create it first.");
  }
  console.log(`   ✅ Found clinic "${orphanClinic.name}" with id=${orphanClinic.id}`);

  // Step 2: Create or update the form
  console.log("\n2. Creating or updating Orphan Sponsorship Followup Form...");
  const existing = await db
    .selectFrom("event_forms")
    .selectAll()
    .where("name", "=", "Orphan Sponsorship Followup Form")
    .where("is_deleted", "=", false)
    .executeTakeFirst();

  let formId: string;
  let existingFields: any[] = [];

  // Extract existing fields if form exists
  if (existing) {
    formId = existing.id;
    existingFields = (existing.form_fields as any) || [];
    console.log(`   ✅ Found existing form with ${existingFields.length} fields`);
    console.log(`   ✅ Preserving existing field IDs to prevent breaking submissions`);
  } else {
    formId = uuidv1();
    console.log(`   ✅ Creating new form with id=${formId}`);
  }

  // Generate field IDs (preserving existing ones)
  const fieldIds = generateFieldIds(existingFields.length > 0 ? existingFields : null);
  
  // Build form fields
  const formFields = buildFormFields(fieldIds);

  // Create form object
  const form = {
    id: formId,
    name: "Orphan Sponsorship Followup Form",
    description: "نموذج متابعة كفالة اليتيم | Orphan Sponsorship Followup Form",
    language: "en" as const,
    is_editable: true,
    is_snapshot_form: false,
    form_fields: formFields,
    metadata: {
      category: "orphan",
      form_id_string: "orphan_sponsorship_followup",
      version: 1,
    },
    is_deleted: false,
    created_at: existing?.created_at || new Date(),
    updated_at: new Date(),
    last_modified: new Date(),
    server_created_at: existing?.server_created_at || new Date(),
    deleted_at: null,
  };

  // Upsert form
  await db
    .insertInto("event_forms")
    .values({
      id: form.id,
      name: form.name,
      description: form.description,
      language: form.language,
      is_editable: form.is_editable,
      is_snapshot_form: form.is_snapshot_form,
      form_fields: sql`${JSON.stringify(form.form_fields)}::jsonb`,
      metadata: sql`${JSON.stringify(form.metadata)}::jsonb`,
      is_deleted: form.is_deleted,
      created_at: form.created_at as any,
      updated_at: form.updated_at as any,
      last_modified: form.last_modified as any,
      server_created_at: form.server_created_at as any,
      deleted_at: form.deleted_at,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        name: (eb) => eb.ref("excluded.name"),
        description: (eb) => eb.ref("excluded.description"),
        language: (eb) => eb.ref("excluded.language"),
        is_editable: (eb) => eb.ref("excluded.is_editable"),
        is_snapshot_form: (eb) => eb.ref("excluded.is_snapshot_form"),
        form_fields: sql`excluded.form_fields`,
        metadata: sql`excluded.metadata`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
      })
    )
    .execute();

  console.log(`   ✅ Form created/updated successfully`);

  // Step 3: Assign form to Orphan clinic
  console.log("\n3. Assigning form to Orphan clinic...");
  const existingAssignment = await db
    .selectFrom("clinic_event_forms")
    .selectAll()
    .where("clinic_id", "=", orphanClinic.id)
    .where("event_form_id", "=", formId)
    .executeTakeFirst();

  if (!existingAssignment) {
    await db
      .insertInto("clinic_event_forms")
      .values({
        clinic_id: orphanClinic.id,
        event_form_id: formId,
      })
      .execute();
    console.log(`   ✅ Form assigned to clinic "${orphanClinic.name}"`);
  } else {
    console.log(`   ✅ Form already assigned to clinic "${orphanClinic.name}"`);
  }

  console.log("\n✅ Orphan Sponsorship Followup Form setup complete!");
  console.log(`\nForm ID: ${formId}`);
  console.log(`Clinic ID: ${orphanClinic.id}`);
  console.log(`Total fields: ${formFields.length}`);
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
