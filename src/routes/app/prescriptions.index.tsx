import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/server-functions/auth";
import {
  getAllPrescriptionsWithDetails,
  togglePrescriptionStatus,
} from "@/lib/server-functions/prescriptions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { SelectInput } from "@/components/select-input";
import Prescription from "@/models/prescription";
import upperFirst from "lodash/upperFirst";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useLanguage, useTranslation } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";

export const Route = createFileRoute("/app/prescriptions/")({
  component: RouteComponent,
  loader: async () => {
    return {
      prescriptions: await getAllPrescriptionsWithDetails(),
      currentUser: await getCurrentUser(),
    };
  },
});

// Simple heuristic to detect if text contains Arabic characters
const hasArabicChars = (text: string): boolean => /[\u0600-\u06FF]/.test(text);

function RouteComponent() {
  const router = useRouter();
  const { prescriptions } = Route.useLoaderData();
  const t = useTranslation();
  const { language } = useLanguage();

  // Cache translated content per prescription id and target language
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

  // Clear translation cache when language changes
  useEffect(() => {
    setTranslatedNotesById({});
    setTranslatedPatientNamesById({});
    setTranslatedProviderNamesById({});
    setTranslatedClinicNamesById({});
  }, [language]);

  // Auto-translate all dynamic content (notes, patient names, provider names, clinic names)
  useEffect(() => {
    if (language !== "en" && language !== "ar") return;

    const targetLang = language;
    const toTranslateNotes: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslatePatientNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslateProviderNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];
    const toTranslateClinicNames: { id: string; text: string; from: "ar" | "en"; to: "ar" | "en" }[] = [];

    for (const item of prescriptions as any[]) {
      const prescription = (item.prescription || item) as Prescription.EncodedT;
      const patient = item.patient || {};
      const provider = item.provider || {};
      const clinic = item.clinic || {};

      // Translate notes
      const notes = (prescription.notes || "").trim();
      if (notes) {
        const cache = translatedNotesById[prescription.id];
        const hasArabic = hasArabicChars(notes);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateNotes.push({ id: prescription.id, text: notes, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateNotes.push({ id: prescription.id, text: notes, from: "en", to: "ar" });
        }
      }

      // Translate patient name
      const patientGivenName = (patient as any).given_name || "";
      const patientSurname = (patient as any).surname || "";
      const patientFullName = `${patientGivenName} ${patientSurname}`.trim();
      if (patientFullName) {
        const cache = translatedPatientNamesById[prescription.id];
        const hasArabic = hasArabicChars(patientFullName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslatePatientNames.push({ id: prescription.id, text: patientFullName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslatePatientNames.push({ id: prescription.id, text: patientFullName, from: "en", to: "ar" });
        }
      }

      // Translate provider name
      const providerName = provider.name || (provider as any).given_name || "";
      const providerSurname = (provider as any).surname || "";
      const providerFullName = providerName ? `${providerName} ${providerSurname}`.trim() : "";
      if (providerFullName) {
        const cache = translatedProviderNamesById[prescription.id];
        const hasArabic = hasArabicChars(providerFullName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateProviderNames.push({ id: prescription.id, text: providerFullName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateProviderNames.push({ id: prescription.id, text: providerFullName, from: "en", to: "ar" });
        }
      }

      // Translate clinic name
      const clinicName = (clinic.name || "").trim();
      if (clinicName) {
        const cache = translatedClinicNamesById[prescription.id];
        const hasArabic = hasArabicChars(clinicName);
        if (targetLang === "en" && hasArabic && !cache?.en) {
          toTranslateClinicNames.push({ id: prescription.id, text: clinicName, from: "ar", to: "en" });
        } else if (targetLang === "ar" && !hasArabic && !cache?.ar) {
          toTranslateClinicNames.push({ id: prescription.id, text: clinicName, from: "en", to: "ar" });
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
          console.error("Failed to translate prescription notes:", err);
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
    })();
  }, [language, prescriptions]);

  // Map status value (with hyphens) to translation key (camelCase)
  const getStatusTranslationKey = (status: string): string => {
    const statusMap: Record<string, string> = {
      "picked-up": "pickedUp",
      "not-picked-up": "notPickedUp",
      "partially-picked-up": "partiallyPickedUp",
    };
    return statusMap[status] || status;
  };

  const handleStatusChange = async (id: string, status: string) => {
    togglePrescriptionStatus({ data: { id, status } })
      .then(() => {
        toast.success(t("prescriptionsList.statusUpdatedSuccess"));
        router.invalidate({ sync: true });
      })
      .catch(() => {
        toast.error(t("prescriptionsList.statusUpdateError"));
      });
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("prescriptionsList.title")}</h1>
        <Button asChild>
          <Link to="/app/prescriptions/edit/$" params={{ _splat: "new" }}>
            {t("prescriptionsList.addNewPrescription")}
          </Link>
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("prescriptionsList.patientNameHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.providerNameHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.clinicHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.statusHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.prescribedAtHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.expirationDateHeader")}</TableHead>
                <TableHead>{t("prescriptionsList.notesHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((item: any) => {
                const prescription = item.prescription || item;
                const patient = item.patient || {};
                const provider = item.provider || {};
                const clinic = item.clinic || {};
                
                // Get translated values
                const patientGivenName = (patient as any).given_name || "";
                const patientSurname = (patient as any).surname || "";
                const patientFullName = `${patientGivenName} ${patientSurname}`.trim();
                const translatedPatientName = language === "en"
                  ? translatedPatientNamesById[prescription.id]?.en || patientFullName
                  : language === "ar"
                    ? translatedPatientNamesById[prescription.id]?.ar || patientFullName
                    : patientFullName;

                const providerName = provider.name || (provider as any).given_name || "";
                const providerSurname = (provider as any).surname || "";
                const providerFullName = providerName ? `${providerName} ${providerSurname}`.trim() : "";
                const translatedProviderName = language === "en"
                  ? translatedProviderNamesById[prescription.id]?.en || providerFullName
                  : language === "ar"
                    ? translatedProviderNamesById[prescription.id]?.ar || providerFullName
                    : providerFullName;

                const clinicName = (clinic.name || "").trim();
                const translatedClinicName = language === "en"
                  ? translatedClinicNamesById[prescription.id]?.en || clinicName
                  : language === "ar"
                    ? translatedClinicNamesById[prescription.id]?.ar || clinicName
                    : clinicName;
                
                return (
                  <TableRow key={prescription.id}>
                    <TableCell>
                      {translatedPatientName || t("prescriptionsList.notAvailable")}
                    </TableCell>
                    <TableCell>
                      {translatedProviderName || t("prescriptionsList.notAvailable")}
                    </TableCell>
                    <TableCell>{translatedClinicName || t("prescriptionsList.notAvailable")}</TableCell>
                    <TableCell>
                      <SelectInput
                        data={Prescription.statusValues.map((status) => {
                          const translationKey = getStatusTranslationKey(status);
                          return {
                            value: status,
                            label: t(`prescriptionForm.statuses.${translationKey}` as any) || upperFirst(status),
                          };
                        })}
                        value={prescription.status}
                        onChange={(value) =>
                          handleStatusChange(prescription.id, value || "")
                        }
                        size="sm"
                        clearable={false}
                      />
                    </TableCell>
                    <TableCell>
                      {prescription.prescribed_at
                        ? format(new Date(prescription.prescribed_at), "PPP", {
                            locale: language === "ar" ? ar : undefined,
                          })
                        : t("prescriptionsList.notAvailable")}
                    </TableCell>
                    <TableCell>
                      {prescription.expiration_date
                        ? format(new Date(prescription.expiration_date), "PPP", {
                            locale: language === "ar" ? ar : undefined,
                          })
                        : t("prescriptionsList.notAvailable")}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {language === "en"
                        ? translatedNotesById[prescription.id]?.en || prescription.notes
                        : language === "ar"
                          ? translatedNotesById[prescription.id]?.ar || prescription.notes
                          : prescription.notes}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
