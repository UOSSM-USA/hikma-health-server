import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import Prescription from "@/models/prescription";
import { v1 as uuidV1 } from "uuid";
import { Schema } from "effect";
import { sql } from "kysely";
import db from "@/db";
import { toast } from "sonner";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkPrescriptionPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import Patient from "@/models/patient";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SelectInput } from "@/components/select-input";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { getAllUsers } from "@/lib/server-functions/users";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { PatientSearchSelect } from "@/components/patient-search-select";
import Clinic from "@/models/clinic";
import User from "@/models/user";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrescriptionPermissions } from "@/hooks/use-permissions";
import { useLanguage, useTranslation } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";

// Create a save prescription server function
const savePrescription = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator(
    (data: {
      prescription: Prescription.EncodedT;
      id: string | null;
      currentUserName: string;
      currentClinicId: string;
    }) => data
  )
  .handler(async ({ data, context }) => {
    const { prescription, id, currentUserName, currentClinicId } = data;

    // Check permissions
    const permContext = createPermissionContext(context);
    const operation = id ? PermissionOperation.EDIT : PermissionOperation.ADD;
    
    // Get patient to check clinic context
    const patient = await Patient.API.getById(prescription.patient_id);
    if (!patient) {
      throw new Error("Patient not found");
    }

    checkPrescriptionPermission(permContext, operation, {
      clinicId: patient.primary_clinic_id,
      providerId: prescription.provider_id,
    });

    return Prescription.API.save(
      id,
      prescription,
      currentUserName,
      currentClinicId
    );
  });

// Get prescription by ID server function
const getPrescriptionById = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { id } = data;
    const res = await db
      .selectFrom(Prescription.Table.name)
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .selectAll()
      .executeTakeFirst();

    return res as unknown as Prescription.EncodedT | null;
  });

export const Route = createFileRoute("/app/prescriptions/edit/$")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const prescriptionId = params["_splat"];
    const result: {
      prescription: Prescription.EncodedT | null;
      users: User.EncodedT[];
      clinics: Clinic.EncodedT[];
      currentUser: User.EncodedT | null;
    } = { prescription: null, users: [], clinics: [], currentUser: null };

    if (prescriptionId && prescriptionId !== "new") {
      result.prescription = (await getPrescriptionById({
        data: { id: prescriptionId },
      })) as Prescription.EncodedT | null;
    }

    result.users = (await getAllUsers()) as User.EncodedT[];
    result.clinics = (await getAllClinics()) as Clinic.EncodedT[];
    result.currentUser = (await getCurrentUser()) as User.EncodedT | null;

    return result;
  },
});

// Priority options
const PRIORITY_OPTION_DEFS = [
  { key: "normal" as const, value: "normal" },
  { key: "low" as const, value: "low" },
  { key: "high" as const, value: "high" },
  { key: "emergency" as const, value: "emergency" },
];

// Status options
const STATUS_OPTION_DEFS = [
  { key: "pending" as const, value: "pending" },
  { key: "prepared" as const, value: "prepared" },
  { key: "pickedUp" as const, value: "picked-up" },
  { key: "notPickedUp" as const, value: "not-picked-up" },
  { key: "partiallyPickedUp" as const, value: "partially-picked-up" },
  { key: "cancelled" as const, value: "cancelled" },
  { key: "other" as const, value: "other" },
];

function RouteComponent() {
  const {
    prescription,
    users: providers,
    clinics,
    currentUser,
  } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const params = Route.useParams();
  const prescriptionId = params._splat;
  const isEditing = !!prescriptionId && prescriptionId !== "new";
  const t = useTranslation();
  const { language } = useLanguage();

  // Permissions
  const { canAdd, canEdit } = usePrescriptionPermissions(currentUser?.role);
  const isReadOnly = useMemo(() => {
    return isEditing ? !canEdit : !canAdd;
  }, [isEditing, canAdd, canEdit]);

  // If attempting to create but not allowed, redirect away
  useEffect(() => {
    if (!isEditing && !canAdd) {
      toast.error(t("prescriptionForm.permissionError"));
      navigate({ to: "/app/prescriptions", replace: true });
    }
  }, [isEditing, canAdd, navigate, t]);

  const form = useForm<Prescription.EncodedT>({
    defaultValues: prescription || {
      id: uuidV1(),
      patient_id: "",
      provider_id: currentUser?.id || "",
      filled_by: null,
      pickup_clinic_id: "",
      visit_id: null,
      priority: "normal",
      expiration_date: null,
      prescribed_at: new Date(),
      filled_at: null,
      status: "pending",
      items: [],
      notes: "",
      metadata: {},
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      last_modified: new Date(),
      server_created_at: new Date(),
    },
  });
  const isSubmitting = form.formState.isSubmitting;

  // Bilingual notes state (in-memory); for now we derive from single notes field
  const [notesBilingual, setNotesBilingual] = useState<{ en: string; ar: string }>(() => {
    const existing = prescription?.notes ?? "";
    // naive guess: if UI is AR, treat existing as ar; otherwise as en
    if (language === "ar") {
      return { en: "", ar: existing };
    }
    return { en: existing, ar: "" };
  });

  // Track if we've already auto-translated for this form instance to avoid repeat calls
  const hasAutoTranslatedRef = useRef<{ en?: boolean; ar?: boolean }>({});

  // When UI language is English or Arabic and we only have the opposite language,
  // auto-translate once into the active UI language for admins.
  useEffect(() => {
    if (isReadOnly) return;

    const wantsEnglish =
      language === "en" &&
      !!notesBilingual.ar &&
      !notesBilingual.en &&
      !hasAutoTranslatedRef.current.en;

    const wantsArabic =
      language === "ar" &&
      !!notesBilingual.en &&
      !notesBilingual.ar &&
      !hasAutoTranslatedRef.current.ar;

    if (!wantsEnglish && !wantsArabic) return;

    (async () => {
      try {
        const from = wantsEnglish ? "ar" : "en";
        const to = wantsEnglish ? "en" : "ar";
        const sourceText = wantsEnglish ? notesBilingual.ar : notesBilingual.en;

        const res = await translateText({
          data: {
            text: sourceText,
            from,
            to,
          },
        });

        setNotesBilingual((prev) => ({
          ...prev,
          [to]: res.translated || (prev as any)[to] || sourceText,
        }));

        if (wantsEnglish) {
          hasAutoTranslatedRef.current.en = true;
        }
        if (wantsArabic) {
          hasAutoTranslatedRef.current.ar = true;
        }
      } catch (err) {
        console.error("Auto-translate for prescription notes failed:", err);
      }
    })();
  }, [language, notesBilingual.ar, notesBilingual.en, isReadOnly]);

  const priorityOptions = PRIORITY_OPTION_DEFS.map((option) => ({
    label: t(`prescriptionForm.priorities.${option.key}`),
    value: option.value,
  }));

  const statusOptions = STATUS_OPTION_DEFS.map((option) => ({
    label: t(`prescriptionForm.statuses.${option.key}`),
    value: option.value,
  }));

  console.log({ currentUser });

  // Handle form submission
  const onSubmit = async (values: Prescription.EncodedT) => {
    if (isReadOnly) {
      toast.error(t("prescriptionForm.modifyError"));
      return;
    }

    // Combine bilingual notes into single stored field (prefer English when available)
    const combinedNotes =
      language === "ar"
        ? notesBilingual.ar || notesBilingual.en
        : notesBilingual.en || notesBilingual.ar;

    const payload: Prescription.EncodedT = {
      ...values,
      notes: combinedNotes,
    };

    try {
      await savePrescription({
        data: {
          prescription: payload,
          // For new prescriptions, pass null so we don't try to use "new" as a UUID
          id: isEditing && prescriptionId && prescriptionId !== "new" ? prescriptionId : null,
          currentUserName: currentUser?.name || t("common.unknown"),
          currentClinicId: currentUser?.clinic_id || t("common.unknown"),
        },
      });

      toast.success(
        isEditing
          ? t("messages.prescriptionUpdated")
          : t("messages.prescriptionCreated"),
      );

      navigate({ to: "/app/prescriptions" });
    } catch (error) {
      console.error(error);
      toast.error(t("messages.prescriptionSaveError"));
    }
  };

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">
        {isEditing
          ? t("prescriptionForm.titleEdit")
          : t("prescriptionForm.titleCreate")}
      </h1>

      <div className="grid grid-cols-1 gap-6 max-w-2xl">
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <PatientSearchSelect
                      label={t("prescriptionForm.patientLabel")}
                        value={field.value as Patient.EncodedT["id"] | null}
                        isMulti={false}
                        onChange={(value) => {
                          field.onChange(value?.id || null);
                        }}
                        isDisabled={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provider_id"
                render={({ field }) => (
                  <SelectInput
                  label={t("prescriptionForm.providerLabel")}
                    data={providers.map((provider) => ({
                      label: provider.name,
                      value: provider.id,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                  placeholder={t("prescriptionForm.providerPlaceholder")}
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="pickup_clinic_id"
                render={({ field }) => (
                  <SelectInput
                  label={t("prescriptionForm.pickupClinicLabel")}
                    data={clinics.map((clinic) => ({
                      label: clinic.name,
                      value: clinic.id,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                  placeholder={t("prescriptionForm.pickupClinicPlaceholder")}
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <SelectInput
                  label={t("prescriptionForm.priorityLabel")}
                    data={priorityOptions}
                    value={field.value || ""}
                    onChange={field.onChange}
                  placeholder={t("prescriptionForm.priorityPlaceholder")}
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="expiration_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                  <FormLabel>
                    {t("prescriptionForm.expirationDateLabel")}
                  </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isReadOnly}
                          >
                            {field.value ? (
                              format(new Date(field.value), "PPP")
                            ) : (
                            <span>
                              {t("prescriptionForm.expirationDatePlaceholder")}
                            </span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(date);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <SelectInput
                  label={t("prescriptionForm.statusLabel")}
                    data={statusOptions}
                    value={field.value || ""}
                    onChange={field.onChange}
                  placeholder={t("prescriptionForm.statusPlaceholder")}
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("prescriptionForm.notesLabel")}</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {/* Arabic (frontline) */}
                        <Textarea
                          value={notesBilingual.ar}
                          onChange={(e) =>
                            setNotesBilingual((prev) => ({
                              ...prev,
                              ar: e.target.value,
                            }))
                          }
                          placeholder={t("prescriptionForm.notesPlaceholder")}
                          className="resize-none"
                          disabled={isReadOnly}
                        />
                        {/* English (admin) + translate helper */}
                        <div className="flex items-start gap-2">
                          <Textarea
                            value={notesBilingual.en}
                            onChange={(e) =>
                              setNotesBilingual((prev) => ({
                                ...prev,
                                en: e.target.value,
                              }))
                            }
                            placeholder="English"
                            className="resize-none"
                            disabled={isReadOnly}
                          />
                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!notesBilingual.ar) {
                                  toast.error(
                                    t("export.error") ||
                                      "No Arabic text to translate",
                                  );
                                  return;
                                }
                                try {
                                  const res = await translateText({
                                    data: {
                                      text: notesBilingual.ar,
                                      from: "ar",
                                      to: "en",
                                    },
                                  });
                                  setNotesBilingual((prev) => ({
                                    ...prev,
                                    en: res.translated || prev.en,
                                  }));
                                } catch (err: any) {
                                  console.error(err);
                                  toast.error(
                                    t("export.error") ||
                                      "Translation failed, please try again",
                                  );
                                }
                              }}
                            >
                              {t("export.translateToEnglish") ||
                                "Translate to English"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: "/app/prescriptions" })}
                >
                  {t("common.cancel")}
                </Button>
                {!isReadOnly && (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? t("common.saving")
                      : isEditing
                        ? t("prescriptionForm.buttons.update")
                        : t("prescriptionForm.buttons.create")}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
