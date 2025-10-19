# Hikma Health - Forms and Sample Data Documentation

This document provides comprehensive documentation for all forms and sample data used in the Hikma Health application.

## 📊 Current Status Overview

### ✅ Completed Forms (5/8)
- **Patient Registration Form** - Complete with sample data
- **Appointment Form** - Complete with sample data  
- **Prescription Form** - Complete with sample data
- **Clinic Department Form** - Complete with sample data
- **Event Form Builder** - Complete with sample data

### 🔄 Pending Forms (3/8)
- **Patient Vital Signs Form** - UI and sample data needed
- **Visit/Encounter Form** - Verification and sample data needed
- **User Management Forms** - Verification and sample data needed

### 📈 Sample Data Statistics
- **Patients**: 10 created across 6 countries
- **Appointments**: 10 created with various departments
- **Prescriptions**: 12 created with realistic medication data
- **Departments**: 70 created across 11 clinics
- **Event Forms**: 6 created covering healthcare scenarios
- **Total Database Records**: 100+ records

---

- [Patient Registration Form](#patient-registration-form)
- [Sample Patient Data](#sample-patient-data)
- [Appointment Management](#appointment-management)
- [Sample Appointment Data](#sample-appointment-data)
- [Clinic Department Management](#clinic-department-management)
- [Sample Department Data](#sample-department-data)
- [Prescription Management](#prescription-management)
- [Sample Prescription Data](#sample-prescription-data)
- [Event Form Builder](#event-form-builder)
- [Sample Event Forms](#sample-event-forms)
- [Clinic Management](#clinic-management)
- [Database Setup Scripts](#database-setup-scripts)
- [Form Field Types](#form-field-types)
- [Data Validation Rules](#data-validation-rules)

---

## 🏥 Patient Registration Form

### Form Configuration

The patient registration form is defined in `src/data/registration-form-base-fields.ts` and contains the following fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `given_name` | text | ✅ | Patient's first name | "Amina" |
| `surname` | text | ✅ | Patient's last name | "Hassan" |
| `date_of_birth` | date | ✅ | Patient's birth date | "1991-03-12" |
| `sex` | select | ✅ | Patient's gender | "female" |
| `citizenship` | text | ✅ | Patient's nationality | "South Sudanese" |
| `hometown` | text | ✅ | Patient's place of origin | "Juba" |
| `phone` | text | ✅ | Contact phone number | "+256 783 412 567" |
| `camp` | text | ✅ | Refugee camp or settlement | "Bidi Bidi Refugee Settlement (Uganda)" |
| `government_id` | text | ✅ | Official government ID | "SSD-001283" |
| `external_patient_id` | text | ✅ | Internal patient ID | "P0001" |
| `primary_clinic_id` | select | ✅ | Assigned clinic | "Bidi Bidi Health Centre IV" |

### Field Details

#### Sex Field Options
- `male` - Male
- `female` - Female

#### Primary Clinic Field
The primary clinic field is populated dynamically from the clinics database table.

---

## 👥 Sample Patient Data

### Complete Dataset

The following 10 patients represent a diverse sample of refugee patients across different camps and clinics:

#### 1. Amina Hassan
- **Patient ID**: P0001
- **Date of Birth**: 1991-03-12
- **Sex**: female
- **Citizenship**: South Sudanese
- **Hometown**: Juba
- **Phone**: +256 783 412 567
- **Camp**: Bidi Bidi Refugee Settlement (Uganda)
- **Government ID**: SSD-001283
- **Primary Clinic**: Bidi Bidi Health Centre IV

#### 2. Peter Odong
- **Patient ID**: P0002
- **Date of Birth**: 1988-09-05
- **Sex**: male
- **Citizenship**: Ugandan
- **Hometown**: Arua
- **Phone**: +256 772 314 890
- **Camp**: Rhino Camp Refugee Settlement (Uganda)
- **Government ID**: UGA-008432
- **Primary Clinic**: Rhino Camp Health Post

#### 3. Grace Nyambura
- **Patient ID**: P0003
- **Date of Birth**: 1994-11-23
- **Sex**: female
- **Citizenship**: Kenyan
- **Hometown**: Nakuru
- **Phone**: +254 712 349 876
- **Camp**: Kakuma Refugee Camp (Kenya)
- **Government ID**: KEN-012345
- **Primary Clinic**: Kakuma General Hospital

#### 4. Jean Kalume
- **Patient ID**: P0004
- **Date of Birth**: 1985-01-16
- **Sex**: male
- **Citizenship**: Congolese (DRC)
- **Hometown**: Goma
- **Phone**: +243 824 657 321
- **Camp**: Kyaka II Refugee Settlement (Uganda)
- **Government ID**: DRC-098712
- **Primary Clinic**: Kyaka II Medical Centre

#### 5. Fatuma Abdallah
- **Patient ID**: P0005
- **Date of Birth**: 1997-06-29
- **Sex**: female
- **Citizenship**: Somali
- **Hometown**: Kismayo
- **Phone**: +256 701 456 832
- **Camp**: Kiryandongo Refugee Settlement (Uganda)
- **Government ID**: SOM-004321
- **Primary Clinic**: Kiryandongo HC III

#### 6. David Mutabazi
- **Patient ID**: P0006
- **Date of Birth**: 1992-02-10
- **Sex**: male
- **Citizenship**: Rwandan
- **Hometown**: Kigali
- **Phone**: +256 751 239 870
- **Camp**: Nakivale Refugee Settlement (Uganda)
- **Government ID**: RWA-007658
- **Primary Clinic**: Nakivale Main Clinic

#### 7. Sarah Ladu
- **Patient ID**: P0007
- **Date of Birth**: 2000-07-14
- **Sex**: female
- **Citizenship**: South Sudanese
- **Hometown**: Yei
- **Phone**: +256 789 023 456
- **Camp**: Palorinya Refugee Settlement (Uganda)
- **Government ID**: SSD-009876
- **Primary Clinic**: Palorinya Health Centre III

#### 8. James Mumbere
- **Patient ID**: P0008
- **Date of Birth**: 1986-10-02
- **Sex**: male
- **Citizenship**: Congolese (DRC)
- **Hometown**: Beni
- **Phone**: +256 778 564 230
- **Camp**: Rwamwanja Refugee Settlement (Uganda)
- **Government ID**: DRC-056732
- **Primary Clinic**: Rwamwanja Clinic A

#### 9. Mary Atieno
- **Patient ID**: P0009
- **Date of Birth**: 1999-05-19
- **Sex**: female
- **Citizenship**: Kenyan
- **Hometown**: Kisumu
- **Phone**: +254 701 982 347
- **Camp**: Dadaab Refugee Camp (Kenya)
- **Government ID**: KEN-067894
- **Primary Clinic**: Dadaab Medical Unit 2

#### 10. Yusuf Hamisi
- **Patient ID**: P0010
- **Date of Birth**: 1993-08-11
- **Sex**: male
- **Citizenship**: Tanzanian
- **Hometown**: Kigoma
- **Phone**: +255 689 432 105
- **Camp**: Nyarugusu Refugee Camp (Tanzania)
- **Government ID**: TAN-032198
- **Primary Clinic**: Nyarugusu Health Post

---

## 📅 Appointment Management

### Form Configuration

The appointment form is located at `/app/appointments/edit/[id]` and contains the following fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `patient_id` | select | ✅ | Patient selection | "Amina Hassan" |
| `clinic_id` | select | ✅ | Clinic selection | "Bidi Bidi Health Centre IV" |
| `provider_id` | select | ✅ | Healthcare provider | "Dr. John Smith" |
| `timestamp` | datetime | ✅ | Appointment date and time | "2025-11-15 09:00" |
| `duration` | number | ✅ | Duration in minutes | 30 |
| `reason` | text | ✅ | Appointment reason | "Diabetes management follow-up" |
| `status` | select | ✅ | Appointment status | "confirmed" |
| `notes` | textarea | ❌ | Additional notes | "Patient needs blood sugar monitoring" |
| `departments` | array | ✅ | Department assignments | ["General Medicine"] |
| `is_walk_in` | boolean | ❌ | Walk-in appointment | false |

### Appointment Status Options
- `pending` - Appointment scheduled but not confirmed
- `confirmed` - Appointment confirmed by patient/staff
- `checked_in` - Patient has arrived
- `completed` - Appointment finished
- `cancelled` - Appointment cancelled

### Department Status Options
- `pending` - Not yet seen
- `in_progress` - Currently being seen
- `completed` - Department visit finished
- `cancelled` - Department visit cancelled
- `checked_in` - Patient checked into department

---

## 📋 Sample Appointment Data

### Complete Dataset

The following appointments have been created for our sample patients:

| Patient | Clinic | Department | Date | Time | Status | Reason |
|---------|--------|------------|------|------|--------|---------|
| Amina Hassan | Bidi Bidi Health Centre IV | General Medicine | 2025-11-15 | 09:00 | confirmed | Diabetes management follow-up |
| Peter Odong | Rhino Camp Health Post | Emergency | 2025-11-16 | 14:30 | pending | Chest pain evaluation |
| Grace Nyambura | Kakuma General Hospital | Pediatrics | 2025-11-17 | 10:15 | confirmed | Child vaccination |
| Mohamed Ali | Dadaab Medical Unit 2 | Cardiology | 2025-11-18 | 11:00 | confirmed | Heart condition assessment |
| Sarah Johnson | Kiryandongo HC III | Obstetrics | 2025-11-19 | 08:30 | confirmed | Prenatal checkup |
| Ahmed Hassan | Kyaka II Medical Centre | Orthopedics | 2025-11-20 | 15:00 | confirmed | Fracture healing check |
| Mary Akello | Nakivale Main Clinic | Dermatology | 2025-11-21 | 13:45 | pending | Skin condition treatment |
| John Mwangi | Nyarugusu Health Post | General Medicine | 2025-11-22 | 09:30 | confirmed | Annual health check |
| Fatima Omar | Palorinya Health Centre III | Pediatrics | 2025-11-23 | 16:00 | checked_in | Child fever |
| David Kiprop | Rwamwanja Clinic A | Mental Health | 2025-11-24 | 10:00 | confirmed | Mental health assessment |

### Appointment Types
- **Follow-up** - Regular follow-up appointments
- **Urgent** - Urgent medical attention needed
- **Routine** - Regular checkups and vaccinations
- **Consultation** - Specialist consultations
- **Prenatal** - Pregnancy-related appointments
- **Emergency** - Emergency medical situations

### Department Coverage
- **General Medicine** - Primary care and general health
- **Emergency** - Urgent medical situations
- **Pediatrics** - Child healthcare
- **Cardiology** - Heart and cardiovascular care
- **Obstetrics** - Pregnancy and women's health
- **Orthopedics** - Bone and joint care
- **Dermatology** - Skin condition treatment
- **Mental Health** - Psychological and psychiatric care

---

## 🏥 Clinic Department Management

### Form Configuration

The clinic department form is embedded within the clinic detail page at `/app/clinics/[id]` and contains the following fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | text | ✅ | Department name | "Emergency Department" |
| `code` | text | ❌ | Department code | "ED" |
| `description` | textarea | ❌ | Department description | "Emergency medical care and urgent treatment" |
| `can_dispense_medications` | boolean | ❌ | Can dispense medications | true |
| `can_perform_labs` | boolean | ❌ | Can perform laboratory tests | true |
| `can_perform_imaging` | boolean | ❌ | Can perform imaging | false |
| `additional_capabilities` | array | ❌ | Additional capabilities | ["Trauma care", "Emergency surgery"] |

### Department Status Options
- `active` - Department is operational
- `inactive` - Department is temporarily closed
- `maintenance` - Department under maintenance

### Department Capabilities
- **Medications**: Can dispense and manage medications
- **Laboratory**: Can perform laboratory tests and diagnostics
- **Imaging**: Can perform medical imaging (X-rays, ultrasound, etc.)

---

## 📋 Sample Department Data

### Complete Dataset

The following departments have been created across all clinics:

| Clinic Type | Departments | Total |
|-------------|-------------|-------|
| **Health Centre IV** | General Medicine, Emergency, Pediatrics, Laboratory, Pharmacy, Maternal Health, Radiology, Surgery | 8 |
| **General Hospital** | General Medicine, Emergency, Pediatrics, Laboratory, Pharmacy, Maternal Health, Mental Health, Radiology, Surgery, Outpatient Services | 10 |
| **Health Post** | General Medicine, Emergency, Pediatrics, Pharmacy, Maternal Health | 5 |
| **Medical Unit** | General Medicine, Emergency, Pediatrics, Laboratory, Pharmacy, Maternal Health | 6 |
| **Medical Centre** | General Medicine, Emergency, Pediatrics, Laboratory, Pharmacy, Maternal Health, Mental Health, Radiology | 8 |
| **Clinic** | General Medicine, Emergency, Pediatrics, Pharmacy, Maternal Health, Mental Health | 6 |

### Department Types and Capabilities

#### Core Departments (All Clinics)
- **General Medicine (GM)**: Primary care, medications, labs
- **Emergency Department (ED)**: Emergency care, medications, labs, imaging
- **Pediatrics (PED)**: Child healthcare, medications, labs
- **Pharmacy (PHARM)**: Medication dispensing
- **Maternal Health (MH)**: Prenatal/postnatal care, medications, labs, imaging

#### Specialized Departments
- **Laboratory (LAB)**: Medical testing and diagnostics
- **Radiology (RAD)**: Medical imaging services
- **Surgery (SURG)**: Surgical procedures, medications, labs, imaging
- **Mental Health (MH)**: Psychological care, medications
- **Outpatient Services (OPD)**: Consultations and follow-up care

### Department Distribution by Clinic

#### Large Facilities (8-10 departments)
- **Kakuma General Hospital**: 10 departments (full service)
- **Bidi Bidi Health Centre IV**: 8 departments
- **Kyaka II Medical Centre**: 8 departments

#### Medium Facilities (6 departments)
- **Hikma Clinic**: 6 departments
- **Nakivale Main Clinic**: 6 departments
- **Rwamwanja Clinic A**: 6 departments
- **Dadaab Medical Unit 2**: 6 departments

#### Small Facilities (5 departments)
- **Rhino Camp Health Post**: 5 departments
- **Kiryandongo HC III**: 5 departments
- **Palorinya Health Centre III**: 5 departments
- **Nyarugusu Health Post**: 5 departments

---

## 💊 Prescription Management

### Form Configuration

The prescription form is located at `/app/prescriptions/edit/[id]` and contains the following fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `patient_id` | select | ✅ | Patient selection | "Amina Hassan" |
| `provider_id` | select | ✅ | Healthcare provider | "Dr. John Smith" |
| `pickup_clinic_id` | select | ✅ | Clinic for pickup | "Bidi Bidi Health Centre IV" |
| `visit_id` | select | ✅ | Associated visit | "Visit #12345" |
| `priority` | select | ✅ | Prescription priority | "normal" |
| `status` | select | ✅ | Prescription status | "prepared" |
| `prescribed_at` | datetime | ✅ | Prescription date | "2025-11-15" |
| `expiration_date` | date | ✅ | Expiration date | "2025-12-15" |
| `filled_at` | datetime | ❌ | Filled date | "2025-11-15" |
| `items` | array | ✅ | Medication items | [{"medication_name": "Metformin", "dosage": "500mg"}] |
| `notes` | textarea | ❌ | Additional notes | "Take with food" |

### Prescription Priority Options
- `normal` - Standard prescription
- `high` - Urgent prescription
- `low` - Non-urgent prescription
- `emergency` - Emergency medication

### Prescription Status Options
- `pending` - Prescription created but not prepared
- `prepared` - Medication prepared and ready for pickup
- `picked-up` - Patient has collected medication
- `not-picked-up` - Patient did not collect medication
- `partially-picked-up` - Patient collected some medications
- `cancelled` - Prescription cancelled
- `other` - Other status

### Medication Item Structure
Each prescription item contains:
- `medication_name`: Name of the medication
- `dosage`: Strength/dosage (e.g., "500mg", "10 units")
- `frequency`: How often to take (e.g., "Twice daily")
- `duration`: Length of treatment (e.g., "30 days")
- `quantity`: Number of units
- `instructions`: Special instructions

---

## 📋 Sample Prescription Data

### Complete Dataset

The following prescriptions have been created for our sample patients:

| Patient | Clinic | Medication | Dosage | Status | Priority | Prescribed Date |
|---------|--------|------------|--------|--------|----------|-----------------|
| Amina Hassan | Bidi Bidi Health Centre IV | Metformin | 500mg | prepared | normal | 2025-11-15 |
| Amina Hassan | Bidi Bidi Health Centre IV | Insulin | 10 units | prepared | high | 2025-11-15 |
| Peter Odong | Rhino Camp Health Post | Aspirin | 81mg | prepared | high | 2025-11-16 |
| Peter Odong | Rhino Camp Health Post | Nitroglycerin | 0.4mg | prepared | emergency | 2025-11-16 |
| Grace Nyambura | Kakuma General Hospital | Paracetamol | 500mg | prepared | normal | 2025-11-17 |
| Mohamed Ali | Dadaab Medical Unit 2 | Lisinopril | 10mg | prepared | high | 2025-11-18 |
| Sarah Johnson | Kiryandongo HC III | Prenatal Vitamins | 1 tablet | prepared | normal | 2025-11-19 |
| Ahmed Hassan | Kyaka II Medical Centre | Ibuprofen | 400mg | prepared | normal | 2025-11-20 |
| Mary Akello | Nakivale Main Clinic | Hydrocortisone Cream | 1% | prepared | normal | 2025-11-21 |
| John Mwangi | Nyarugusu Health Post | Multivitamin | 1 tablet | prepared | low | 2025-11-22 |
| Fatima Omar | Palorinya Health Centre III | Amoxicillin | 250mg | prepared | high | 2025-11-23 |
| David Kiprop | Rwamwanja Clinic A | Sertraline | 50mg | prepared | normal | 2025-11-24 |

### Medication Categories

#### Chronic Disease Management
- **Metformin** (500mg) - Diabetes management
- **Insulin** (10 units) - Diabetes treatment
- **Lisinopril** (10mg) - Heart condition management
- **Sertraline** (50mg) - Mental health treatment

#### Acute Conditions
- **Aspirin** (81mg) - Chest pain evaluation
- **Nitroglycerin** (0.4mg) - Emergency chest pain relief
- **Paracetamol** (500mg) - Post-vaccination fever
- **Ibuprofen** (400mg) - Fracture pain management
- **Amoxicillin** (250mg) - Bacterial infection

#### Preventive Care
- **Prenatal Vitamins** (1 tablet) - Pregnancy care
- **Multivitamin** (1 tablet) - General health maintenance
- **Hydrocortisone Cream** (1%) - Skin condition treatment

### Status Distribution
- **Prepared**: 12 prescriptions (100%)

### Priority Distribution
- **Normal**: 6 prescriptions (50%)
- **High**: 4 prescriptions (33%)
- **Low**: 1 prescription (8%)
- **Emergency**: 1 prescription (8%)

---

## 📋 Event Form Builder

### Form Configuration

The event form builder is located at `/app/event-forms/edit/[id]` and provides a dynamic form creation system with the following features:

| Feature | Description | Example |
|---------|-------------|---------|
| **Form Name** | Custom form title | "Emergency Triage Assessment" |
| **Description** | Form purpose and usage | "Comprehensive triage form for emergency department patients" |
| **Language** | Form language | "en" (English) |
| **Editable** | Whether form can be modified | true/false |
| **Snapshot Form** | Whether form creates snapshots | true/false |
| **Form Fields** | Dynamic field configuration | Array of field objects |

### Supported Field Types

| Field Type | Description | Validation Options | Example |
|------------|-------------|-------------------|---------|
| `text` | Single-line text input | minLength, maxLength | Patient name |
| `textarea` | Multi-line text input | minLength, maxLength | Chief complaint |
| `number` | Numeric input | min, max | Pain level (1-10) |
| `select` | Dropdown selection | options array | Triage priority |
| `checkbox` | Multiple selection | options array | Symptoms checklist |
| `date` | Date picker | date validation | Vaccination date |
| `radio` | Single selection | options array | Risk level |

### Field Configuration Properties

Each field can have the following properties:
- `id`: Unique field identifier (UUID)
- `type`: Field type (text, textarea, number, select, checkbox, date, radio)
- `label`: Field display label
- `required`: Whether field is mandatory
- `placeholder`: Placeholder text
- `validation`: Validation rules (min, max, minLength, maxLength)
- `options`: Available options (for select, checkbox, radio fields)

---

## 📋 Sample Event Forms

### Complete Dataset

The following event forms have been created for different healthcare scenarios:

| Form Name | Category | Fields | Description |
|-----------|----------|--------|-------------|
| Emergency Triage Assessment | Emergency | 5 | Comprehensive triage form for emergency department patients |
| Prenatal Care Visit | Maternal | 5 | Standard prenatal care assessment form |
| Mental Health Assessment | Mental Health | 5 | Comprehensive mental health evaluation form |
| Chronic Disease Management | Chronic Care | 6 | Follow-up form for chronic disease patients |
| Pediatric Growth Assessment | Pediatrics | 6 | Growth and development tracking for children |
| Vaccination Record | Immunization | 6 | Immunization tracking and documentation |

### Form Categories and Use Cases

#### Emergency Care
- **Emergency Triage Assessment**: Patient prioritization, vital signs, chief complaint, pain assessment

#### Maternal Health
- **Prenatal Care Visit**: Gestational age, risk assessment, symptoms, weight tracking, notes

#### Mental Health
- **Mental Health Assessment**: Mood evaluation, symptom checklist, PHQ-9 scoring, suicide risk assessment

#### Chronic Disease Management
- **Chronic Disease Management**: Disease type, vital signs, medication adherence, side effects, lifestyle changes

#### Pediatric Care
- **Pediatric Growth Assessment**: Age, weight, height, growth percentiles, developmental milestones

#### Immunization
- **Vaccination Record**: Vaccine type, batch number, dates, injection site, adverse reactions

### Field Distribution

| Field Type | Count | Percentage | Use Cases |
|------------|-------|------------|-----------|
| **Select** | 8 | 24% | Priority levels, risk assessments, categories |
| **Text** | 7 | 21% | Names, measurements, identifiers |
| **Checkbox** | 6 | 18% | Symptom lists, multiple selections |
| **Textarea** | 5 | 15% | Notes, descriptions, complaints |
| **Number** | 4 | 12% | Scores, measurements, counts |
| **Date** | 3 | 9% | Dates, appointments, schedules |

### Form Statistics
- **Total Forms**: 6
- **Total Fields**: 33
- **Categories**: 6
- **Average Fields per Form**: 5.5
- **Editable Forms**: 6 (100%)
- **Snapshot Forms**: 1 (17%)

---

## 🏥 Clinic Management

### Available Clinics

The system includes 11 clinics across different refugee settlements:

| Clinic Name | Location | Country |
|-------------|----------|---------|
| Hikma Clinic | - | - |
| Bidi Bidi Health Centre IV | Bidi Bidi Refugee Settlement | Uganda |
| Rhino Camp Health Post | Rhino Camp Refugee Settlement | Uganda |
| Kakuma General Hospital | Kakuma Refugee Camp | Kenya |
| Kyaka II Medical Centre | Kyaka II Refugee Settlement | Uganda |
| Kiryandongo HC III | Kiryandongo Refugee Settlement | Uganda |
| Nakivale Main Clinic | Nakivale Refugee Settlement | Uganda |
| Palorinya Health Centre III | Palorinya Refugee Settlement | Uganda |
| Rwamwanja Clinic A | Rwamwanja Refugee Settlement | Uganda |
| Dadaab Medical Unit 2 | Dadaab Refugee Camp | Kenya |
| Nyarugusu Health Post | Nyarugusu Refugee Camp | Tanzania |

### Clinic Data Structure

Each clinic record contains:
- `id`: Unique UUID identifier
- `name`: Clinic name
- `is_deleted`: Soft delete flag
- `is_archived`: Archive status
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

---

## 🛠️ Database Setup Scripts

### Available Scripts

| Script | Purpose | Command | Status |
|--------|---------|---------|--------|
| `mass-patient-registration.ts` | Create sample patients | `npx tsx scripts/mass-patient-registration.ts` | ✅ Complete |
| `create-sample-appointments.ts` | Create sample appointments | `npx tsx scripts/create-sample-appointments.ts` | ✅ Complete |
| `create-sample-departments.ts` | Create sample departments | `npx tsx scripts/create-sample-departments.ts` | ✅ Complete |
| `create-sample-prescriptions.ts` | Create sample prescriptions | `npx tsx scripts/create-sample-prescriptions.ts` | ✅ Complete |
| `create-sample-event-forms.ts` | Create sample event forms | `npx tsx scripts/create-sample-event-forms.ts` | ✅ Complete |
| `list-clinics.ts` | List all clinics | `npx tsx scripts/list-clinics.ts` | ✅ Complete |

### Script Usage Notes
- **Default behavior**: Scripts skip creation if data already exists to prevent duplicates
- **Cleanup mode**: Add `--cleanup` flag to remove existing data and recreate
- **Example**: `npx tsx scripts/create-sample-prescriptions.ts --cleanup`

### Script Details

#### Mass Patient Registration
- **File**: `scripts/mass-patient-registration.ts`
- **Purpose**: Creates 10 sample patients with realistic data
- **Features**: 
  - Matches patients to appropriate clinics
  - Includes diverse demographics
  - Covers multiple refugee settlements
- **Output**: 10 patients created successfully

#### Sample Appointment Creation
- **File**: `scripts/create-sample-appointments.ts`
- **Purpose**: Creates 10 sample appointments for existing patients
- **Features**:
  - Links appointments to existing patients and clinics
  - Creates associated visits
  - Includes various appointment types and departments
  - Uses future dates (November 2025)
- **Output**: 10 appointments created successfully

#### Sample Department Creation
- **File**: `scripts/create-sample-departments.ts`
- **Purpose**: Creates sample departments for all clinics
- **Features**:
  - Assigns departments based on clinic type (Health Centre IV, General Hospital, etc.)
  - Includes realistic capabilities (medications, labs, imaging)
  - Creates 70 departments across 11 clinics
  - Varies department count by clinic size
- **Output**: 70 departments created successfully

#### Sample Prescription Creation
- **File**: `scripts/create-sample-prescriptions.ts`
- **Purpose**: Creates sample prescriptions for existing patients
- **Features**:
  - Links prescriptions to existing patients, clinics, and providers
  - Creates associated visits for each prescription
  - Includes realistic medication data (dosages, frequencies, instructions)
  - Covers various medication categories (chronic, acute, preventive)
  - Uses different priorities and statuses
- **Output**: 12 prescriptions created successfully

#### Sample Event Form Creation
- **File**: `scripts/create-sample-event-forms.ts`
- **Purpose**: Creates sample event forms for different healthcare scenarios
- **Features**:
  - Creates 6 comprehensive event forms across 6 categories
  - Includes 33 total fields with various field types
  - Covers emergency, maternal, mental health, chronic care, pediatrics, immunization
  - Uses realistic healthcare form structures and validation
- **Output**: 6 event forms created successfully

#### Clinic Listing
- **File**: `scripts/list-clinics.ts`
- **Purpose**: Lists all clinics in the database
- **Features**: Shows clinic names, IDs, and creation dates
- **Output**: 11 clinics found

---
## 📝 Form Field Types

### Supported Field Types

| Type | Description | Validation | Example |
|------|-------------|------------|---------|
| `text` | Single-line text input | Required, non-empty | "Amina" |
| `select` | Dropdown selection | Required, valid option | "female" |
| `date` | Date picker | Required, valid date | "1991-03-12" |
| `number` | Numeric input | Optional, valid number | 25 |
| `boolean` | Checkbox/toggle | Optional, true/false | true |

### Field Configuration Properties

Each field can have the following properties:
- `id`: Unique identifier (UUID)
- `column`: Database column name
- `label`: Multi-language label object
- `fieldType`: Input type
- `options`: Available options (for select fields)
- `visible`: Whether field is shown
- `required`: Whether field is mandatory
- `deleted`: Soft delete flag
- `isSearchField`: Whether field is searchable
- `showsInSummary`: Whether field appears in summaries

---

## ✅ Data Validation Rules

### Patient Registration Validation

1. **Required Fields**: All fields marked as `required: true` must be provided
2. **Date Format**: Dates must be in `YYYY-MM-DD` format
3. **Phone Numbers**: Should include country code (e.g., +256)
4. **Sex Values**: Must be exactly "male" or "female" (lowercase)
5. **Clinic Selection**: Must select a valid clinic from the dropdown
6. **Government ID**: Should follow country-specific format
7. **Patient ID**: Must be unique within the system

### Data Format Standards

#### Dates
- **Format**: `YYYY-MM-DD`
- **Example**: `1991-03-12`
- **Validation**: Must be valid date, not in future

#### Phone Numbers
- **Format**: `+[country code] [number]`
- **Examples**: 
  - `+256 783 412 567` (Uganda)
  - `+254 712 349 876` (Kenya)
  - `+243 824 657 321` (DRC)

#### Government IDs
- **Format**: `[COUNTRY_CODE]-[NUMBER]`
- **Examples**:
  - `SSD-001283` (South Sudan)
  - `UGA-008432` (Uganda)
  - `KEN-012345` (Kenya)

#### Patient IDs
- **Format**: `P[4-digit number]`
- **Examples**: `P0001`, `P0002`, `P0010`
- **Validation**: Must be unique

---

## 🚀 Usage Instructions

### Setting Up Sample Data

1. **Create Clinics**:
   ```bash
   npx tsx scripts/create-sample-clinic.ts
   ```

2. **Create Registration Form**:
   ```bash
   npx tsx scripts/create-default-registration-form.ts
   ```

3. **Register Sample Patients**:
   ```bash
   npx tsx scripts/mass-patient-registration.ts
   ```

### Verifying Data

1. **List Clinics**:
   ```bash
   npx tsx scripts/list-clinics.ts
   ```

2. **Check Registration Form**:
   - Navigate to `/app/patients/register`
   - Verify all fields are present and working

### Testing Registration

1. **Manual Testing**:
   - Use the web form at `http://localhost:3001/app/patients/register`
   - Fill in sample data and submit

2. **Bulk Testing**:
   - Run the mass registration script
   - Verify all patients are created successfully

---

## 📊 Data Statistics

### Current Database State

- **Clinics**: 11 total
- **Registration Forms**: 1 (default form with 11 fields)
- **Sample Patients**: 10 registered
- **Countries Represented**: 6 (South Sudan, Uganda, Kenya, DRC, Rwanda, Somalia, Tanzania)
- **Refugee Camps**: 10 different settlements

### Geographic Distribution

- **Uganda**: 6 camps (Bidi Bidi, Rhino Camp, Kyaka II, Kiryandongo, Nakivale, Palorinya, Rwamwanja)
- **Kenya**: 2 camps (Kakuma, Dadaab)
- **Tanzania**: 1 camp (Nyarugusu)

---

## 🔧 Technical Notes

### Database Schema

The patient registration system uses the following key tables:
- `patients`: Main patient records
- `patient_additional_attributes`: Extended patient data
- `clinics`: Clinic information
- `patient_registration_forms`: Form configurations

### Form Rendering

The registration form uses:
- React Hook Form for form management
- SelectInput component for dropdowns
- DatePickerInput for date selection
- Proper validation and error handling

### Error Handling

The system includes comprehensive error handling for:
- SQL syntax errors
- UUID serialization issues
- Missing required fields
- Invalid data formats
- Database connection issues

## 🔧 Technical Fixes Applied

### Event Form Builder UI Fixes
- **Issue**: Duplicate field names error when adding multiple Medicine or Diagnosis fields
- **Root Cause**: Hardcoded field names ("Medication", "ICD 11 Diagnosis") in ComponentRegistry
- **Solution**: Changed hardcoded names to empty strings (`name: ""`) for user customization
- **Files Modified**: `src/routes/app/event-forms.edit.$.tsx`
- **Result**: Users can now add multiple fields of the same type without conflicts

### Sample Data Script Improvements
- **Issue**: Scripts creating duplicate data on multiple runs
- **Solution**: Implemented duplicate prevention logic and `--cleanup` flag
- **Features Added**:
  - Check for existing records before creation
  - Skip creation if data already exists
  - `--cleanup` flag to soft delete and recreate data
  - Comprehensive logging and status messages
- **Scripts Updated**: All sample data creation scripts
- **Result**: Clean, non-duplicate data management

### Database Schema Fixes
- **Issue**: UUID serialization errors with Option types
- **Solution**: Extract raw values from Option types before database insertion
- **Issue**: Missing foreign key constraints (visit_id for appointments)
- **Solution**: Create visit records before creating appointments
- **Issue**: Column name mismatches (first_name vs name, scheduled_date vs timestamp)
- **Solution**: Corrected column names to match database schema
- **Result**: All database operations working correctly

### Form Field Type Corrections
- **Issue**: primary_clinic_id field not appearing as dropdown
- **Solution**: Changed fieldType from "text" to "select" in registration form
- **Issue**: Empty form fields causing SQL syntax errors
- **Solution**: Added conditional checks for empty arrays before database insertion
- **Result**: All form fields rendering and saving correctly

---
