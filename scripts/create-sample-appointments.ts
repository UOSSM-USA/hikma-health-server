#!/usr/bin/env tsx

/**
 * Script to create sample appointment data
 * 
 * Usage:
 *   npx tsx scripts/create-sample-appointments.ts          # Create appointments (skip if exist)
 *   npx tsx scripts/create-sample-appointments.ts --cleanup # Clean up existing and recreate
 */

import { v1 as uuidv1 } from "uuid";
import { Option } from "effect";
import db from "../src/db";
import Appointment from "../src/models/appointment";

// Sample appointment data based on our existing patients
const sampleAppointments = [
  {
    patientName: "Amina Hassan",
    patientId: "P0001",
    clinicName: "Bidi Bidi Health Centre IV",
    department: "General Medicine",
    appointmentType: "Follow-up",
    reason: "Diabetes management follow-up",
    status: "confirmed" as const,
    scheduledDate: "2025-11-15",
    scheduledTime: "09:00",
    duration: 30,
    notes: "Patient needs blood sugar monitoring and medication adjustment"
  },
  {
    patientName: "Peter Odong",
    patientId: "P0002", 
    clinicName: "Rhino Camp Health Post",
    department: "Emergency",
    appointmentType: "Urgent",
    reason: "Chest pain evaluation",
    status: "pending" as const,
    scheduledDate: "2025-11-16",
    scheduledTime: "14:30",
    duration: 45,
    notes: "Patient reported chest pain, needs immediate evaluation"
  },
  {
    patientName: "Grace Nyambura",
    patientId: "P0003",
    clinicName: "Kakuma General Hospital", 
    department: "Pediatrics",
    appointmentType: "Routine",
    reason: "Child vaccination",
    status: "confirmed" as const,
    scheduledDate: "2025-11-17",
    scheduledTime: "10:15",
    duration: 20,
    notes: "Routine vaccination for 2-year-old child"
  },
  {
    patientName: "Mohamed Ali",
    patientId: "P0004",
    clinicName: "Dadaab Medical Unit 2",
    department: "Cardiology", 
    appointmentType: "Consultation",
    reason: "Heart condition assessment",
    status: "confirmed" as const,
    scheduledDate: "2025-11-18",
    scheduledTime: "11:00",
    duration: 60,
    notes: "Comprehensive cardiac evaluation needed"
  },
  {
    patientName: "Sarah Johnson",
    patientId: "P0005",
    clinicName: "Kiryandongo HC III",
    department: "Obstetrics",
    appointmentType: "Prenatal",
    reason: "Prenatal checkup",
    status: "confirmed" as const,
    scheduledDate: "2025-11-19",
    scheduledTime: "08:30",
    duration: 40,
    notes: "Regular prenatal visit, 28 weeks pregnant"
  },
  {
    patientName: "Ahmed Hassan",
    patientId: "P0006",
    clinicName: "Kyaka II Medical Centre",
    department: "Orthopedics",
    appointmentType: "Follow-up",
    reason: "Fracture healing check",
    status: "confirmed" as const,
    scheduledDate: "2025-11-20",
    scheduledTime: "15:00",
    duration: 30,
    notes: "Post-fracture healing assessment, X-ray review"
  },
  {
    patientName: "Mary Akello",
    patientId: "P0007",
    clinicName: "Nakivale Main Clinic",
    department: "Dermatology",
    appointmentType: "Consultation",
    reason: "Skin condition treatment",
    status: "pending" as const,
    scheduledDate: "2025-11-21",
    scheduledTime: "13:45",
    duration: 25,
    notes: "Persistent skin rash, needs dermatological evaluation"
  },
  {
    patientName: "John Mwangi",
    patientId: "P0008",
    clinicName: "Nyarugusu Health Post",
    department: "General Medicine",
    appointmentType: "Routine",
    reason: "Annual health check",
    status: "confirmed" as const,
    scheduledDate: "2025-11-22",
    scheduledTime: "09:30",
    duration: 45,
    notes: "Annual comprehensive health examination"
  },
  {
    patientName: "Fatima Omar",
    patientId: "P0009",
    clinicName: "Palorinya Health Centre III",
    department: "Pediatrics",
    appointmentType: "Emergency",
    reason: "Child fever",
    status: "checked_in" as const,
    scheduledDate: "2025-11-23",
    scheduledTime: "16:00",
    duration: 35,
    notes: "Child with high fever, needs immediate attention"
  },
  {
    patientName: "David Kiprop",
    patientId: "P0010",
    clinicName: "Rwamwanja Clinic A",
    department: "Mental Health",
    appointmentType: "Consultation",
    reason: "Mental health assessment",
    status: "confirmed" as const,
    scheduledDate: "2025-11-24",
    scheduledTime: "10:00",
    duration: 50,
    notes: "Initial mental health consultation and assessment"
  }
];

async function createSampleAppointments() {
  console.log("🏥 Creating sample appointments...\n");

  // Check for command line arguments
  const shouldCleanup = process.argv.includes("--cleanup") || process.argv.includes("-c");

  try {
    // Check if appointments already exist
    const existingAppointments = await db
      .selectFrom("appointments")
      .select(["id"])
      .where("is_deleted", "=", false)
      .execute();

    if (existingAppointments.length > 0 && !shouldCleanup) {
      console.log(`⚠️  Found ${existingAppointments.length} existing appointments. Skipping creation to avoid duplicates.`);
      console.log("💡 To recreate appointments, run: npx tsx scripts/create-sample-appointments.ts --cleanup");
      return;
    }

    if (shouldCleanup && existingAppointments.length > 0) {
      console.log(`🗑️  Cleaning up ${existingAppointments.length} existing appointments...`);
      await db
        .updateTable("appointments")
        .set({
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date()
        })
        .where("is_deleted", "=", false)
        .execute();
      console.log("✅ Existing appointments cleaned up.");
    }

    // Get all patients to match with appointments
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
      console.log("❌ No users found. Creating appointments requires at least one user.");
      return;
    }

    // Create appointments
    const createdAppointments = [];

    for (const appointmentData of sampleAppointments) {
      // Find matching patient
      const patient = patients.find(p => 
        p.external_patient_id === appointmentData.patientId ||
        (p.given_name?.toLowerCase().includes(appointmentData.patientName.split(' ')[0].toLowerCase()) &&
         p.surname?.toLowerCase().includes(appointmentData.patientName.split(' ')[1].toLowerCase()))
      );

      if (!patient) {
        console.log(`⚠️  Patient not found for: ${appointmentData.patientName} (${appointmentData.patientId})`);
        continue;
      }

      // Find matching clinic
      const clinic = clinics.find(c => 
        c.name?.toLowerCase().includes(appointmentData.clinicName.toLowerCase())
      );

      if (!clinic) {
        console.log(`⚠️  Clinic not found for: ${appointmentData.clinicName}`);
        continue;
      }

      // Select a random user as provider
      const provider = users[Math.floor(Math.random() * users.length)];

      // Create visit first
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

      // Create appointment object
      const appointmentDateTime = new Date(`${appointmentData.scheduledDate}T${appointmentData.scheduledTime}:00`);
      
      const appointment = {
        id: uuidv1(),
        patient_id: patient.id,
        clinic_id: clinic.id,
        provider_id: provider.id,
        user_id: provider.id,
        current_visit_id: visitId,
        timestamp: appointmentDateTime,
        duration: appointmentData.duration,
        reason: appointmentData.reason,
        status: appointmentData.status,
        notes: appointmentData.notes,
        departments: JSON.stringify([
          {
            id: uuidv1(),
            name: appointmentData.department,
            seen_at: null,
            seen_by: null,
            status: "pending"
          }
        ]),
        is_walk_in: false,
        metadata: JSON.stringify({}),
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null
      };

      // Insert appointment
      await db
        .insertInto("appointments")
        .values(appointment)
        .execute();

      createdAppointments.push({
        patient: appointmentData.patientName,
        clinic: appointmentData.clinicName,
        department: appointmentData.department,
        date: appointmentData.scheduledDate,
        time: appointmentData.scheduledTime,
        status: appointmentData.status
      });

      console.log(`✅ Created appointment for ${appointmentData.patientName} at ${appointmentData.clinicName}`);
    }

    console.log(`\n🎉 Successfully created ${createdAppointments.length} appointments!`);
    console.log("\n📋 Created Appointments:");
    createdAppointments.forEach((apt, index) => {
      console.log(`${index + 1}. ${apt.patient} - ${apt.clinic} (${apt.department}) - ${apt.date} ${apt.time} [${apt.status}]`);
    });

  } catch (error) {
    console.error("❌ Error creating appointments:", error);
  } finally {
    await db.destroy();
  }
}

// Run the script
createSampleAppointments();
