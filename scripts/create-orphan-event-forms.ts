#!/usr/bin/env tsx

/**
 * Script to create Orphanage-specific event forms
 *
 * Usage:
 *   npx tsx scripts/create-orphan-event-forms.ts
 *
 * Notes:
 * - Forms are defined in Arabic (source language), matching the provided SOPs.
 * - We tag them with metadata.category = "orphan" so they can be filtered later.
 * - Field labels are bilingual (ar/en) inside form_fields so they render in the UI language.
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";

// Label type that supports bilingual labels
type BilingualLabel = {
  ar: string;
  en: string;
};

type SimpleField =
  | {
      id: string;
      type: "text" | "textarea" | "number" | "date";
      label: BilingualLabel;
      required: boolean;
      placeholder?: string;
    }
  | {
      id: string;
      type: "select";
      label: BilingualLabel;
      required: boolean;
      options: { value: string; label: string }[];
    };

type SimpleForm = {
  name: string; // stored in Arabic as canonical name
  description: string; // stored in Arabic for now
  language: "ar" | "en";
  isEditable: boolean;
  isSnapshotForm: boolean;
  category: "orphan";
  formFields: SimpleField[];
};

const orphanForms: SimpleForm[] = [
  {
    name: "طلب تفويض مساعدة صندوق حالات الطوارئ",
    description:
      "نموذج يستخدمه أخصائي الحالة/رئيس فريق إدارة الحالة لطلب تمويل من صندوق الطوارئ لحماية الطفل.",
    language: "ar",
    isEditable: true,
    isSnapshotForm: false,
    category: "orphan",
    formFields: [
      // معلومات الأخصائي والإحالة
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "اسم الأخصائي الاجتماعي",
          en: "Social worker name",
        },
        required: true,
        placeholder: "اكتب اسم الأخصائي الاجتماعي",
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "تمت الإحالة من قبل (إذا تمت إحالة من قبل منظمة غير حكومية أخرى)",
          en: "Referred by (if referred by another NGO)",
        },
        required: false,
        placeholder: "اكتب اسم الشخص أو الجهة المحيلة إن وجدت",
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "اسم الوكالة",
          en: "Agency name",
        },
        required: false,
        placeholder: "اكتب اسم الوكالة المحيلة",
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ الإحالة",
          en: "Referral date",
        },
        required: true,
      },
      // معلومات الحالة
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "رمز الحالة",
          en: "Case code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "دفتر العائلة #",
          en: "Family book #",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "الرقم التسلسلي في متتبع الحالات",
          en: "Case tracker serial number",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "إيصال #",
          en: "Receipt #",
        },
        required: false,
      },
      // المنتجات المطلوب شراؤها - نستخدم حقل نصي حر لتبسيط التمثيل بدلاً من جدول كامل
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "المنتجات المطلوب شراؤها (الكمية، الوصف، القيمة الإجمالية)",
          en: "Products to purchase (quantity, description, total value)",
        },
        required: true,
        placeholder:
          "اكتب قائمة بالمنتجات المطلوب شراؤها، مع الكمية وقيمة الشراء لكل منتج",
      },
      {
        id: uuidv1(),
        type: "number",
        label: {
          ar: "إجمالي قيمة الشراء (بالدولار الأمريكي أو العملة المحلية)",
          en: "Total purchase amount (USD or local currency)",
        },
        required: true,
      },
    ],
  },
  {
    name: "نموذج الموافقة لصندوق حالات الطوارئ",
    description:
      "نموذج موافقة مستنيرة يستخدم قبل تسجيل حالة إدارة حالات حماية الطفل المتعلقة بصندوق الطوارئ.",
    language: "ar",
    isEditable: true,
    isSnapshotForm: false,
    category: "orphan",
    formFields: [
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "الرمز المرجعي للحالة",
          en: "Case reference code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "الشخص الذي يمنح الموافقة",
          en: "Person granting consent",
        },
        required: true,
        options: [
          { value: "caregiver", label: "الوالدان/مقدم الرعاية" },
          { value: "child", label: "الطفل (إذا أبلغ أنه وحيد)" },
          { value: "caseworker", label: "أخصائي الحالة" },
        ],
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "اسم الشخص الذي يمنح الموافقة",
          en: "Name of person granting consent",
        },
        required: true,
        placeholder: "اكتب اسم الشخص الذي يمنح الموافقة",
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "اسم الوكالة",
          en: "Agency name",
        },
        required: true,
        placeholder: "اكتب اسم الوكالة التي تحفظ البيانات وتشاركها",
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "هل يرغب الشخص الذي يمنح الموافقة في حجب كامل أو جزء من معلومات الحالة؟",
          en: "Does the person want to withhold any case information?",
        },
        required: true,
        options: [
          { value: "no", label: "لا" },
          { value: "yes", label: "نعم" },
        ],
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "تفاصيل الأطراف أو المعلومات التي يرغب الشخص في حجبها (إن وجدت)",
          en: "Details of parties/information to be withheld (if any)",
        },
        required: false,
        placeholder:
          "اكتب تفاصيل الوكالات/المجتمع/أفراد الأسرة أو غيرهم الذين لا يرغب الشخص بمشاركة المعلومات معهم، وأسباب ذلك",
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "توقيع الشخص الذي يمنح الموافقة",
          en: "Signature of person granting consent",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "رمز أخصائي الحالة",
          en: "Caseworker code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "التاريخ (اليوم/الشهر/السنة)",
          en: "Date (day/month/year)",
        },
        required: true,
      },
    ],
  },
  {
    name: "ايصال استلام مساعدة من صندوق الاحتياجات الطارئة",
    description:
      "نموذج لتوثيق استلام المساعدة من صندوق الاحتياجات الطارئة، يتضمن تفاصيل المواد المستلمة والمستفيدين.",
    language: "ar",
    isEditable: true,
    isSnapshotForm: false,
    category: "orphan",
    formFields: [
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "رقم دفتر العائلة",
          en: "Family book number",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "رمز الحالة",
          en: "Case code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "نوع الحاجة",
          en: "Type of need",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "مصدر الإحالة",
          en: "Referral source",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "المواد المستلمة (قائمة بالمواد والكميات)",
          en: "Materials received (list of materials and quantities)",
        },
        required: true,
        placeholder: "اكتب قائمة بالمواد المستلمة مع الكميات لكل مادة",
      },
      {
        id: uuidv1(),
        type: "number",
        label: {
          ar: "العدد الإجمالي من الأفراد المستفيدين بشكل مباشر من المساعدة ضمن نفس الأسرة",
          en: "Total number of direct beneficiaries within the same family",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "اسم المستلم",
          en: "Recipient name",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ الاستلام",
          en: "Receipt date",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "توقيع عامل إدارة الحالة",
          en: "Caseworker signature",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ التوقيع",
          en: "Signature date",
        },
        required: true,
      },
    ],
  },
  {
    name: "نموذج التسجيل - إدارة حالات حماية الطفل",
    description:
      "نموذج تسجيل شامل لحالة حماية الطفل، يتضمن المعلومات الشخصية، العنوان، العائلة/مقدمي الرعاية، والمخاوف المتعلقة بالحماية.",
    language: "ar",
    isEditable: true,
    isSnapshotForm: false,
    category: "orphan",
    formFields: [
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ التسجيل (اليوم/الشهر/السنة)",
          en: "Registration date (day/month/year)",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "الموقع",
          en: "Location",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "الرمز المرجعي للحالة",
          en: "Case reference code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "الاسم الكامل",
          en: "Full name",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "number",
        label: {
          ar: "العمر",
          en: "Age",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ الميلاد (اليوم/الشهر/السنة)",
          en: "Date of birth (day/month/year)",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "الجنس",
          en: "Sex",
        },
        required: true,
        options: [
          { value: "male", label: "ذكر" },
          { value: "female", label: "أنثى" },
        ],
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "مكان الولادة",
          en: "Place of birth",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "هل المستفيد",
          en: "Is beneficiary",
        },
        required: true,
        options: [
          { value: "resident", label: "مقيم" },
          { value: "displaced", label: "نازح" },
        ],
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "العنوان السابق (إذا كان نازحاً)",
          en: "Previous address (if displaced)",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "بيانات الاتصال الخاصة بالطفل (إن أمكن)",
          en: "Child contact information (if available)",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "بيانات الاتصال الخاصة بمقدم الرعاية (بما في ذلك الاسم)",
          en: "Caregiver contact information (including name)",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "العائلة / مقدمو الرعاية",
          en: "Family / Caregivers",
        },
        required: true,
        options: [
          { value: "family", label: "1- يعيش مع الأسرة" },
          { value: "relatives", label: "2- يعيش مع الأقارب" },
          { value: "adult_caregiver", label: "3- يعيش مع مقدم/ي رعاية بالغ/ين" },
          { value: "other_children", label: "4- يعيش مع أطفال آخرين (دون سن 18 سنة)" },
        ],
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "تفاصيل العائلة/مقدمي الرعاية (حسب الخيار المختار أعلاه)",
          en: "Family/Caregiver details (based on option selected above)",
        },
        required: false,
        placeholder: "اكتب تفاصيل إضافية حسب نوع العائلة/مقدمي الرعاية",
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "المخاوف المتعلقة بالحماية التي تم وصفها في مرحلة التحديد/الإحالة",
          en: "Protection concerns described during identification/referral",
        },
        required: true,
        placeholder: "اكتب تفاصيل المخاوف المتعلقة بالحماية ومصدر الإحالة إن وجد",
      },
      {
        id: uuidv1(),
        type: "select",
        label: {
          ar: "تقييم مستوى الخطر",
          en: "Risk level assessment",
        },
        required: true,
        options: [
          { value: "high", label: "عالٍ" },
          { value: "medium", label: "متوسط" },
          { value: "low", label: "متدني" },
        ],
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ التقييم (اليوم/الشهر/السنة)",
          en: "Assessment date (day/month/year)",
        },
        required: false,
      },
      {
        id: uuidv1(),
        type: "text",
        label: {
          ar: "رمز أخصائي الحالة",
          en: "Caseworker code",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: {
          ar: "التوقيع",
          en: "Signature",
        },
        required: true,
      },
      {
        id: uuidv1(),
        type: "date",
        label: {
          ar: "تاريخ استكمال النموذج (اليوم/الشهر/السنة)",
          en: "Form completion date (day/month/year)",
        },
        required: true,
      },
    ],
  },
];

async function main() {
  console.log("Creating or updating orphan event forms (idempotent)...");

  for (const form of orphanForms) {
    // Check if a form with the same name already exists
    const existing = await db
      .selectFrom("event_forms")
      .selectAll()
      .where("name", "=", form.name)
      .where("is_deleted", "=", false)
      .executeTakeFirst();

    if (existing) {
      console.log(`- Updating form_fields for existing form "${form.name}" (id=${existing.id})`);
      await db
        .updateTable("event_forms")
        .set({
          form_fields: JSON.stringify(form.formFields) as any,
        })
        .where("id", "=", existing.id)
        .execute();
      continue;
    }

    const id = uuidv1();
    await db
      .insertInto("event_forms")
      .values({
        id,
        name: form.name,
        description: form.description,
        language: form.language,
        is_editable: form.isEditable,
        is_snapshot_form: form.isSnapshotForm,
        form_fields: JSON.stringify(form.formFields) as any,
        metadata: JSON.stringify({
          category: form.category,
        }) as any,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null,
      })
      .execute();

    console.log(`- Created form "${form.name}" with id=${id}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create/update orphan event forms:", err);
  process.exit(1);
});
