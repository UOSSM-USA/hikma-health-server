#!/usr/bin/env tsx

/**
 * Script to perform mass patient registration
 * Run with: npx tsx scripts/mass-patient-registration.ts
 */

import { v1 as uuidv1 } from "uuid";
import { Option } from "effect";
import db from "../src/db";

// Sample patient data
const samplePatients = [
  {
    firstName: "Amina",
    lastName: "Hassan",
    dateOfBirth: "1991-03-12",
    sex: "female",
    citizenship: "South Sudanese",
    hometown: "Juba",
    phone: "+256 783 412 567",
    camp: "Bidi Bidi Refugee Settlement (Uganda)",
    governmentId: "SSD-001283",
    patientId: "P0001",
    clinicName: "Bidi Bidi Health Centre IV"
  },
  {
    firstName: "Peter",
    lastName: "Odong",
    dateOfBirth: "1988-09-05",
    sex: "male",
    citizenship: "Ugandan",
    hometown: "Arua",
    phone: "+256 772 314 890",
    camp: "Rhino Camp Refugee Settlement (Uganda)",
    governmentId: "UGA-008432",
    patientId: "P0002",
    clinicName: "Rhino Camp Health Post"
  },
  {
    firstName: "Grace",
    lastName: "Nyambura",
    dateOfBirth: "1994-11-23",
    sex: "female",
    citizenship: "Kenyan",
    hometown: "Nakuru",
    phone: "+254 712 349 876",
    camp: "Kakuma Refugee Camp (Kenya)",
    governmentId: "KEN-012345",
    patientId: "P0003",
    clinicName: "Kakuma General Hospital"
  },
  {
    firstName: "Jean",
    lastName: "Kalume",
    dateOfBirth: "1985-01-16",
    sex: "male",
    citizenship: "Congolese (DRC)",
    hometown: "Goma",
    phone: "+243 824 657 321",
    camp: "Kyaka II Refugee Settlement (Uganda)",
    governmentId: "DRC-098712",
    patientId: "P0004",
    clinicName: "Kyaka II Medical Centre"
  },
  {
    firstName: "Fatuma",
    lastName: "Abdallah",
    dateOfBirth: "1997-06-29",
    sex: "female",
    citizenship: "Somali",
    hometown: "Kismayo",
    phone: "+256 701 456 832",
    camp: "Kiryandongo Refugee Settlement (Uganda)",
    governmentId: "SOM-004321",
    patientId: "P0005",
    clinicName: "Kiryandongo HC III"
  },
  {
    firstName: "David",
    lastName: "Mutabazi",
    dateOfBirth: "1992-02-10",
    sex: "male",
    citizenship: "Rwandan",
    hometown: "Kigali",
    phone: "+256 751 239 870",
    camp: "Nakivale Refugee Settlement (Uganda)",
    governmentId: "RWA-007658",
    patientId: "P0006",
    clinicName: "Nakivale Main Clinic"
  },
  {
    firstName: "Sarah",
    lastName: "Ladu",
    dateOfBirth: "2000-07-14",
    sex: "female",
    citizenship: "South Sudanese",
    hometown: "Yei",
    phone: "+256 789 023 456",
    camp: "Palorinya Refugee Settlement (Uganda)",
    governmentId: "SSD-009876",
    patientId: "P0007",
    clinicName: "Palorinya Health Centre III"
  },
  {
    firstName: "James",
    lastName: "Mumbere",
    dateOfBirth: "1986-10-02",
    sex: "male",
    citizenship: "Congolese (DRC)",
    hometown: "Beni",
    phone: "+256 778 564 230",
    camp: "Rwamwanja Refugee Settlement (Uganda)",
    governmentId: "DRC-056732",
    patientId: "P0008",
    clinicName: "Rwamwanja Clinic A"
  },
  {
    firstName: "Mary",
    lastName: "Atieno",
    dateOfBirth: "1999-05-19",
    sex: "female",
    citizenship: "Kenyan",
    hometown: "Kisumu",
    phone: "+254 701 982 347",
    camp: "Dadaab Refugee Camp (Kenya)",
    governmentId: "KEN-067894",
    patientId: "P0009",
    clinicName: "Dadaab Medical Unit 2"
  },
  {
    firstName: "Yusuf",
    lastName: "Hamisi",
    dateOfBirth: "1993-08-11",
    sex: "male",
    citizenship: "Tanzanian",
    hometown: "Kigoma",
    phone: "+255 689 432 105",
    camp: "Nyarugusu Refugee Camp (Tanzania)",
    governmentId: "TAN-032198",
    patientId: "P0010",
    clinicName: "Nyarugusu Health Post"
  }
];

async function massPatientRegistration() {
  try {
    console.log("Starting mass patient registration...\n");
    
    // First, get all clinics to map clinic names to IDs
    const clinics = await db
      .selectFrom("clinics")
      .where("is_deleted", "=", false)
      .where("is_archived", "=", false)
      .select(["id", "name"])
      .execute();

    console.log("Available clinics:");
    clinics.forEach((clinic, index) => {
      console.log(`${index + 1}. ${clinic.name} (${clinic.id})`);
    });
    console.log("");

    // Create a mapping of clinic names to IDs
    const clinicMap = new Map();
    clinics.forEach(clinic => {
      clinicMap.set(clinic.name, clinic.id);
    });

    const now = new Date();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < samplePatients.length; i++) {
      const patientData = samplePatients[i];
      const clinicId = clinicMap.get(patientData.clinicName);
      
      if (!clinicId) {
        console.log(`❌ ${i + 1}. ${patientData.firstName} ${patientData.lastName} - Clinic "${patientData.clinicName}" not found`);
        errorCount++;
        continue;
      }

      try {
        const patientId = uuidv1();
        
        // Create patient object
        const patient = {
          id: patientId,
          given_name: Option.fromNullable(patientData.firstName),
          surname: Option.fromNullable(patientData.lastName),
          date_of_birth: Option.fromNullable(new Date(patientData.dateOfBirth)),
          citizenship: Option.fromNullable(patientData.citizenship),
          hometown: Option.fromNullable(patientData.hometown),
          phone: Option.fromNullable(patientData.phone),
          sex: Option.fromNullable(patientData.sex),
          camp: Option.fromNullable(patientData.camp),
          additional_data: {},
          image_timestamp: Option.none(),
          is_deleted: false,
          created_at: now,
          updated_at: now,
          last_modified: now,
          server_created_at: now,
          deleted_at: Option.none(),
          metadata: {},
          photo_url: Option.none(),
          government_id: Option.fromNullable(patientData.governmentId),
          external_patient_id: Option.fromNullable(patientData.patientId),
          primary_clinic_id: Option.fromNullable(clinicId),
          last_modified_by: Option.none(),
          additional_attributes: {},
        };

        // Insert patient directly into database
        await db
          .insertInto("patients")
          .values({
            id: patientId,
            given_name: Option.getOrElse(patient.given_name, () => null),
            surname: Option.getOrElse(patient.surname, () => null),
            date_of_birth: Option.getOrElse(patient.date_of_birth, () => null),
            citizenship: Option.getOrElse(patient.citizenship, () => null),
            hometown: Option.getOrElse(patient.hometown, () => null),
            phone: Option.getOrElse(patient.phone, () => null),
            sex: Option.getOrElse(patient.sex, () => null),
            camp: Option.getOrElse(patient.camp, () => null),
            additional_data: JSON.stringify(patient.additional_data),
            image_timestamp: Option.getOrElse(patient.image_timestamp, () => null),
            metadata: JSON.stringify(patient.metadata),
            photo_url: Option.getOrElse(patient.photo_url, () => null),
            government_id: Option.getOrElse(patient.government_id, () => null),
            external_patient_id: Option.getOrElse(patient.external_patient_id, () => null),
            is_deleted: patient.is_deleted,
            created_at: now,
            updated_at: now,
            last_modified: now,
            server_created_at: now,
            deleted_at: Option.getOrElse(patient.deleted_at, () => null),
            primary_clinic_id: Option.getOrElse(patient.primary_clinic_id, () => null),
            last_modified_by: Option.getOrElse(patient.last_modified_by, () => null),
          })
          .execute();

        console.log(`✅ ${i + 1}. ${patientData.firstName} ${patientData.lastName} (${patientData.patientId}) - Registered successfully`);
        successCount++;

      } catch (error) {
        console.log(`❌ ${i + 1}. ${patientData.firstName} ${patientData.lastName} - Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Registration Summary:`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📝 Total: ${samplePatients.length}`);

    if (successCount > 0) {
      console.log(`\n🎉 Mass registration completed! ${successCount} patients registered successfully.`);
    }

  } catch (error) {
    console.error("❌ Mass registration failed:", error);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

// Run the mass registration
massPatientRegistration();
