import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EventForm from "@/models/event-form";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkEventFormPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import { redirect } from "@tanstack/react-router";
import User from "@/models/user";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { useMemo, useState, useEffect } from "react";
import { useEventFormPermissions } from "@/hooks/use-permissions";
import { useTranslation, useLanguage } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";

const deleteForm = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    // Check permissions - only super admin can delete event forms
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.DELETE);
    
    return EventForm.API.softDelete(data.id);
  });

const toggleFormDetail = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator(
    (d: { id: string; field: "snapshot" | "editable"; value: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    // Check permissions - editing form settings requires edit permission
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.EDIT);
    
    switch (data.field) {
      case "snapshot":
        return await EventForm.API.toggleSnapshot({
          id: data.id,
          isSnapshot: data.value,
        });
      case "editable":
        return await EventForm.API.toggleEditable({
          id: data.id,
          isEditable: data.value,
        });
      default:
        throw Error("Unknown field");
    }
  });

// top-level guard to avoid creating server fn inside loader
const ensureCanViewEventForms = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.VIEW);
    return true;
  });

export const Route = createFileRoute("/app/event-forms/")({
  component: RouteComponent,
  loader: async () => {
    // Deny access to users without VIEW permission (e.g., registrar)
    const canView = await ensureCanViewEventForms();
    if (!canView) {
      throw redirect({ to: "/app", replace: true });
    }
    const currentUser = (await getCurrentUser()) as User.EncodedT | null;
    return {
      forms: await getEventForms(),
      currentUser,
    };
  },
});

function RouteComponent() {
  const { forms, currentUser } = Route.useLoaderData() as {
    forms: EventForm.EncodedT[];
    currentUser: User.EncodedT | null;
  };
  const route = useRouter();
  const t = useTranslation();
  const { language } = useLanguage();
  const { canAdd, canEdit, canDelete } = useEventFormPermissions(
    currentUser?.role,
  );
  const canConfigure = useMemo(() => canEdit, [canEdit]);
  
  // State for translated form names and descriptions
  const [translatedFormNames, setTranslatedFormNames] = useState<Record<string, string>>({});
  const [translatedFormDescriptions, setTranslatedFormDescriptions] = useState<Record<string, string>>({});

  // Clear translation cache when language changes
  useEffect(() => {
    setTranslatedFormNames({});
    setTranslatedFormDescriptions({});
  }, [language]);

  // Auto-translate event form names and descriptions to match UI language (en/ar)
  useEffect(() => {
    if (!forms || !forms.length) return;
    const targetLang = language === "ar" ? "ar" : "en";

    // Simple heuristic to detect Arabic script
    const hasArabicChars = (text: string) => /[\u0600-\u06FF]/.test(text);

    void (async () => {
      const nameUpdates: Record<string, string> = {};
      const descUpdates: Record<string, string> = {};

      for (const form of forms) {
        const id = form.id;
        const name = form.name || "";
        const description = form.description || "";
        if (!id || (!name && !description)) continue;

        // Skip if we already have translations for this form and language
        // Check if name translation exists (and description if it exists in form)
        const hasNameTranslation = name ? translatedFormNames[id] : true;
        const hasDescTranslation = description ? translatedFormDescriptions[id] : true;
        if (hasNameTranslation && hasDescTranslation) continue;

        // Determine stored language
        const storedLang: "en" | "ar" =
          form.language === "ar"
            ? "ar"
            : form.language === "en"
              ? "en"
              : hasArabicChars(name + description)
                ? "ar"
                : "en";

        // If stored language already matches UI language, just cache the originals
        if (storedLang === targetLang) {
          if (name) nameUpdates[id] = name;
          if (description) descUpdates[id] = description;
          continue;
        }

        // Translate name
        if (name) {
          try {
            const nameRes = await translateText({
              data: {
                text: name,
                from: storedLang,
                to: targetLang,
              },
            });
            const translatedName = nameRes.translated || name;
            nameUpdates[id] = translatedName;
          } catch (err) {
            // On failure or rate limit, fall back to original name
            console.error("Failed to translate event form name:", err);
            nameUpdates[id] = name;
          }
        }

        // Translate description
        if (description) {
          try {
            const descRes = await translateText({
              data: {
                text: description,
                from: storedLang,
                to: targetLang,
              },
            });
            const translatedDesc = descRes.translated || description;
            descUpdates[id] = translatedDesc;
          } catch (err) {
            // On failure or rate limit, fall back to original description
            console.error("Failed to translate event form description:", err);
            descUpdates[id] = description;
          }
        }
      }

      if (Object.keys(nameUpdates).length > 0) {
        setTranslatedFormNames((prev) => ({ ...prev, ...nameUpdates }));
      }
      if (Object.keys(descUpdates).length > 0) {
        setTranslatedFormDescriptions((prev) => ({ ...prev, ...descUpdates }));
      }
    })();
  }, [forms, language]);

  const handleSnapshotToggle = (id: string, isSnapshot: boolean) => {
    toggleFormDetail({ data: { id, field: "snapshot", value: isSnapshot } })
      .then(() => {
        toast.success(t("messages.formSaved") || "Form snapshot mode toggled successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error(t("messages.formSaveError") || "Failed to toggle form snapshot mode");
        console.error(error);
      });
  };

  const handleEditableToggle = (id: string, isEditable: boolean) => {
    toggleFormDetail({ data: { id, field: "editable", value: isEditable } })
      .then(() => {
        toast.success(t("messages.formSaved") || "Form editable mode toggled successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error(t("messages.formSaveError") || "Failed to toggle form editable mode");
        console.error(error);
      });
  };

  const handleDelete = (id: string) => {
    deleteForm({ data: { id } })
      .then(() => {
        toast.success(t("messages.formDeleted") || "Form deleted successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error(t("messages.formDeleteError") || "Failed to delete form");
        console.error(error);
      });
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("nav.eventForms")}</h1>
        {canAdd && (
          <Link to="/app/event-forms/edit/$" params={{ _splat: "new" }}>
            <Button>{t("nav.registerNewForm")}</Button>
          </Link>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableCaption>{t("nav.eventForms")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.snapshot")}</TableHead>
                <TableHead>{t("table.editable")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.description")}</TableHead>
                <TableHead>{t("table.created")}</TableHead>
                <TableHead>{t("table.updated")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    {t("table.noFormsAvailable")}
                  </TableCell>
                </TableRow>
              ) : (
                forms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell>
                      {canConfigure ? (
                        <Checkbox
                          checked={form.is_snapshot_form}
                          onCheckedChange={() =>
                            handleSnapshotToggle(
                              form.id,
                              !form.is_snapshot_form,
                            )
                          }
                        />
                      ) : (
                        <Checkbox checked={form.is_snapshot_form} disabled />
                      )}
                    </TableCell>
                    <TableCell>
                      {canConfigure ? (
                        <Checkbox
                          checked={form.is_editable}
                          onCheckedChange={() =>
                            handleEditableToggle(form.id, !form.is_editable)
                          }
                        />
                      ) : (
                        <Checkbox checked={form.is_editable} disabled />
                      )}
                    </TableCell>
                    <TableCell>
                      {translatedFormNames[form.id] || form.name || "—"}
                    </TableCell>
                    <TableCell>
                      {translatedFormDescriptions[form.id] || form.description || "—"}
                    </TableCell>
                    <TableCell>
                      {format(form.created_at, "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      {format(form.updated_at, "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell className="space-x-2">
                      {canEdit && (
                        <Link
                          to="/app/event-forms/edit/$"
                          params={{ _splat: form.id }}
                        >
                          <Button variant="outline" size="sm">
                            {t("common.edit")}
                          </Button>
                        </Link>
                      )}
                      {canDelete && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(form.id)}
                        >
                          {t("common.delete")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
