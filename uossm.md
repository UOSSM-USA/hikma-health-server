# Hikma Health - Project Status & Development Roadmap

## Executive Summary

This document provides a comprehensive overview of the Hikma Health project status, addressing concerns and outlining the development roadmap.

### **Latest Updates (January 2025)**

**Critical Pre-Go-Live Requirements** (from Paul & Testing Team feedback):
1. ✅ **Duplicate Patient Prevention** - COMPLETED: Multi-criteria duplicate detection with Government ID check, Name+DOB, and Phone number matching
2. 🔴 **Form Visibility & Access Control** - HIGH PRIORITY: Role-based form access (health facilities vs mental health/child protection)
3. 🔴 **Form Editing with Approval Workflow** - HIGH PRIORITY: 3-month direct editing window, then approval-required edits
4. 🟡 **Cross-Clinic Patient Access** - MEDIUM PRIORITY: Requires clarification meeting for mental health/child protection projects
5. 🟢 **Post-Go-Live Enhancements** - FUTURE: Summary forms and automated form generation

**Key Implementation Notes**:
- All changes must maintain backward compatibility with existing functionality
- Form visibility changes require careful testing to avoid breaking current access patterns
- Gaza-specific duplicate prevention solutions need discussion and custom implementation
- Mental health/child protection forms require strict privacy controls (different from health facilities)

## Current Project Status

### **Completed Work**

#### **Core Forms Implementation**
- **Patient Registration Form** - Complete with multi-language support (EN/AR/ES)
- **Appointment Management** - Full scheduling system with department support
- **Prescription Management** - Complete medication workflow with priority handling
- **Clinic Department Management** - Department creation with capability tracking
- **Event Form Builder** - Dynamic form creation system with 6 field types

#### **Sample Data Infrastructure(staging testing)**
- **10 Patients** across 6 countries and 10 camps
- **10 Appointments** with various departments and statuses
- **12 Prescriptions** with realistic medication data
- **70 Departments** across 11 clinics with varying capabilities
- **6 Event Forms** covering emergency, maternal, mental health, chronic care, pediatrics, and immunization
- **100+ Total Database Records** created

#### **Technical Infrastructure**
- **Database Schema** - Complete with proper relationships and constraints
- **Sample Data Scripts** - 6 scripts with duplicate prevention and cleanup functionality
- **Form Validation** - Comprehensive validation across all forms
- **Error Handling** - Robust error handling and user feedback

#### **Patient Data Integrity** ✅ COMPLETED
- **Duplicate Patient Prevention** - Multi-criteria duplicate detection system
  - Government ID check with auto-population
  - Name + Date of Birth matching
  - Phone number matching
  - Auto-generated Patient IDs (PID-000-0001 format)
  - Duplicate review screen before registration
  - Support for patients without Government IDs

#### **Internationalization (i18n) Implementation** ✅ COMPLETED
- **Comprehensive UI Translations** - All application pages support English and Arabic
- **User Language Preferences** - Stored in user profile metadata with database migration
- **Dynamic Language Switching** - Real-time UI translation with session-based toggling
- **Translation Coverage**:
  - ✅ Dashboard page
  - ✅ Patients list page (with dynamic field headers)
  - ✅ Users list page (with role translations)
  - ✅ Clinics list page
  - ✅ Appointments list page
  - ✅ Prescriptions list page
  - ✅ Settings pages
- **SSR-Safe Implementation** - Server-side rendering compatible with fallback contexts
- **Type-Safe Translation Keys** - TypeScript support for translation management

#### **Deployment Pipeline & Infrastructure**

##### **Multi-Environment Architecture**
- **Staging Environment**: 
  - **Database**: `hikma_health_db_staging` on Render PostgreSQL
  - **Purpose**: Testing, validation, and stakeholder demonstrations
  - **Status**: **Fully operational** with complete sample data
  - **Access**: Secure connection with dedicated credentials

- **Production Environment**:
  - **Database**: `hikma_health_db_production` on Render PostgreSQL
  - **Purpose**: Live patient data management
  - **Status**: **Ready for deployment** with tested forms
  - **Access**: Production-grade security and monitoring
  - **Scalability**: Auto-scaling based on demand

##### **Render Platform Integration**
- **Database Hosting**: Managed PostgreSQL on Render
- **Automatic Backups**: Built-in data protection with point-in-time recovery
- **Scalability**: Auto-scaling based on demand
- **Monitoring**: Real-time performance tracking and alerts
- **Security**: SSL encryption and access controls
- **Uptime**: 99.9% availability guarantee

##### **Deployment Workflow**
1. **Development**: Local testing with staging database connection
2. **Staging**: Full testing with realistic data scenarios
3. **Production**: Seamless deployment with zero-downtime updates
4. **Rollback**: Quick reversion capabilities if needed

##### **Database Migration Strategy**
- **Version Control**: All schema changes tracked in Git
- **Incremental Updates**: Safe, reversible migrations
- **Data Integrity**: Foreign key constraints maintained
- **Testing**: Staging validation before production deployment
- **Backup Strategy**: Automated backups before each migration

##### **Infrastructure Benefits**
- **Reliability**: 99.9% uptime guarantee from Render
- **Performance**: Optimized PostgreSQL configuration
- **Security**: Enterprise-grade data protection
- **Compliance**: Healthcare data security standards
- **Cost-Effective**: Managed infrastructure reduces operational overhead
- **Global Access**: CDN distribution for international camps

##### **Deployment Pipeline Importance**
The deployment pipeline is **critical** for the project's success because:

1. **Staging Environment Validation**: All forms and features are tested in staging before production deployment
2. **Data Integrity**: Sample data scripts run against staging database to ensure production readiness
3. **Stakeholder Demonstrations**: Staging environment allows safe demonstration of features to stakeholders
4. **Zero-Risk Testing**: New features can be tested without affecting live patient data
5. **Rollback Capability**: Quick reversion if issues arise in production
6. **Continuous Integration**: Automated testing and deployment processes
7. **Healthcare Compliance**: Proper data handling and security measures in place

**Current Status**: **Fully Operational** - Staging environment is live with complete sample data, ready for stakeholder review and production deployment.

## **Pending Work(Forms)**

#### **Missing Forms (3/8)** ✅ ALL COMPLETED
- ~~**Patient Vital Signs Form** - UI and sample data needed~~ ✅ COMPLETED
- ~~**Visit/Encounter Form** - Verification and sample data needed~~ ✅ COMPLETED
- ~~**User Management Forms** - Verification and sample data needed~~ ✅ COMPLETED

## **Critical Pre-Go-Live Requirements** 🔴

### **High Priority Items (Must Complete Before Launch)**

1. **Form Visibility & Access Control** (Section 5.2)
   - Health facility staff: Cross-caseworker form visibility
   - Mental health/child protection: Private forms (caseworker-only)
   - Supervisor/M&E/IM: View all forms
   - **Status**: NOT STARTED
   - **Timeline**: 2-3 weeks
   - **Risk**: HIGH - Affects data privacy and user workflows

2. **Form Editing with Approval Workflow** (Section 5.3)
   - 3-month direct editing window
   - Post-3-month approval workflow
   - Email notification system
   - **Status**: NOT STARTED
   - **Timeline**: 2-3 weeks
   - **Risk**: MEDIUM - Requires email infrastructure

3. **Cross-Clinic Patient Access** (Section 5.4)
   - Health facilities: Shared access ✅ AGREED
   - Mental health/child protection: ⚠️ REQUIRES CLARIFICATION
   - **Status**: AWAITING CLARIFICATION MEETING
   - **Timeline**: TBD after meeting
   - **Risk**: MEDIUM - Needs stakeholder alignment

4. **Gaza-Specific Duplicate Prevention** (Section 5.1)
   - Alternative identification methods
   - Manual duplicate merge functionality
   - **Status**: REQUIRES DISCUSSION
   - **Timeline**: TBD
   - **Risk**: MEDIUM - Context-specific solution needed

---

## **Overall Concerns & Issues to Address**

### **1. User Permission Issues** ✅ RESOLVED

#### **Issue**: Register and provider users can delete Admin and Super Admin accounts
- **Status**: **RESOLVED** ✅
- **Impact**: Critical security vulnerability (NOW FIXED)
- **Priority**: **HIGH** - Security risk (COMPLETED)
- **Resolution Date**: October 24, 2025

#### **Implemented Solution**:
```typescript
// Permission hierarchy system - IMPLEMENTED
export const ROLE_HIERARCHY: Record<typeof RoleSchema.Type, number> = {
  registrar: 1,    // Can only register patients
  provider: 2,     // Can manage patients
  admin: 3,        // Can manage clinic users and patients
  super_admin: 4,  // Can manage all users and system
};
```

#### **Security Enhancements Implemented**:
1. ✅ **Role Hierarchy System**: Numerical levels (1-4) prevent lower roles from managing higher roles
2. ✅ **Permission Validation Functions**: 
   - `canManageRole()` - Checks if one role can manage another
   - `canDeleteRole()` - Only super_admins can delete users
   - `canCreateRole()` - Prevents unauthorized user creation
   - `canUpdateUser()` - Validates role changes and updates
3. ✅ **Server-Side Enforcement**: All user management endpoints now validate role hierarchy
4. ✅ **UI Protection**: Buttons and forms respect role permissions
5. ✅ **Comprehensive Testing**: 34 unit tests covering all permission scenarios

#### **Key Security Rules**:
- ✅ Only super_admins can delete users
- ✅ Admins cannot create or manage super_admins
- ✅ Providers and registrars cannot create any users
- ✅ Users cannot delete themselves (prevents accidental lockout)
- ✅ Role escalation is prevented at all levels
- ✅ All actions validated on both client and server side

### **2. Bilingual Functionality Clarification** ✅ MOSTLY RESOLVED

#### **Current State**: 
- **Patient Registration Form** - Full EN/AR/ES support ✅
- **Form Builder** - Multi-language form creation ✅
- **All Application Pages** - Full EN/AR support with language toggle ✅
- **User Language Preferences** - Stored in user profile metadata ✅
- **Dynamic Language Switching** - Real-time UI translation ✅
- **Form Field Labels** - Dynamic translation based on registration form configuration ✅

#### **Stakeholder Expectation**: Full bilingual support across all forms
- **Status**: **MOSTLY IMPLEMENTED** ✅
- **Impact**: User accessibility in camps(geographical locations)
- **Priority**: **HIGH** - User experience
- **Completion Date**: November 2025

#### **Completed Implementation**:
- ✅ Dashboard page translations (EN/AR)
- ✅ Patients list page translations (EN/AR)
- ✅ Users list page translations with role translations (EN/AR)
- ✅ Clinics list page translations (EN/AR)
- ✅ Appointments list page translations (EN/AR)
- ✅ Prescriptions list page translations (EN/AR)
- ✅ Settings page translations (EN/AR)
- ✅ User language preference storage in database
- ✅ Session-based language toggling
- ✅ SSR-safe translation implementation

#### **Technical Implementation**:
```typescript
// Current: Manual form creation per language
// Needed: Dynamic language switching
const SUPPORTED_LANGUAGES = {
  en: "English",
  ar: "Arabic", 
  es: "Spanish",
  fr: "French",    // Additional languages needed
  sw: "Swahili"   // For Africa
};
```

### **3. Missing Features**

#### **Skip Feature**
- **Status**: **NOT IMPLEMENTED**
- **Impact**: User experience in form completion
- **Priority**: **MEDIUM**
- **Timeline**: Pending confirmation

#### **Input Validations**
- **Status**: **NOT IMPLEMENTED**
- **Impact**: Data quality and user experience
- **Priority**: **MEDIUM**
- **Timeline**: Pending confirmation

### **4. Patient Detail Page Issues**

#### **Issue**: Incomplete patient information display
- **Missing Data**:
  - Recent visits history
  - Vital signs history
  - Prescription history
  - Current vital signs
- **Status**: **NOT IMPLEMENTED**
- **Impact**: Healthcare provider workflow
- **Priority**: **HIGH** - Core functionality

#### **Current Patient Detail Page**:
```typescript
// Currently shows:
- Basic patient information
- Appointments

// Missing:
- Recent visits
- Vital signs history
- Prescription history
- Current vitals
```

### **5. Event Forms Usability** ✅ RESOLVED

#### **Issue**: Event forms are not fully functional
- **Current State**: Forms can be created, viewed, and integrated with patient records ✅
- **Status**: **RESOLVED** ✅
- **Resolution Date**: January 2025

#### **Solutions Implemented**:
1. ✅ **Patient Integration**: Added Event Forms tab to patient detail page
2. ✅ **Event Display**: Events are now visible with patient records
3. ✅ **Form Association**: Event forms linked to patient encounters
4. ✅ **Workflow Access**: Providers can now view and track all event forms per patient

#### **Remaining Enhancements**:
- **Form Submission**: Create dedicated submission interface
- **Form Versioning**: Track form history and changes
- **Rich Editing**: Enhanced form data editing capabilities

**Priority**: **HIGH** → **MEDIUM** (Core workflow now functional)

---

## **Technical Debt & Fixes Applied**

### **Resolved Issues**
1. **Event Form Builder UI** - Fixed duplicate field names error
2. **Sample Data Scripts** - Implemented duplicate prevention
3. **Database Schema** - Fixed UUID serialization and foreign key issues
4. **Form Field Rendering** - Fixed dropdown and validation issues

### **Remaining Technical Debt**
1. ~~**Permission System** - Needs complete overhaul~~ ✅ RESOLVED
2. ~~**Language Support** - Needs expansion across all forms~~ ✅ MOSTLY RESOLVED (EN/AR complete, additional languages can be added)
3. **Patient Detail Integration** - Needs comprehensive data display
4. ~~**Event Form Workflow** - Needs integration with patient records~~ ✅ RESOLVED

---

## **Maintenance Justification**

### **Current Value Delivered**
- **5 Complete Forms** with full functionality
- **100+ Database Records** for testing and demonstration
- **Multi-language Support** for international populations
- **Robust Technical Infrastructure** with error handling
- **Production-Ready Deployment Pipeline** with staging and production environments
- **Managed Database Infrastructure** on Render with 99.9% uptime
- **Comprehensive Documentation** for future development

### **Investment Required for Completion**
- ~~**Security Enhancements** - Critical for production use~~ ✅ COMPLETED
- ~~**Language Expansion** - Essential for international deployment~~ ✅ COMPLETED (EN/AR, additional languages can be added incrementally)
- **Patient Detail Integration** - Core healthcare workflow requirement ⚠️ NEXT PRIORITY
- ~~**Event Form Usability** - Clinical efficiency improvement~~ ✅ COMPLETED

### **ROI for Stakeholders**
- **Reduced Development Time** - 62.5% already complete
- **Proven Technical Foundation** - Stable, tested codebase
- **Immediate Deployment Capability** - Current forms are production-ready
- **Enterprise-Grade Infrastructure** - Managed databases with 99.9% uptime
- **Zero-Downtime Deployments** - Seamless updates to production
- **Global Accessibility** - CDN distribution for international camps
- **Scalable Architecture** - Ready for additional features
- **Cost-Effective Operations** - Managed infrastructure reduces overhead

---

## **Recommendations**

### **Immediate Actions**
1. ~~**Address Security Issues** - Implement permission hierarchy~~ ✅ COMPLETED
2. **Enhance Patient Detail Page** - Add missing data sections ⚠️ NEXT PRIORITY
3. ~~**Fix Event Form Integration** - Make forms usable in workflow~~ ✅ COMPLETED

### **Short-term Goals**
1. ~~**Expand Language Support** - Add Arabic, French, Swahili, and other languages~~ ✅ Arabic completed, others can be added incrementally
2. **Complete Missing Forms** - Vital signs, visits, user management
3. ~~**Implement Form Translation** - Dynamic language switching~~ ✅ COMPLETED

### **Long-term Vision**
1. **Advanced Features** - Skip logic, enhanced validation
2. **Analytics Dashboard** - Usage tracking and reporting
3. **Mobile Optimization** - Enhanced mobile experience

---

## **Success Metrics**

### **Technical Metrics**
- **Forms Completion**: 5/8 forms (62.5%) - 3 forms remaining
- **Language Support**: 2 languages (EN/AR) ✅ - Additional languages can be added
- **Security Issues**: 0 critical vulnerabilities ✅
- **Performance**: <2s page load times

### **User Experience Metrics**
- **Patient Detail Completeness**: Partial (appointments visible, visits/vitals/prescriptions missing)
- **Form Usability**: Event forms integrated in workflow ✅
- **Language Accessibility**: Multi-language support across all application pages ✅
- **Permission Security**: Proper role-based access control ✅

---

## **Development Roadmap**

### **Phase 1: Critical Security & Core Features**

#### **Priority 1: Security Fixes** ✅ COMPLETED
- [x] **Implement Permission Hierarchy** ✅
  - ✅ Prevent non-admin users from deleting admin accounts
  - ✅ Implement role-based access control
  - ✅ Add user permission validation

#### **Priority 2: Patient Detail Page Enhancement**
- [x] **Add Recent Visits Section**
  - Display visit history with dates and providers
  - Link to visit details and forms
- [x] **Add Vital Signs History**
  - Display historical vital signs data
  - Show trends and charts
- [x] **Add Prescription History**
  - Display medication history
  - Show current medications and dosages
- [x] **Add Current Vitals Display**
  - Show most recent vital signs
  - Quick vital signs entry form

### **Phase 2: Language Support & User Experience**

#### **Priority 3: Enhanced Bilingual Support** ✅ MOSTLY COMPLETED
- [x] **Expand Language Support** ✅
  - ✅ Add Arabic language support (English already supported)
  - ✅ Implement dynamic language switching
  - ✅ Add language preference storage in user profile
  - [ ] Add French, Swahili and other international languages (can be added incrementally)
- [x] **Application UI Translation System** ✅
  - ✅ Comprehensive translation catalog for all pages
  - ✅ Dynamic UI translation with real-time switching
  - ✅ Type-safe translation keys
  - [ ] Create translation management interface (future enhancement)
  - [ ] Add translation validation (future enhancement)

#### **Priority 4: Event Forms Integration** ✅ CORE FUNCTIONALITY COMPLETED
- [x] **Event Form Workflow** ✅
  - ✅ Integrate with patient records
  - ✅ Add form submission and storage
  - [ ] Implement form versioning (future enhancement)
- [x] **Event Form Templates** ✅
  - ✅ Create pre-built form templates (form builder allows custom forms)
  - [ ] Add form sharing between clinics (future enhancement)
  - ✅ Implement form customization (form builder provides full customization)

### **Phase 3: Advanced Features**

#### **Priority 5: Skip Feature Implementation** ✅ COMPLETED
- [x] **Form Skip Logic** ✅
  - ✅ Add conditional field display
  - ✅ Implement skip validation
  - ✅ Add skip tracking and analytics

#### **Priority 6: Input Validation Enhancement** ✅ COMPLETED
- [x] **Advanced Validation** ✅
  - ✅ Add custom validation rules
  - ✅ Implement real-time validation
  - ✅ Add validation error handling

---

*This document represents the current state of the Hikma Health project and provides a clear roadmap for completion. Significant progress has been made with security fixes, comprehensive i18n support, and event form integration completed. The next critical priority is enhancing the Patient Detail Page with missing data sections.*


######################################################################################
## Next Steps - Development Roadmap

### Immediate priorities (next sprint)

#### 1. Patient Detail Page enhancements (Priority 2 continuation)
- [x] Add charts/trends for vital signs over time
  - Line charts for BP, HR, temperature, O₂ saturation
  - Weight/BMI trends
  - Date range filtering
- [x] Add ability to edit existing vital records
  - Edit button on vital history entries
  - Pre-populated form with existing values
  - Update server function for vital edits
- [x] Link visits to associated vitals and prescriptions
  - Show vitals and prescriptions per visit
  - Visit details view with full encounter information
  - Navigation between related records

#### 2. Complete missing forms (from Pending Work)
- [x] Patient Vital Signs Form — dedicated UI form
  - Standalone form for comprehensive vital entry (quick-entry dialog on patient detail page)
  - Sample data generation script (`scripts/create-sample-vitals.ts`)
- [x] Visit/Encounter Form — verification and enhancement
  - Visit/encounter captured via appointments + event forms
  - Sample visit data created via `scripts/create-sample-appointments.ts`
  - Visit history and encounters visible on patient detail page
- [x] User Management Forms — verification
  - User add/edit form at `/app/users/:id` (new and existing)
  - Verified role/clinic constraints and permission errors
  - Sample users present for testing in staging

### Short-term goals (next 2-3 sprints)

#### 3. Advanced form features (Phase 3)
- [x] Skip Feature Implementation (Priority 5) ✅ COMPLETED
  - ✅ Conditional field display based on previous answers
  - ✅ Skip logic validation
  - ✅ Skip tracking and analytics
- [x] Input Validation Enhancement (Priority 6) ✅ COMPLETED
  - ✅ Custom validation rules per field type
  - ✅ Real-time validation feedback
  - ✅ Enhanced error handling and messages

#### 4. Data export and reporting
- [x] Export patient history to PDF/Excel ✅ COMPLETED
  - ✅ Full patient record export (Excel format)
  - ✅ Patient history includes vitals, appointments, prescriptions, events, visits
  - ✅ Export button on patient detail page
  - [ ] Customizable export templates (future enhancement)
  - [ ] Batch export for multiple patients (future enhancement - current export includes all patients)
- [x] Analytics Dashboard enhancements ✅ COMPLETED
  - ✅ Usage tracking and reporting (appointments, prescriptions, events counts)
  - ✅ Clinic performance metrics (top 10 clinics with patient/visit/appointment/prescription counts)
  - ✅ Patient visit trends visualization (last 30 days with trend percentage)

#### 5. Patient Data Integrity & Workflow Enhancements (CRITICAL - Pre-Go-Live)

##### 5.1. Duplicate Patient Prevention ✅ COMPLETED
- [x] **Government ID Check Flow** ✅
  - ✅ Two-step registration: Government ID check → Full registration
  - ✅ Auto-populate existing patient info if duplicate found
  - ✅ Auto-generate Patient ID (PID-000-0001 format) for new patients
  - ✅ Multi-criteria duplicate detection (Government ID, Name+DOB, Phone)
  - ✅ Duplicate review screen before final registration
  - ✅ Support for patients without Government IDs
- [ ] **Gaza-Specific Duplicate Prevention Solutions** ⚠️ REQUIRES DISCUSSION
  - [ ] Identify challenges specific to Gaza context
  - [ ] Develop alternative identification methods when Government ID unavailable
  - [ ] Consider biometric or photo-based duplicate detection
  - [ ] Implement manual duplicate merge functionality for administrators
  - **Recommendation**: Create a "Potential Duplicates" admin dashboard to review and merge records manually

##### 5.2. Form Visibility & Access Control (CRITICAL - Role-Based) ✅ COMPLETED
- [x] **Health Facility Staff Access** (Doctors, Nurses, Pharmacists) ✅
  - [x] Allow cross-caseworker form visibility within same clinic ✅
  - [x] Enable shared access to patient forms for continuity of care ✅
  - [x] Maintain role-based permissions (view vs edit) ✅
  - **Implementation**: Updated `getEventsByFormId` and `getEventsByPatientId` to allow health facility roles (PROVIDER, REGISTRAR, ADMIN) to see all events within their clinic
  - **Status**: ✅ COMPLETED - Health facility roles now have shared access to all forms within their clinic
- [x] **Mental Health & Child Protection (Orphan Project) - Restricted Access** ✅
  - [x] **CRITICAL**: Keep forms private within caseworker scope ✅
  - [x] Caseworkers CANNOT view forms submitted by other caseworkers ✅
  - [x] Only direct supervisors, M&E officers, and IM associates can view all forms ✅
  - **Implementation**: Updated event filtering logic to restrict caseworkers (CASEWORKER_1-4) to only see their own events, while supervisors have full access
  - **Status**: ✅ COMPLETED - Orphan Project caseworkers can only see their own forms; supervisors have full access
- [x] **Supervisor/M&E/IM Access** ✅
  - [x] Supervisors can view all forms within their clinic/project ✅
  - [x] M&E officers can view all forms for reporting ✅
  - [x] IM associates can view all forms for data management ✅
  - **Implementation**: Added `hasFullAccess` helper function that includes all supervisor roles (TEAM_LEADER, ME_OFFICER, IM_ASSOCIATE, PROJECT_MANAGER, TECHNICAL_ADVISOR)
  - **Status**: ✅ COMPLETED - All supervisor roles have full access to view all forms
- [ ] **Patient ID Reference Check** ⚠️ DEFERRED
  - [ ] Before accepting a case, check patient ID in system
  - [ ] Show existing forms/history when patient ID is entered
  - [ ] Prevent duplicate case creation for same patient
  - **Recommendation**: Add patient ID lookup in case creation workflow
  - **Status**: ⚠️ DEFERRED - Can be implemented as part of case creation workflow enhancement

##### 5.3. Form Editing Capabilities (Time-Based Approval System) ✅ PARTIALLY COMPLETED
- [x] **First 3 Months: Direct Editing** ✅
  - [x] Users can edit forms they submitted ✅
  - [x] Track edit history (who edited, when, what changed) ✅
  - [x] Enforce 3-month editing window (90 days) ✅
  - **Implementation**: 
    - Added `isWithinEditWindow` helper function to check if event is within 90 days
    - Added `canEditDirectly` function to determine edit permissions
    - Updated `saveEvent` to enforce 3-month window and track edit history in metadata
    - Added `checkEventEditPermission` server function for UI to check edit permissions
  - **Status**: ✅ COMPLETED - Users can edit their own forms within 3 months; edit history is tracked in metadata
- [ ] **After 3 Months: Approval Workflow** ⚠️ DEFERRED
  - [x] Lock forms after 3 months (read-only for original submitter) ✅
  - [ ] Add "Request Edit" button that sends email to supervisor and IM
  - [ ] Email includes: Patient info, Form details, Requested changes, Link to approve/reject
  - [ ] Supervisor/IM can approve and unlock form for editing
  - [ ] Track approval history and maintain audit trail
  - **Implementation Note**: Email notification system and approval workflow UI needed
  - **Status**: ⚠️ DEFERRED - Core locking mechanism implemented; email approval workflow can be added later
- [x] **Edit History & Audit Trail** ✅
  - [x] Track all form edits (who, when, what changed) ✅
  - [x] Maintain original form data for comparison ✅
  - **Implementation**: Edit history stored in event metadata:
    - `edit_history`: Array of edit records with `edited_by`, `edited_by_role`, `edited_at`, `previous_form_data`
    - `last_edited_by`, `last_edited_by_role`, `last_edited_at`: Latest edit information
  - **Status**: ✅ COMPLETED - Edit history tracking implemented in metadata
  - [ ] Show edit history in form view (UI enhancement - can be added later)
  - [ ] Export edit history for compliance/auditing (can use existing export functionality)

##### 5.4. Cross-Clinic Patient Record Access
- [ ] **Health & Medical Projects: Shared Access** ✅ AGREED
  - [ ] Allow clinic A to view patient records from clinic B
  - [ ] Implement role-based access controls (view vs edit)
  - [ ] Show clinic source on patient records
  - [ ] Enable referral workflow between clinics
  - **Implementation Note**: Extend current clinic permissions to allow cross-clinic viewing
  - **Recommendation**: Add `can_view_cross_clinic_records` permission, default true for health facilities
- [ ] **Mental Health & Child Protection: Restricted Access** ⚠️ REQUIRES CLARIFICATION
  - [ ] **DISCUSSION NEEDED**: Should Orphan project have cross-clinic access?
  - [ ] Consider privacy requirements for sensitive cases
  - [ ] May need clinic-level restrictions for mental health/child protection
  - **Recommendation**: Schedule meeting to clarify requirements before implementation
- [ ] **Referral System**
  - [ ] Enable referral from Clinic A to Clinic B
  - [ ] Transfer patient records with referral
  - [ ] Track referral history
  - [ ] Notify receiving clinic of new referral
  - **Recommendation**: Build on existing appointment system, add referral-specific workflow

**Implementation Priority**: 
- **5.1**: ✅ COMPLETED
- **5.2**: ✅ COMPLETED (Critical for go-live, affects data privacy)
- **5.3**: ✅ PARTIALLY COMPLETED (Core functionality implemented; email approval workflow deferred)
- **5.4**: ⚠️ REQUIRES CLARIFICATION (Requires discussion meeting first)

**Risk Mitigation & Recommendations**:

**To Avoid Breaking Existing Functionality**:
1. **Feature Flags**: Implement feature flags for all new access control changes
   - `ENABLE_CROSS_CASEWORKER_FORM_VIEW` (default: false, enable per clinic)
   - `ENABLE_FORM_EDITING_WITH_APPROVAL` (default: false, enable after go-live)
   - `ENABLE_CROSS_CLINIC_ACCESS` (default: false, enable per project type)

2. **Gradual Rollout**: 
   - Test form visibility changes in staging with real user scenarios
   - Roll out to one clinic/project first, then expand
   - Monitor for any access issues or broken workflows

3. **Backward Compatibility**:
   - Maintain existing permission checks as fallback
   - Add new permissions alongside (not replacing) existing ones
   - Ensure caseworkers still see their own forms (current behavior preserved)

4. **Data Integrity**:
   - Form editing should create edit history, not overwrite original
   - Approval workflow should maintain audit trail
   - Cross-clinic access should be read-only by default (edit requires explicit permission)

5. **Testing Strategy**:
   - Test all role combinations (caseworker, provider, admin, supervisor, M&E, IM)
   - Test clinic filtering (health facilities vs Orphan project)
   - Test form access across different scenarios
   - Verify no regression in existing form submission/viewing workflows

6. **Documentation**:
   - Update user training guide with new access rules
   - Create admin guide for managing form permissions
   - Document approval workflow for supervisors/IM
   - Add inline help text explaining form visibility rules

#### 6. Audio/Mic input for dictation and automated translations
- [ ] Automated translation for dynamic notes (pre-work)
  - Appointment notes (bilingual UI + auto-translate helper)
  - Patient/visit notes on patient detail page
  - Event form free-text fields (chief complaint, history, comments)
- [ ] Speech-to-text functionality for notes
  - Microphone button integration in Textarea components
  - Browser Web Speech API implementation
  - Multi-language support (English, Arabic, etc.)
  - Start/stop recording controls
  - Offline capability (where supported)
- [ ] Integration across all note fields
  - Prescription notes
  - Appointment notes
  - Event form textarea fields
  - Patient event forms

### Medium-term enhancements (next quarter)

#### 5.5. Items Requiring Discussion & Clarification ⚠️ AWAITING CLARIFICATION MEETING

##### 5.4. Cross-Clinic Patient Record Access ⚠️ REQUIRES CLARIFICATION
- [ ] **Health & Medical Projects: Shared Access** ✅ AGREED
  - [ ] Allow clinic A to view patient records from clinic B
  - [ ] Implement role-based access controls (view vs edit)
  - [ ] Show clinic source on patient records
  - [ ] Enable referral workflow between clinics
  - **Implementation Note**: Extend current clinic permissions to allow cross-clinic viewing
  - **Recommendation**: Add `can_view_cross_clinic_records` permission, default true for health facilities
  - **Status**: ⚠️ AGREED but not yet implemented - requires clarification meeting
- [ ] **Mental Health & Child Protection: Restricted Access** ⚠️ REQUIRES CLARIFICATION
  - [ ] **DISCUSSION NEEDED**: Should Orphan project have cross-clinic access?
  - [ ] Consider privacy requirements for sensitive cases
  - [ ] May need clinic-level restrictions for mental health/child protection
  - **Recommendation**: Schedule meeting to clarify requirements before implementation
  - **Status**: ⚠️ REQUIRES DISCUSSION - Privacy concerns need to be addressed
- [ ] **Referral System**
  - [ ] Enable referral from Clinic A to Clinic B
  - [ ] Transfer patient records with referral
  - [ ] Track referral history
  - [ ] Notify receiving clinic of new referral
  - **Recommendation**: Build on existing appointment system, add referral-specific workflow
  - **Status**: ⚠️ DEFERRED - Can be implemented after cross-clinic access is clarified

**Summary Notes for Manager Paul**:
- **5.4 Cross-Clinic Access**: Health & Medical projects agreed for shared access, but implementation details need clarification. Mental Health & Child Protection projects require discussion about privacy requirements and whether cross-clinic access should be allowed.
- **Next Steps**: Schedule clarification meeting to discuss:
  1. Implementation approach for health facility cross-clinic access
  2. Privacy requirements for mental health/child protection projects
  3. Referral workflow requirements
  4. Timeline for implementation

#### 6. Post-Go-Live Form Enhancements (Post-Launch)

##### 6.1. Derivative/Summary Forms
- [ ] **Create Summary Forms from Existing Data**
  - [ ] Build form builder capability to create forms that pull data from existing forms
  - [ ] Define data aggregation rules (sum, average, latest, etc.)
  - [ ] Create summary form templates (e.g., 3-month recurring form)
  - [ ] Enable editing of summary forms while maintaining source data integrity
  - **Current Status**: Form will be uploaded to Hikma system as-is for initial launch
  - **Parallel Work**: Mutaz will share form in Excel format for summary report creation
  - **Recommendation**: Build summary form builder after initial launch, use Excel export as interim solution
  - **Risk Mitigation**: Ensure summary forms don't modify source data, maintain data lineage

##### 6.2. Automated Form Generation (Scheduled Jobs)
- [ ] **Cron-Based Form Generation**
  - [ ] Implement scheduled job system for automated form creation
  - [ ] Support recurring forms (daily, weekly, monthly, quarterly)
  - [ ] Auto-generate forms for required reports/reviews at fixed intervals
  - [ ] Notification system for form completion deadlines
  - [ ] Dashboard for scheduled form status
  - **Use Cases**:
    - Monthly clinic reports
    - Quarterly program reviews
    - Annual assessments
    - Recurring patient follow-ups
  - **Recommendation**: Use existing cron infrastructure, add form scheduling UI for admins
  - **Risk Mitigation**: Add safeguards to prevent duplicate form generation, allow manual override

**Implementation Timeline**: Post-go-live (after initial system stabilization)
**Dependencies**: Stable form system, reliable cron infrastructure, user training on new features

#### 7. Clinical decision support
- [ ] Vital signs alerts for abnormal values
  - Configurable thresholds per vital sign
  - Real-time alerts for critical values
  - Alert history and acknowledgment
- [ ] Clinical guidelines integration
  - Evidence-based recommendations
  - Treatment protocols
  - Drug interaction warnings

#### 8. Additional language support
- [ ] Add French language support
- [ ] Add Swahili language support
- [ ] Translation management interface
  - Admin UI for managing translations
  - Translation validation tools
  - Community translation contributions

### Long-term vision (6+ months)

#### 9. Mobile optimization
- [ ] Enhanced mobile experience
  - Responsive design improvements
  - Touch-optimized interfaces
  - Offline capability for mobile app

#### 10. Advanced analytics
- [ ] Predictive analytics
  - Patient risk scoring
  - Resource utilization forecasting
  - Disease outbreak detection

#### 11. Integration and interoperability
- [ ] HL7 FHIR integration
- [ ] Third-party system integrations
- [ ] API for external applications

### Priority ranking

1. High priority (next sprint)
   - Charts/trends for vital signs
   - Edit existing vital records
   - Link visits to vitals/prescriptions

2. High priority (pre-go-live - CRITICAL)
   - Form visibility & access control (5.2)
   - Form editing capabilities with approval workflow (5.3)
   - Cross-clinic patient record access (5.4) - after clarification meeting
   - Gaza-specific duplicate prevention solutions (5.1)

3. Medium priority (next 2-3 sprints)
   - Complete missing forms (Vital Signs, Visit, User Management)
   - Skip Feature Implementation ✅ COMPLETED
   - Input Validation Enhancement ✅ COMPLETED
   - Audio/Mic input for dictation (moved to post 5.x)

4. Medium-term (next quarter - post-go-live)
   - Derivative/summary forms (6.1)
   - Automated form generation via scheduled jobs (6.2)
   - Export functionality ✅ COMPLETED
   - Vital signs alerts
   - Additional languages

### Success metrics

- Patient Detail Page: 75% complete (charts and editing remaining)
- Forms Completion: 8/8 forms (100%) ✅ COMPLETED
- Feature Completeness: Core features done; pre-go-live requirements in progress
- User Experience: Good foundation; critical workflow enhancements needed
- **Data Integrity**: Duplicate prevention ✅ COMPLETED
- **Form Access Control**: 0% complete → Target: 100% before go-live 🔴 CRITICAL
- **Form Editing Workflow**: 0% complete → Target: 100% before go-live 🔴 CRITICAL

### Estimated timeline

- **Pre-Go-Live Critical Items**: 4-6 weeks (Form visibility, editing workflow, cross-clinic access)
- Immediate priorities: 2-3 weeks (after critical items)
- Short-term goals: 6-8 weeks
- Medium-term enhancements: 3-4 months (post-go-live)
- Long-term vision: 6+ months

### Implementation Considerations

**Critical Success Factors**:
1. **No Breaking Changes**: All new features must be additive, not replacing existing functionality
2. **Gradual Rollout**: Use feature flags and staged deployment
3. **User Training**: Comprehensive training on new access controls and workflows
4. **Testing**: Extensive testing in staging before production deployment
5. **Monitoring**: Track form access patterns and edit requests to identify issues early

**Key Decisions Needed**:
- [ ] Clarification meeting on cross-clinic access for mental health/child protection
- [ ] Discussion on Gaza-specific duplicate prevention challenges
- [ ] Approval workflow email template and notification preferences
- [ ] Form privacy level configuration (public vs private forms)

This roadmap builds on the completed Patient Detail Page Enhancement and aligns with the project's strategic goals. The new critical pre-go-live requirements from Paul and the testing team have been integrated with careful consideration to avoid breaking existing functionality.
