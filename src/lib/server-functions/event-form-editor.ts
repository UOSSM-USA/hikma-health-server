import { createServerFn } from "@tanstack/react-start";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  checkEventFormPermission,
  createPermissionContext,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import EventForm from "@/models/event-form";
import { safeJSONParse } from "@/lib/utils";
import * as Sentry from "@sentry/tanstackstart-react";

type FormFields = EventForm.EncodedT["form_fields"];

export function normalizeFormFields(form: EventForm.EncodedT): EventForm.EncodedT {
  const formFields = (() => {
    let data: unknown = form.form_fields;
    if (typeof data === "string") {
      data = safeJSONParse(data, []);
      if (Array.isArray(data) && data.length === 0) {
        data = form.form_fields;
      }
    }
    if (Array.isArray(data)) {
      data.forEach((field: any) => {
        // Ensure required base properties exist
        if (!field.id) {
          console.warn("Field missing id, skipping:", field);
          return;
        }

        // Handle orphan forms that use 'label' (bilingual object) instead of 'name'
        // Preserve the label object for bilingual support, but also set name as fallback
        // If name is already set (e.g., from script with context like "(Screening)"), preserve it
        // Otherwise, derive name from label
        if (!field.name || typeof field.name !== "string" || field.name.trim().length === 0) {
          if (field.label) {
            // Orphan forms use bilingual label object { ar: "...", en: "..." }
            if (typeof field.label === "object" && field.label !== null) {
              // Set name as fallback (prefer English for default, but keep label object)
              field.name = field.label.en || field.label.ar || `Field ${field.id.substring(0, 8)}`;
              // Preserve the label object for bilingual rendering
              // Don't delete it - the UI will use it for language switching
            } else if (typeof field.label === "string") {
              field.name = field.label;
            } else {
              field.name = `Field ${field.id.substring(0, 8)}`;
            }
          } else {
            field.name = `Field ${field.id.substring(0, 8)}`; // Fallback
          }
        }
        // Always preserve the label object if it exists (for bilingual support)
        // The name can be unique (e.g., "Mother's name (Screening)") while label stays the same ("Mother's name")
        // This allows the form editor to have unique names while the UI shows the same label
        if (field.label && typeof field.label === "object" && field.label !== null) {
          // Label object is preserved - UI will use it for language switching
        }

        // Ensure name is a string (not undefined/null)
        if (!field.name || typeof field.name !== "string") {
          field.name = `Field ${field.id.substring(0, 8)}`;
        }

        // Ensure description exists (can be empty string)
        if (field.description === undefined || field.description === null) {
          field.description = "";
        }
        if (typeof field.description !== "string") {
          field.description = String(field.description || "");
        }

        // Handle legacy fields that use 'type' instead of 'fieldType'
        if (field.type && !field.fieldType) {
          // Map simple types to fieldType
          if (field.type === "text" || field.type === "textarea" || field.type === "number" || field.type === "email" || field.type === "tel") {
            field.fieldType = "free-text";
            field.inputType = field.type === "textarea" ? "textarea" : field.type;
            if (field.type === "textarea") {
              field.length = "long";
            } else {
              field.length = "short";
            }
          } else if (field.type === "select" || field.type === "checkbox" || field.type === "radio") {
            field.fieldType = field.type === "select" && field.multi ? "options" : field.type === "select" ? "options" : "binary";
            field.inputType = field.type;
            if (!field.options) {
              field.options = [];
            }
          } else if (field.type === "date") {
            field.fieldType = "date";
            field.inputType = "date";
          } else {
            // Default to free-text for unknown types
            field.fieldType = "free-text";
            field.inputType = field.type || "text";
            field.length = "short";
          }
          // Remove the old 'type' property
          delete field.type;
        }

        // Normalize inputType for textarea
        if (field.inputType === "textarea") {
          field.inputType = "text";
          field.length = "long";
        }

        // Ensure fieldType exists before calling getFieldTag
        if (!field.fieldType) {
          // If no fieldType, default to free-text
          field.fieldType = "free-text";
          field.inputType = field.inputType || "text";
          field.length = field.length || "short";
        }

        // Ensure _tag is set
        try {
          field._tag = EventForm.getFieldTag(field.fieldType);
        } catch (error) {
          console.error(`Failed to get field tag for fieldType "${field.fieldType}":`, error);
          // Fallback to free-text if fieldType is unknown
          field.fieldType = "free-text";
          field._tag = "free-text";
          field.inputType = field.inputType || "text";
          field.length = field.length || "short";
        }

        // Ensure required properties exist for all field types
        if (field.required === undefined) {
          field.required = false;
        }
        if (field.visible === undefined) {
          field.visible = true;
        }
        if (field.deleted === undefined) {
          field.deleted = false;
        }

        // Preserve skipLogic if it exists (it should already be in the correct format)
        // SkipLogic is used for conditional field visibility
        if (field.skipLogic) {
          // Ensure skipLogic structure is valid
          if (field.skipLogic.showWhen && !Array.isArray(field.skipLogic.showWhen)) {
            field.skipLogic.showWhen = [];
          }
          if (field.skipLogic.hideWhen && !Array.isArray(field.skipLogic.hideWhen)) {
            field.skipLogic.hideWhen = [];
          }
        }
      });
    }
    return data as FormFields;
  })();

  return {
    ...form,
    form_fields: formFields,
  };
}

const _getEventFormForEditor = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: "eventForms.getForEditor" }, async () => {
      const form = await EventForm.API.getById(data.id);
      if (!form) {
        return null;
      }
      return normalizeFormFields(form);
    }),
  );
export const getEventFormForEditor = _getEventFormForEditor;

const _saveEventForm = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator(
    (d: { form: EventForm.EncodedT; updateFormId: null | string }) => d,
  )
  .handler(async ({ data, context }) =>
    Sentry.startSpan({ name: "eventForms.save" }, async () => {
      const { updateFormId, form } = data;
      const permContext = createPermissionContext(context);
      const operation = updateFormId
        ? PermissionOperation.EDIT
        : PermissionOperation.ADD;
      checkEventFormPermission(permContext, operation);

      let savedForm: any;
      if (updateFormId) {
        savedForm = await EventForm.API.update({
          id: updateFormId,
          form,
        });
      } else {
        // Creating a new form
        savedForm = await EventForm.API.insert(form);
        
        // Automatically assign the new form to the user's clinic(s)
        // Super admins can manually assign forms, so skip auto-assignment for them
        const ClinicEventFormModel = (await import("@/models/clinic-event-form")).default;
        const UserModel = (await import("@/models/user")).default;
        const isSuperAdmin = context.isSuperAdmin || context.role === UserModel.ROLES.SUPER_ADMIN_2;
        
        if (!isSuperAdmin && context.clinicIds.length > 0) {
          // Assign form to all clinics the user has access to
          for (const clinicId of context.clinicIds) {
            try {
              await ClinicEventFormModel.API.assignFormToClinic(clinicId, savedForm.id);
            } catch (error) {
              console.error(`Failed to assign form to clinic ${clinicId}:`, error);
              // Continue with other clinics even if one fails
            }
          }
        }
      }
      
      return savedForm as any;
    }),
  );
export const saveEventForm = _saveEventForm;

const _ensureCanAddEventForm = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) =>
    Sentry.startSpan({ name: "eventForms.ensureCanAdd" }, async () => {
      // Only admins and super admins can create/edit form templates
      // Providers, caseworkers, and registrars can only submit data using forms, not edit form structure
      const UserModel = (await import("@/models/user")).default;
      const isAdmin = context.role === UserModel.ROLES.ADMIN;
      const isSuperAdmin = context.isSuperAdmin || context.role === UserModel.ROLES.SUPER_ADMIN_2;
      
      if (!isAdmin && !isSuperAdmin) {
        throw new Error("Unauthorized: Only admins and super admins can create form templates");
      }
      
      return true;
    }),
  );
export const ensureCanAddEventForm = _ensureCanAddEventForm;

const _ensureCanEditEventForm = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) =>
    Sentry.startSpan({ name: "eventForms.ensureCanEdit" }, async () => {
      // Only admins and super admins can create/edit form templates
      // Providers, caseworkers, and registrars can only submit data using forms, not edit form structure
      const UserModel = (await import("@/models/user")).default;
      const isAdmin = context.role === UserModel.ROLES.ADMIN;
      const isSuperAdmin = context.isSuperAdmin || context.role === UserModel.ROLES.SUPER_ADMIN_2;
      
      if (!isAdmin && !isSuperAdmin) {
        throw new Error("Unauthorized: Only admins and super admins can edit form templates");
      }
      
      return true;
    }),
  );
export const ensureCanEditEventForm = _ensureCanEditEventForm;

