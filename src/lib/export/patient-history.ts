import ExcelJS from "exceljs";
import type Patient from "@/models/patient";
import type PatientVital from "@/models/patient-vital";
import type Appointment from "@/models/appointment";
import type Prescription from "@/models/prescription";
import type Event from "@/models/event";
import type Visit from "@/models/visit";
import { format } from "date-fns";

export type PatientHistoryData = {
  patient: Patient.EncodedT;
  vitals: PatientVital.EncodedT[];
  appointments: {
    appointment: Appointment.EncodedT;
    clinic: { name: string };
    provider: { given_name?: string; surname?: string } | null;
  }[];
  prescriptions: {
    prescription: Prescription.EncodedT;
    clinic: { name: string };
    provider: { given_name?: string; surname?: string } | null;
  }[];
  events: Event.EncodedT[];
  visits: Visit.EncodedT[];
};

/**
 * Export patient history to Excel
 */
export async function exportPatientHistoryToExcel(
  data: PatientHistoryData,
  translations: Record<string, string>,
  clinics?: { id: string; name: string | null }[]
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const patient = data.patient;

  const clinicNameById = new Map<string, string>();
  (clinics || []).forEach((clinic) => {
    if (clinic.id) {
      clinicNameById.set(clinic.id, clinic.name || "");
    }
  });

  // Patient Information Sheet
  const patientSheet = workbook.addWorksheet(translations.patient || "Patient");
  patientSheet.columns = [
    { header: translations.field || "Field", width: 20 },
    { header: translations.value || "Value", width: 40 },
  ];

  // Demographics
  patientSheet.addRow([translations.demographics || "Demographics", ""]);
  patientSheet.addRow([
    translations.patientId || "Patient ID",
    patient.id || "",
  ]);
  patientSheet.addRow([
    translations.givenName || "Given Name",
    patient.given_name || "",
  ]);
  patientSheet.addRow([
    translations.surname || "Surname",
    patient.surname || "",
  ]);
  patientSheet.addRow([
    translations.dateOfBirth || "Date of Birth",
    patient.date_of_birth
      ? format(new Date(patient.date_of_birth), "yyyy-MM-dd")
      : "",
  ]);
  patientSheet.addRow([translations.sex || "Sex", patient.sex || ""]);
  patientSheet.addRow([
    translations.citizenship || "Citizenship",
    patient.citizenship || "",
  ]);
  patientSheet.addRow([
    translations.hometown || "Hometown",
    patient.hometown || "",
  ]);
  patientSheet.addRow([
    translations.camp || "Camp",
    patient.camp || "",
  ]);
  patientSheet.addRow([""]); // Empty row

  // Contact Information
  patientSheet.addRow([
    translations.contactInformation || "Contact Information",
    "",
  ]);
  patientSheet.addRow([
    translations.phone || "Phone",
    patient.phone || "",
  ]);
  patientSheet.addRow([""]); // Empty row

  // Current Vitals (most recent)
  if (data.vitals.length > 0) {
    const sortedVitals = [...data.vitals].sort((a, b) => {
      const da = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const db = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return db - da;
    });
    const latestVital = sortedVitals[0];
    patientSheet.addRow([translations.currentVitals || "Current Vitals", ""]);
    patientSheet.addRow([
      translations.date || "Date",
      latestVital.timestamp
        ? format(new Date(latestVital.timestamp), "yyyy-MM-dd HH:mm")
        : "",
    ]);
    patientSheet.addRow([
      translations.systolic || "Systolic BP",
      latestVital.systolic_bp ?? "",
    ]);
    patientSheet.addRow([
      translations.diastolic || "Diastolic BP",
      latestVital.diastolic_bp ?? "",
    ]);
    patientSheet.addRow([
      translations.heartRate || "Heart Rate",
      latestVital.heart_rate ?? "",
    ]);
    patientSheet.addRow([
      translations.temperature || "Temperature",
      latestVital.temperature_celsius ?? "",
    ]);
    patientSheet.addRow([
      translations.oxygenSaturation || "O2 Saturation",
      latestVital.oxygen_saturation ?? "",
    ]);
    patientSheet.addRow([
      translations.respiratoryRate || "Respiratory Rate",
      latestVital.respiratory_rate ?? "",
    ]);
    patientSheet.addRow([
      translations.weight || "Weight (kg)",
      latestVital.weight_kg ?? "",
    ]);
    patientSheet.addRow([
      translations.height || "Height (cm)",
      latestVital.height_cm ?? "",
    ]);
    patientSheet.addRow([translations.bmi || "BMI", latestVital.bmi ?? ""]);
    patientSheet.addRow([
      translations.painLevel || "Pain Level",
      latestVital.pain_level ?? "",
    ]);
    patientSheet.addRow([""]); // spacer
  }

  // Most recent visits (up to 5)
  if (data.visits.length > 0) {
    const recentVisits = [...data.visits]
      .sort((a, b) => {
        const aTime =
          (a as any).timestamp ||
          (a as any).check_in_timestamp ||
          (a as any).created_at ||
          null;
        const bTime =
          (b as any).timestamp ||
          (b as any).check_in_timestamp ||
          (b as any).created_at ||
          null;
        const da = aTime ? new Date(aTime).getTime() : 0;
        const db = bTime ? new Date(bTime).getTime() : 0;
        return db - da;
      })
      .slice(0, 5);
    patientSheet.addRow([
      translations.recentVisits || "Recent Visits (Last 5)",
      "",
    ]);
    patientSheet.addRow([
      translations.visitDate || "Visit Date",
      translations.clinic || "Clinic",
    ]);
    recentVisits.forEach((visit) => {
      const visitTime =
        (visit as any).timestamp ||
        (visit as any).check_in_timestamp ||
        (visit as any).created_at ||
        null;
      patientSheet.addRow([
        visitTime ? format(new Date(visitTime), "yyyy-MM-dd HH:mm") : "",
        (visit as any).clinic_name ||
          clinicNameById.get((visit as any).clinic_id || "") ||
          (visit as any).clinic_id ||
          "",
      ]);
    });
    patientSheet.addRow([""]); // spacer
  }

  // Vitals Sheet
  if (data.vitals.length > 0) {
    const vitalsSheet = workbook.addWorksheet(
      translations.vitals || "Vitals"
    );
    vitalsSheet.columns = [
      { header: translations.date || "Date", width: 20 },
      { header: translations.systolic || "Systolic BP", width: 15 },
      { header: translations.diastolic || "Diastolic BP", width: 15 },
      { header: translations.heartRate || "Heart Rate", width: 15 },
      { header: translations.temperature || "Temperature", width: 15 },
      { header: translations.oxygenSaturation || "O2 Saturation", width: 15 },
      { header: translations.respiratoryRate || "Respiratory Rate", width: 15 },
      { header: translations.weight || "Weight (kg)", width: 15 },
      { header: translations.height || "Height (cm)", width: 15 },
      { header: translations.bmi || "BMI", width: 15 },
      { header: translations.painLevel || "Pain Level", width: 15 },
    ];

    data.vitals.forEach((vital) => {
      vitalsSheet.addRow([
        vital.timestamp
          ? format(new Date(vital.timestamp), "yyyy-MM-dd HH:mm")
          : "",
        vital.systolic_bp || "",
        vital.diastolic_bp || "",
        vital.heart_rate || "",
        vital.temperature_celsius || "",
        vital.oxygen_saturation || "",
        vital.respiratory_rate || "",
        vital.weight_kg || "",
        vital.height_cm || "",
        vital.bmi || "",
        vital.pain_level || "",
      ]);
    });
  }

  // Appointments Sheet
  if (data.appointments.length > 0) {
    const appointmentsSheet = workbook.addWorksheet(
      translations.appointments || "Appointments"
    );
    appointmentsSheet.columns = [
      { header: translations.date || "Date", width: 20 },
      { header: translations.clinic || "Clinic", width: 25 },
      { header: translations.provider || "Provider", width: 25 },
      { header: translations.status || "Status", width: 15 },
      { header: translations.notes || "Notes", width: 40 },
    ];

    data.appointments.forEach((apt) => {
      const providerName = apt.provider
        ? `${apt.provider.given_name || ""} ${apt.provider.surname || ""}`.trim()
        : "";
      appointmentsSheet.addRow([
        apt.appointment.timestamp
          ? format(new Date(apt.appointment.timestamp), "yyyy-MM-dd HH:mm")
          : "",
        apt.clinic.name || "",
        providerName,
        apt.appointment.status || "",
        apt.appointment.notes || "",
      ]);
    });
  }

  // Prescriptions Sheet
  if (data.prescriptions.length > 0) {
    const prescriptionsSheet = workbook.addWorksheet(
      translations.prescriptions || "Prescriptions"
    );
    prescriptionsSheet.columns = [
      { header: translations.date || "Date", width: 20 },
      { header: translations.clinic || "Clinic", width: 25 },
      { header: translations.provider || "Provider", width: 25 },
      { header: translations.medication || "Medication", width: 30 },
      { header: translations.dosage || "Dosage", width: 20 },
      { header: translations.status || "Status", width: 15 },
      { header: translations.notes || "Notes", width: 40 },
    ];

    data.prescriptions.forEach((prescription) => {
      const providerName = prescription.provider
        ? `${prescription.provider.given_name || ""} ${prescription.provider.surname || ""}`.trim()
        : "";
      const presData = prescription.prescription as any;
      const medFromItems =
        Array.isArray(presData.items) && presData.items.length > 0
          ? presData.items[0]
          : {};
      const medication =
        presData.medication || medFromItems.medication || "";
      const dosage = presData.dosage || medFromItems.dosage || "";
      prescriptionsSheet.addRow([
        presData.created_at
          ? format(new Date(presData.created_at), "yyyy-MM-dd")
          : "",
        prescription.clinic.name || "",
        providerName,
        medication,
        dosage,
        presData.status || "",
        presData.notes || "",
      ]);
    });
  }

  // Events Sheet
  if (data.events.length > 0) {
    const eventsSheet = workbook.addWorksheet(translations.events || "Events");
    eventsSheet.columns = [
      { header: translations.date || "Date", width: 20 },
      { header: translations.eventType || "Event Type", width: 30 },
      { header: translations.formData || "Form Data", width: 50 },
    ];

    data.events.forEach((event) => {
      const formDataStr = event.form_data
        ? JSON.stringify(event.form_data, null, 2)
        : "";
      eventsSheet.addRow([
        event.created_at
          ? format(new Date(event.created_at), "yyyy-MM-dd HH:mm")
          : "",
        event.event_type || "",
        formDataStr,
      ]);
    });
  }

  // Visits Sheet
  if (data.visits.length > 0) {
    const visitsSheet = workbook.addWorksheet(translations.visits || "Visits");
    visitsSheet.columns = [
      { header: translations.date || "Date", width: 20 },
      { header: translations.clinic || "Clinic", width: 25 },
      { header: translations.provider || "Provider", width: 25 },
      { header: translations.notes || "Notes", width: 40 },
    ];

    data.visits.forEach((visit) => {
      const visitTime =
        (visit as any).timestamp ||
        (visit as any).check_in_timestamp ||
        (visit as any).created_at ||
        null;
      visitsSheet.addRow([
        visitTime ? format(new Date(visitTime), "yyyy-MM-dd HH:mm") : "",
        (visit as any).clinic_name || "",
        (visit as any).provider_name || "",
        (visit as any).notes || "",
      ]);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Export patient history to PDF (simplified text-based format)
 * Note: For full PDF support, you'd need a library like jsPDF or pdfkit
 */
export function exportPatientHistoryToPDF(
  data: PatientHistoryData,
  translations: Record<string, string>
): string {
  // For now, return a simple text format
  // In production, you'd use jsPDF or similar library
  let content = `${translations.patient || "Patient"} History\n`;
  content += `================================\n\n`;
  content += `${translations.patientId || "Patient ID"}: ${data.patient.id}\n`;
  content += `${translations.givenName || "Given Name"}: ${data.patient.given_name || ""}\n`;
  content += `${translations.surname || "Surname"}: ${data.patient.surname || ""}\n\n`;

  content += `${translations.vitals || "Vitals"} (${data.vitals.length})\n`;
  content += `${translations.appointments || "Appointments"} (${data.appointments.length})\n`;
  content += `${translations.prescriptions || "Prescriptions"} (${data.prescriptions.length})\n`;
  content += `${translations.events || "Events"} (${data.events.length})\n`;
  content += `${translations.visits || "Visits"} (${data.visits.length})\n`;

  return content;
}
