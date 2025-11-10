#!/usr/bin/env tsx

/**
 * Script to create sample event forms
 * 
 * Usage:
 *   npx tsx scripts/create-sample-event-forms.ts          # Create event forms (skip if exist)
 *   npx tsx scripts/create-sample-event-forms.ts --cleanup # Clean up existing and recreate
 */

import { v1 as uuidv1 } from "uuid";
import { Option } from "effect";
import db from "../src/db";

// Sample event form data for different healthcare scenarios
const sampleEventForms = [
  {
    name: "Emergency Triage Assessment",
    description: "Comprehensive triage form for emergency department patients",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    formFields: [
      {
        id: uuidv1(),
        type: "text",
        label: "Patient Name",
        required: true,
        placeholder: "Enter patient's full name",
        validation: { minLength: 2, maxLength: 100 }
      },
      {
        id: uuidv1(),
        type: "select",
        label: "Triage Priority",
        required: true,
        options: [
          { value: "critical", label: "Critical (Immediate)" },
          { value: "urgent", label: "Urgent (Within 1 hour)" },
          { value: "semi-urgent", label: "Semi-Urgent (Within 4 hours)" },
          { value: "non-urgent", label: "Non-Urgent (Within 24 hours)" }
        ]
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Chief Complaint",
        required: true,
        placeholder: "Describe the main reason for visit",
        validation: { minLength: 10, maxLength: 500 }
      },
      {
        id: uuidv1(),
        type: "number",
        label: "Pain Level (1-10)",
        required: true,
        validation: { min: 1, max: 10 }
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Abnormal Vital Signs",
        required: false,
        options: [
          { value: "blood_pressure", label: "Blood Pressure" },
          { value: "heart_rate", label: "Heart Rate" },
          { value: "temperature", label: "Temperature" },
          { value: "oxygen_saturation", label: "Oxygen Saturation" }
        ]
      }
    ]
  },
  {
    name: "Prenatal Care Visit",
    description: "Standard prenatal care assessment form",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    formFields: [
      {
        id: uuidv1(),
        type: "number",
        label: "Gestational Age (weeks)",
        required: true,
        validation: { min: 4, max: 42 }
      },
      {
        id: uuidv1(),
        type: "select",
        label: "Pregnancy Risk Level",
        required: true,
        options: [
          { value: "low", label: "Low Risk" },
          { value: "moderate", label: "Moderate Risk" },
          { value: "high", label: "High Risk" }
        ]
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Symptoms",
        required: false,
        options: [
          { value: "nausea", label: "Nausea" },
          { value: "vomiting", label: "Vomiting" },
          { value: "fatigue", label: "Fatigue" },
          { value: "back_pain", label: "Back Pain" },
          { value: "swelling", label: "Swelling" },
          { value: "headaches", label: "Headaches" }
        ]
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Maternal Weight (kg)",
        required: true,
        validation: { min: 30, max: 200 }
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Prenatal Notes",
        required: false,
        placeholder: "Additional observations or concerns"
      }
    ]
  },
  {
    name: "Mental Health Assessment",
    description: "Comprehensive mental health evaluation form",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    formFields: [
      {
        id: uuidv1(),
        type: "select",
        label: "Mood Assessment",
        required: true,
        options: [
          { value: "excellent", label: "Excellent" },
          { value: "good", label: "Good" },
          { value: "fair", label: "Fair" },
          { value: "poor", label: "Poor" },
          { value: "very_poor", label: "Very Poor" }
        ]
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Symptoms Present",
        required: false,
        options: [
          { value: "anxiety", label: "Anxiety" },
          { value: "depression", label: "Depression" },
          { value: "sleep_disturbance", label: "Sleep Disturbance" },
          { value: "appetite_changes", label: "Appetite Changes" },
          { value: "concentration_difficulty", label: "Concentration Difficulty" },
          { value: "social_withdrawal", label: "Social Withdrawal" }
        ]
      },
      {
        id: uuidv1(),
        type: "number",
        label: "PHQ-9 Score",
        required: true,
        validation: { min: 0, max: 27 }
      },
      {
        id: uuidv1(),
        type: "select",
        label: "Suicide Risk",
        required: true,
        options: [
          { value: "none", label: "No Risk" },
          { value: "low", label: "Low Risk" },
          { value: "moderate", label: "Moderate Risk" },
          { value: "high", label: "High Risk" }
        ]
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Mental Health Treatment Plan",
        required: true,
        placeholder: "Describe recommended treatment approach"
      }
    ]
  },
  {
    name: "Chronic Disease Management",
    description: "Follow-up form for chronic disease patients",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    formFields: [
      {
        id: uuidv1(),
        type: "select",
        label: "Disease Type",
        required: true,
        options: [
          { value: "diabetes", label: "Diabetes" },
          { value: "hypertension", label: "Hypertension" },
          { value: "asthma", label: "Asthma" },
          { value: "copd", label: "COPD" },
          { value: "heart_disease", label: "Heart Disease" }
        ]
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Blood Pressure (mmHg)",
        required: false,
        placeholder: "e.g., 120/80"
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Blood Glucose (mg/dL)",
        required: false,
        validation: { min: 50, max: 500 }
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Medication Adherence",
        required: true,
        options: [
          { value: "excellent", label: "Excellent (>90%)" },
          { value: "good", label: "Good (80-90%)" },
          { value: "fair", label: "Fair (70-80%)" },
          { value: "poor", label: "Poor (<70%)" }
        ]
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Medication Side Effects",
        required: false,
        placeholder: "Report any medication side effects"
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Lifestyle Modification Progress",
        required: false,
        placeholder: "Diet, exercise, smoking cessation progress"
      }
    ]
  },
  {
    name: "Pediatric Growth Assessment",
    description: "Growth and development tracking for children",
    language: "en",
    isEditable: true,
    isSnapshotForm: false,
    formFields: [
      {
        id: uuidv1(),
        type: "text",
        label: "Age (months)",
        required: true,
        validation: { min: 0, max: 216 }
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Child Weight (kg)",
        required: true,
        validation: { min: 1, max: 100 }
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Child Height (cm)",
        required: true,
        validation: { min: 30, max: 200 }
      },
      {
        id: uuidv1(),
        type: "select",
        label: "Growth Percentile",
        required: true,
        options: [
          { value: "<3rd", label: "< 3rd Percentile" },
          { value: "3rd-10th", label: "3rd - 10th Percentile" },
          { value: "10th-25th", label: "10th - 25th Percentile" },
          { value: "25th-50th", label: "25th - 50th Percentile" },
          { value: "50th-75th", label: "50th - 75th Percentile" },
          { value: "75th-90th", label: "75th - 90th Percentile" },
          { value: "90th-97th", label: "90th - 97th Percentile" },
          { value: ">97th", label: "> 97th Percentile" }
        ]
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Developmental Milestones",
        required: false,
        options: [
          { value: "sitting", label: "Sitting Independently" },
          { value: "crawling", label: "Crawling" },
          { value: "walking", label: "Walking" },
          { value: "talking", label: "First Words" },
          { value: "social_smile", label: "Social Smile" }
        ]
      },
      {
        id: uuidv1(),
        type: "textarea",
        label: "Parent Development Concerns",
        required: false,
        placeholder: "Any concerns about child's development"
      }
    ]
  },
  {
    name: "Vaccination Record",
    description: "Immunization tracking and documentation",
    language: "en",
    isEditable: true,
    isSnapshotForm: true,
    formFields: [
      {
        id: uuidv1(),
        type: "select",
        label: "Vaccine Type",
        required: true,
        options: [
          { value: "bcg", label: "BCG" },
          { value: "dpt", label: "DPT" },
          { value: "polio", label: "Polio" },
          { value: "measles", label: "Measles" },
          { value: "hepatitis_b", label: "Hepatitis B" },
          { value: "covid19", label: "COVID-19" }
        ]
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Batch Number",
        required: true,
        placeholder: "Vaccine batch/lot number"
      },
      {
        id: uuidv1(),
        type: "date",
        label: "Vaccination Date",
        required: true
      },
      {
        id: uuidv1(),
        type: "text",
        label: "Next Due Date",
        required: false
      },
      {
        id: uuidv1(),
        type: "select",
        label: "Site of Injection",
        required: true,
        options: [
          { value: "left_arm", label: "Left Arm" },
          { value: "right_arm", label: "Right Arm" },
          { value: "left_thigh", label: "Left Thigh" },
          { value: "right_thigh", label: "Right Thigh" }
        ]
      },
      {
        id: uuidv1(),
        type: "checkbox",
        label: "Adverse Reactions",
        required: false,
        options: [
          { value: "fever", label: "Fever" },
          { value: "swelling", label: "Swelling at injection site" },
          { value: "rash", label: "Rash" },
          { value: "none", label: "No adverse reactions" }
        ]
      }
    ]
  }
];

async function createSampleEventForms() {
  console.log("📋 Creating sample event forms...\n");

  // Check for command line arguments
  const shouldCleanup = process.argv.includes("--cleanup") || process.argv.includes("-c");

  try {
    // Check if event forms already exist
    const existingEventForms = await db
      .selectFrom("event_forms")
      .select(["id"])
      .where("is_deleted", "=", false)
      .execute();

    if (existingEventForms.length > 0 && !shouldCleanup) {
      console.log(`⚠️  Found ${existingEventForms.length} existing event forms. Skipping creation to avoid duplicates.`);
      console.log("💡 To recreate event forms, run: npx tsx scripts/create-sample-event-forms.ts --cleanup");
      return;
    }

    if (shouldCleanup && existingEventForms.length > 0) {
      console.log(`🗑️  Cleaning up ${existingEventForms.length} existing event forms...`);
      await db
        .updateTable("event_forms")
        .set({
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date()
        })
        .where("is_deleted", "=", false)
        .execute();
      console.log("✅ Existing event forms cleaned up.");
    }

    // Create event forms
    const createdEventForms = [];

    for (const formData of sampleEventForms) {
      // Create event form object
      const eventForm = {
        id: uuidv1(),
        name: formData.name,
        description: formData.description,
        language: formData.language,
        is_editable: formData.isEditable,
        is_snapshot_form: formData.isSnapshotForm,
        form_fields: JSON.stringify(formData.formFields),
        metadata: JSON.stringify({
          created_by: "system",
          version: "1.0",
          category: formData.name.includes("Emergency") ? "emergency" : 
                   formData.name.includes("Prenatal") ? "maternal" :
                   formData.name.includes("Mental") ? "mental_health" :
                   formData.name.includes("Chronic") ? "chronic_care" :
                   formData.name.includes("Pediatric") ? "pediatrics" :
                   formData.name.includes("Vaccination") ? "immunization" : "general"
        }),
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null
      };

      // Insert event form
      await db
        .insertInto("event_forms")
        .values(eventForm)
        .execute();

      createdEventForms.push({
        name: formData.name,
        description: formData.description,
        fields: formData.formFields.length,
        category: eventForm.metadata ? JSON.parse(eventForm.metadata).category : "general"
      });

      console.log(`✅ Created event form: ${formData.name}`);
    }

    console.log(`\n🎉 Successfully created ${createdEventForms.length} event forms!`);
    console.log("\n📋 Created Event Forms:");
    
    // Group by category
    const groupedByCategory = createdEventForms.reduce((acc, form) => {
      if (!acc[form.category]) acc[form.category] = [];
      acc[form.category].push(form);
      return acc;
    }, {} as Record<string, typeof createdEventForms>);

    Object.entries(groupedByCategory).forEach(([category, forms]) => {
      console.log(`\n📂 Category: ${category.toUpperCase()}`);
      forms.forEach(form => {
        console.log(`   • ${form.name} - ${form.fields} fields`);
        console.log(`     ${form.description}`);
      });
    });

    console.log("\n📊 Form Statistics:");
    console.log(`   Total Forms: ${createdEventForms.length}`);
    console.log(`   Total Fields: ${createdEventForms.reduce((sum, form) => sum + form.fields, 0)}`);
    console.log(`   Categories: ${Object.keys(groupedByCategory).length}`);

  } catch (error) {
    console.error("❌ Error creating event forms:", error);
  } finally {
    await db.destroy();
  }
}

// Run the script
createSampleEventForms();
