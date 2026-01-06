# Hikma Health System - End User Training Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Role-Based Access Overview](#role-based-access-overview)
4. [Patient Registration](#patient-registration)
5. [Form Usage - General](#form-usage-general)
6. [Nutrition Services Form - Detailed Guide](#nutrition-services-form-detailed-guide)
7. [Orphan Location Forms](#orphan-location-forms)
8. [Skip Logic Explained](#skip-logic-explained)
9. [Common Tasks by Role](#common-tasks-by-role)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

### What is Hikma Health System?
Hikma Health is a comprehensive health information management system designed to track patient care, manage clinical forms, and support healthcare delivery across multiple clinics.

**[SCREENSHOT PLACEHOLDER: System dashboard/homepage]**

### Key Features
- **Patient Management**: Register and track patients across clinics
- **Clinical Forms**: Fill out structured forms for different services
- **Bilingual Interface**: English and Arabic support
- **Role-Based Access**: Different access levels based on your role
- **Skip Logic**: Forms adapt based on your answers

---

## Getting Started

### 1. Logging In

**Step 1:** Navigate to the login page
- Enter your email address (case-sensitive)
- Enter your password
- Click "Sign In"

**[SCREENSHOT PLACEHOLDER: Login page]**

**Important Notes:**
- Email addresses are case-sensitive (e.g., `User@Example.com` is different from `user@example.com`)
- If you forget your password, contact your system administrator

**Step 2:** After login, you'll see:
- Your assigned clinic(s) in the top-left corner
- Navigation menu on the left sidebar
- Dashboard with overview information

**[SCREENSHOT PLACEHOLDER: Post-login dashboard view]**

### 2. Understanding the Navigation Menu

The left sidebar contains the main navigation:

- **Dashboard** 📊 - Overview and statistics
- **Patients** 👥 - Patient list, registration, and management
- **Event Forms** 📋 - Clinical forms and templates
- **Users** 👤 - User management (admin roles only)
- **Clinics** 🏥 - Clinic management (admin roles only)
- **Appointments** 📅 - Schedule and manage appointments
- **Prescriptions** 💊 - Prescription management
- **Data Analysis** 📈 - Reports and analytics
- **Settings** ⚙️ - System settings (admin roles only)

**[SCREENSHOT PLACEHOLDER: Navigation sidebar with labels]**

### 3. Language Toggle

You can switch between English and Arabic:
- Click the language toggle button (usually in the top-right or sidebar)
- The interface will update immediately
- Form descriptions always appear in Arabic, regardless of UI language

**[SCREENSHOT PLACEHOLDER: Language toggle button and Arabic interface]**

---

## Role-Based Access Overview

### Understanding Your Role

Your role determines what you can see and do in the system. Here's a quick overview:

#### **Super Admin** (Full System Access)
- Can see and manage everything across all clinics
- Can create/edit/delete users, clinics, and forms
- Can access all patient records
- Can manage system settings

#### **Admin / Project Manager / Technical Advisor / Team Leader / M&E Officer / IM Associate** (Clinic Admin Access)
- Can see and manage everything within assigned clinic(s)
- Can view all forms submitted by caseworkers
- Can create/edit users within clinic
- **Cannot access Nutrition clinic** (for Orphan Project roles)

#### **Provider** (Clinical Access)
- Can view and edit assigned patients only
- Can fill out clinical forms for assigned patients
- Can manage prescriptions for assigned patients
- Cannot delete records or manage users

#### **Caseworker (CW1-CW4)** (Restricted Access)
- Can register new patients
- Can only see patients they created
- Can access all form templates (empty forms)
- Can submit their own forms
- **Cannot see forms submitted by other caseworkers**
- **Cannot access Nutrition clinic**

#### **Registrar** (Registration Only)
- Can register new patients
- Can schedule appointments
- Can view prescriptions (read-only)
- Cannot access clinical forms or patient history

**[SCREENSHOT PLACEHOLDER: Role comparison table/diagram]**

---

## Patient Registration

### Who Can Register Patients?
- Super Admins
- Admins
- Providers
- Caseworkers
- Registrars

### Step-by-Step: Registering a New Patient

**Step 1:** Navigate to Patient Registration
- Click **Patients** in the sidebar
- Click **Register New Patient**

**[SCREENSHOT PLACEHOLDER: Navigation to patient registration]**

**Step 2:** Fill in Required Information
The registration form includes bilingual labels (English above, Arabic below):

- **First Name** / **الاسم المعطى** (Required)
- **Last Name** / **الكنية** (Required)
- **Date of Birth** / **تاريخ الولادة** (Required)
- **Sex** / **الجنس** (Required) - Select from dropdown
- **Citizenship** / **الجنسية** (Required)
- **Hometown** / **مسقط الرأس** (Required)
- **Phone** / **الهاتف** (Required)
- **Camp** / **المخيم** (Optional)
- **Government ID** / **الهوية الحكومية** (Required)
- **Patient ID** / **رقم المريض** (Required)
- **Primary Clinic** / **العيادة الأساسية** (Required) - Select from dropdown

**[SCREENSHOT PLACEHOLDER: Patient registration form with bilingual labels visible]**

**Step 3:** Select Primary Clinic
- Click the **Primary Clinic** dropdown
- You'll only see clinics you have access to
- Caseworkers will only see "Orphan Clinic"
- Nutrition staff will see "Nutrition" clinic

**[SCREENSHOT PLACEHOLDER: Clinic selection dropdown]**

**Step 4:** Submit Registration
- Review all information
- Click **Save** or **Submit**
- You'll see a success message
- The patient will appear in your patient list

**[SCREENSHOT PLACEHOLDER: Success message after registration]**

### Viewing Your Patients

**For Caseworkers:**
- You'll only see patients you created
- Click **Patients** → **Patients List**
- Use search to find specific patients

**For Admins/Providers:**
- You'll see all patients in your assigned clinic(s)
- Can filter by various criteria

**[SCREENSHOT PLACEHOLDER: Patient list view showing filtered results]**

---

## Form Usage - General

### What Are Event Forms?
Event forms are structured questionnaires used to record clinical encounters, assessments, and services provided to patients.

### Form Structure
Each form has:
- **Title** (in English)
- **Description** (always in Arabic, regardless of UI language)
- **Questions/Fields** (bilingual - English and Arabic)

**[SCREENSHOT PLACEHOLDER: Form header showing title and Arabic description]**

### Accessing Forms

**Step 1:** Select a Patient
- Go to **Patients** → **Patients List**
- Click on a patient's name or the actions button
- This opens the patient's chart

**[SCREENSHOT PLACEHOLDER: Patient list with actions button highlighted]**

**Step 2:** Navigate to Forms
- In the patient chart, look for **Event Forms** or **Forms** section
- Or navigate directly: Click **Event Forms** in sidebar → Select form → Enter patient ID

**[SCREENSHOT PLACEHOLDER: Patient chart showing forms section]**

**Step 3:** Select a Form
- You'll see a list of available forms
- Forms are filtered by your clinic access
- Click on the form you want to fill out

**[SCREENSHOT PLACEHOLDER: Form selection page]**

### Filling Out Forms

**Understanding Bilingual Fields:**
- Each question shows English text on top
- Arabic translation appears below in smaller, gray text
- Both languages are always visible

**[SCREENSHOT PLACEHOLDER: Form field showing bilingual label]**

**Field Types:**
1. **Text Fields** - Type your answer
2. **Select/Dropdown** - Choose one option
3. **Checkbox (Multi-select)** - Select multiple options
4. **Radio Buttons** - Choose one option from a list
5. **Number Fields** - Enter numeric values
6. **Date Fields** - Select a date from calendar

**[SCREENSHOT PLACEHOLDER: Different field types examples]**

**Required Fields:**
- Required fields are marked with an asterisk (*) or "Required" label
- You cannot submit the form until all required fields are filled

**[SCREENSHOT PLACEHOLDER: Required field indicator]**

### Form Submission

**Step 1:** Complete All Required Fields
- Fill in all fields marked as required
- Review your answers

**Step 2:** Submit the Form
- Click **Submit** or **Save** button
- You'll see a success message
- The form data is saved to the patient's record

**[SCREENSHOT PLACEHOLDER: Submit button and success message]**

**Important Notes:**
- Once submitted, caseworkers cannot edit forms submitted by others
- Admins can view and edit all forms
- Providers can edit forms for their assigned patients

---

## Nutrition Services Form - Detailed Guide

### Who Can Access This Form?
- **Nutrition Clinic Staff**: Full access
- **Orphan Project Roles**: **Cannot access** (restricted by system)

### Form Overview

The Nutrition Services Form is used to record:
- Screening services
- Treatment services (SAM/MAM)
- IYCF-E (Infant and Young Child Feeding in Emergencies) services

**[SCREENSHOT PLACEHOLDER: Nutrition form header]**

### Understanding Skip Logic in Nutrition Form

**What is Skip Logic?**
Skip logic makes forms "smart" - questions appear or disappear based on your previous answers. This makes forms shorter and more relevant.

**Example:**
- If you select "Screening" as the service type, you'll see screening-related questions
- If you select "Treatment", you'll see treatment-related questions
- Questions you don't need won't appear

### Step-by-Step: Filling the Nutrition Form

#### **Section 1: Admission & Transfer Information**
This section is always visible and required.

**[SCREENSHOT PLACEHOLDER: Section 1 fields]**

#### **Section 2: Type of Nutrition Service Received**

**Step 1:** Select Service Type
You must choose one:
- **Screening** / **فحص** - For initial assessments
- **Treatment** / **علاج** - For ongoing treatment
- **IYCF-E** / **تغذية الرضع وصغار الأطفال في الطوارئ** - For infant feeding support

**[SCREENSHOT PLACEHOLDER: Service type selection]**

**What Happens Next:**
- Based on your selection, different sections will appear
- The form adapts automatically

#### **Section 3: Screening Services** (Only if "Screening" selected)

**Step 1:** Select Who Screening is For
- **Child** / **طفل** - Screening for a child
- **Pregnant or Breastfeeding Woman (PBW)** / **امرأة حامل أو مرضع** - Screening for a mother

**[SCREENSHOT PLACEHOLDER: Screening for selection]**

**Step 2:** Demographic Information (Section 3A)
- If **Child** selected: Enter child's name and age group
- If **PBW** selected: Enter mother's name and age

**[SCREENSHOT PLACEHOLDER: Demographic fields appearing based on selection]**

**Step 3:** Screening Services Provided (Section 3B)
- **For Children**: Select all that apply:
  - MUAC measurement / **قياس محيط منتصف الذراع**
  - Oedema check / **فحص الوذمة**
  - Weight measurement / **قياس الوزن**
  - Nutrition counseling / **إرشاد تغذوي**
  - Other (specify) / **أخرى (يرجى التحديد)**

- **For PBW**: Select all that apply:
  - MUAC measurement
  - Nutrition counseling
  - Other (specify)

**[SCREENSHOT PLACEHOLDER: Multi-select checkboxes for screening services]**

**Step 4:** Referral After Screening
- Was the patient referred? **Yes** / **نعم** or **No** / **لا**
- If **Yes**, select referral types:
  - Advanced level care related to nutrition
  - OTP (not related to nutrition)
  - Inpatient care (not related to nutrition)

**[SCREENSHOT PLACEHOLDER: Referral fields appearing when "Yes" selected]**

#### **Section 4: IYCF-E Services** (Only if "IYCF-E" selected)

**Step 1:** Type of IYCF-E Support
- **Group counselling** / **إرشاد جماعي**
- **One on one counselling** / **إرشاد فردي**

**Step 2:** IYCF-E Supports Provided
Select all that apply (multi-select checkboxes):
- Infant and Young Child Feeding (IYCF) counseling
- Breastfeeding support
- Complementary feeding counseling
- Relactation support

**[SCREENSHOT PLACEHOLDER: IYCF-E supports multi-select]**

**Step 3:** Relactation Details (Only if "Relactation support" selected)
- Was relactation support provided? **Yes** / **No**
- If **Yes**, you'll see:
  - Outcome of relactation efforts
  - Session number

**[SCREENSHOT PLACEHOLDER: Relactation fields appearing conditionally]**

**Step 4:** Type of Treatment (IYCF-E)
Select all that apply from a comprehensive list including:
- Breastfeeding counselling
- Relactation support sessions
- Guidance on breast milk expression
- Support for breastfeeding difficulties
- And many more options...

**[SCREENSHOT PLACEHOLDER: IYCF-E treatment types]**

**Step 5:** Referral After IYCF-E
- Was the patient referred? **Yes** / **No**
- If **Yes**, select referral types

**Step 6:** Supplements Given
Select all that apply:
- LNS-LQ
- Cereals
- HEB
- PB5
- None

**[SCREENSHOT PLACEHOLDER: Supplements multi-select]**

#### **Section 5: Treatment Services** (Only if "Treatment" selected)

**Step 1:** Treatment Provided For
- **Child** / **طفل**
- **Pregnant or Breastfeeding Woman (PBW)** / **امرأة حامل أو مرضع**

**Step 2A: If Patient is a Child**

**Nutritional Status:**
- **SAM** / **سوء تغذية حاد وخيم** - Severe Acute Malnutrition
- **MAM** / **سوء تغذية متوسط** - Moderate Acute Malnutrition

**[SCREENSHOT PLACEHOLDER: Nutritional status selection]**

**If SAM Selected:**
- Did the child receive RUTF? **Yes** / **No**
- If **Yes**, enter **Quantity of RUTF provided**

**[SCREENSHOT PLACEHOLDER: RUTF quantity field appearing]**

**If MAM Selected:**
- Did the child receive (select all that apply):
  - **RUIF** / **أغذية علاجية جاهزة للاستخدام**
  - **HEB**
  - **None** / **لا شيء**

**[SCREENSHOT PLACEHOLDER: MAM products multi-select]**

**Quantity Fields (MAM):**
- If **RUIF** is selected, a quantity field appears: **Quantity provided | الكمية المقدّمة RUIF**
- If **HEB** is selected, a separate quantity field appears: **Quantity provided | الكمية المقدّمة HEB**
- These fields only appear when the corresponding product is selected

**[SCREENSHOT PLACEHOLDER: Quantity fields appearing based on product selection]**

**Treatment Types:**
- Type of treatment (if OTP not related to nutrition is selected)
- Select all that apply from a comprehensive list

**Referral After Treatment:**
- Was the patient referred? **Yes** / **No**
- If **Yes**, select referral types

**Step 2B: If Patient is PBW**

**Products Received:**
Select all that apply:
- **LNS-LQ** / **مكملات غذائية منخفضة الكمية**
- **Cereal** / **حبوب**
- **HEB**
- **PB5**
- **None** / **لا شيء**

**[SCREENSHOT PLACEHOLDER: PBW products multi-select]**

**Quantity Fields (PBW):**
- Each product has its own quantity field that appears when selected:
  - **LNS-LQ** → Quantity provided | الكمية المقدّمة LNS-LQ
  - **Cereal** → Quantity provided | الكمية المقدّمة Cereal
  - **HEB** → Quantity provided | الكمية المقدّمة HEB
  - **PB5** → Quantity provided | الكمية المقدّمة PB5

**[SCREENSHOT PLACEHOLDER: Multiple quantity fields appearing for PBW]**

**Important Skip Logic Note:**
- Quantity fields only appear when:
  1. The corresponding product is selected in the checkbox list
  2. "None" is NOT selected
- If you select "None", quantity fields disappear
- You can select multiple products, and each will show its quantity field

**Referral After Treatment:**
- Was the patient referred? **Yes** / **No**
- If **Yes**, select referral types

#### **Section 6: Enumerator Information**
Always required:
- **Enumerator name** / **اسم جامع البيانات**
- **Date of data collection** / **تاريخ جمع البيانات**
- **Site/Facility name** / **اسم الموقع / المرفق**

**[SCREENSHOT PLACEHOLDER: Enumerator information section]**

### Key Skip Logic Examples in Nutrition Form

**Example 1: Service Type Selection**
```
Select "Screening" → Section 3 appears
Select "Treatment" → Section 5 appears
Select "IYCF-E" → Section 4 appears
```

**Example 2: Child vs PBW**
```
Select "Child" for screening → Child-specific questions appear
Select "PBW" for screening → Mother-specific questions appear
```

**Example 3: Product Selection and Quantities**
```
Select "RUIF" in MAM products → RUIF quantity field appears
Select "HEB" in MAM products → HEB quantity field appears
Select "None" → All quantity fields disappear
```

**Example 4: Conditional Referrals**
```
Select "Was patient referred? = Yes" → Referral type fields appear
Select "Was patient referred? = No" → Referral fields are hidden
```

**[SCREENSHOT PLACEHOLDER: Before/after skip logic demonstration]**

---

## Orphan Location Forms

### Who Can Access These Forms?
- **Orphan Project Roles**: Full access (Project Manager, Technical Advisor, Team Leader, M&E Officer, IM Associate, Caseworkers)
- **Cannot access Nutrition clinic forms**

### Common Orphan Location Forms

Forms available for Orphan Clinic include:
- Case Closure Form
- Child Protection Status Form
- And other clinic-specific forms

**[SCREENSHOT PLACEHOLDER: Orphan clinic forms list]**

### Form Access for Caseworkers

**Important Restrictions:**
- Caseworkers can see **all form templates** (empty forms)
- Caseworkers can **submit their own forms**
- Caseworkers **cannot see forms submitted by other caseworkers**
- Caseworkers **cannot edit forms submitted by others**

**For Admins:**
- Can see **all submitted forms** from all caseworkers
- Can edit and validate all forms
- Can extract data from all forms

**[SCREENSHOT PLACEHOLDER: Caseworker vs Admin form view comparison]**

### Filling Out Orphan Forms

The process is similar to Nutrition forms:
1. Select a patient
2. Choose the form
3. Fill in required fields
4. Submit the form

**Skip Logic:**
- Orphan forms also use skip logic
- Questions appear/disappear based on your answers
- Follow the same principles as Nutrition form

---

## Skip Logic Explained

### What is Skip Logic?

Skip logic (also called conditional logic) makes forms intelligent by showing or hiding questions based on previous answers.

### How It Works

**Two Types of Conditions:**

1. **Show When** (AND Logic)
   - Field appears when **ALL** conditions are met
   - Example: Show "RUTF Quantity" when:
     - Service type = "Treatment" **AND**
     - Treatment for = "Child" **AND**
     - Nutritional status = "SAM" **AND**
     - Received RUTF = "Yes"

2. **Hide When** (OR Logic)
   - Field disappears when **ANY** condition is met
   - Example: Hide quantity fields when:
     - "None" is selected **OR**
     - No products are selected

### Visual Indicators

**Fields That Appear:**
- When you select an option, related fields may appear below
- They slide in smoothly
- They're marked with the same required/optional indicators

**Fields That Disappear:**
- When conditions change, fields may disappear
- Your data in those fields is saved but hidden
- If you change back, the fields reappear with your data

**[SCREENSHOT PLACEHOLDER: Animation showing fields appearing/disappearing]**

### Best Practices

1. **Answer questions in order** - Skip logic depends on previous answers
2. **Don't skip required fields** - They'll prevent form submission
3. **Review your answers** - Changing one answer may show/hide other fields
4. **Use "Other (specify)"** - When available, use this for options not listed

### Common Skip Logic Patterns

**Pattern 1: Service Type Branching**
```
Service Type Selection
├─ Screening → Screening questions
├─ Treatment → Treatment questions
└─ IYCF-E → IYCF-E questions
```

**Pattern 2: Client Type Branching**
```
Client Type Selection
├─ Child → Child-specific questions
└─ PBW → Mother-specific questions
```

**Pattern 3: Product Selection**
```
Product Checkboxes
├─ Select Product A → Quantity field A appears
├─ Select Product B → Quantity field B appears
└─ Select "None" → All quantity fields disappear
```

**Pattern 4: Yes/No Branching**
```
Yes/No Question
├─ Yes → Additional details appear
└─ No → Details hidden
```

**[SCREENSHOT PLACEHOLDER: Skip logic flow diagram]**

---

## Common Tasks by Role

### For Caseworkers

#### Task 1: Register a New Patient
1. Navigate: **Patients** → **Register New Patient**
2. Fill in all required fields
3. Select "Orphan Clinic" as Primary Clinic
4. Click **Save**

#### Task 2: Fill Out a Form for Your Patient
1. Go to **Patients** → **Patients List**
2. Click on a patient you created
3. Navigate to forms section
4. Select a form template
5. Fill out the form (watch for skip logic)
6. Submit the form

#### Task 3: View Your Submitted Forms
1. Go to **Patients** → Select your patient
2. View form history
3. You can only see forms you submitted

**Limitations:**
- Cannot see other caseworkers' forms
- Cannot edit forms submitted by others
- Cannot access Nutrition clinic

**[SCREENSHOT PLACEHOLDER: Caseworker workflow diagram]**

### For Admins (Project Manager, Technical Advisor, etc.)

#### Task 1: Review All Caseworker Forms
1. Go to **Patients** → Select any patient
2. View all submitted forms
3. You can see forms from all caseworkers
4. Edit/validate as needed

#### Task 2: Manage Users
1. Navigate: **Users** → **Users List**
2. View all users in your clinic
3. Click **New User** to create users
4. Edit existing users as needed

#### Task 3: View Clinic Reports
1. Navigate: **Data Analysis**
2. Select clinic and date range
3. View aggregated data
4. Export reports if needed

**Capabilities:**
- Full access to all forms in assigned clinic(s)
- Can manage users within clinic
- Cannot access Nutrition clinic (for Orphan roles)

**[SCREENSHOT PLACEHOLDER: Admin workflow diagram]**

### For Providers

#### Task 1: View Assigned Patients
1. Go to **Patients** → **Patients List**
2. You'll see patients assigned to you
3. Click on a patient to view details

#### Task 2: Fill Out Clinical Forms
1. Select an assigned patient
2. Choose appropriate form
3. Fill out clinical information
4. Submit form

#### Task 3: Manage Prescriptions
1. Go to **Prescriptions**
2. Create new prescriptions for assigned patients
3. View prescription history

**Capabilities:**
- Access to assigned patients only
- Can create/edit forms for assigned patients
- Can manage prescriptions

**[SCREENSHOT PLACEHOLDER: Provider workflow diagram]**

### For Registrars

#### Task 1: Register Patients
1. Navigate: **Patients** → **Register New Patient**
2. Fill in demographic information
3. Select appropriate clinic
4. Save patient record

#### Task 2: Schedule Appointments
1. Go to **Appointments**
2. Click **New Appointment**
3. Select patient and provider
4. Set date and time
5. Save appointment

**Limitations:**
- Cannot access clinical forms
- Cannot view patient history
- Read-only access to prescriptions

**[SCREENSHOT PLACEHOLDER: Registrar workflow diagram]**

### For Super Admins

#### Task 1: System-Wide Management
1. Access all clinics and users
2. Manage system settings
3. Create/edit/delete any record
4. Full data access

#### Task 2: Form Template Management
1. Navigate: **Event Forms** → **Forms List**
2. Create new form templates
3. Edit existing forms
4. Assign forms to clinics

**Capabilities:**
- Full system access
- Can manage all users including other super admins
- Can delete records

**[SCREENSHOT PLACEHOLDER: Super Admin dashboard]**

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Cannot see Nutrition clinic"
**Problem:** Orphan Project roles cannot access Nutrition clinic
**Solution:** This is by design. Nutrition clinic is restricted to Nutrition staff only.

#### Issue 2: "Cannot see patients created by other caseworkers"
**Problem:** Caseworkers can only see their own patients
**Solution:** This is correct behavior. Contact an admin if you need access to other patients.

#### Issue 3: "Form fields not appearing"
**Problem:** Skip logic may be hiding fields
**Solution:** 
- Check your previous answers
- Ensure you've selected the correct options
- Some fields only appear when specific conditions are met

#### Issue 4: "Cannot edit form"
**Problem:** You may not have permission
**Solution:**
- Caseworkers can only edit their own forms
- Providers can only edit forms for assigned patients
- Contact an admin if you need to edit a form

#### Issue 5: "Invalid credentials" error
**Problem:** Email or password incorrect
**Solution:**
- Check email spelling (case-sensitive)
- Verify password
- Contact administrator if issues persist

#### Issue 6: "Required field" error but field not visible
**Problem:** Skip logic may be hiding a required field
**Solution:**
- Review previous answers
- Ensure you've answered all visible required fields
- Some required fields only appear based on your answers

#### Issue 7: "Cannot submit form"
**Problem:** Missing required fields or validation errors
**Solution:**
- Check for red error messages
- Fill in all required fields (marked with *)
- Ensure data format is correct (e.g., dates, numbers)

### Getting Help

If you encounter issues:
1. Check this guide first
2. Contact your clinic administrator
3. For technical issues, contact system support

---

## Quick Reference Card

### Navigation Shortcuts
- **Dashboard**: `/app`
- **Patients List**: `/app/patients`
- **Register Patient**: `/app/patients/register`
- **Event Forms**: `/app/event-forms`
- **Users**: `/app/users` (admin only)
- **Clinics**: `/app/clinics` (admin only)

### Form Submission Checklist
- [ ] All required fields filled
- [ ] Skip logic conditions met
- [ ] Patient selected
- [ ] Form type correct for clinic
- [ ] Data reviewed for accuracy

### Role Quick Reference

| Role | Can Register Patients | Can See All Forms | Can Edit Others' Forms | Clinic Access |
|------|---------------------|-------------------|------------------------|---------------|
| Super Admin | ✅ | ✅ | ✅ | All |
| Admin | ✅ | ✅ | ✅ | Assigned |
| Caseworker | ✅ | ❌ (templates only) | ❌ | Assigned (not Nutrition) |
| Provider | ✅ | ❌ (assigned only) | ❌ (assigned only) | Assigned |
| Registrar | ✅ | ❌ | ❌ | Assigned |

---

## Appendix: Form Field Types Reference

### Text Field
- **Use for:** Names, addresses, free-text answers
- **Example:** Patient name, facility name

### Select/Dropdown
- **Use for:** Single choice from a list
- **Example:** Service type, nutritional status

### Checkbox (Multi-select)
- **Use for:** Multiple selections
- **Example:** Products received, services provided

### Radio Buttons
- **Use for:** Single choice from visible options
- **Example:** Yes/No questions

### Number Field
- **Use for:** Numeric values
- **Example:** Age, quantity, measurements

### Date Field
- **Use for:** Dates
- **Example:** Date of birth, collection date

---

**End of Training Guide**

*Last Updated: [Date]*
*Version: 1.0*

