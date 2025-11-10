#!/usr/bin/env tsx

/**
 * Script to create sample prescription data
 * 
 * Usage:
 *   npx tsx scripts/create-sample-prescriptions.ts          # Create prescriptions (skip if exist)
 *   npx tsx scripts/create-sample-prescriptions.ts --cleanup # Clean up existing and recreate
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";

// Sample prescription data based on our existing patients and appointments
const samplePrescriptions = [
  {
    patientName: "Amina Hassan",
    patientId: "P0001",
    clinicName: "Bidi Bidi Health Centre IV",
    medicationName: "Metformin",
    dosage: "500mg",
    frequency: "Twice daily",
    duration: "30 days",
    reason: "Diabetes management",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-15",
    expirationDate: "2025-12-15",
    notes: "Take with food to reduce stomach upset"
  },
  {
    patientName: "Peter Odong",
    patientId: "P0002",
    clinicName: "Rhino Camp Health Post",
    medicationName: "Aspirin",
    dosage: "81mg",
    frequency: "Once daily",
    duration: "7 days",
    reason: "Chest pain evaluation",
    priority: "high" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-16",
    expirationDate: "2025-11-23",
    notes: "Monitor for bleeding, take with food"
  },
  {
    patientName: "Grace Nyambura",
    patientId: "P0003",
    clinicName: "Kakuma General Hospital",
    medicationName: "Paracetamol",
    dosage: "500mg",
    frequency: "Every 6 hours",
    duration: "3 days",
    reason: "Post-vaccination fever",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-17",
    expirationDate: "2025-11-20",
    notes: "For child, adjust dose based on weight"
  },
  {
    patientName: "Mohamed Ali",
    patientId: "P0004",
    clinicName: "Dadaab Medical Unit 2",
    medicationName: "Lisinopril",
    dosage: "10mg",
    frequency: "Once daily",
    duration: "30 days",
    reason: "Heart condition management",
    priority: "high" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-18",
    expirationDate: "2025-12-18",
    notes: "Monitor blood pressure, may cause dry cough"
  },
  {
    patientName: "Sarah Johnson",
    patientId: "P0005",
    clinicName: "Kiryandongo HC III",
    medicationName: "Prenatal Vitamins",
    dosage: "1 tablet",
    frequency: "Once daily",
    duration: "90 days",
    reason: "Prenatal care",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-19",
    expirationDate: "2026-02-19",
    notes: "Contains folic acid and iron for pregnancy"
  },
  {
    patientName: "Ahmed Hassan",
    patientId: "P0006",
    clinicName: "Kyaka II Medical Centre",
    medicationName: "Ibuprofen",
    dosage: "400mg",
    frequency: "Three times daily",
    duration: "10 days",
    reason: "Fracture pain management",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-20",
    expirationDate: "2025-11-30",
    notes: "Take with food, monitor for stomach irritation"
  },
  {
    patientName: "Mary Akello",
    patientId: "P0007",
    clinicName: "Nakivale Main Clinic",
    medicationName: "Hydrocortisone Cream",
    dosage: "1%",
    frequency: "Apply twice daily",
    duration: "14 days",
    reason: "Skin condition treatment",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-21",
    expirationDate: "2025-12-05",
    notes: "Apply thin layer to affected areas only"
  },
  {
    patientName: "John Mwangi",
    patientId: "P0008",
    clinicName: "Nyarugusu Health Post",
    medicationName: "Multivitamin",
    dosage: "1 tablet",
    frequency: "Once daily",
    duration: "30 days",
    reason: "General health maintenance",
    priority: "low" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-22",
    expirationDate: "2025-12-22",
    notes: "Take with breakfast for better absorption"
  },
  {
    patientName: "Fatima Omar",
    patientId: "P0009",
    clinicName: "Palorinya Health Centre III",
    medicationName: "Amoxicillin",
    dosage: "250mg",
    frequency: "Three times daily",
    duration: "7 days",
    reason: "Child fever - bacterial infection",
    priority: "high" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-23",
    expirationDate: "2025-11-30",
    notes: "Complete full course even if symptoms improve"
  },
  {
    patientName: "David Kiprop",
    patientId: "P0010",
    clinicName: "Rwamwanja Clinic A",
    medicationName: "Sertraline",
    dosage: "50mg",
    frequency: "Once daily",
    duration: "30 days",
    reason: "Mental health treatment",
    priority: "normal" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-24",
    expirationDate: "2025-12-24",
    notes: "May take 2-4 weeks to see full effect"
  },
  {
    patientName: "Amina Hassan",
    patientId: "P0001",
    clinicName: "Bidi Bidi Health Centre IV",
    medicationName: "Insulin",
    dosage: "10 units",
    frequency: "Before meals",
    duration: "30 days",
    reason: "Diabetes management",
    priority: "high" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-15",
    expirationDate: "2025-12-15",
    notes: "Store in refrigerator, rotate injection sites"
  },
  {
    patientName: "Peter Odong",
    patientId: "P0002",
    clinicName: "Rhino Camp Health Post",
    medicationName: "Nitroglycerin",
    dosage: "0.4mg",
    frequency: "As needed",
    duration: "30 days",
    reason: "Emergency chest pain relief",
    priority: "emergency" as const,
    status: "prepared" as const,
    prescribedDate: "2025-11-16",
    expirationDate: "2025-12-16",
    notes: "Keep with patient at all times, use if chest pain occurs"
  }
];

async function createSamplePrescriptions() {
  console.log("💊 Creating sample prescriptions...\n");

  // Check for command line arguments
  const shouldCleanup = process.argv.includes("--cleanup") || process.argv.includes("-c");

  try {
    // Check if prescriptions already exist
    const existingPrescriptions = await db
      .selectFrom("prescriptions")
      .select(["id"])
      .where("is_deleted", "=", false)
      .execute();

    if (existingPrescriptions.length > 0 && !shouldCleanup) {
      console.log(`⚠️  Found ${existingPrescriptions.length} existing prescriptions. Skipping creation to avoid duplicates.`);
      console.log("💡 To recreate prescriptions, run: npx tsx scripts/create-sample-prescriptions.ts --cleanup");
      return;
    }

    if (shouldCleanup && existingPrescriptions.length > 0) {
      console.log(`🗑️  Cleaning up ${existingPrescriptions.length} existing prescriptions...`);
      await db
        .updateTable("prescriptions")
        .set({
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date()
        })
        .where("is_deleted", "=", false)
        .execute();
      console.log("✅ Existing prescriptions cleaned up.");
    }

    // Get all patients to match with prescriptions
    const patients = await db
      .selectFrom("patients")
      .select(["id", "given_name", "surname", "external_patient_id"])
      .where("is_deleted", "=", false)
      .execute();

    console.log(`📋 Found ${patients.length} patients in database`);

    // Get all clinics
    const clinics = await db
      .selectFrom("clinics")
      .select(["id", "name"])
      .where("is_deleted", "=", false)
      .execute();

    console.log(`🏥 Found ${clinics.length} clinics in database`);

    // Get all users (providers)
    const users = await db
      .selectFrom("users")
      .select(["id", "name", "role"])
      .where("is_deleted", "=", false)
      .execute();

    console.log(`👥 Found ${users.length} users in database`);

    if (users.length === 0) {
      console.log("❌ No users found. Creating prescriptions requires at least one user.");
      return;
    }

    // Create prescriptions
    const createdPrescriptions = [];

    for (const prescriptionData of samplePrescriptions) {
      // Find matching patient
      const patient = patients.find(p => 
        p.external_patient_id === prescriptionData.patientId ||
        (p.given_name?.toLowerCase().includes(prescriptionData.patientName.split(' ')[0].toLowerCase()) &&
         p.surname?.toLowerCase().includes(prescriptionData.patientName.split(' ')[1].toLowerCase()))
      );

      if (!patient) {
        console.log(`⚠️  Patient not found for: ${prescriptionData.patientName} (${prescriptionData.patientId})`);
        continue;
      }

      // Find matching clinic
      const clinic = clinics.find(c => 
        c.name?.toLowerCase().includes(prescriptionData.clinicName.toLowerCase())
      );

      if (!clinic) {
        console.log(`⚠️  Clinic not found for: ${prescriptionData.clinicName}`);
        continue;
      }

      // Select a random user as provider
      const provider = users[Math.floor(Math.random() * users.length)];

      // Create visit first (prescriptions need a visit)
      const visitId = uuidv1();
      const visit = {
        id: visitId,
        patient_id: patient.id,
        clinic_id: clinic.id,
        provider_id: provider.id,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null,
        metadata: JSON.stringify({}),
        provider_name: provider.name || "Unknown Provider"
      };

      // Insert visit
      await db
        .insertInto("visits")
        .values(visit)
        .execute();

      // Create prescription items
      const prescriptionItems = [
        {
          id: uuidv1(),
          medication_name: prescriptionData.medicationName,
          dosage: prescriptionData.dosage,
          frequency: prescriptionData.frequency,
          duration: prescriptionData.duration,
          quantity: prescriptionData.duration.includes("30") ? "30" : prescriptionData.duration.includes("7") ? "7" : "14",
          instructions: prescriptionData.notes
        }
      ];

      // Create prescription
      const prescription = {
        id: uuidv1(),
        patient_id: patient.id,
        provider_id: provider.id,
        pickup_clinic_id: clinic.id,
        visit_id: visitId,
        priority: prescriptionData.priority,
        status: prescriptionData.status,
        prescribed_at: new Date(prescriptionData.prescribedDate),
        expiration_date: new Date(prescriptionData.expirationDate),
        filled_at: null,
        items: JSON.stringify(prescriptionItems),
        notes: prescriptionData.notes,
        metadata: JSON.stringify({
          reason: prescriptionData.reason,
          prescribed_by: provider.name || "Unknown Provider"
        }),
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null
      };

      // Insert prescription
      await db
        .insertInto("prescriptions")
        .values(prescription)
        .execute();

      createdPrescriptions.push({
        patient: prescriptionData.patientName,
        clinic: prescriptionData.clinicName,
        medication: prescriptionData.medicationName,
        dosage: prescriptionData.dosage,
        status: prescriptionData.status,
        priority: prescriptionData.priority,
        prescribedDate: prescriptionData.prescribedDate
      });

      console.log(`✅ Created prescription: ${prescriptionData.medicationName} for ${prescriptionData.patientName}`);
    }

    console.log(`\n🎉 Successfully created ${createdPrescriptions.length} prescriptions!`);
    console.log("\n💊 Created Prescriptions Summary:");
    
    // Group by status
    const groupedByStatus = createdPrescriptions.reduce((acc, presc) => {
      if (!acc[presc.status]) acc[presc.status] = [];
      acc[presc.status].push(presc);
      return acc;
    }, {} as Record<string, typeof createdPrescriptions>);

    Object.entries(groupedByStatus).forEach(([status, prescriptions]) => {
      console.log(`\n📋 Status: ${status.toUpperCase()}`);
      prescriptions.forEach(presc => {
        console.log(`   • ${presc.patient} - ${presc.medication} ${presc.dosage} [${presc.priority}]`);
      });
    });

    // Group by priority
    console.log("\n🚨 Priority Distribution:");
    const priorityCounts = createdPrescriptions.reduce((acc, presc) => {
      acc[presc.priority] = (acc[presc.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(priorityCounts).forEach(([priority, count]) => {
      console.log(`   ${priority}: ${count} prescriptions`);
    });

  } catch (error) {
    console.error("❌ Error creating prescriptions:", error);
  } finally {
    await db.destroy();
  }
}

// Run the script
createSamplePrescriptions();
