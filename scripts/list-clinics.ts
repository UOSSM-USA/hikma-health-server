#!/usr/bin/env tsx

/**
 * Script to list all existing clinics in the database
 * Run with: npx tsx scripts/list-clinics.ts
 */

import db from "../src/db";

async function listClinics() {
  try {
    console.log("Fetching all clinics from the database...\n");
    
    const clinics = await db
      .selectFrom("clinics")
      .where("is_deleted", "=", false)
      .select(["id", "name", "created_at"])
      .orderBy("name", "asc")
      .execute();

    if (clinics.length === 0) {
      console.log("❌ No clinics found in the database.");
      console.log("Run: npx tsx scripts/create-sample-clinic.ts to create sample clinics.");
      return;
    }

    console.log(`✅ Found ${clinics.length} clinic(s):\n`);
    
    clinics.forEach((clinic, index) => {
      console.log(`${index + 1}. ${clinic.name}`);
      console.log(`   ID: ${clinic.id}`);
      console.log(`   Created: ${clinic.created_at.toISOString().split('T')[0]}`);
      console.log("");
    });

    console.log("📋 Sample data format for patient registration:");
    console.log("Primary Clinic ID: Use any of the IDs above");
    
  } catch (error) {
    console.error("❌ Error fetching clinics:", error);
  } finally {
    await db.destroy();
  }
}

// Run the script
listClinics();
