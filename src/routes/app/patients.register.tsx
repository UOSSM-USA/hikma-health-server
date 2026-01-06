import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkDuplicateGovernmentId, checkPotentialDuplicates, generateNextPatientId } from "@/lib/server-functions/patients";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/date-picker-input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import PatientRegistrationForm from "@/models/patient-registration-form";
import Language from "@/models/language";
import { createServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import Patient from "@/models/patient";
import { Option } from "effect";
import { v1 as uuidv1 } from "uuid";
import PatientAdditionalAttribute from "@/models/patient-additional-attribute";
import { SelectInput } from "@/components/select-input";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkPatientPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import { useLanguage, useTranslation } from "@/lib/i18n/context";
import { toast } from "sonner";

export const createPatient = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator<{
    baseFields: Patient.T;
    additionalAttributes: PatientAdditionalAttribute.T[];
  }>((data) => data)
  .handler(async ({ data, context }) => {
    // Check permissions using new permission system
    const permContext = createPermissionContext(context);
    checkPatientPermission(permContext, PermissionOperation.ADD, {
      clinicId: Option.getOrNull(data.baseFields.primary_clinic_id),
    });

    // Set last_modified_by to current user ID so they can see patients they create
    const patientData = {
      ...data,
      baseFields: {
        ...data.baseFields,
        last_modified_by: context.userId 
          ? Option.some(context.userId) 
          : Option.none(),
      },
    };

    return Patient.register(
      patientData as unknown as {
        baseFields: Patient.T;
        additionalAttributes: PatientAdditionalAttribute.T[];
      },
    );
  });

export const getAllPatientRegistrationForms = createServerFn({
  method: "GET",
}).handler(async () => {
  return PatientRegistrationForm.getAll();
});

export const Route = createFileRoute("/app/patients/register")({
  component: RouteComponent,
  loader: async () => {
    const patientRegistrationForm = await getAllPatientRegistrationForms();
    const clinicsList = await getAllClinics();
    return { patientRegistrationForm: patientRegistrationForm[0], clinicsList };
  },
});

function RouteComponent() {
  const { patientRegistrationForm, clinicsList } = Route.useLoaderData();
  const { language } = useLanguage();
  const t = useTranslation();
  const navigate = useNavigate();

  // State for two-step flow
  const [step, setStep] = useState<"check-id" | "register" | "review-duplicates">("check-id");
  const [governmentId, setGovernmentId] = useState("");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [existingPatient, setExistingPatient] = useState<Patient.EncodedT | null>(null);
  const [potentialDuplicates, setPotentialDuplicates] = useState<Patient.EncodedT[]>([]);
  const [duplicateMatchReasons, setDuplicateMatchReasons] = useState<string[]>([]);
  const [generatedPatientId, setGeneratedPatientId] = useState<string | null>(null);
  const [formDataForDuplicateCheck, setFormDataForDuplicateCheck] = useState<any>(null);

  const { formState, handleSubmit, register, watch, setValue } = useForm({
    mode: "all",
  });

  // Generate Patient ID when moving to registration step
  useEffect(() => {
    if (step === "register" && !generatedPatientId) {
      generateNextPatientId().then((result) => {
        if (result.patientId && !result.error) {
          setGeneratedPatientId(result.patientId);
          setValue("external_patient_id", result.patientId);
        }
      });
    }
  }, [step, generatedPatientId, setValue]);

  // Auto-populate government_id when we have it
  useEffect(() => {
    if (governmentId && step === "register") {
      setValue("government_id", governmentId);
    }
  }, [governmentId, step, setValue]);

  // Handle Government ID check
  const handleCheckGovernmentId = async () => {
    if (!governmentId.trim()) {
      toast.error("Please enter a Government ID");
      return;
    }

    setCheckingDuplicate(true);
    try {
      const result = await checkDuplicateGovernmentId({ data: { government_id: governmentId.trim() } });
      
      if (result.exists && result.patient) {
        // Duplicate found - show existing patient info
        setExistingPatient(result.patient);
        setValue("government_id", governmentId.trim());
      } else {
        // No duplicate - proceed to registration
        setExistingPatient(null);
        setValue("government_id", governmentId.trim());
        setStep("register");
      }
    } catch (error) {
      console.error("Error checking duplicate:", error);
      toast.error("Failed to check for duplicate. Please try again.");
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Handle skip Government ID check (for patients without Government ID)
  const handleSkipGovernmentId = () => {
    setGovernmentId("");
    setExistingPatient(null);
    setStep("register");
  };

  // Handle continue to existing patient profile
  const handleContinueToPatient = () => {
    if (existingPatient) {
      navigate({ to: `/app/patients/${existingPatient.id}` });
    }
  };

  // Check for duplicates before submitting
  const checkDuplicatesBeforeSubmit = async (data: any) => {
    setCheckingDuplicate(true);
    setFormDataForDuplicateCheck(data);
    
    try {
      const result = await checkPotentialDuplicates({
        data: {
          government_id: data.government_id || governmentId || undefined,
          given_name: data.given_name,
          surname: data.surname,
          date_of_birth: data.date_of_birth,
          phone: data.phone,
        },
      });

      if (result.duplicates && result.duplicates.length > 0) {
        // Found potential duplicates - show review screen
        setPotentialDuplicates(result.duplicates);
        setDuplicateMatchReasons(result.matchReasons);
        setStep("review-duplicates");
      } else {
        // No duplicates found - proceed with registration
        await submitRegistration(data);
      }
    } catch (error) {
      console.error("Error checking duplicates:", error);
      toast.error("Failed to check for duplicates. Please try again.");
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Handle continue to existing patient from duplicates list
  const handleContinueToDuplicatePatient = (patientId: string) => {
    navigate({ to: `/app/patients/${patientId}` });
  };

  // Handle proceed with registration despite duplicates
  const handleProceedDespiteDuplicates = async () => {
    if (formDataForDuplicateCheck) {
      await submitRegistration(formDataForDuplicateCheck);
    }
  };

  // Actual registration submission
  const submitRegistration = async (data: any) => {
    // Ensure government_id and external_patient_id are set
    const finalData = {
      ...data,
      government_id: data.government_id || governmentId,
      external_patient_id: data.external_patient_id || generatedPatientId,
    };

    const patient: Patient.T = {
      id: uuidv1(),
      given_name: Option.fromNullable(finalData.given_name),
      surname: Option.fromNullable(finalData.surname),
      date_of_birth: Option.fromNullable(finalData.date_of_birth),
      citizenship: Option.fromNullable(finalData.citizenship),
      hometown: Option.fromNullable(finalData.hometown),
      phone: Option.fromNullable(finalData.phone),
      sex: Option.fromNullable(finalData.sex),
      camp: Option.fromNullable(finalData.camp),
      additional_data: finalData.additional_data || {},
      image_timestamp: Option.fromNullable(finalData.image_timestamp),
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      last_modified: new Date(),
      server_created_at: new Date(),
      deleted_at: Option.none(),
      metadata: {},
      photo_url: Option.fromNullable(finalData.photo_url),
      government_id: Option.fromNullable(finalData.government_id),
      external_patient_id: Option.fromNullable(finalData.external_patient_id),
      primary_clinic_id: Option.fromNullable(finalData.primary_clinic_id),
      last_modified_by: Option.none(),
      additional_attributes: {},
    };

    const patientBaseData: Record<string, any> = {};
    const additionalAttributes: PatientAdditionalAttribute.T[] = [];

    patientRegistrationForm?.fields
      .filter((field) => field.deleted !== true && field.visible)
      .forEach((field) => {
        if (field.baseField) {
          // @ts-ignore
          patientBaseData[field.column] = data[field.column];
        } else {
          const row: PatientAdditionalAttribute.T = {
            id: uuidv1(),
            patient_id: "",
            attribute_id: field.id,
            attribute: field.column,
            number_value: Option.fromNullable(
              field.fieldType === "number" ? Number(data[field.column]) : null,
            ),
            string_value: Option.fromNullable(
              ["text", "select"].includes(field.fieldType)
                ? String(data[field.column])
                : null,
            ),
            date_value: Option.fromNullable(
              field.fieldType === "date" ? new Date(data[field.column]) : null,
            ),
            boolean_value: Option.fromNullable(
              field.fieldType === "boolean"
                ? Boolean(data[field.column])
                : null,
            ),
            metadata: {},
            is_deleted: false,
            created_at: new Date(),
            updated_at: new Date(),
            last_modified: new Date(),
            server_created_at: new Date(),
            deleted_at: Option.none(),
          };
          additionalAttributes.push(row);
        }
      });

    try {
      const result = await createPatient({
        data: { baseFields: patient, additionalAttributes } as any,
      });
      toast.success(t("registration.success"));
      
      // Navigate to the newly created patient's profile
      // Patient.register returns { id: string } from the database insert
      if (result && typeof result === 'object' && 'id' in result && result.id) {
        navigate({ to: `/app/patients/${result.id}` });
      } else {
        // Fallback: If we have a government_id, try to fetch by it
        if (finalData.government_id && finalData.government_id.trim()) {
          try {
            const createdPatient = await Patient.API.getByGovernmentId(finalData.government_id);
            if (createdPatient) {
              navigate({ to: `/app/patients/${createdPatient.id}` });
              return;
            }
          } catch (error) {
            console.error("Failed to fetch patient by government_id:", error);
          }
        }
        // Last resort: navigate to patients list
        navigate({ to: "/app/patients" });
      }
    } catch (error) {
      console.error("Failed to register patient:", error);
      toast.error(t("registration.error"));
    }
  };

  // Override form submission to check duplicates first (defined after checkDuplicatesBeforeSubmit)
  const onFormSubmit = handleSubmit(checkDuplicatesBeforeSubmit);

  if (!patientRegistrationForm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">
            {t("registration.noFormTitle")}
          </h2>
          <p className="text-gray-600">
            {t("registration.noFormDescription")}
          </p>
          <Link to="/app/patients/customize-registration-form" className="mt-4">
            <Button className="primary">{t("registration.createFormCta")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Step 1: Check Government ID
  if (step === "check-id") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Register New Patient</CardTitle>
            <CardDescription>
              Enter the Government ID to check if this patient already exists in the system. If the patient doesn't have a Government ID, you can skip this step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="government_id_check" className="flex flex-col">
                <span className="text-sm font-medium">Government ID (Optional)</span>
                <span className="text-sm text-muted-foreground mt-0.5" dir="rtl">الهوية الحكومية (اختياري)</span>
              </Label>
              <Input
                id="government_id_check"
                value={governmentId}
                onChange={(e) => setGovernmentId(e.target.value)}
                placeholder="Enter Government ID (optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && governmentId.trim()) {
                    e.preventDefault();
                    handleCheckGovernmentId();
                  }
                }}
                disabled={checkingDuplicate}
              />
            </div>

            {existingPatient && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <p className="font-semibold text-green-900">Patient already exists!</p>
                    </div>
                    <div className="text-sm space-y-1 text-green-800">
                      <p>
                        <strong>Name:</strong>{" "}
                        {(() => {
                          const firstName = existingPatient.given_name || "";
                          const lastName = existingPatient.surname || "";
                          const fullName = `${firstName} ${lastName}`.trim();
                          return fullName || "Not provided";
                        })()}
                      </p>
                      <p>
                        <strong>Patient ID:</strong>{" "}
                        {existingPatient.external_patient_id || "Not assigned"}
                      </p>
                      {existingPatient.government_id && (
                        <p>
                          <strong>Government ID:</strong> {existingPatient.government_id}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handleContinueToPatient}
                      className="w-full mt-2"
                    >
                      Continue to Patient Profile
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCheckGovernmentId}
                disabled={checkingDuplicate || !governmentId.trim()}
                className="flex-1"
              >
                {checkingDuplicate ? "Checking..." : "Check"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSkipGovernmentId}
                disabled={checkingDuplicate}
                className="flex-1"
              >
                Skip (No Government ID)
              </Button>
            </div>
            {existingPatient && (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setExistingPatient(null);
                    setStep("register");
                  }}
                  className="w-full"
                >
                  Register New Patient Anyway
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2.5: Review Potential Duplicates
  if (step === "review-duplicates") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Potential Duplicate Patients Found</CardTitle>
            <CardDescription>
              We found {potentialDuplicates.length} patient(s) that may match the information you entered. Please review them before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {potentialDuplicates.map((patient, idx) => (
                <Card key={patient.id} className="border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-yellow-900">
                            {Option.getOrElse(patient.given_name, () => "")} {Option.getOrElse(patient.surname, () => "")}
                          </p>
                          {patient.external_patient_id && (
                            <p className="text-sm text-yellow-800">
                              Patient ID: {Option.getOrElse(patient.external_patient_id, () => "")}
                            </p>
                          )}
                          {patient.government_id && (
                            <p className="text-sm text-yellow-800">
                              Government ID: {Option.getOrElse(patient.government_id, () => "")}
                            </p>
                          )}
                          {patient.phone && (
                            <p className="text-sm text-yellow-800">
                              Phone: {Option.getOrElse(patient.phone, () => "")}
                            </p>
                          )}
                          {patient.date_of_birth && (
                            <p className="text-sm text-yellow-800">
                              Date of Birth: {new Date(Option.getOrElse(patient.date_of_birth, () => new Date())).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={() => handleContinueToDuplicatePatient(patient.id)}
                          variant="outline"
                        >
                          View Patient
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                onClick={handleProceedDespiteDuplicates}
                disabled={checkingDuplicate}
                className="flex-1"
              >
                Register New Patient Anyway
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("register");
                  setPotentialDuplicates([]);
                  setDuplicateMatchReasons([]);
                }}
                className="flex-1"
              >
                Go Back to Form
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Full Registration Form
  return (
    <div>
      <div className="mb-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setStep("check-id");
            setExistingPatient(null);
            setGovernmentId("");
          }}
        >
          ← Back to Government ID Check
        </Button>
      </div>
      <form onSubmit={onFormSubmit}>
        <div style={{ maxWidth: 500 }} className="space-y-4">
          {patientRegistrationForm?.fields
            .filter((field) => field.visible && field.deleted !== true)
            .map((field, idx) => {
              const isGovernmentId = field.column === "government_id";
              const isPatientId = field.column === "external_patient_id";
              const isReadOnly = (isGovernmentId && governmentId) || (isPatientId && generatedPatientId);
              // If Government ID was skipped, make it optional (not required)
              const isOptional = isGovernmentId && !governmentId;

              if (field.fieldType === "text") {
                const englishLabel = Language.getTranslation(field.label, "en") || "";
                const arabicLabel = Language.getTranslation(field.label, "ar") || "";
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="flex flex-col"
                    >
                      <span className="text-sm font-medium">{englishLabel}</span>
                      {arabicLabel && arabicLabel !== englishLabel && (
                        <span className="text-sm text-muted-foreground mt-0.5" dir="rtl">{arabicLabel}</span>
                      )}
                    </Label>
                    <Input
                      data-testid={"register-patient-" + idx}
                      data-inputtype={"text"}
                      data-column={field.column}
                      key={field.id}
                      {...register(field.column)}
                      readOnly={isReadOnly}
                      className={isReadOnly ? "bg-muted cursor-not-allowed" : ""}
                      value={
                        isGovernmentId && governmentId
                          ? governmentId
                          : isPatientId && generatedPatientId
                          ? generatedPatientId
                          : watch(field.column) || ""
                      }
                    />
                  </div>
                );
              }
              if (field.fieldType === "select") {
                const englishLabel = Language.getTranslation(field.label, "en") || "";
                const arabicLabel = Language.getTranslation(field.label, "ar") || "";
                const bilingualLabel = (
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{englishLabel}</span>
                    {arabicLabel && arabicLabel !== englishLabel && (
                      <span className="text-sm text-muted-foreground mt-0.5" dir="rtl">{arabicLabel}</span>
                    )}
                  </div>
                );
                return (
                  <div key={field.id} className="space-y-2">
                    <SelectInput
                      className="w-full"
                      data-testid={"register-patient-" + idx}
                      data-inputtype={"select"}
                      label={bilingualLabel}
                      data={field.column === "primary_clinic_id" 
                        ? clinicsList.map((clinic) => ({
                            label: clinic.name || t("sidebar.unknownClinic"),
                            value: clinic.id,
                          }))
                        : field.options?.map((option) => ({
                            label: Language.getTranslation(option, language),
                            value: Language.getTranslation(option, language),
                          })) || []
                      }
                      value={watch(field.column)}
                      onChange={(v) => setValue(field.column, v)}
                    />
                  </div>
                );
              }
              if (field.fieldType === "number") {
                const englishLabel = Language.getTranslation(field.label, "en") || "";
                const arabicLabel = Language.getTranslation(field.label, "ar") || "";
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="flex flex-col"
                    >
                      <span className="text-sm font-medium">{englishLabel}</span>
                      {arabicLabel && arabicLabel !== englishLabel && (
                        <span className="text-sm text-muted-foreground mt-0.5" dir="rtl">{arabicLabel}</span>
                      )}
                    </Label>
                    <Input
                      data-inputtype={"number"}
                      data-testid={"register-patient-" + idx}
                      key={field.id}
                      {...register(field.column)}
                    />
                  </div>
                );
              }
              if (field.fieldType === "date") {
                const englishLabel = Language.getTranslation(field.label, "en") || "";
                const arabicLabel = Language.getTranslation(field.label, "ar") || "";
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="flex flex-col"
                    >
                      <span className="text-sm font-medium">{englishLabel}</span>
                      {arabicLabel && arabicLabel !== englishLabel && (
                        <span className="text-sm text-muted-foreground mt-0.5" dir="rtl">{arabicLabel}</span>
                      )}
                    </Label>
                    <DatePickerInput
                      // valueFormat="YYYY MMM DD"
                      // description={''}
                      //   label={Language.getTranslation(field.label, "en")}
                      required={field.required}
                      placeholder={t("registration.datePlaceholder")}
                      data-testid={"register-patient-" + idx}
                      data-inputtype="date"
                      {...register(field.column)}
                      value={watch(field.column)}
                      onChange={(date) => setValue(field.column, date)}
                    />
                  </div>
                );
              }
              return <div></div>;
            })}

          <Button
            type="submit"
            data-testid={"submit-button"}
            className="primary"
          >
            {formState.isSubmitting
              ? t("registration.submitting")
              : t("registration.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
