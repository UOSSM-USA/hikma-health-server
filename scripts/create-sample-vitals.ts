#!/usr/bin/env tsx

/**
 * Script to create sample patient vital signs data
 *
 * Usage:
 *   npx tsx scripts/create-sample-vitals.ts          # Create vitals (skip if exist)
 *   npx tsx scripts/create-sample-vitals.ts --cleanup # Clean up existing and recreate
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";

type PatientRow = {
  id: string;
  given_name: string | null;
  surname: string | null;
  external_patient_id: string | null;
  is_deleted: boolean;
};

type ExistingVitalRow = {
  id: string;
};

const SAMPLE_VITAL_SETS = [
  {
    systolic_bp: 120,
    diastolic_bp: 80,
    heart_rate: 72,
    temperature_celsius: 36.8,
    oxygen_saturation: 98,
    respiratory_rate: 16,
    weight_kg: 70,
    height_cm: 170,
    pain_level: 2,
  },
  {
    systolic_bp: 135,
    diastolic_bp: 85,
    heart_rate: 80,
    temperature_celsius: 37.2,
    oxygen_saturation: 97,
    respiratory_rate: 18,
    weight_kg: 82,
    height_cm: 175,
    pain_level: 4,
  },
  {
    systolic_bp: 110,
    diastolic_bp: 70,
    heart_rate: 68,
    temperature_celsius: 36.5,
    oxygen_saturation: 99,
    respiratory_rate: 14,
    weight_kg: 60,
    height_cm: 165,
    pain_level: 1,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const cleanup = args.includes("--cleanup");

  console.log("📋 Sample vitals script starting...");

  if (cleanup) {
    console.log("🧹 Cleaning up existing sample vitals (is_deleted = true)...");
    await db
      .deleteFrom("patient_vitals")
      .where("metadata", "@>", JSON.stringify({ sample: true }) as any)
      .execute();
  }

  const patients = (await db
    .selectFrom("patients")
    .selectAll()
    .where("is_deleted", "=", false)
    .execute()) as PatientRow[];

  if (!patients.length) {
    console.log("⚠️  No patients found. Run mass-patient-registration first.");
    process.exit(0);
  }

  const existingVitals = (await db
    .selectFrom("patient_vitals")
    .select(["id"])
    .execute()) as ExistingVitalRow[];

  if (!cleanup && existingVitals.length > 0) {
    console.log("ℹ️  Vitals already exist; run with --cleanup to recreate.");
    process.exit(0);
  }

  const now = new Date();
  const created: string[] = [];

  for (const patient of patients) {
    // Attach 2–3 vitals records per patient with different timestamps
    const vitalsToCreate = SAMPLE_VITAL_SETS.slice(0, 3);

    for (let i = 0; i < vitalsToCreate.length; i++) {
      const v = vitalsToCreate[i];
      const timestamp = new Date(
        now.getTime() - (i + 1) * 24 * 60 * 60 * 1000,
      ); // last few days

      const heightM = v.height_cm / 100;
      const bmi =
        heightM > 0 ? Number((v.weight_kg / (heightM * heightM)).toFixed(2)) : null;

      await db
        .insertInto("patient_vitals")
        .values({
          id: uuidv1(),
          patient_id: patient.id,
          visit_id: null,
          timestamp,
          systolic_bp: v.systolic_bp,
          diastolic_bp: v.diastolic_bp,
          bp_position: null,
          height_cm: v.height_cm,
          weight_kg: v.weight_kg,
          bmi,
          waist_circumference_cm: null,
          heart_rate: v.heart_rate,
          pulse_rate: null,
          oxygen_saturation: v.oxygen_saturation,
          respiratory_rate: v.respiratory_rate,
          temperature_celsius: v.temperature_celsius,
          pain_level: v.pain_level,
          recorded_by_user_id: null,
          metadata: JSON.stringify({ sample: true }) as any,
          is_deleted: false,
          created_at: timestamp,
          updated_at: timestamp,
          last_modified: timestamp,
          server_created_at: timestamp,
          deleted_at: null,
        } as any)
        .execute();

      created.push(patient.id);
    }
  }

  console.log(`✅ Created sample vitals for ${created.length} records.`);
  console.log("   You can now open a patient detail page to see vitals history and trends.");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed to create sample vitals", err);
  process.exit(1);
});


