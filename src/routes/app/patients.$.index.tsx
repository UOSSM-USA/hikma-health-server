import { getPatientById } from "@/lib/server-functions/patients";
import { getPatientVitals, createPatientVital, updatePatientVital } from "@/lib/server-functions/vitals";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { getEventsByPatientId } from "@/lib/server-functions/events";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { getVisitsByPatientId } from "@/lib/server-functions/visits";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n/context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Phone,
  MapPin,
  Heart,
  Activity,
  Thermometer,
  Droplets,
  Wind,
  Brain,
  Ruler,
  Weight,
  LucideUser,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import type PatientVital from "@/models/patient-vital";
import type Patient from "@/models/patient";
import Appointment from "@/models/appointment";
import type Prescription from "@/models/prescription";
import type Visit from "@/models/visit";
import { useEffect, useMemo, useState } from "react";
import { getAppointmentsByPatientId } from "@/lib/server-functions/appointments";
import type Clinic from "@/models/clinic";
import type User from "@/models/user";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { exportPatientHistoryToExcel } from "@/lib/export/patient-history";

export const Route = createFileRoute("/app/patients/$/")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const patientId = params["_splat"];

    const result: {
      patient: Patient.EncodedT | null;
      vitals: PatientVital.EncodedT[];
      visits: Visit.EncodedT[];
      appointments: {
        appointment: Appointment.EncodedT;
        patient: Patient.EncodedT;
        clinic: Clinic.EncodedT;
        provider: User.EncodedT;
      }[];
      prescriptions: {
        prescription: Prescription.EncodedT;
        patient: Patient.EncodedT;
        clinic: Clinic.EncodedT;
        provider: User.EncodedT;
      }[];
      events: any[];
      eventForms: any[];
    } = {
      patient: null,
      vitals: [],
      visits: [],
      appointments: [],
      prescriptions: [],
      events: [],
      eventForms: [],
    };

    if (!patientId || patientId === "new") {
      return result;
    }

    try {
      // Get patient data
      const patientResult = (await getPatientById({ data: { id: patientId } })) as {
        patient: Patient.EncodedT;
        error: { message: string } | null;
      };
      
      if (patientResult && patientResult.patient && !patientResult.error) {
        result.patient = patientResult.patient;

        // Get appointments
        const appointmentsResult = (await getAppointmentsByPatientId({
          data: { patientId },
        })) as {
          data: {
            appointment: Appointment.EncodedT;
            patient: Patient.EncodedT;
            clinic: Clinic.EncodedT;
            provider: User.EncodedT | null;
          }[];
          error: Error | null;
        };
        
        if (appointmentsResult) {
          appointmentsResult.error && console.error(appointmentsResult.error);
          result.appointments = appointmentsResult.data || [];
        }

        // Get patient vitals
        try {
          const fetchedVitals = (await getPatientVitals({
            data: { patientId },
          })) as PatientVital.EncodedT[];
          result.vitals = Array.isArray(fetchedVitals) ? fetchedVitals : [];
        } catch (error) {
          console.error("Failed to fetch vitals:", error);
        }

        // Get patient events
        try {
          const fetchedEvents = (await getEventsByPatientId({
            data: { patient_id: patientId },
          })) as any[];
          result.events = fetchedEvents || [];
        } catch (error) {
          console.error("Failed to fetch events:", error);
        }

        // Get all event forms
        try {
          const forms = (await getEventForms()) as any[];
          result.eventForms = forms || [];
        } catch (error) {
          console.error("Failed to fetch event forms:", error);
        }

        // Get patient prescriptions
        try {
          const { getPrescriptionsByPatientId } = await import("@/lib/server-functions/prescriptions");
          const fetchedPrescriptions = await getPrescriptionsByPatientId({ data: { patientId } });
          result.prescriptions = fetchedPrescriptions || [];
        } catch (error) {
          console.error("Failed to fetch prescriptions:", error);
        }

        // Get patient visits
        try {
          const fetchedVisits = await getVisitsByPatientId({ data: { patientId } });
          result.visits = Array.isArray(fetchedVisits) ? fetchedVisits : [];
        } catch (error) {
          console.error("Failed to fetch visits:", error);
        }
      }
    } catch (error) {
      console.error("Failed to fetch patient:", error);
    }

    return result;
  },
});

function RouteComponent() {
  const {
    patient,
    vitals: initialVitals,
    visits,
    appointments,
    prescriptions,
    events,
    eventForms,
  } = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = Route.useNavigate();
  const patientId = params._splat;
  const isEditing = !!patientId && patientId !== "new";
  const t = useTranslation();
  const [mostRecentVital, setMostRecentVital] = useState<
    typeof PatientVital.PatientVitalSchema.Encoded | null
  >(null);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [vitalFormData, setVitalFormData] = useState({
    systolic_bp: "",
    diastolic_bp: "",
    heart_rate: "",
    temperature_celsius: "",
    oxygen_saturation: "",
    respiratory_rate: "",
    weight_kg: "",
    height_cm: "",
    pain_level: "",
  });
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const [editingVital, setEditingVital] = useState<PatientVital.EncodedT | null>(null);
  const [vitalRange, setVitalRange] = useState<"7d" | "30d" | "90d" | "all">("90d");

  const filteredVitals = useMemo(() => {
    if (!initialVitals || initialVitals.length === 0) return [];
    if (vitalRange === "all") return initialVitals;

    const days =
      vitalRange === "7d" ? 7 : vitalRange === "30d" ? 30 : 90;
    const now = new Date();

    return initialVitals.filter((v) => {
      const ts = new Date(v.timestamp);
      const diff = differenceInDays(now, ts);
      return diff <= days;
    });
  }, [initialVitals, vitalRange]);

  const sortedVitalsAsc = useMemo(
    () =>
      [...filteredVitals].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    [filteredVitals],
  );

  const visitVitalsMap = useMemo(() => {
    const map: Record<string, PatientVital.EncodedT[]> = {};
    for (const vital of initialVitals) {
      if (vital.visit_id) {
        if (!map[vital.visit_id]) {
          map[vital.visit_id] = [];
        }
        map[vital.visit_id].push(vital);
      }
    }
    return map;
  }, [initialVitals]);

  const visitPrescriptionsMap = useMemo(() => {
    const map: Record<
      string,
      {
        prescription: Prescription.EncodedT;
        patient: Patient.EncodedT;
        clinic: Clinic.EncodedT;
        provider: User.EncodedT;
      }[]
    > = {};
    for (const item of prescriptions) {
      const visitId = item.prescription.visit_id;
      if (visitId) {
        if (!map[visitId]) {
          map[visitId] = [];
        }
        map[visitId].push(item);
      }
    }
    return map;
  }, [prescriptions]);

  const visitEventsMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const event of events) {
      if (event.visit_id) {
        if (!map[event.visit_id]) {
          map[event.visit_id] = [];
        }
        map[event.visit_id].push(event);
      }
    }
    return map;
  }, [events]);

  useEffect(() => {
    if (initialVitals && initialVitals.length > 0) {
      setMostRecentVital(initialVitals[0]);
    }
  }, [initialVitals]);

  if (!isEditing || !patient) {
    toast.error("Patient not found");
    throw redirect({
      to: "/app/patients",
      from: "/app/patients/$",
      state: {},
      replace: true,
    });
  }

  // Calculate age from date of birth
  const calculateAge = (dob: Date | string | undefined) => {
    if (!dob) return "Unknown";
    const birthDate = new Date(dob);
    const today = new Date();
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

  type SparklinePoint = { x: number; y: number };

  function VitalTrendSparkline({
    label,
    vitals,
    getValue,
    unit,
  }: {
    label: string;
    vitals: PatientVital.EncodedT[];
    getValue: (v: PatientVital.EncodedT) => number | null;
    unit: string;
  }) {
    const values = vitals
      .map((v) => {
        const raw = getValue(v);
        if (raw === null || raw === undefined) return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      })
      .filter((v): v is number => v !== null);

    if (values.length < 2) {
      return null;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 160;
    const height = 40;

    const points: SparklinePoint[] = values.map((value, index) => ({
      x: (index / (values.length - 1)) * width,
      y: height - ((value - min) / range) * height,
    }));

    const path = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const latest = values[values.length - 1];

    return (
      <div className="border rounded-lg p-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-sm font-semibold">
            {typeof latest === "number" ? latest.toFixed(1) : "—"} {unit}
          </span>
        </div>
        <svg width={width} height={height} className="text-primary">
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Get patient initials for avatar
  const getInitials = (givenName?: string, surname?: string) => {
    const first = givenName?.[0] || "";
    const last = surname?.[0] || "";
    return (first + last).toUpperCase() || "PT";
  };

  // Format vital value with unit
  const formatVitalValue = (value: any, unit: string) => {
    if (value === null || value === undefined) return "—";
    return `${value} ${unit}`;
  };

  // Calculate BMI from weight and height if BMI is not present
  const calculateBMI = (weight: number | null | undefined, height: number | null | undefined, existingBMI: number | string | null | undefined): number | null => {
    // If BMI already exists, return it
    if (existingBMI !== null && existingBMI !== undefined) {
      const bmiNum = typeof existingBMI === 'string' ? parseFloat(existingBMI) : existingBMI;
      if (!isNaN(bmiNum) && bmiNum > 0) {
        return bmiNum;
      }
    }
    
    // Calculate BMI if both weight and height are available
    if (weight && height && height > 0) {
      const heightInMeters = height / 100;
      const bmi = weight / (heightInMeters * heightInMeters);
      return Math.round(bmi * 100) / 100;
    }
    
    return null;
  };

  const handleEditAppointment = (appointmentId: Appointment.EncodedT["id"]) => {
    navigate({
      to: `/app/appointments/edit/${appointmentId}`,
    });
  };

  const handleSaveVitals = async () => {
    setIsSavingVitals(true);
    try {
      const weight = vitalFormData.weight_kg
        ? Number(vitalFormData.weight_kg)
        : null;
      const height = vitalFormData.height_cm
        ? Number(vitalFormData.height_cm)
        : null;
      let bmi: number | null = null;

      if (weight !== null && height !== null && height > 0) {
        const heightInMeters = height / 100;
        bmi = parseFloat(
          (weight / (heightInMeters * heightInMeters)).toFixed(2),
        );
      }

      if (editingVital) {
        await updatePatientVital({
          data: {
            id: editingVital.id,
            updates: {
              systolic_bp: vitalFormData.systolic_bp
                ? Number(vitalFormData.systolic_bp)
                : null,
              diastolic_bp: vitalFormData.diastolic_bp
                ? Number(vitalFormData.diastolic_bp)
                : null,
              heart_rate: vitalFormData.heart_rate
                ? Number(vitalFormData.heart_rate)
                : null,
              temperature_celsius: vitalFormData.temperature_celsius
                ? Number(vitalFormData.temperature_celsius)
                : null,
              oxygen_saturation: vitalFormData.oxygen_saturation
                ? Number(vitalFormData.oxygen_saturation)
                : null,
              respiratory_rate: vitalFormData.respiratory_rate
                ? Number(vitalFormData.respiratory_rate)
                : null,
              weight_kg: weight,
              height_cm: height,
              pain_level: vitalFormData.pain_level
                ? Number(vitalFormData.pain_level)
                : null,
              bmi,
            },
          },
        });
      } else {
        const vitalData: PatientVital.Table.NewPatientVitals = {
          id: undefined,
          patient_id: patientId,
          visit_id: null,
          timestamp: new Date(),
          systolic_bp: vitalFormData.systolic_bp
            ? Number(vitalFormData.systolic_bp)
            : null,
          diastolic_bp: vitalFormData.diastolic_bp
            ? Number(vitalFormData.diastolic_bp)
            : null,
          heart_rate: vitalFormData.heart_rate
            ? Number(vitalFormData.heart_rate)
            : null,
          temperature_celsius: vitalFormData.temperature_celsius
            ? Number(vitalFormData.temperature_celsius)
            : null,
          oxygen_saturation: vitalFormData.oxygen_saturation
            ? Number(vitalFormData.oxygen_saturation)
            : null,
          respiratory_rate: vitalFormData.respiratory_rate
            ? Number(vitalFormData.respiratory_rate)
            : null,
          weight_kg: weight,
          height_cm: height,
          pain_level: vitalFormData.pain_level
            ? Number(vitalFormData.pain_level)
            : null,
          bp_position: null,
          bmi,
          waist_circumference_cm: null,
          pulse_rate: null,
          recorded_by_user_id: null,
          metadata: {},
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        };

        await createPatientVital({ data: vitalData });
      }

      toast.success(t("patientDetail.vitalsSaved"));
      setShowVitalForm(false);
      setEditingVital(null);
      setVitalFormData({
        systolic_bp: "",
        diastolic_bp: "",
        heart_rate: "",
        temperature_celsius: "",
        oxygen_saturation: "",
        respiratory_rate: "",
        weight_kg: "",
        height_cm: "",
        pain_level: "",
      });
      window.location.reload();
    } catch (error) {
      console.error("Failed to save vitals:", error);
      toast.error(t("patientDetail.vitalsSaveError"));
    } finally {
      setIsSavingVitals(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Patient Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={patient.photo_url || undefined} />
                <AvatarFallback className="text-lg">
                  {getInitials(patient.given_name, patient.surname)}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">
                  {patient.given_name || "—"} {patient.surname || "—"}
                </CardTitle>
                <CardDescription className="mt-1">
                  Patient ID: {patient.external_patient_id || patient.id}
                </CardDescription>
                <div className="flex items-center gap-4 mt-2">
                  <Badge variant="outline" className="font-normal">
                    <LucideUser className="mr-1 h-3 w-3" />
                    {patient.sex || "Unknown"}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    <Calendar className="mr-1 h-3 w-3" />
                    Age: {calculateAge(patient.date_of_birth)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const translations = {
                      patient: t("export.patient"),
                      demographics: t("export.demographics"),
                      contactInformation: t("export.contactInformation"),
                      vitals: t("export.currentVitals") || t("patientDetail.currentVitals"),
                      currentVitals: t("export.currentVitals") || t("patientDetail.currentVitals"),
                      appointments: t("patientDetail.appointments"),
                      prescriptions: t("patientDetail.prescriptions"),
                      events: t("patientDetail.eventForms"),
                      visits: t("export.recentVisits") || t("patientDetail.recentVisits"),
                      recentVisits: t("export.recentVisits") || t("patientDetail.recentVisits"),
                      visitDate: t("export.visitDate") || t("common.date") || "Date",
                      date: t("common.date") || "Date",
                      provider: t("appointmentsList.providerHeader") || "Provider",
                      clinic: t("export.clinic") || t("appointmentsList.clinicHeader") || "Clinic",
                      notes: t("appointmentsList.notesHeader") || "Notes",
                      status: t("appointmentsList.statusHeader") || "Status",
                      field: t("common.field") || "Field",
                      value: t("common.value") || "Value",
                      patientId: t("export.patientId") || "Patient ID",
                      givenName: t("export.givenName") || "First Name",
                      surname: t("export.surname") || "Last Name",
                      dateOfBirth: t("export.dateOfBirth") || "Date of Birth",
                      sex: t("export.sex") || "Sex",
                      citizenship: t("export.citizenship") || "Citizenship",
                      hometown: t("export.hometown") || "Hometown",
                      camp: t("export.camp") || "Camp",
                      phone: t("common.phone") || "Phone",
                      systolic: t("export.systolicBp") || "Systolic BP",
                      diastolic: t("export.diastolicBp") || "Diastolic BP",
                      heartRate: t("patientDetail.heartRate") || "Heart Rate",
                      temperature: t("patientDetail.temperature") || "Temperature",
                      oxygenSaturation: t("patientDetail.oxygenSaturation") || "O2 Saturation",
                      respiratoryRate: t("patientDetail.respiratoryRate") || "Respiratory Rate",
                      weight: t("patientDetail.weight") || "Weight (kg)",
                      height: t("patientDetail.height") || "Height (cm)",
                      bmi: t("patientDetail.bmi") || "BMI",
                      painLevel: t("patientDetail.painLevel") || "Pain Level",
                      medication: t("prescription.medication") || "Medication",
                      dosage: t("prescription.dosage") || "Dosage",
                      eventType: t("eventForm.formName") || "Event Type",
                      formData: t("eventForm.formFields") || "Form Data",
                    };

                    const historyData = {
                      patient,
                      vitals: initialVitals,
                      appointments: appointments.map((apt) => ({
                        appointment: apt.appointment,
                        clinic: { name: apt.clinic.name || "" },
                        provider: apt.provider
                          ? {
                              given_name: apt.provider.given_name,
                              surname: apt.provider.surname,
                            }
                          : null,
                      })),
                      prescriptions: prescriptions.map((pres) => ({
                        prescription: pres.prescription,
                        clinic: { name: pres.clinic.name || "" },
                        provider: pres.provider
                          ? {
                              given_name: pres.provider.given_name,
                              surname: pres.provider.surname,
                            }
                          : null,
                      })),
                      events,
                      visits,
                    };

                const allClinics = await getAllClinics();

                    const blob = await exportPatientHistoryToExcel(
                      historyData,
                  translations,
                  allClinics || []
                    );
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `patient_history_${patient.external_patient_id || patient.id}_${new Date().toISOString().split("T")[0]}.xlsx`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    toast.success(t("export.success") || "Patient history exported successfully");
                  } catch (error: any) {
                    console.error("Export error:", error);
                    toast.error(t("export.error") || "Failed to export patient history");
                  }
                }}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {t("export.exportHistory") || "Export History"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Demographics and Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("patientDetail.demographics")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Birth</span>
              <span className="font-medium">
                {patient.date_of_birth
                  ? format(new Date(patient.date_of_birth), "MMM dd, yyyy")
                  : "—"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sex</span>
              <span className="font-medium">{patient.sex || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Citizenship</span>
              <span className="font-medium">{patient.citizenship || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Government ID</span>
              <span className="font-medium">
                {patient.government_id || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("patientDetail.contactInformation")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center">
                <Phone className="mr-2 h-4 w-4" />
                Phone
              </span>
              <span className="font-medium">{patient.phone || "—"}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center">
                <MapPin className="mr-2 h-4 w-4" />
                Hometown
              </span>
              <span className="font-medium">{patient.hometown || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Camp</span>
              <span className="font-medium">{patient.camp || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vitals Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t("patientDetail.currentVitals")}</CardTitle>
            <div className="flex items-center gap-2">
              {mostRecentVital && (
                <span className="text-sm text-muted-foreground">
                  {t("patientDetail.lastRecorded")}{" "}
                  {format(
                    new Date(mostRecentVital.timestamp),
                    "MMM dd, yyyy HH:mm",
                  )}
                </span>
              )}
              <Dialog open={showVitalForm} onOpenChange={setShowVitalForm}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("patientDetail.addVitals")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t("patientDetail.quickEntryVitals")}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("patientDetail.systolic")}</Label>
                      <Input
                        type="number"
                        placeholder="120"
                        value={vitalFormData.systolic_bp}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, systolic_bp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.diastolic")}</Label>
                      <Input
                        type="number"
                        placeholder="80"
                        value={vitalFormData.diastolic_bp}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, diastolic_bp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.heartRate")}</Label>
                      <Input
                        type="number"
                        placeholder="72"
                        value={vitalFormData.heart_rate}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, heart_rate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.temperature")} (°C)</Label>
                      <Input
                        type="number"
                        placeholder="37.0"
                        value={vitalFormData.temperature_celsius}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, temperature_celsius: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.oxygenSaturation")} (%)</Label>
                      <Input
                        type="number"
                        placeholder="98"
                        value={vitalFormData.oxygen_saturation}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, oxygen_saturation: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.respiratoryRate")}</Label>
                      <Input
                        type="number"
                        placeholder="16"
                        value={vitalFormData.respiratory_rate}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, respiratory_rate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.weight")} (kg)</Label>
                      <Input
                        type="number"
                        placeholder="70"
                        value={vitalFormData.weight_kg}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, weight_kg: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.height")} (cm)</Label>
                      <Input
                        type="number"
                        placeholder="170"
                        value={vitalFormData.height_cm}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, height_cm: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patientDetail.painLevel")} (1-10)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        placeholder="0"
                        value={vitalFormData.pain_level}
                        onChange={(e) => setVitalFormData({ ...vitalFormData, pain_level: e.target.value })}
                      />
                    </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVitalForm(false);
                    setEditingVital(null);
                    setVitalFormData({
                      systolic_bp: "",
                      diastolic_bp: "",
                      heart_rate: "",
                      temperature_celsius: "",
                      oxygen_saturation: "",
                      respiratory_rate: "",
                      weight_kg: "",
                      height_cm: "",
                      pain_level: "",
                    });
                  }}
                >
                  {t("patientDetail.cancel")}
                </Button>
                <Button onClick={handleSaveVitals} disabled={isSavingVitals}>
                  {isSavingVitals ? t("common.saving") : t("patientDetail.saveVitals")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mostRecentVital ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Blood Pressure */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Heart className="h-4 w-4 text-red-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.bloodPressure")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {mostRecentVital.systolic_bp && mostRecentVital.diastolic_bp
                    ? `${mostRecentVital.systolic_bp}/${mostRecentVital.diastolic_bp}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">mmHg</p>
              </div>

              {/* Heart Rate */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Activity className="h-4 w-4 text-pink-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.heartRate")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.heart_rate, "")}
                </p>
                <p className="text-xs text-muted-foreground">bpm</p>
              </div>

              {/* Temperature */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Thermometer className="h-4 w-4 text-orange-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.temperature")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.temperature_celsius, "")}
                </p>
                <p className="text-xs text-muted-foreground">°C</p>
              </div>

              {/* Oxygen Saturation */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Droplets className="h-4 w-4 text-blue-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.oxygenSaturation")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.oxygen_saturation, "")}
                </p>
                <p className="text-xs text-muted-foreground">%</p>
              </div>

              {/* Respiratory Rate */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Wind className="h-4 w-4 text-teal-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.respiratoryRate")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.respiratory_rate, "")}
                </p>
                <p className="text-xs text-muted-foreground">breaths/min</p>
              </div>

              {/* Weight */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Weight className="h-4 w-4 text-purple-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.weight")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.weight_kg, "")}
                </p>
                <p className="text-xs text-muted-foreground">kg</p>
              </div>

              {/* Height */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Ruler className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.height")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {formatVitalValue(mostRecentVital.height_cm, "")}
                </p>
                <p className="text-xs text-muted-foreground">cm</p>
              </div>

              {/* BMI */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Brain className="h-4 w-4 text-indigo-500 mr-2" />
                  <span className="text-sm font-medium">{t("patientDetail.bmi")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {(() => {
                    const bmi = calculateBMI(
                      mostRecentVital.weight_kg,
                      mostRecentVital.height_cm,
                      mostRecentVital.bmi
                    );
                    return bmi ? bmi.toFixed(1) : "—";
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">kg/m²</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t("patientDetail.noVitalsRecorded")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Additional Information */}
      <Tabs defaultValue="visits" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="visits">{t("patientDetail.recentVisits")}</TabsTrigger>
          <TabsTrigger value="vitals">{t("patientDetail.vitalHistory")}</TabsTrigger>
          <TabsTrigger value="prescriptions">{t("patientDetail.prescriptions")}</TabsTrigger>
          <TabsTrigger value="appointments">{t("patientDetail.appointments")}</TabsTrigger>
          <TabsTrigger value="events">{t("patientDetail.eventForms")}</TabsTrigger>
        </TabsList>

        <TabsContent value="visits">
          <Card>
            <CardHeader>
              <CardTitle>{t("patientDetail.recentVisits")}</CardTitle>
              <CardDescription>{t("patientDetail.recentVisitsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {visits && visits.length > 0 ? (
                <div className="space-y-4">
                  {visits.map((visit) => (
                    <div key={visit.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {visit.check_in_timestamp
                              ? format(new Date(visit.check_in_timestamp), "MMM dd, yyyy HH:mm")
                              : format(new Date(visit.created_at), "MMM dd, yyyy HH:mm")}
                          </p>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            {visit.provider_name && (
                              <p>
                                <span className="font-medium">{t("patientDetail.provider")}:</span> {visit.provider_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">{t("patientDetail.visitId")}</p>
                          <p className="font-mono text-xs">{visit.id.slice(0, 8)}</p>
                        </div>
                      </div>

                      {/* Linked vitals for this visit */}
                      {visitVitalsMap[visit.id] && visitVitalsMap[visit.id].length > 0 && (
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-semibold mb-2 text-muted-foreground">
                            {t("patientDetail.vitalHistory")}
                          </p>
                          <div className="space-y-2 text-xs text-muted-foreground">
                            {visitVitalsMap[visit.id].map((vital) => (
                              <div key={vital.id} className="flex justify-between">
                                <span>
                                  {format(new Date(vital.timestamp), "MMM dd, yyyy HH:mm")}
                                </span>
                                <span>
                                  {vital.systolic_bp && vital.diastolic_bp
                                    ? `${vital.systolic_bp}/${vital.diastolic_bp} mmHg`
                                    : ""}
                                  {vital.heart_rate
                                    ? ` • ${t("patientDetail.heartRate")}: ${vital.heart_rate} bpm`
                                    : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Linked prescriptions for this visit */}
                      {visitPrescriptionsMap[visit.id] &&
                        visitPrescriptionsMap[visit.id].length > 0 && (
                          <div className="mt-3 border-t pt-3">
                            <p className="text-xs font-semibold mb-2 text-muted-foreground">
                              {t("patientDetail.prescriptions")}
                            </p>
                            <div className="space-y-2 text-xs text-muted-foreground">
                              {visitPrescriptionsMap[visit.id].map(
                                ({ prescription }) => (
                                  <div key={prescription.id} className="flex justify-between">
                                    <span>
                                      {format(
                                        new Date(prescription.prescribed_at),
                                        "MMM dd, yyyy",
                                      )}
                                    </span>
                                    <span className="truncate max-w-[200px]">
                                      {prescription.items && prescription.items.length > 0
                                        ? (prescription.items[0] as any).medication ||
                                          (prescription.items[0] as any).name
                                        : ""}
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {/* Linked events for this visit */}
                      {visitEventsMap[visit.id] &&
                        visitEventsMap[visit.id].length > 0 && (
                          <div className="mt-3 border-t pt-3">
                            <p className="text-xs font-semibold mb-2 text-muted-foreground">
                              {t("patientDetail.eventForms")}
                            </p>
                            <div className="space-y-2 text-xs text-muted-foreground">
                              {visitEventsMap[visit.id].map((event) => (
                                <div
                                  key={event.id}
                                  className="flex justify-between items-center"
                                >
                                  <span>
                                    {event.event_type || t("common.unknown")}
                                  </span>
                                  <span>
                                    {format(
                                      new Date(event.created_at),
                                      "MMM dd, yyyy HH:mm",
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t("patientDetail.noVisitsRecorded")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vitals">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>{t("patientDetail.vitalHistory")}</CardTitle>
                  <CardDescription>{t("patientDetail.vitalHistoryDescription")}</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("common.dateRange") ?? "Range"}
                  </span>
                  <div className="inline-flex rounded-md border bg-background p-1">
                    {[
                      { key: "7d", label: "7d" },
                      { key: "30d", label: "30d" },
                      { key: "90d", label: "90d" },
                      { key: "all", label: t("common.all") ?? "All" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={[
                          "px-2 py-1 rounded-md",
                          vitalRange === opt.key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted",
                        ].join(" ")}
                        onClick={() =>
                          setVitalRange(opt.key as "7d" | "30d" | "90d" | "all")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sortedVitalsAsc.length > 1 && (
                <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Simple trend “charts” using SVG sparklines */}
                  <VitalTrendSparkline
                    label={t("patientDetail.bloodPressure")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) =>
                      v.systolic_bp && v.diastolic_bp
                        ? (v.systolic_bp + v.diastolic_bp) / 2
                        : null
                    }
                    unit="mmHg"
                  />
                  <VitalTrendSparkline
                    label={t("patientDetail.heartRate")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) => v.heart_rate ?? null}
                    unit="bpm"
                  />
                  <VitalTrendSparkline
                    label={t("patientDetail.weight")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) => v.weight_kg ?? null}
                    unit="kg"
                  />
                  <VitalTrendSparkline
                    label={t("patientDetail.temperature")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) => v.temperature_celsius ?? null}
                    unit="°C"
                  />
                  <VitalTrendSparkline
                    label={t("patientDetail.oxygenSaturation")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) => v.oxygen_saturation ?? null}
                    unit="%"
                  />
                  <VitalTrendSparkline
                    label={t("patientDetail.bmi")}
                    vitals={sortedVitalsAsc}
                    getValue={(v) => {
                      if (!v.weight_kg || !v.height_cm) return null;
                      const h = v.height_cm / 100;
                      if (!h) return null;
                      const bmi = v.weight_kg / (h * h);
                      return Number.isFinite(bmi) ? bmi : null;
                    }}
                    unit=""
                  />
                </div>
              )}

              {filteredVitals && filteredVitals.length > 0 ? (
                <div className="space-y-4">
                  {filteredVitals.map((vital) => (
                    <div key={vital.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-medium">
                            {format(
                              new Date(vital.timestamp),
                              "MMM dd, yyyy HH:mm",
                            )}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm text-muted-foreground mt-2">
                            {vital.systolic_bp && vital.diastolic_bp && (
                              <span>
                                {t("patientDetail.bloodPressure")}: {vital.systolic_bp}/{vital.diastolic_bp} mmHg
                              </span>
                            )}
                            {vital.heart_rate && (
                              <span>{t("patientDetail.heartRate")}: {vital.heart_rate} bpm</span>
                            )}
                            {vital.pulse_rate && (
                              <span>PR: {vital.pulse_rate} bpm</span>
                            )}
                            {vital.temperature_celsius && (
                              <span>{t("patientDetail.temperature")}: {vital.temperature_celsius}°C</span>
                            )}
                            {vital.oxygen_saturation && (
                              <span>{t("patientDetail.oxygenSaturation")}: {vital.oxygen_saturation}%</span>
                            )}
                            {vital.respiratory_rate && (
                              <span>{t("patientDetail.respiratoryRate")}: {vital.respiratory_rate} breaths/min</span>
                            )}
                            {vital.weight_kg && (
                              <span>{t("patientDetail.weight")}: {vital.weight_kg} kg</span>
                            )}
                            {vital.height_cm && (
                              <span>{t("patientDetail.height")}: {vital.height_cm} cm</span>
                            )}
                            {(() => {
                              const bmi = calculateBMI(vital.weight_kg, vital.height_cm, vital.bmi);
                              return bmi ? (
                                <span>{t("patientDetail.bmi")}: {bmi.toFixed(1)}</span>
                              ) : null;
                            })()}
                            {vital.pain_level && (
                              <span>{t("patientDetail.painLevel")}: {vital.pain_level}/10</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingVital(vital);
                              setVitalFormData({
                                systolic_bp: vital.systolic_bp?.toString() ?? "",
                                diastolic_bp: vital.diastolic_bp?.toString() ?? "",
                                heart_rate: vital.heart_rate?.toString() ?? "",
                                temperature_celsius: vital.temperature_celsius?.toString() ?? "",
                                oxygen_saturation: vital.oxygen_saturation?.toString() ?? "",
                                respiratory_rate: vital.respiratory_rate?.toString() ?? "",
                                weight_kg: vital.weight_kg?.toString() ?? "",
                                height_cm: vital.height_cm?.toString() ?? "",
                                pain_level: vital.pain_level?.toString() ?? "",
                              });
                              setShowVitalForm(true);
                            }}
                          >
                            {t("common.edit")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t("patientDetail.noVitalHistory")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardHeader>
              <CardTitle>{t("patientDetail.prescriptions")}</CardTitle>
              <CardDescription>{t("patientDetail.prescriptionsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {prescriptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("patientDetail.noPrescriptions")}
                </div>
              ) : (
                prescriptions.map(({ prescription, provider, clinic }) => (
                  <div
                    key={prescription.id}
                    className="border rounded-lg p-4 mb-4 last:mb-0"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium">
                            {format(
                              new Date(prescription.prescribed_at),
                              "MMM dd, yyyy"
                            )}
                          </p>
                          <Badge
                            variant={
                              prescription.status === "picked-up"
                                ? "default"
                                : prescription.status === "prepared"
                                  ? "secondary"
                                  : prescription.status === "pending"
                                    ? "outline"
                                    : "destructive"
                            }
                          >
                            {prescription.status?.replace("-", " ") || "Pending"}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>
                            <span className="font-medium">{t("patientDetail.provider")}:</span>{" "}
                            {provider?.name || provider?.given_name || ""} {provider?.surname || ""}
                          </p>
                          <p>
                            <span className="font-medium">{t("patientDetail.clinic")}:</span>{" "}
                            {clinic?.name || t("common.unknown")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">{t("patientDetail.prescriptionId")}</p>
                        <p className="font-mono text-xs">
                          {prescription.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    {prescription.items && prescription.items.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-medium mb-1">{t("patientDetail.prescriptionItems")}</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {prescription.items.map((item: any, idx: number) => (
                            <li key={idx}>
                              {item.medication || item.name}
                              {item.dosage && ` - ${item.dosage}`}
                              {item.frequency && ` (${item.frequency})`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {prescription.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm">
                          <span className="font-medium">{t("patientDetail.prescriptionNotes")}</span>{" "}
                          {prescription.notes}
                        </p>
                      </div>
                    )}

                    {prescription.expiration_date && (
                      <div className="pt-2 mt-2 border-t text-xs text-muted-foreground">
                        {t("patientDetail.expires")} {format(new Date(prescription.expiration_date), "MMM dd, yyyy")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <CardTitle>{t("patientDetail.appointments")}</CardTitle>
              <CardDescription>{t("patientDetail.appointmentsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {t("patientDetail.noAppointments")}
                </div>
              )}
              {appointments.map(({ appointment, provider, clinic }) => (
                <div
                  key={appointment.id}
                  className="border rounded-lg p-4 mb-4 last:mb-0"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {format(
                          new Date(appointment.timestamp),
                          "MMM dd, yyyy",
                        )}{" "}
                        at {format(new Date(appointment.timestamp), "HH:mm")}
                      </p>
                      <div className="flex gap-2">
                        <Badge
                          variant={
                            appointment.status === "completed"
                              ? "default"
                              : appointment.status === "confirmed"
                                ? "secondary"
                                : appointment.status === "cancelled"
                                  ? "destructive"
                                  : appointment.status === "checked_in"
                                    ? "outline"
                                    : "secondary"
                          }
                        >
                          {appointment.status || "Pending"}
                        </Badge>
                        {appointment.duration && (
                          <Badge variant="outline">
                            {appointment.duration} min
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditAppointment(appointment.id)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">{t("patientDetail.appointmentId")}</p>
                      <p className="font-mono text-xs">
                        {appointment.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {appointment.notes && (
                    <div className="mb-3">
                      <p className="text-sm text-muted-foreground mb-1">
                        {t("appointmentForm.notesLabel")}
                      </p>
                      <p className="text-sm">{appointment.notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {appointment.clinic_id && (
                      <div>
                        <span className="text-muted-foreground">{t("patientDetail.clinic")}: </span>
                        <span className="font-medium">
                          {clinic.name || t("common.unknown")}
                        </span>
                      </div>
                    )}
                    {appointment.provider_id && (
                      <div>
                        <span className="text-muted-foreground">
                          {t("patientDetail.provider")}:{" "}
                        </span>
                        <span className="font-medium">
                          {provider.name || t("common.unknown")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("patientDetail.eventForms")}</CardTitle>
                  <CardDescription>
                    {t("patientDetail.eventFormsDescription")}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = `/app/patients-event?patientId=${patientId}`;
                  }}
                >
                  {t("patientDetail.newEncounter")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="mb-2">{t("patientDetail.noEventForms")}</p>
                  <p className="text-sm">
                    {t("patientDetail.eventFormsInfo")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => {
                    // Find the form name
                    const eventForm = eventForms.find(
                      (form) => form.id === event.form_id
                    );
                    const formName = eventForm?.name || t("common.unknown");

                    return (
                      <div key={event.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="space-y-1">
                            <p className="font-medium">{formName}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(
                                new Date(event.created_at),
                                "MMM dd, yyyy HH:mm"
                              )}
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">{t("patientDetail.eventId")}</p>
                            <p className="font-mono text-xs">
                              {event.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>

                        {event.event_type && (
                          <Badge variant="outline" className="mb-3">
                            {event.event_type}
                          </Badge>
                        )}

                        {event.form_data && event.form_data.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium mb-2">
                              {t("patientDetail.formData")}
                            </p>
                            {event.form_data.slice(0, 3).map((field: any, idx: number) => (
                              <div key={idx} className="text-sm">
                                <span className="text-muted-foreground">
                                  {field.fieldName || t("common.unknown")}:
                                </span>{" "}
                                <span className="font-medium">
                                  {field.value || "—"}
                                </span>
                              </div>
                            ))}
                            {event.form_data.length > 3 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                +{event.form_data.length - 3} {t("patientDetail.moreFields")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
