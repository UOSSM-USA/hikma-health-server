import { createServerFn } from "@tanstack/react-start";
import PatientRegistrationForm from "@/models/patient-registration-form";
import { Option } from "effect";
import { Logger } from "@hikmahealth/js-utils";
import { adminMiddleware } from "@/middleware/auth";

export const getPatientRegistrationForm = createServerFn({
  method: "GET",
})
  .middleware([adminMiddleware])
  .handler(async (): Promise<PatientRegistrationForm.EncodedT | undefined> => {
    const forms = await PatientRegistrationForm.getAll();
    const form = forms[0];
    return form;
  });
