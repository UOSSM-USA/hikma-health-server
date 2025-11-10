#!/usr/bin/env tsx

/**
 * Script to create sample clinic departments
 * 
 * Usage:
 *   npx tsx scripts/create-sample-departments.ts          # Create departments (skip if exist)
 *   npx tsx scripts/create-sample-departments.ts --cleanup # Clean up existing and recreate
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";

// Sample department data for different clinic types
const sampleDepartments = [
  // General Medicine Departments (for most clinics)
  {
    name: "General Medicine",
    code: "GM",
    description: "Primary care and general health services",
    can_dispense_medications: true,
    can_perform_labs: true,
    can_perform_imaging: false,
    additional_capabilities: ["Basic diagnostics", "Health screenings", "Chronic disease management"]
  },
  {
    name: "Emergency Department",
    code: "ED",
    description: "Emergency medical care and urgent treatment",
    can_dispense_medications: true,
    can_perform_labs: true,
    can_perform_imaging: true,
    additional_capabilities: ["Trauma care", "Emergency surgery", "Critical care", "Ambulance services"]
  },
  {
    name: "Pediatrics",
    code: "PED",
    description: "Healthcare services for children and adolescents",
    can_dispense_medications: true,
    can_perform_labs: true,
    can_perform_imaging: false,
    additional_capabilities: ["Child vaccinations", "Growth monitoring", "Developmental assessments"]
  },
  {
    name: "Laboratory",
    code: "LAB",
    description: "Medical laboratory testing and diagnostics",
    can_dispense_medications: false,
    can_perform_labs: true,
    can_perform_imaging: false,
    additional_capabilities: ["Blood tests", "Microbiology", "Pathology", "Quality control"]
  },
  {
    name: "Pharmacy",
    code: "PHARM",
    description: "Medication dispensing and pharmaceutical services",
    can_dispense_medications: true,
    can_perform_labs: false,
    can_perform_imaging: false,
    additional_capabilities: ["Medication counseling", "Drug interactions", "Inventory management"]
  },
  {
    name: "Maternal Health",
    code: "MH",
    description: "Prenatal, delivery, and postnatal care services",
    can_dispense_medications: true,
    can_perform_labs: true,
    can_perform_imaging: true,
    additional_capabilities: ["Antenatal care", "Delivery services", "Family planning", "Postnatal care"]
  },
  {
    name: "Mental Health",
    code: "MH",
    description: "Psychological and psychiatric care services",
    can_dispense_medications: true,
    can_perform_labs: false,
    can_perform_imaging: false,
    additional_capabilities: ["Counseling", "Psychiatric evaluation", "Group therapy", "Crisis intervention"]
  },
  {
    name: "Radiology",
    code: "RAD",
    description: "Medical imaging and diagnostic radiology",
    can_dispense_medications: false,
    can_perform_labs: false,
    can_perform_imaging: true,
    additional_capabilities: ["X-rays", "Ultrasound", "CT scans", "Image interpretation"]
  },
  {
    name: "Surgery",
    code: "SURG",
    description: "Surgical procedures and operations",
    can_dispense_medications: true,
    can_perform_labs: true,
    can_perform_imaging: true,
    additional_capabilities: ["Minor surgery", "Emergency surgery", "Post-operative care", "Anesthesia"]
  },
  {
    name: "Outpatient Services",
    code: "OPD",
    description: "Outpatient consultations and follow-up care",
    can_dispense_medications: true,
    can_perform_labs: false,
    can_perform_imaging: false,
    additional_capabilities: ["Consultations", "Follow-up visits", "Health education", "Referrals"]
  }
];

// Department assignments for different clinic types
const clinicDepartmentAssignments = {
  "Health Centre IV": ["General Medicine", "Emergency Department", "Pediatrics", "Laboratory", "Pharmacy", "Maternal Health", "Radiology", "Surgery"],
  "General Hospital": ["General Medicine", "Emergency Department", "Pediatrics", "Laboratory", "Pharmacy", "Maternal Health", "Mental Health", "Radiology", "Surgery", "Outpatient Services"],
  "Health Post": ["General Medicine", "Emergency Department", "Pediatrics", "Pharmacy", "Maternal Health"],
  "Medical Unit": ["General Medicine", "Emergency Department", "Pediatrics", "Laboratory", "Pharmacy", "Maternal Health"],
  "Medical Centre": ["General Medicine", "Emergency Department", "Pediatrics", "Laboratory", "Pharmacy", "Maternal Health", "Mental Health", "Radiology"],
  "Clinic": ["General Medicine", "Emergency Department", "Pediatrics", "Pharmacy", "Maternal Health", "Mental Health"]
};

async function createSampleDepartments() {
  console.log("🏥 Creating sample clinic departments...\n");

  // Check for command line arguments
  const shouldCleanup = process.argv.includes("--cleanup") || process.argv.includes("-c");

  try {
    // Check if departments already exist
    const existingDepartments = await db
      .selectFrom("clinic_departments")
      .select(["id"])
      .where("is_deleted", "=", false)
      .execute();

    if (existingDepartments.length > 0 && !shouldCleanup) {
      console.log(`⚠️  Found ${existingDepartments.length} existing departments. Skipping creation to avoid duplicates.`);
      console.log("💡 To recreate departments, run: npx tsx scripts/create-sample-departments.ts --cleanup");
      return;
    }

    if (shouldCleanup && existingDepartments.length > 0) {
      console.log(`🗑️  Cleaning up ${existingDepartments.length} existing departments...`);
      await db
        .updateTable("clinic_departments")
        .set({
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date()
        })
        .where("is_deleted", "=", false)
        .execute();
      console.log("✅ Existing departments cleaned up.");
    }

    // Get all clinics
    const clinics = await db
      .selectFrom("clinics")
      .select(["id", "name"])
      .where("is_deleted", "=", false)
      .execute();

    console.log(`📋 Found ${clinics.length} clinics in database`);

    if (clinics.length === 0) {
      console.log("❌ No clinics found. Please create clinics first.");
      return;
    }

    const createdDepartments = [];

    for (const clinic of clinics) {
      console.log(`\n🏥 Processing clinic: ${clinic.name}`);

      // Determine clinic type based on name
      let clinicType = "Health Post"; // default
      if (clinic.name.includes("Health Centre IV")) clinicType = "Health Centre IV";
      else if (clinic.name.includes("General Hospital")) clinicType = "General Hospital";
      else if (clinic.name.includes("Health Post")) clinicType = "Health Post";
      else if (clinic.name.includes("Medical Unit")) clinicType = "Medical Unit";
      else if (clinic.name.includes("Medical Centre")) clinicType = "Medical Centre";
      else if (clinic.name.includes("Clinic")) clinicType = "Clinic";

      // Get departments for this clinic type
      const assignedDepartments = clinicDepartmentAssignments[clinicType] || clinicDepartmentAssignments["Health Post"];

      console.log(`   📋 Assigning ${assignedDepartments.length} departments for ${clinicType}`);

      for (const deptName of assignedDepartments) {
        // Find the department template
        const deptTemplate = sampleDepartments.find(d => d.name === deptName);
        if (!deptTemplate) {
          console.log(`   ⚠️  Department template not found: ${deptName}`);
          continue;
        }

        // Create department
        const department = {
          id: uuidv1(),
          clinic_id: clinic.id,
          name: deptTemplate.name,
          code: deptTemplate.code,
          description: deptTemplate.description,
          status: "active",
          can_dispense_medications: deptTemplate.can_dispense_medications,
          can_perform_labs: deptTemplate.can_perform_labs,
          can_perform_imaging: deptTemplate.can_perform_imaging,
          additional_capabilities: JSON.stringify(deptTemplate.additional_capabilities),
          metadata: JSON.stringify({}),
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_modified: new Date(),
          server_created_at: new Date(),
          deleted_at: null
        };

        // Insert department
        await db
          .insertInto("clinic_departments")
          .values(department)
          .execute();

        createdDepartments.push({
          clinic: clinic.name,
          department: deptTemplate.name,
          code: deptTemplate.code,
          capabilities: {
            medications: deptTemplate.can_dispense_medications,
            labs: deptTemplate.can_perform_labs,
            imaging: deptTemplate.can_perform_imaging
          }
        });

        console.log(`   ✅ Created: ${deptTemplate.name} (${deptTemplate.code})`);
      }
    }

    console.log(`\n🎉 Successfully created ${createdDepartments.length} departments!`);
    console.log("\n📋 Created Departments Summary:");
    
    // Group by clinic
    const groupedByClinic = createdDepartments.reduce((acc, dept) => {
      if (!acc[dept.clinic]) acc[dept.clinic] = [];
      acc[dept.clinic].push(dept);
      return acc;
    }, {} as Record<string, typeof createdDepartments>);

    Object.entries(groupedByClinic).forEach(([clinicName, departments]) => {
      console.log(`\n🏥 ${clinicName}:`);
      departments.forEach(dept => {
        const capabilities = [];
        if (dept.capabilities.medications) capabilities.push("Medications");
        if (dept.capabilities.labs) capabilities.push("Labs");
        if (dept.capabilities.imaging) capabilities.push("Imaging");
        console.log(`   • ${dept.department} (${dept.code}) - ${capabilities.join(", ")}`);
      });
    });

  } catch (error) {
    console.error("❌ Error creating departments:", error);
  } finally {
    await db.destroy();
  }
}

// Run the script
createSampleDepartments();
