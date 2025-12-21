import { createFileRoute } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { getAllAppointmentsWithDetails } from "@/lib/server-functions/appointments";
import ClinicDepartment from "@/models/clinic-department";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import truncate from "lodash/truncate";
import { SelectInput } from "@/components/select-input";
import { toggleAppointmentStatus } from "@/lib/server-functions/appointments";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { useTranslation, useLanguage } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/app/appointments/")({
  component: RouteComponent,
  loader: async () => {
    const appointments = await getAllAppointmentsWithDetails();

    // Get all unique department IDs from appointments
    const departmentIds = new Set<string>();
    appointments.forEach((appt) => {
      if (appt?.appointment?.departments) {
        appt.appointment.departments.forEach((dept: any) => {
          departmentIds.add(dept.id);
        });
      }
    });

    // Fetch department details
    const departmentMap = new Map<string, string>();
    for (const deptId of departmentIds) {
      try {
        const dept = await ClinicDepartment.API.getById(deptId);
        if (dept) {
          departmentMap.set(deptId, dept.name);
        }
      } catch {
        console.error(`Failed to fetch department ${deptId}`);
      }
    }

    return {
      appointments,
      currentUser: await getCurrentUser(),
      departmentNames: Object.fromEntries(departmentMap),
    };
  },
});

// TODO: Support pagination and search

// Simple heuristic to detect if text contains Arabic characters
const hasArabicChars = (text: string): boolean => /[\u0600-\u06FF]/.test(text);

function RouteComponent() {
  const { appointments, departmentNames } = Route.useLoaderData();
  const router = useRouter();
  const t = useTranslation();
  const { language } = useLanguage();

  // Cache translated content per appointment id and target language
  const [translatedNotesById, setTranslatedNotesById] = useState<
    Record<string, { en?: string; ar?: string }>
  >({});
  const [translatedPatientNamesById, setTranslatedPatientNamesById] = useState<
    Record<string, { en?: string; ar?: string }>
  >({});
  const [translatedProviderNamesById, setTranslatedProviderNamesById] = useState<
    Record<string, { en?: string; ar?: string }>
  >({});
  const [translatedClinicNamesById, setTranslatedClinicNamesById] = useState<
    Record<string, { en?: string; ar?: string }>
  >({});
  const [translatedDepartmentNamesById, setTranslatedDepartmentNamesById] = useState<
    Record<string, Record<string, { en?: string; ar?: string }>>
  >({});

  // Clear translation cache when language changes
  useEffect(() => {
    setTranslatedNotesById({});
    setTranslatedPatientNamesById({});
    setTranslatedProviderNamesById({});
    setTranslatedClinicNamesById({});
    setTranslatedDepartmentNamesById({});
  }, [language]);

  // Auto-translate all dynamic content (notes, patient names, provider names, clinic names, department names)
  useEffect(() => {
    if (language !== "en" && language !== "ar") return;

    const targetLang = language;
    const toTranslateNotes: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslatePatientNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslateProviderNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslateClinicNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslateDepartmentNames: { appointmentId: string; deptId: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];

    for (const appt of appointments as any[]) {
      const appointment = appt?.appointment;
      if (!appointment) continue;
      
      const patient = appt?.patient || {};
      const provider = appt?.provider || {};
      const clinic = appt?.clinic || {};

      // Translate notes
      const notes = (appointment.notes || "").trim();
      if (notes) {
        const cache = translatedNotesById[appointment.id];
        const hasArabic = hasArabicChars(notes);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateNotes.push({ id: appointment.id, text: notes, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateNotes.push({ id: appointment.id, text: notes, from: "en", to: "ar" });
        }
      }

      // Translate patient name
      const patientGivenName = patient?.given_name || "";
      const patientSurname = patient?.surname || "";
      const patientFullName = `${patientGivenName} ${patientSurname}`.trim();
      if (patientFullName) {
        const cache = translatedPatientNamesById[appointment.id];
        const hasArabic = hasArabicChars(patientFullName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslatePatientNames.push({ id: appointment.id, text: patientFullName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslatePatientNames.push({ id: appointment.id, text: patientFullName, from: "en", to: "ar" });
        }
      }

      // Translate provider name
      const providerName = (provider?.name || "").trim();
      if (providerName) {
        const cache = translatedProviderNamesById[appointment.id];
        const hasArabic = hasArabicChars(providerName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateProviderNames.push({ id: appointment.id, text: providerName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateProviderNames.push({ id: appointment.id, text: providerName, from: "en", to: "ar" });
        }
      }

      // Translate clinic name
      const clinicName = (clinic?.name || "").trim();
      if (clinicName) {
        const cache = translatedClinicNamesById[appointment.id];
        const hasArabic = hasArabicChars(clinicName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateClinicNames.push({ id: appointment.id, text: clinicName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateClinicNames.push({ id: appointment.id, text: clinicName, from: "en", to: "ar" });
        }
      }

      // Translate department names
      if (appointment.departments && Array.isArray(appointment.departments)) {
        for (const dept of appointment.departments) {
          const deptName = departmentNames[dept.id] || "";
          if (deptName) {
            const cache = translatedDepartmentNamesById[appointment.id]?.[dept.id];
            const hasArabic = hasArabicChars(deptName);
            if (targetLang === "en" && hasArabic && !cache?.en) {
              toTranslateDepartmentNames.push({ appointmentId: appointment.id, deptId: dept.id, text: deptName, from: "ar", to: "en" });
            } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
              toTranslateDepartmentNames.push({ appointmentId: appointment.id, deptId: dept.id, text: deptName, from: "en", to: "ar" });
            }
          }
        }
      }
    }

    // Fire off translations in the background; best-effort only
    void (async () => {
      // Translate notes
      for (const entry of toTranslateNotes) {
        try {
          const res = await translateText({
            data: { text: entry.text, from: entry.from, to: entry.to },
          });
          setTranslatedNotesById((prev) => ({
            ...prev,
            [entry.id]: { ...(prev[entry.id] || {}), [entry.to]: res.translated || entry.text },
          }));
        } catch (err) {
          console.error("Failed to translate appointment notes:", err);
        }
      }

      // Translate patient names
      for (const entry of toTranslatePatientNames) {
        try {
          const res = await translateText({
            data: { text: entry.text, from: entry.from, to: entry.to },
          });
          setTranslatedPatientNamesById((prev) => ({
            ...prev,
            [entry.id]: { ...(prev[entry.id] || {}), [entry.to]: res.translated || entry.text },
          }));
        } catch (err) {
          console.error("Failed to translate patient name:", err);
        }
      }

      // Translate provider names
      for (const entry of toTranslateProviderNames) {
        try {
          const res = await translateText({
            data: { text: entry.text, from: entry.from, to: entry.to },
          });
          setTranslatedProviderNamesById((prev) => ({
            ...prev,
            [entry.id]: { ...(prev[entry.id] || {}), [entry.to]: res.translated || entry.text },
          }));
        } catch (err) {
          console.error("Failed to translate provider name:", err);
        }
      }

      // Translate clinic names
      for (const entry of toTranslateClinicNames) {
        try {
          const res = await translateText({
            data: { text: entry.text, from: entry.from, to: entry.to },
          });
          setTranslatedClinicNamesById((prev) => ({
            ...prev,
            [entry.id]: { ...(prev[entry.id] || {}), [entry.to]: res.translated || entry.text },
          }));
        } catch (err) {
          console.error("Failed to translate clinic name:", err);
        }
      }

      // Translate department names
      for (const entry of toTranslateDepartmentNames) {
        try {
          const res = await translateText({
            data: { text: entry.text, from: entry.from, to: entry.to },
          });
          setTranslatedDepartmentNamesById((prev) => ({
            ...prev,
            [entry.appointmentId]: {
              ...(prev[entry.appointmentId] || {}),
              [entry.deptId]: {
                ...(prev[entry.appointmentId]?.[entry.deptId] || {}),
                [entry.to]: res.translated || entry.text,
              },
            },
          }));
        } catch (err) {
          console.error("Failed to translate department name:", err);
        }
      }
    })();
  }, [appointments, language, departmentNames]);

  // Function to calculate age from date of birth
  const calculateAge = (dateOfBirth: Date | string | null | undefined) => {
    if (!dateOfBirth) return t("appointmentsList.notAvailable");
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  };

  console.log({ appointments });

  // Function to handle status change
  const handleStatusChange = (appointmentId: string, newStatus: string) => {
    toggleAppointmentStatus({ data: { id: appointmentId, status: newStatus } })
      .then(() => {
        toast.success(t("appointmentsList.statusUpdatedSuccess"));
        router.invalidate({ sync: true });
      })
      .catch(() => {
        toast.error(t("appointmentsList.statusUpdateError"));
      });
  };

  return (
    <TooltipProvider>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">{t("appointmentsList.title")}</h1>

        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("appointmentsList.patientIdHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.typeHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.appointmentTimeHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.givenNameHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.lastNameHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.ageHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.clinicHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.providerHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.departmentsHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.durationHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.notesHeader")}</TableHead>
                  <TableHead>{t("appointmentsList.statusHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appt) => (
                  <TableRow key={appt?.appointment?.id}>
                    <TableCell title={appt?.patient?.id}>
                      {truncate(appt?.patient?.id, { length: 12 })}
                    </TableCell>
                    <TableCell>
                      {appt?.appointment?.is_walk_in ? (
                        <Badge variant="secondary">{t("appointmentsList.walkIn")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("appointmentsList.scheduled")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {appt?.appointment?.timestamp ? (
                        <div className="text-sm">
                          <div className="font-medium">
                            {new Date(
                              appt.appointment.timestamp,
                            ).toLocaleDateString(language === "ar" ? "ar-SA" : undefined)}
                          </div>
                          <div className="text-muted-foreground">
                            {new Date(
                              appt.appointment.timestamp,
                            ).toLocaleTimeString(language === "ar" ? "ar-SA" : undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const appointment = appt?.appointment;
                        if (!appointment) return "—";
                        const patientGivenName = appt?.patient?.given_name || "";
                        const patientSurname = appt?.patient?.surname || "";
                        const patientFullName = `${patientGivenName} ${patientSurname}`.trim();
                        return language === "en"
                          ? translatedPatientNamesById[appointment.id]?.en || patientFullName || "—"
                          : language === "ar"
                            ? translatedPatientNamesById[appointment.id]?.ar || patientFullName || "—"
                            : patientFullName || "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const appointment = appt?.appointment;
                        if (!appointment) return "—";
                        const patientSurname = appt?.patient?.surname || "";
                        // For surname, we'll use the translated full name and extract surname if needed
                        // For simplicity, just show the full name translation's last part
                        const patientFullName = `${appt?.patient?.given_name || ""} ${patientSurname}`.trim();
                        const translatedFullName = language === "en"
                          ? translatedPatientNamesById[appointment.id]?.en || patientFullName
                          : language === "ar"
                            ? translatedPatientNamesById[appointment.id]?.ar || patientFullName
                            : patientFullName;
                        // Extract surname from translated full name (last word)
                        const parts = translatedFullName.split(" ");
                        return parts.length > 1 ? parts[parts.length - 1] : translatedFullName || "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      {calculateAge(appt?.patient?.date_of_birth)}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const appointment = appt?.appointment;
                        if (!appointment) return "—";
                        const clinicName = appt?.clinic?.name || "";
                        return language === "en"
                          ? translatedClinicNamesById[appointment.id]?.en || clinicName || "—"
                          : language === "ar"
                            ? translatedClinicNamesById[appointment.id]?.ar || clinicName || "—"
                            : clinicName || "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const appointment = appt?.appointment;
                        if (!appointment) return "—";
                        const providerName = appt?.provider?.name || "";
                        return language === "en"
                          ? translatedProviderNamesById[appointment.id]?.en || providerName || "—"
                          : language === "ar"
                            ? translatedProviderNamesById[appointment.id]?.ar || providerName || "—"
                            : providerName || "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      {appt?.appointment?.departments &&
                      appt?.appointment?.departments.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {appt.appointment.departments.map((dept: any) => {
                            const originalDeptName = String(
                              departmentNames[dept.id] ||
                                `${t("appointmentsList.deptPrefix")} ${dept.id.substring(0, 8)}`,
                            );
                            const translatedDeptName = language === "en"
                              ? translatedDepartmentNamesById[appt?.appointment?.id]?.[dept.id]?.en || originalDeptName
                              : language === "ar"
                                ? translatedDepartmentNamesById[appt?.appointment?.id]?.[dept.id]?.ar || originalDeptName
                                : originalDeptName;
                            const deptName = translatedDeptName;
                            const statusIcon =
                              dept.status === "completed"
                                ? "✓"
                                : dept.status === "in_progress"
                                  ? "⏳"
                                  : "○";

                            return (
                              <Tooltip key={dept.id}>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant={
                                      dept.status === "completed"
                                        ? "default"
                                        : dept.status === "in_progress"
                                          ? "secondary"
                                          : "outline"
                                    }
                                    className="text-xs cursor-help"
                                  >
                                    {statusIcon} {deptName}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <div className="space-y-1 text-xs">
                                    <p className="font-semibold">{deptName}</p>
                                    <p>
                                      {t("appointmentsList.statusLabel")}{" "}
                                      <span className="capitalize">
                                        {dept.status.replace("_", " ")}
                                      </span>
                                    </p>
                                    {dept.seen_at && (
                                      <p>
                                        {t("appointmentsList.seenAtLabel")}{" "}
                                        {new Date(
                                          dept.seen_at,
                                        ).toLocaleString(language === "ar" ? "ar-SA" : undefined)}
                                      </p>
                                    )}
                                    {dept.seen_by && (
                                      <p>{t("appointmentsList.seenByLabel")} {String(dept.seen_by)}</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t("appointmentsList.noDepartments")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{appt?.appointment?.duration}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {(() => {
                        const appointment = appt?.appointment;
                        if (!appointment) return "—";
                        
                        const notes = appointment.notes || "";
                        if (!notes.trim()) return "—";
                        
                        // Display translated version if available, otherwise original
                        const cache = translatedNotesById[appointment.id];
                        if (language === "en" && cache?.en) {
                          return cache.en;
                        } else if (language === "ar" && cache?.ar) {
                          return cache.ar;
                        }
                        return notes;
                      })()}
                    </TableCell>
                    <TableCell>
                      <SelectInput
                        value={appt?.appointment?.status}
                        data={[
                          { label: t("appointmentForm.statuses.pending"), value: "pending" },
                          { label: t("appointmentForm.statuses.confirmed"), value: "confirmed" },
                          { label: t("appointmentForm.statuses.cancelled"), value: "cancelled" },
                          { label: t("appointmentForm.statuses.completed"), value: "completed" },
                          { label: t("appointmentForm.statuses.checkedIn"), value: "checked_in" },
                        ]}
                        onChange={(value) =>
                          handleStatusChange(
                            appt?.appointment?.id,
                            value as string,
                          )
                        }
                      />
                      {/* <Select
                      defaultValue={appt?.appointment?.status}
                      onValueChange={(value) =>
                        handleStatusChange(appt?.appointment?.id, value)
                      }
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="checked_in">Checked In</SelectItem>
                      </SelectContent>
                    </Select> */}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
