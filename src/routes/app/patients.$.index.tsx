import { getPatientById } from "@/lib/server-functions/patients";
import { getPatientVitals } from "@/lib/server-functions/vitals";
import { getEventsByPatientId } from "@/lib/server-functions/events";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { format } from "date-fns";
import type PatientVital from "@/models/patient-vital";
import type Patient from "@/models/patient";
import Appointment from "@/models/appointment";
import type Prescription from "@/models/prescription";
import { useEffect, useState } from "react";
import { getAppointmentsByPatientId } from "@/lib/server-functions/appointments";
import type Clinic from "@/models/clinic";
import type User from "@/models/user";

export const Route = createFileRoute("/app/patients/$/")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const patientId = params["_splat"];

    const result: {
      patient: Patient.EncodedT | null;
      vitals: PatientVital.EncodedT[];
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
    appointments,
    prescriptions,
    events,
    eventForms,
  } = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = Route.useNavigate();
  const patientId = params._splat;
  const isEditing = !!patientId && patientId !== "new";
  const [mostRecentVital, setMostRecentVital] = useState<
    typeof PatientVital.PatientVitalSchema.Encoded | null
  >(null);

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

  const handleEditAppointment = (appointmentId: Appointment.EncodedT["id"]) => {
    navigate({
      to: `/app/appointments/edit/${appointmentId}`,
    });
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
            {/*TODO: add patient actions*/}
            {/*<div className="flex gap-2">
              <Button variant="outline">Edit Patient</Button>
              <Button>New Visit</Button>
            </div>*/}
          </div>
        </CardHeader>
      </Card>

      {/* Demographics and Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Demographics</CardTitle>
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
            <CardTitle className="text-lg">Contact Information</CardTitle>
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
            <CardTitle className="text-lg">Current Vitals</CardTitle>
            {mostRecentVital && (
              <span className="text-sm text-muted-foreground">
                Last recorded:{" "}
                {format(
                  new Date(mostRecentVital.timestamp),
                  "MMM dd, yyyy HH:mm",
                )}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {mostRecentVital ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Blood Pressure */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Heart className="h-4 w-4 text-red-500 mr-2" />
                  <span className="text-sm font-medium">Blood Pressure</span>
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
                  <span className="text-sm font-medium">Heart Rate</span>
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
                  <span className="text-sm font-medium">Temperature</span>
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
                  <span className="text-sm font-medium">O₂ Saturation</span>
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
                  <span className="text-sm font-medium">Respiratory Rate</span>
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
                  <span className="text-sm font-medium">Weight</span>
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
                  <span className="text-sm font-medium">Height</span>
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
                  <span className="text-sm font-medium">BMI</span>
                </div>
                <p className="text-2xl font-bold">
                  {mostRecentVital.bmi
                    ? parseFloat(mostRecentVital.bmi)?.toFixed(1)
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">kg/m²</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No vitals recorded yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Additional Information */}
      <Tabs defaultValue="visits" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="visits">Recent Visits</TabsTrigger>
          <TabsTrigger value="vitals">Vital History</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="events">Event Forms</TabsTrigger>
        </TabsList>

        <TabsContent value="visits">
          <Card>
            <CardHeader>
              <CardTitle>Recent Visits</CardTitle>
              <CardDescription>Patient's visit history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No recent visits recorded
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vitals">
          <Card>
            <CardHeader>
              <CardTitle>Vital Signs History</CardTitle>
              <CardDescription>Historical vital measurements</CardDescription>
            </CardHeader>
            <CardContent>
              {initialVitals && initialVitals.length > 0 ? (
                <div className="space-y-4">
                  {initialVitals.slice(0, 5).map((vital) => (
                    <div key={vital.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {format(
                              new Date(vital.timestamp),
                              "MMM dd, yyyy HH:mm",
                            )}
                          </p>
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            {vital.systolic_bp && vital.diastolic_bp && (
                              <span>
                                BP: {vital.systolic_bp}/{vital.diastolic_bp}
                              </span>
                            )}
                            {vital.heart_rate && (
                              <span>HR: {vital.heart_rate}</span>
                            )}
                            {vital.pulse_rate && (
                              <span>PR: {vital.pulse_rate}</span>
                            )}
                            {vital.temperature_celsius && (
                              <span>Temp: {vital.temperature_celsius}°C</span>
                            )}
                            {vital.oxygen_saturation && (
                              <span>O₂: {vital.oxygen_saturation}%</span>
                            )}
                            {vital.pain_level && (
                              <span>Pain: {vital.pain_level}/10</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No vital history available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardHeader>
              <CardTitle>Prescriptions</CardTitle>
              <CardDescription>Active and past medications</CardDescription>
            </CardHeader>
            <CardContent>
              {prescriptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No prescriptions recorded
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
                            <span className="font-medium">Provider:</span>{" "}
                            {provider?.name || provider?.given_name || ""} {provider?.surname || ""}
                          </p>
                          <p>
                            <span className="font-medium">Pickup Clinic:</span>{" "}
                            {clinic?.name || "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Prescription ID</p>
                        <p className="font-mono text-xs">
                          {prescription.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    {prescription.items && prescription.items.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-medium mb-1">Items:</p>
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
                          <span className="font-medium">Notes:</span>{" "}
                          {prescription.notes}
                        </p>
                      </div>
                    )}

                    {prescription.expiration_date && (
                      <div className="pt-2 mt-2 border-t text-xs text-muted-foreground">
                        Expires: {format(new Date(prescription.expiration_date), "MMM dd, yyyy")}
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
              <CardTitle>Appointments</CardTitle>
              <CardDescription>Upcoming and past appointments</CardDescription>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No appointments scheduled
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
                      <p className="text-muted-foreground">Appointment ID</p>
                      <p className="font-mono text-xs">
                        {appointment.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {appointment.notes && (
                    <div className="mb-3">
                      <p className="text-sm text-muted-foreground mb-1">
                        Notes
                      </p>
                      <p className="text-sm">{appointment.notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {appointment.clinic_id && (
                      <div>
                        <span className="text-muted-foreground">Clinic: </span>
                        <span className="font-medium">
                          {clinic.name || "Unknown"}
                        </span>
                      </div>
                    )}
                    {appointment.provider_id && (
                      <div>
                        <span className="text-muted-foreground">
                          Provider:{" "}
                        </span>
                        <span className="font-medium">
                          {provider.name || "Unknown"}
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
                  <CardTitle>Event Forms</CardTitle>
                  <CardDescription>
                    Clinical encounters and documentation
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = `/app/patients-event?patientId=${patientId}`;
                  }}
                >
                  New Encounter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="mb-2">No event forms recorded for this patient</p>
                  <p className="text-sm">
                    Event forms capture clinical encounters and medical documentation
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => {
                    // Find the form name
                    const eventForm = eventForms.find(
                      (form) => form.id === event.form_id
                    );
                    const formName = eventForm?.name || "Unknown Form";

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
                            <p className="text-muted-foreground">Event ID</p>
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
                              Form Data:
                            </p>
                            {event.form_data.slice(0, 3).map((field: any, idx: number) => (
                              <div key={idx} className="text-sm">
                                <span className="text-muted-foreground">
                                  {field.fieldName || "Field"}:
                                </span>{" "}
                                <span className="font-medium">
                                  {field.value || "—"}
                                </span>
                              </div>
                            ))}
                            {event.form_data.length > 3 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                +{event.form_data.length - 3} more fields
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
