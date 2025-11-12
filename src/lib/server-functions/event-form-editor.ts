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

function normalizeFormFields(form: EventForm.EncodedT): EventForm.EncodedT {
  const formFields = (() => {
    let data: unknown = form.form_fields;
    if (typeof data === "string") {
      data = safeJSONParse(data, []);
      if (Array.isArray(data) && data.length === 0) {
        data = form.form_fields;
      }
    }
    if (Array.isArray(data)) {
      data.forEach((field) => {
        if (field.inputType === "textarea") {
          field.inputType = "text";
          field.length = "long";
        }
        field._tag = EventForm.getFieldTag(field.fieldType);
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

      if (updateFormId) {
        return (await EventForm.API.update({
          id: updateFormId,
          form,
        })) as any;
      }
      return (await EventForm.API.insert(form)) as any;
    }),
  );
export const saveEventForm = _saveEventForm;

const _ensureCanAddEventForm = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) =>
    Sentry.startSpan({ name: "eventForms.ensureCanAdd" }, async () => {
      const permContext = createPermissionContext(context);
      checkEventFormPermission(permContext, PermissionOperation.ADD);
      return true;
    }),
  );
export const ensureCanAddEventForm = _ensureCanAddEventForm;

const _ensureCanEditEventForm = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) =>
    Sentry.startSpan({ name: "eventForms.ensureCanEdit" }, async () => {
      const permContext = createPermissionContext(context);
      checkEventFormPermission(permContext, PermissionOperation.EDIT);
      return true;
    }),
  );
export const ensureCanEditEventForm = _ensureCanEditEventForm;

