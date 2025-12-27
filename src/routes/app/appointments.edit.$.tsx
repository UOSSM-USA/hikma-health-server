import { createFileRoute } from "@tanstack/react-router";
import { getAppointmentById } from "@/lib/server-functions/appointments";
import Appointment from "@/models/appointment";
import { useForm } from "react-hook-form";
import { createServerFn } from "@tanstack/react-start";
import Select from "react-select";
import { useEffect, useState } from "react";
import ClinicDepartment from "@/models/clinic-department";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { v1 as uuidV1 } from "uuid";
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
import { format, formatDate } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import User from "@/models/user";
import Clinic from "@/models/clinic";
import { SelectInput } from "@/components/select-input";
import { getAllClinics, getClinicById } from "@/lib/server-functions/clinics";
import { getAllUsers } from "@/lib/server-functions/users";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { PatientSearchSelect } from "@/components/patient-search-select";
import { getPatientById } from "@/lib/server-functions/patients";
import type Patient from "@/models/patient";
import If from "@/components/if";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation, useLanguage } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";

// Simple heuristic to detect if text contains Arabic characters
const hasArabicChars = (text: string): boolean => /[\u0600-\u06FF]/.test(text);

const saveAppointment = createServerFn({ method: "POST" })
  .validator(
    (data: {
      appointment: Appointment.EncodedT;
      id: string | null;
      currentUserName: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { appointment, id, currentUserName } = data;
    return await Appointment.API.save(id, appointment, currentUserName);
  });

export const Route = createFileRoute("/app/appointments/edit/$")({
  component: RouteComponent,
  loader: async ({ params, location }) => {
    const appointmentId = params["_splat"];

    let patientId: string | null = null;
    if (!appointmentId || typeof appointmentId !== "string") {
      patientId =
        (location.search as { patientId?: string })?.patientId || null;
    }

    const result: {
      appointment: Appointment.EncodedT | null;
      users: User.EncodedT[];
      clinics: Clinic.EncodedT[];
      currentUser: User.EncodedT | null;
      patient: Patient.EncodedT | null;
    } = {
      appointment: null,
      users: [],
      clinics: [],
      currentUser: null,
      patient: null,
    };
    if (appointmentId) {
      result.appointment = (await getAppointmentById({
        data: { id: appointmentId },
      })) as Appointment.EncodedT | null;
      patientId = result?.appointment?.patient_id || null;
    }

    result.users = (await getAllUsers()) as User.EncodedT[];
    result.clinics = (await getAllClinics()) as Clinic.EncodedT[];
    result.currentUser = (await getCurrentUser()) as User.EncodedT | null;
    if (patientId) {
      const patientResult = (await getPatientById({
        data: { id: patientId },
      })) as { patient?: Patient.EncodedT | null };
      result.patient = patientResult?.patient || null;
    }
    return result;
  },
});

// Duration options
const DURATION_OPTION_DEFS = [
  { key: "unknown" as const, value: 0 },
  { key: "minutes15" as const, value: 15 },
  { key: "minutes30" as const, value: 30 },
  { key: "minutes45" as const, value: 45 },
  { key: "hour1" as const, value: 60 },
  { key: "hours2" as const, value: 60 * 2 },
  { key: "hours3" as const, value: 60 * 3 },
  { key: "hours8" as const, value: 60 * 8 },
];

// Reason options
const REASON_OPTION_DEFS = [
  { key: "doctorVisit" as const, value: "doctor-visit" },
  { key: "screening" as const, value: "screening" },
  { key: "referral" as const, value: "referral" },
  { key: "checkup" as const, value: "checkup" },
  { key: "followUp" as const, value: "follow-up" },
  { key: "counselling" as const, value: "counselling" },
  { key: "procedure" as const, value: "procedure" },
  { key: "investigation" as const, value: "investigation" },
  { key: "other" as const, value: "other" },
];

// Status options
const STATUS_OPTION_DEFS = [
  { key: "pending" as const, value: "pending" },
  { key: "confirmed" as const, value: "confirmed" },
  { key: "cancelled" as const, value: "cancelled" },
  { key: "completed" as const, value: "completed" },
  { key: "checkedIn" as const, value: "checked_in" },
];

const DEFAULT_FORM_VALUES: Partial<Appointment.EncodedT> = {
  provider_id: null,
  clinic_id: "",
  patient_id: "",
  user_id: "",
  current_visit_id: "",
  fulfilled_visit_id: null,
  timestamp: new Date(),
  duration: 0,
  reason: "",
  notes: "",
  status: "pending" as const,
  metadata: {},
  departments: [],
  is_walk_in: false,
  is_deleted: false,
  created_at: new Date(),
  updated_at: new Date(),
  last_modified: new Date(),
  server_created_at: new Date(),
  deleted_at: null,
};

function RouteComponent() {
  const {
    appointment,
    users: providers,
    clinics,
    currentUser,
    patient,
  } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const params = Route.useParams();
  const appointmentId = params._splat;
  const isEditing = !!appointmentId;
  const t = useTranslation();
  const { language } = useLanguage();

  // State for translated provider, clinic, and department names
  const [translatedProviderNames, setTranslatedProviderNames] = useState<Record<string, string>>({});
  const [translatedClinicNames, setTranslatedClinicNames] = useState<Record<string, string>>({});
  const [translatedDepartmentNames, setTranslatedDepartmentNames] = useState<Record<string, string>>({});
  const [translatedNotes, setTranslatedNotes] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<
    ClinicDepartment.EncodedT[]
  >([]);

  // Clear translation cache when language changes
  useEffect(() => {
    setTranslatedProviderNames({});
    setTranslatedClinicNames({});
    setTranslatedDepartmentNames({});
    setTranslatedNotes(null);
  }, [language]);

  // Auto-translate provider, clinic, department names, and notes
  useEffect(() => {
    if (language !== "en" && language !== "ar") return;
    const targetLang = language;

    void (async () => {
      const providerUpdates: Record<string, string> = {};
      const clinicUpdates: Record<string, string> = {};
      const deptUpdates: Record<string, string> = {};

      // Translate provider names
      for (const provider of providers) {
        const providerName = provider.name || "";
        if (!providerName) continue;
        const hasArabic = hasArabicChars(providerName);
        
        if (targetLang === "en" && hasArabic) {
          try {
            const res = await translateText({
              data: { text: providerName, from: "ar", to: "en" },
            });
            providerUpdates[provider.id] = res.translated || providerName;
          } catch (err) {
            providerUpdates[provider.id] = providerName;
          }
        } else if (targetLang === "ar" && !hasArabic) {
          try {
            const res = await translateText({
              data: { text: providerName, from: "en", to: "ar" },
            });
            providerUpdates[provider.id] = res.translated || providerName;
          } catch (err) {
            providerUpdates[provider.id] = providerName;
          }
        } else {
          providerUpdates[provider.id] = providerName;
        }
      }

      // Translate clinic names
      for (const clinic of clinics) {
        const clinicName = clinic.name || "";
        if (!clinicName) continue;
        const hasArabic = hasArabicChars(clinicName);
        
        if (targetLang === "en" && hasArabic) {
          try {
            const res = await translateText({
              data: { text: clinicName, from: "ar", to: "en" },
            });
            clinicUpdates[clinic.id] = res.translated || clinicName;
          } catch (err) {
            clinicUpdates[clinic.id] = clinicName;
          }
        } else if (targetLang === "ar" && !hasArabic) {
          try {
            const res = await translateText({
              data: { text: clinicName, from: "en", to: "ar" },
            });
            clinicUpdates[clinic.id] = res.translated || clinicName;
          } catch (err) {
            clinicUpdates[clinic.id] = clinicName;
          }
        } else {
          clinicUpdates[clinic.id] = clinicName;
        }
      }

      // Translate department names
      for (const dept of availableDepartments) {
        const deptName = dept.name || "";
        if (!deptName) continue;
        const hasArabic = hasArabicChars(deptName);
        
        if (targetLang === "en" && hasArabic) {
          try {
            const res = await translateText({
              data: { text: deptName, from: "ar", to: "en" },
            });
            deptUpdates[dept.id] = res.translated || deptName;
          } catch (err) {
            deptUpdates[dept.id] = deptName;
          }
        } else if (targetLang === "ar" && !hasArabic) {
          try {
            const res = await translateText({
              data: { text: deptName, from: "en", to: "ar" },
            });
            deptUpdates[dept.id] = res.translated || deptName;
          } catch (err) {
            deptUpdates[dept.id] = deptName;
          }
        } else {
          deptUpdates[dept.id] = deptName;
        }
      }

      // Translate notes if editing existing appointment
      if (isEditing && appointment?.notes) {
        const notes = appointment.notes.trim();
        if (notes) {
          const hasArabic = hasArabicChars(notes);
          if (targetLang === "en" && hasArabic) {
            try {
              const res = await translateText({
                data: { text: notes, from: "ar", to: "en" },
              });
              setTranslatedNotes(res.translated || notes);
            } catch (err) {
              setTranslatedNotes(notes);
            }
          } else if (targetLang === "ar" && !hasArabic) {
            try {
              const res = await translateText({
                data: { text: notes, from: "en", to: "ar" },
              });
              setTranslatedNotes(res.translated || notes);
            } catch (err) {
              setTranslatedNotes(notes);
            }
          } else {
            setTranslatedNotes(notes);
          }
        }
      }

      if (Object.keys(providerUpdates).length > 0) {
        setTranslatedProviderNames(providerUpdates);
      }
      if (Object.keys(clinicUpdates).length > 0) {
        setTranslatedClinicNames(clinicUpdates);
      }
      if (Object.keys(deptUpdates).length > 0) {
        setTranslatedDepartmentNames(deptUpdates);
      }
    })();
  }, [language, providers, clinics, availableDepartments, isEditing, appointment]);

  console.log({ appointment });

  const form = useForm<Appointment.EncodedT>({
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      ...appointment,
      patient_id: patient?.id || "",
      provider_id: currentUser?.id || "",
    } as Appointment.EncodedT,
  });
  const isSubmitting = form.formState.isSubmitting;

  const durationOptions = DURATION_OPTION_DEFS.map((option) => ({
    label: t(`appointmentForm.durations.${option.key}`),
    value: option.value,
  }));

  const reasonOptions = REASON_OPTION_DEFS.map((option) => ({
    label: t(`appointmentForm.reasons.${option.key}`),
    value: option.value,
  }));

  const statusOptions = STATUS_OPTION_DEFS.map((option) => ({
    label: t(`appointmentForm.statuses.${option.key}`),
    value: option.value,
  }));

  // Handle form submission
  const onSubmit = async (values: Appointment.EncodedT) => {
    if (!currentUser) return;
    try {
      await saveAppointment({
        data: {
          appointment: {
            ...values,
            id: appointment?.id || uuidV1(),
            user_id: currentUser?.id || "",
          },
          id: isEditing ? appointment?.id || null : null,
          currentUserName: currentUser?.name || "",
        },
      });

      toast.success(
        isEditing
          ? t("messages.appointmentUpdated")
          : t("messages.appointmentCreated"),
      );
      navigate({ to: "/app/appointments" });
    } catch (error) {
      console.error("Error saving appointment:", error);
      toast.error(t("messages.appointmentSaveError"));
    }
  };

  // print out the selected clinic
  console.log("Selected Clinic:", form.watch("clinic_id"));

  const selectedClinic = form.watch("clinic_id");

  // Fetch departments when clinic changes
  useEffect(() => {
    const handleDepartmentsUpdate = async () => {
      if (selectedClinic) {
        try {
          const clinicResponse = (await getClinicById({
            data: { id: selectedClinic },
          })) as { data?: { departments?: ClinicDepartment.EncodedT[] } };
          if (clinicResponse?.data?.departments) {
            setAvailableDepartments(clinicResponse.data.departments);

            // Update form field with departments if they don't already have values
            const currentDepartments = form.getValues("departments");
            if (!currentDepartments || currentDepartments.length === 0) {
              // Don't auto-populate departments, let user select them
              form.setValue("departments", []);
            }
          }
        } catch (error) {
          console.error("Failed to fetch departments:", error);
          setAvailableDepartments([]);
        }
      } else {
        setAvailableDepartments([]);
        form.setValue("departments", []);
      }
    };

    handleDepartmentsUpdate();
  }, [selectedClinic]);

  // TODO: Default provider and clinic selection based on who is the current use

  console.log(form.watch());

  return (
    <div className="">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold mb-2">
            {isEditing
              ? t("appointmentForm.titleEdit")
              : t("appointmentForm.titleCreate")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isEditing
              ? t("appointmentForm.subtitleEdit")
              : t("appointmentForm.subtitleCreate")}
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="is_walk_in"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Checkbox
                      label={t("appointmentForm.walkInLabel")}
                      description={t("appointmentForm.walkInDescription")}
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <PatientSearchSelect
                onChange={(patient) =>
                  form.setValue("patient_id", patient?.id || "")
                }
                value={patient?.id || ""}
                defaultValue={patient?.id || ""}
                defaultPatients={patient ? [patient] : []}
                label={t("appointmentForm.patientLabel")}
                clearable
                description={t("appointmentForm.patientDescription")}
                withAsterisk
              />
              <FormField
                control={form.control}
                name="provider_id"
                render={({ field }) => (
                  <SelectInput
                  label={t("appointmentForm.providerLabel")}
                  data={providers.map((provider) => ({
                    label: translatedProviderNames[provider.id] || provider.name,
                    value: provider.id,
                  }))}
                  value={field.value || ""}
                  onChange={field.onChange}
                  clearable
                  className="w-full"
                  placeholder={t("appointmentForm.providerPlaceholder")}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="clinic_id"
                render={({ field }) => (
                  <SelectInput
                  label={t("appointmentForm.clinicLabel")}
                  data={clinics.map((clinic) => ({
                    label: translatedClinicNames[clinic.id] || clinic.name || t("common.unknown"),
                    value: clinic.id,
                  }))}
                  value={field.value || ""}
                  onChange={field.onChange}
                  clearable
                  className="w-full"
                  placeholder={t("appointmentForm.clinicPlaceholder")}
                  />
                )}
              />

              <If show={selectedClinic.length > 0}>
                <FormField
                  control={form.control}
                  name="departments"
                  render={({ field }) => {
                    const selectedDepartments = field.value || [];

                    // Create options from available departments
                    const departmentOptions = availableDepartments.map(
                      (dept) => ({
                        value: dept.id,
                        label: translatedDepartmentNames[dept.id] || dept.name,
                        department: dept,
                      }),
                    );

                    // Map current value to options format
                    const currentValue = selectedDepartments.map((dept) => ({
                      value: dept.id,
                      label:
                        availableDepartments.find((d) => d.id === dept.id)
                          ?.name || dept.id,
                      department: availableDepartments.find(
                        (d) => d.id === dept.id,
                      ),
                    }));

                    return (
                      <FormItem>
                        <FormLabel>
                          {t("appointmentForm.departmentLabel")}
                        </FormLabel>
                        <Select
                          isMulti
                          options={departmentOptions}
                          value={currentValue}
                          onChange={(selected) => {
                            const newDepartments = (selected || []).map(
                              (option) => ({
                                id: option.value,
                                name: option.label,
                                seen_at: null,
                                seen_by: null,
                                status: "pending" as const,
                              }),
                            );

                            // Preserve existing data for departments that were already selected
                            const updatedDepartments = newDepartments.map(
                              (newDept) => {
                                const existing = selectedDepartments.find(
                                  (d: any) => d.id === newDept.id,
                                );
                                if (existing) {
                                  return existing; // Keep existing data
                                }
                                return newDept; // New department with defaults
                              },
                            );

                            field.onChange(updatedDepartments);
                          }}
                          placeholder={t("appointmentForm.departmentPlaceholder")}
                          className="basic-multi-select"
                          classNamePrefix="select"
                          // styles={{
                          //   control: (base) => ({
                          //     ...base,
                          //     minHeight: "36px",
                          //     backgroundColor: "hsl(var(--background))",
                          //     borderColor: "hsl(var(--border))",
                          //     "&:hover": {
                          //       borderColor: "hsl(var(--border))",
                          //     },
                          //   }),
                          //   menu: (base) => ({
                          //     ...base,
                          //     backgroundColor: "hsl(var(--background))",
                          //     border: "1px solid hsl(var(--border))",
                          //   }),
                          //   option: (base, state) => ({
                          //     ...base,
                          //     backgroundColor: state.isFocused
                          //       ? "hsl(var(--accent))"
                          //       : "hsl(var(--background))",
                          //     color: "hsl(var(--foreground))",
                          //     cursor: "pointer",
                          //     "&:hover": {
                          //       backgroundColor: "hsl(var(--accent))",
                          //     },
                          //   }),
                          //   multiValue: (base) => ({
                          //     ...base,
                          //     backgroundColor: "hsl(var(--secondary))",
                          //   }),
                          //   multiValueLabel: (base) => ({
                          //     ...base,
                          //     color: "hsl(var(--secondary-foreground))",
                          //   }),
                          //   multiValueRemove: (base) => ({
                          //     ...base,
                          //     color: "hsl(var(--secondary-foreground))",
                          //     "&:hover": {
                          //       backgroundColor: "hsl(var(--destructive))",
                          //       color: "hsl(var(--destructive-foreground))",
                          //     },
                          //   }),
                          //   input: (base) => ({
                          //     ...base,
                          //     color: "hsl(var(--foreground))",
                          //   }),
                          //   placeholder: (base) => ({
                          //     ...base,
                          //     color: "hsl(var(--muted-foreground))",
                          //   }),
                          // }}
                        />
                        <FormDescription>
                          {t("appointmentForm.departmentDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </If>

              <FormField
                control={form.control}
                name="timestamp"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("appointmentForm.dateLabel")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value
                              ? format(new Date(field.value), "PPP HH:mm", {
                                  locale: language === "ar" ? ar : undefined,
                                })
                              : t("appointmentForm.datetimePlaceholder")}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={new Date(field.value)}
                          onSelect={(date) => {
                            if (date) {
                              const currentDate = new Date(field.value);
                              date.setHours(currentDate.getHours());
                              date.setMinutes(currentDate.getMinutes());
                              field.onChange(date);
                            }
                          }}
                          initialFocus
                        />
                        <div className="p-3 border-t border-border">
                          <Input
                            type="time"
                            value={format(new Date(field.value), "HH:mm")}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value
                                .split(":")
                                .map(Number);
                              const date = new Date(field.value);
                              date.setHours(hours);
                              date.setMinutes(minutes);
                              field.onChange(date);
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    <If show={form.watch("is_walk_in")}>
                      <FormDescription>
                        {t("appointmentForm.walkInSchedulingNote")}
                      </FormDescription>
                    </If>
                    <FormDescription>
                      {t("appointmentForm.currentTimeNote")}{" "}
                      {formatDate(new Date(), "PPP HH:mm", {
                        locale: language === "ar" ? ar : undefined,
                      })}
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <SelectInput
                    data={durationOptions.map((option) => ({
                      label: option.label,
                      value: option.value.toString(),
                    }))}
                    value={field.value.toString()}
                    onChange={(value) => field.onChange(Number(value))}
                    placeholder={t("appointmentForm.durationPlaceholder")}
                    className="w-full"
                    label={t("appointmentForm.durationLabel")}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <SelectInput
                    label={t("appointmentForm.reasonLabel")}
                    data={reasonOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder={t("appointmentForm.reasonPlaceholder")}
                    className="w-full"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <SelectInput
                    label={t("appointmentForm.statusLabel")}
                    data={statusOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder={t("appointmentForm.statusPlaceholder")}
                    className="w-full"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("appointmentForm.notesLabel")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("appointmentForm.notesPlaceholder")}
                        className="resize-none"
                        value={isEditing && translatedNotes !== null ? translatedNotes : field.value}
                        onChange={(e) => {
                          field.onChange(e);
                          if (isEditing) {
                            setTranslatedNotes(null); // Clear translation when user edits
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: "/app/appointments" })}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? t("common.saving")
                    : isEditing
                      ? t("appointmentForm.buttons.update")
                      : t("appointmentForm.buttons.create")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
