#!/usr/bin/env tsx

/**
 * Script to create users for the Orphanage clinic from CSV
 * 
 * Usage:
 *   npx tsx scripts/create-orphanage-users.ts
 * 
 * This script:
 * 1. Reads user data from docs/orphanage/Email Orphans project staff(EMAIL).csv
 * 2. Maps CSV roles to system roles
 * 3. Creates users with simple passwords (first name + job position)
 * 4. Assigns users to the Orphanage clinic
 * 5. Outputs a CSV with passwords to docs/orphanage/users-with-passwords.csv
 */

import { v1 as uuidv1 } from "uuid";
import db from "../src/db";
import User from "../src/models/user";
import UserClinicPermissions from "../src/models/user-clinic-permissions";
import bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
// Simple CSV parser (no external dependency needed)
function parseCSV(content: string): CsvRow[] {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  
  // Parse header
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  
  // Parse rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values.length === 0 || !values[0]) continue;
    
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row as CsvRow);
  }
  
  return rows;
}

// Map CSV role values to system roles
const roleMapping: Record<string, User.RoleT> = {
  "Technical_adviser": User.ROLES.TECHNICAL_ADVISOR,
  "Team_Leader": User.ROLES.TEAM_LEADER,
  "Caseworker_1": User.ROLES.CASEWORKER_1,
  "Caseworker_2": User.ROLES.CASEWORKER_2,
  "Caseworker_3": User.ROLES.CASEWORKER_3,
  "Caseworker_4": User.ROLES.CASEWORKER_4,
  "Me_officer": User.ROLES.ME_OFFICER,
  "Im_associate": User.ROLES.IM_ASSOCIATE,
  "Super_admin": User.ROLES.SUPER_ADMIN,
  "N/A": User.ROLES.PROVIDER, // Default for N/A roles (Photographer, Accounts Assistant)
};

interface CsvRow {
  employee_name: string;
  job_position_title: string;
  "UOSSM DER Email": string;
  Project: string;
  "Hikma User": string;
}

interface UserWithPassword extends CsvRow {
  password: string;
  role: User.RoleT;
  clinic_id: string;
  user_id?: string;
  status?: "created" | "exists" | "error";
  error_message?: string;
}

function generatePassword(firstName: string, jobPosition: string): string {
  // Clean first name: take first word, lowercase, remove spaces/special chars
  const cleanFirstName = firstName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  
  // Clean job position: take key words, lowercase, remove spaces/special chars
  const cleanJobPosition = jobPosition
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/teamleader/g, "teamleader")
    .replace(/technicalseniorcoordinator/g, "techcoord")
    .replace(/accountsassistant/g, "accounts")
    .replace(/photographer/g, "photo")
    .replace(/meal/g, "meal")
    .replace(/regionaloperationmanager/g, "rom")
    .replace(/hqprogrammanager/g, "hqpm")
    .replace(/vicepresident/g, "vp");
  
  // For simple positions like "Psw", use just "psw"
  if (cleanJobPosition === "psw") {
    return `${cleanFirstName}Psw`;
  }
  
  // For longer positions, use abbreviation
  if (cleanJobPosition.includes("teamleader")) {
    return `${cleanFirstName}TeamLeader`;
  }
  if (cleanJobPosition.includes("techcoord") || cleanJobPosition.includes("technicalseniorcoordinator")) {
    return `${cleanFirstName}TechCoord`;
  }
  if (cleanJobPosition.includes("accounts")) {
    return `${cleanFirstName}Accounts`;
  }
  if (cleanJobPosition.includes("photo")) {
    return `${cleanFirstName}Photo`;
  }
  if (cleanJobPosition.includes("meal")) {
    return `${cleanFirstName}Meal`;
  }
  if (cleanJobPosition.includes("rom") || cleanJobPosition.includes("regionaloperationmanager")) {
    return `${cleanFirstName}ROM`;
  }
  if (cleanJobPosition.includes("hqpm") || cleanJobPosition.includes("hqprogrammanager")) {
    return `${cleanFirstName}HQPM`;
  }
  if (cleanJobPosition.includes("vp") || cleanJobPosition.includes("vicepresident")) {
    return `${cleanFirstName}VP`;
  }
  if (cleanJobPosition.includes("imassociate")) {
    return `${cleanFirstName}IM`;
  }
  if (cleanJobPosition.includes("superadmin")) {
    return `${cleanFirstName}Admin`;
  }
  
  // Default: first name + first 3-4 chars of job position
  const jobAbbr = cleanJobPosition.substring(0, Math.min(cleanJobPosition.length, 6));
  return `${cleanFirstName}${jobAbbr.charAt(0).toUpperCase()}${jobAbbr.slice(1)}`;
}

function mapRole(csvRole: string): User.RoleT {
  const normalizedRole = csvRole.trim();
  return roleMapping[normalizedRole] || User.ROLES.PROVIDER;
}

async function findOrCreateOrphanageClinic(): Promise<string> {
  // Try different possible names for the Orphanage clinic
  const possibleNames = ["Orphanage", "Orphan", "Orphan Project", "Orphans"];
  
  for (const name of possibleNames) {
    const clinic = await db
      .selectFrom("clinics")
      .selectAll()
      .where("name", "=", name)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
    
    if (clinic) {
      console.log(`✅ Found existing clinic: "${name}" (id: ${clinic.id})`);
      return clinic.id;
    }
  }
  
  // If not found, create it
  console.log("⚠️  Orphanage clinic not found. Creating new clinic...");
  const clinicId = uuidv1();
  const now = new Date();
  
  await db
    .insertInto("clinics")
    .values({
      id: clinicId,
      name: "Orphanage",
      is_deleted: false,
      is_archived: false,
      created_at: now,
      updated_at: now,
    })
    .execute();
  
  console.log(`✅ Created new clinic "Orphanage" (id: ${clinicId})`);
  return clinicId;
}

// Get permissions for a role, with fallback for roles not in rolePermissions
function getRolePermissions(role: User.RoleT): {
  can_delete_records: boolean;
  can_view_history: boolean;
  can_edit_records: boolean;
  can_register_patients: boolean;
  is_clinic_admin: boolean;
} {
  // Check if role exists in rolePermissions (only super_admin, admin, provider, registrar are defined)
  const definedRoles = ["super_admin", "admin", "provider", "registrar"];
  
  if (definedRoles.includes(role)) {
    try {
      return UserClinicPermissions.getRolePermissions(role);
    } catch {
      // Fall through to default
    }
  }
  
  // Fallback: treat caseworkers and similar roles like providers
  if (
    role === User.ROLES.CASEWORKER_1 ||
    role === User.ROLES.CASEWORKER_2 ||
    role === User.ROLES.CASEWORKER_3 ||
    role === User.ROLES.CASEWORKER_4 ||
    role === User.ROLES.TEAM_LEADER ||
    role === User.ROLES.TECHNICAL_ADVISOR ||
    role === User.ROLES.PROJECT_MANAGER ||
    role === User.ROLES.ME_OFFICER ||
    role === User.ROLES.IM_ASSOCIATE
  ) {
    // Caseworkers and team leaders have provider-like permissions
    return {
      can_delete_records: false,
      can_view_history: true,
      can_edit_records: true,
      can_register_patients: true,
      is_clinic_admin: false,
    };
  }
  
  // Default to provider permissions
  return {
    can_delete_records: false,
    can_view_history: true,
    can_edit_records: true,
    can_register_patients: true,
    is_clinic_admin: false,
  };
}

async function getOrCreateSystemUser(): Promise<string> {
  // Try to find an existing super admin to use as creator
  const superAdmin = await db
    .selectFrom("users")
    .select("id")
    .where("role", "=", User.ROLES.SUPER_ADMIN)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
  
  if (superAdmin) {
    return superAdmin.id;
  }
  
  // If no super admin exists, return null (will be set to null in DB)
  return ""; // Empty string will be converted to null
}

async function createUser(
  userData: CsvRow,
  password: string,
  role: User.RoleT,
  clinicId: string,
  creatorId: string | null,
): Promise<{ userId: string; status: "created" | "exists" }> {
  const email = userData["UOSSM DER Email"].trim();
  
  // Check if user already exists
  const existing = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
  
  if (existing) {
    console.log(`⚠️  User already exists: ${userData.employee_name} (${email})`);
    return { userId: existing.id, status: "exists" };
  }
  
  // Hash password
  const saltRounds = 10;
  const salt = bcrypt.genSaltSync(saltRounds);
  const hashedPassword = bcrypt.hashSync(password, salt);
  
  const userId = uuidv1();
  const now = new Date();
  
  // Get permissions for the role
  const userPermissions = getRolePermissions(role);
  
  await db.transaction().execute(async (trx) => {
    // Insert user
    await trx
      .insertInto("users")
      .values({
        id: userId,
        name: userData.employee_name.trim(),
        role: role,
        email: email,
        hashed_password: hashedPassword,
        instance_url: null,
        clinic_id: clinicId,
        is_deleted: false,
        created_at: now,
        updated_at: now,
        last_modified: now,
        server_created_at: now,
        deleted_at: null,
      })
      .execute();
    
    // Create clinic permissions
    await trx
      .insertInto("user_clinic_permissions")
      .values({
        user_id: userId,
        clinic_id: clinicId,
        can_delete_records: userPermissions.can_delete_records,
        can_view_history: userPermissions.can_view_history,
        can_edit_records: userPermissions.can_edit_records,
        can_register_patients: userPermissions.can_register_patients,
        is_clinic_admin: userPermissions.is_clinic_admin,
        created_by: creatorId || null,
        created_at: now,
        updated_at: now,
        last_modified_by: creatorId || null,
      })
      .execute();
  });
  
  return { userId, status: "created" };
}

async function main() {
  console.log("🚀 Starting Orphanage user creation from CSV...\n");
  
  // Read CSV file
  const csvPath = path.join(process.cwd(), "docs/orphanage/Email Orphans project staff(EMAIL).csv");
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records: CsvRow[] = parseCSV(csvContent);
  
  console.log(`📋 Found ${records.length} users in CSV\n`);
  
  // Find or create Orphanage clinic
  const clinicId = await findOrCreateOrphanageClinic();
  console.log("");
  
  // Get creator ID (use super admin if available, otherwise null)
  const creatorId = await getOrCreateSystemUser();
  if (creatorId) {
    console.log(`Using creator ID: ${creatorId}\n`);
  } else {
    console.log(`No super admin found, using null for creator ID\n`);
  }
  
  // Process each user
  const results: UserWithPassword[] = [];
  let createdCount = 0;
  let existsCount = 0;
  let errorCount = 0;
  
  for (const row of records) {
    try {
      const firstName = row.employee_name.split(" ")[0];
      const password = generatePassword(firstName, row.job_position_title);
      const role = mapRole(row["Hikma User"]);
      
      console.log(`Processing: ${row.employee_name} (${row.job_position_title})`);
      console.log(`  Email: ${row["UOSSM DER Email"]}`);
      console.log(`  Role: ${role} (from "${row["Hikma User"]}")`);
      console.log(`  Password: ${password}`);
      
      const { userId, status } = await createUser(row, password, role, clinicId, creatorId || null);
      
      results.push({
        ...row,
        password,
        role,
        clinic_id: clinicId,
        user_id: userId,
        status,
      });
      
      if (status === "created") {
        createdCount++;
        console.log(`  ✅ Created user (id: ${userId})\n`);
      } else {
        existsCount++;
        console.log(`  ⚠️  User already exists (id: ${userId})\n`);
      }
    } catch (error: any) {
      errorCount++;
      console.error(`  ❌ Error: ${error.message}\n`);
      results.push({
        ...row,
        password: generatePassword(row.employee_name.split(" ")[0], row.job_position_title),
        role: mapRole(row["Hikma User"]),
        clinic_id: clinicId,
        status: "error",
        error_message: error.message,
      });
    }
  }
  
  // Write output CSV
  const outputPath = path.join(process.cwd(), "docs/orphanage/users-with-passwords.csv");
  const headers = [
    "employee_name",
    "job_position_title",
    "UOSSM DER Email",
    "Project",
    "Hikma User",
    "password",
    "role",
    "clinic_id",
    "user_id",
    "status",
    "error_message",
  ];
  
  const csvRows = [
    headers.join(","),
    ...results.map((r) =>
      [
        `"${r.employee_name}"`,
        `"${r.job_position_title}"`,
        `"${r["UOSSM DER Email"]}"`,
        `"${r.Project}"`,
        `"${r["Hikma User"]}"`,
        `"${r.password}"`,
        `"${r.role}"`,
        `"${r.clinic_id}"`,
        `"${r.user_id || ""}"`,
        `"${r.status || ""}"`,
        `"${r.error_message || ""}"`,
      ].join(",")
    ),
  ];
  
  fs.writeFileSync(outputPath, csvRows.join("\n"), "utf-8");
  
  console.log("📊 Summary:");
  console.log(`  ✅ Created: ${createdCount}`);
  console.log(`  ⚠️  Already exists: ${existsCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`\n📄 Output CSV written to: ${outputPath}`);
  
  await db.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
