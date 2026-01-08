import { createServerFn } from "@tanstack/react-start";
import PatientRegistrationForm from "@/models/patient-registration-form";

export const getPatientRegistrationForm = createServerFn({
  method: "GET",
}).handler(async (): Promise<PatientRegistrationForm.EncodedT | null> => {
  const forms = await PatientRegistrationForm.getAll();
  // Return the default form (clinic_id = null) or first form, or null if no forms exist
  const form = forms.find(f => f.clinic_id === null) || forms[0] || null;
  return form;
});
