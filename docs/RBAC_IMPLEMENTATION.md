# Role-Based Access Control (RBAC) - Complete Implementation Guide

**Status**: ✅ Production Ready  
**Date**: November 10, 2025  
**Tests**: 170 passing (100%)

---

## Table of Contents
1. [Overview](#overview)
2. [Permission Matrix](#permission-matrix)
3. [Key Files](#key-files)
4. [Usage Guide](#usage-guide)
5. [Provider Assignment Verification](#provider-assignment-verification)
6. [Testing](#testing)
7. [Deployment](#deployment)

---

## Overview

A comprehensive RBAC system controlling access to 9 modules across 5 user roles, based on the UOSSM Hikma Permission Matrix.

### Roles (Hierarchical)
1. **Registrar** - Patient registration, basic data entry
2. **Provider** - Clinical care, assigned patient management
3. **Admin** - Clinic administration, user management
4. **Super Admin 2** - Full system access (no deletion privileges)
5. **Super Admin** - Full system access with deletion privileges

### Modules
Patients • Event Forms • Users • Clinics • Appointments • Prescriptions • Data Analysis • Settings • Clinic Permissions

### Permission Scopes
- **NONE** - No access
- **OWN** - Only own records
- **ASSIGNED** - Only assigned records (verified via visits/appointments/prescriptions)
- **CLINIC** - Within assigned clinic(s)
- **CLINIC_ADMIN** - Admin access within clinic(s)
- **ALL** - System-wide (super admin only)

---

## Permission Matrix

### Quick Reference Table

| Module | Registrar | Provider | Admin | Super Admin 2 | Super Admin |
|--------|-----------|----------|-------|---------------|-------------|
| **Patients** | View, Add, Edit (own demographic only) | View, Add, Edit (assigned) | Full (no delete) | View, Add, Edit | Full CRUD |
| **Event Forms** | ❌ NO ACCESS | View, Add, Edit (assigned) | View, Add, Edit | View, Add, Edit | Full CRUD |
| **Users** | ❌ | ❌ | View, Add, Edit (no SA creation) | View, Add, Edit (no SA creation) | Full CRUD |
| **Clinics** | ❌ | View, Add, Edit | View, Add, Edit | View, Add, Edit | Full CRUD |
| **Appointments** | View, Add, Edit | View, Add, Edit (own) | View, Add, Edit | View, Add, Edit | Full CRUD |
| **Prescriptions** | View only | View, Add, Edit (assigned) | View, Edit (approve) | View, Add, Edit | Full CRUD |
| **Data Analysis** | ❌ | View (own patients) | View | View, Add, Edit | Full CRUD |
| **Settings** | ❌ | ❌ | View | View, Add, Edit | Full CRUD |
| **Clinic Permissions** | ❌ | ❌ | View, Add, Edit | View, Add, Edit | Full CRUD |

### Key Restrictions
- ✅ **Registrars excluded from clinical data** (Event Forms)
- ✅ **Registrars can only edit demographic data they entered**
- ✅ **Admins cannot create super_admin or super_admin_2 users**
- ✅ **Admins cannot delete users or patients**
- ✅ **Super Admin 2 has full access but NO deletion privileges**
- ✅ **Super Admin 2 cannot create Super Admin users**
- ✅ **Providers limited to assigned patients** (verified via DB)

---

## Key Files

### Core System
```
src/models/permissions.ts              # Permission matrix definition
src/lib/permission-service.ts          # Context-aware permission checking
src/lib/server-functions/permissions.ts # Server function helpers
src/hooks/use-permissions.ts           # React hooks for UI
src/middleware/auth.ts                 # Enhanced with permission context
```

### Tests
```
tests/models/permissions-matrix.test.ts    # 43 tests - Permission matrix
tests/lib/permission-service.test.ts       # 29 tests - Service logic
tests/models/user-permissions*.test.ts     # 47 tests - User hierarchy
```

### Documentation
```
RBAC_IMPLEMENTATION.md                 # This file
UOOSM Hikma Role Based Permission_KS.xlsx # Source requirements
```

---

## Usage Guide

### Server-Side Implementation

#### Basic Permission Check
<details>
<summary>Show code</summary>
```typescript
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkPatientPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";

export const createPatient = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .handler(async ({ data, context }) => {
    // Create permission context
    const permContext = createPermissionContext(context);
    
    // Check permission with resource context
    checkPatientPermission(permContext, PermissionOperation.ADD, {
      clinicId: data.clinicId,
    });
    
    return Patient.register(data);
  });
```
</details>

#### Strict Verification (Database Check)
<details>
<summary>Show code</summary>
```typescript
import { checkPermissionStrict } from "@/lib/server-functions/permissions";

export const viewPatientRecords = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ data, context }) => {
    const permContext = createPermissionContext(context);
    
    // Strict check - verifies provider has treated this patient
    await checkPermissionStrict(
      permContext,
      Module.PATIENTS,
      PermissionOperation.VIEW,
      {
        patientId: data.patientId, // Queries visits/appointments/prescriptions
      }
    );
    
    return Patient.API.getById(data.patientId);
  });
```
</details>

### Client-Side Implementation

#### Using React Hooks
<details>
<summary>Show code</summary>
```tsx
import { usePatientPermissions, useIsAdmin } from "@/hooks/use-permissions";

function PatientManagement() {
  const currentUserRole = useCurrentUserRole();
  const { canView, canAdd, canEdit, canDelete } = usePatientPermissions(currentUserRole);
  const isAdmin = useIsAdmin(currentUserRole);
  
  return (
    <div>
      {canView && <PatientList />}
      {canAdd && <Button>Register Patient</Button>}
      {canEdit && <Button>Edit</Button>}
      {canDelete && isAdmin && <Button>Delete</Button>}
    </div>
  );
}
```
</details>

#### Conditional Navigation
<details>
<summary>Show code</summary>
```tsx
import { useAccessibleModules } from "@/hooks/use-permissions";

function Navigation() {
  const accessibleModules = useAccessibleModules(currentUserRole);
  
  return (
    <nav>
      {accessibleModules.includes(Module.PATIENTS) && (
        <Link to="/patients">Patients</Link>
      )}
      {accessibleModules.includes(Module.EVENT_FORMS) && (
        <Link to="/event-forms">Event Forms</Link>
      )}
    </nav>
  );
}
```
</details>

### Available Hooks
<details>
<summary>Show code</summary>
```typescript
usePatientPermissions(role)        // CRUD permissions for patients
useEventFormPermissions(role)      // CRUD permissions for event forms
useUserPermissions(role)           // CRUD permissions for users
useAppointmentPermissions(role)    // CRUD permissions for appointments
usePrescriptionPermissions(role)   // CRUD permissions for prescriptions
useHasPermission(role, module, op) // Generic permission check
useIsAdmin(role)                   // Check if admin/super admin (any)
useIsSuperAdmin(role)              // Check if super admin (including super_admin_2)
useIsFullSuperAdmin(role)          // Check if full super admin (can delete)
useAccessibleModules(role)         // Get all accessible modules
```
</details>

---

## Provider Assignment Verification

### Two Verification Modes

#### 1. Standard Check (Fast)
Verifies role permissions and explicit resource context. Use for:
- Creating new resources (prescription, appointment)
- When providerId is already validated
- Performance-critical operations

<details>
<summary>Show code</summary>
```typescript
checkPatientPermission(permContext, PermissionOperation.EDIT, {
  providerId: context.userId,  // Must match current user
  clinicId: "clinic-1",
});
```
</details>

#### 2. Strict Verification (Database Query)
Queries database to verify provider-patient relationship. Use for:
- First-time access to patient data
- Sensitive medical records
- Compliance/audit requirements

<details>
<summary>Show code</summary>
```typescript
await checkPermissionStrict(permContext, Module.PATIENTS, PermissionOperation.VIEW, {
  patientId: "patient-123", // Checks visits/appointments/prescriptions
});
```
</details>

### How Assignment is Determined

A provider is "assigned" to a patient if they have:
1. **Visits** with the patient
2. **Appointments** with the patient
3. **Prescriptions** for the patient

The system queries these three tables to verify the relationship:

<details>
<summary>Show code</summary>
```typescript
// Simplified logic
static async checkProviderPatientAssignment(
  providerId: string,
  patientId: string,
): Promise<boolean> {
  // Check visits
  const visit = await db
    .selectFrom("visits")
    .where("provider_id", "=", providerId)
    .where("patient_id", "=", patientId)
    .limit(1)
    .executeTakeFirst();
  
  if (visit) return true;

  // Check appointments and prescriptions...
  return false;
}
```
</details>

### Decision Matrix

| Scenario | Standard | Strict | Reason |
|----------|----------|--------|--------|
| Creating prescription | ✅ | | Provider creating, assignment implied |
| Viewing medical history | | ✅ | Sensitive data, verify relationship |
| Editing own appointment | ✅ | | Resource providerId already verified |
| First patient access | | ✅ | Security - verify treatment history |
| Bulk operations | ✅ | | Performance - resources validated |

---

## Testing

### Run Tests
<details>
<summary>Show commands</summary>
```bash
# All tests
pnpm test

# Permission tests only
pnpm test tests/models/permissions-matrix.test.ts
pnpm test tests/lib/permission-service.test.ts

# With coverage
pnpm test:coverage
```
</details>

### Test Coverage
- **170 total tests** (100% passing)
- **43 tests** - Permission matrix (all roles × modules)
- **29 tests** - Permission service (context-aware checks)
- **47 tests** - User hierarchy (role management)
- **51 tests** - Other (utils, components, edge cases)

### Example Tests
<details>
<summary>Show code</summary>
```typescript
// Permission matrix test
it("registrar cannot access event forms", () => {
  expect(hasPermission("registrar", Module.EVENT_FORMS, PermissionOperation.VIEW))
    .toBe(false);
});

// Context-aware test
it("provider can view assigned patient", () => {
  const context = { userId: "p1", role: "provider", ... };
  const result = PermissionService.check(
    context, Module.PATIENTS, PermissionOperation.VIEW,
    { providerId: "p1" }
  );
  expect(result.allowed).toBe(true);
});
```
</details>

---

## Deployment

### ✅ Zero Database Changes
- Uses existing `users` table and `role` field
- Uses existing `user_clinic_permissions` table
- No migrations required
- Backward compatible

### Deployment Steps
1. Deploy code to server
2. Restart application
3. All permissions automatically enforced
4. No manual configuration needed

### Verification Checklist
<details>
<summary>Show commands</summary>
```bash
# 1. Run tests
pnpm test

# 2. Check linter
pnpm lint

# 3. Build application
pnpm build

# 4. Verify no errors
# ✅ All tests passing
# ✅ No linter errors
# ✅ Clean build
```
</details>

### Post-Deployment
- Monitor logs for permission denied errors
- Verify users have correct roles assigned
- Check users assigned to correct clinics
- Test key workflows per role

---

## Security Benefits

### Fixed Vulnerabilities
✅ **Granular module-level permissions** - Each role has specific access  
✅ **Registrars excluded from clinical data** - No Event Forms access  
✅ **Provider assignment verification** - Database-verified relationships  
✅ **Admin boundaries enforced** - Cannot create super_admin users  
✅ **Scope-based access control** - Own, Assigned, Clinic, All scopes  

### Defense in Depth
1. **Client-side** - UI hides unauthorized features
2. **Server-side** - Middleware enforces all requests
3. **Database** - Clinic permissions, provider assignments
4. **Testing** - 170 comprehensive tests

---

## Troubleshooting

### Common Issues

**Permission denied errors**
- ✓ Verify user has correct role
- ✓ Check user assigned to clinic
- ✓ Verify clinic admin status if needed
- ✓ Ensure server function has `permissionsMiddleware`

**UI shows unauthorized buttons**
- ✓ Use permission hooks: `usePatientPermissions(role)`
- ✓ Wrap with `<If show={canAdd}>...</If>`
- ✓ Check currentUserRole is loaded

**Tests failing**
- ✓ Run: `pnpm test tests/models/permissions-matrix.test.ts`
- ✓ Check permission matrix matches requirements
- ✓ Verify scope logic in PermissionService

---

## API Reference

### Permission Service
<details>
<summary>Show API</summary>
```typescript
// Main permission check
PermissionService.check(context, module, operation, resource?)

// Strict verification with DB query
PermissionService.checkWithAssignmentVerification(...)

// Shorthand methods
PermissionService.canView(context, module, resource?)
PermissionService.canAdd(context, module, resource?)
PermissionService.canEdit(context, module, resource?)
PermissionService.canDelete(context, module, resource?)

// Provider assignment check
PermissionService.checkProviderPatientAssignment(providerId, patientId)
```
</details>

### Server Function Helpers
<details>
<summary>Show API</summary>
```typescript
// Create context from middleware
createPermissionContext(context)

// Module-specific checkers
checkPatientPermission(context, operation, resource?)
checkEventFormPermission(context, operation, resource?)
checkAppointmentPermission(context, operation, resource?)
checkPrescriptionPermission(context, operation, resource?)

// Strict verification
checkPermissionStrict(context, module, operation, resource?)
```
</details>

### React Hooks
<details>
<summary>Show API</summary>
```typescript
// Module permissions
usePatientPermissions(role) // { canView, canAdd, canEdit, canDelete }
useEventFormPermissions(role)
useAppointmentPermissions(role)

// Generic checks
useHasPermission(role, module, operation)
useHasAnyPermission(role, module)

// Utilities
useIsAdmin(role)
useIsSuperAdmin(role)
useAccessibleModules(role)
```
</details>

---

## Summary

A production-ready RBAC system with:
- ✅ 9 modules with granular permissions
- ✅ 5 hierarchical roles (including Super Admin 2 with no delete)
- ✅ Scope-based access control
- ✅ Provider assignment verification
- ✅ Server and client enforcement
- ✅ 170 passing tests
- ✅ Zero database changes
- ✅ Comprehensive documentation

**Ready for production deployment.**

---

*For questions or issues, all functions include TSDoc comments and tests provide usage examples.*

