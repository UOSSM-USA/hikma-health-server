import EventForm from "@/models/event-form";

export type ValidationError = {
  fieldId: string;
  message: string;
};

/**
 * Validates a single field value against its validation rules
 */
export function validateField(
  field: EventForm.HHField,
  value: any,
  formData: Record<string, any>
): ValidationError | null {
  if (!field.validation || field.validation.length === 0) {
    return null;
  }

  // Check required validation
  if (field.required) {
    const isEmpty =
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      return {
        fieldId: field.id,
        message: field.validation.find((r) => r.type === "required")?.message || "validation.required",
      };
    }
  }

  // Check custom validation rules
  for (const rule of field.validation) {
    let isValid = true;
    let errorMessage = rule.message;

    switch (rule.type) {
      case "required":
        // Already handled above
        continue;

      case "min":
        if (value !== null && value !== undefined && value !== "") {
          isValid = Number(value) >= Number(rule.value);
          if (!errorMessage) {
            errorMessage = `validation.min|${rule.value}`;
          }
        }
        break;

      case "max":
        if (value !== null && value !== undefined && value !== "") {
          isValid = Number(value) <= Number(rule.value);
          if (!errorMessage) {
            errorMessage = `validation.max|${rule.value}`;
          }
        }
        break;

      case "minLength":
        if (value !== null && value !== undefined && value !== "") {
          const strValue = String(value);
          isValid = strValue.length >= Number(rule.value);
          if (!errorMessage) {
            errorMessage = `validation.minLength|${rule.value}`;
          }
        }
        break;

      case "maxLength":
        if (value !== null && value !== undefined && value !== "") {
          const strValue = String(value);
          isValid = strValue.length <= Number(rule.value);
          if (!errorMessage) {
            errorMessage = `validation.maxLength|${rule.value}`;
          }
        }
        break;

      case "pattern":
        if (value !== null && value !== undefined && value !== "") {
          const regex = new RegExp(rule.value);
          isValid = regex.test(String(value));
          if (!errorMessage) {
            errorMessage = "validation.pattern";
          }
        }
        break;

      case "email":
        if (value !== null && value !== undefined && value !== "") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          isValid = emailRegex.test(String(value));
          if (!errorMessage) {
            errorMessage = "validation.email";
          }
        }
        break;

      case "custom":
        if (rule.validator) {
          const result = rule.validator(value, formData);
          if (typeof result === "string") {
            isValid = false;
            errorMessage = result;
          } else {
            isValid = result;
            if (!errorMessage) {
              errorMessage = "validation.pattern";
            }
          }
        }
        break;
    }

    if (!isValid) {
      return {
        fieldId: field.id,
        message: errorMessage || "validation.pattern",
      };
    }
  }

  return null;
}

/**
 * Validates all fields in a form
 */
export function validateForm(
  fields: EventForm.HHField[],
  formData: Record<string, any>
): ValidationError[] {
  const errors: ValidationError[] = [];

  fields.forEach((field) => {
    const value = formData[field.id];
    const error = validateField(field, value, formData);
    if (error) {
      errors.push(error);
    }
  });

  return errors;
}

/**
 * Validates a field in real-time (for onBlur/onChange validation)
 */
export function validateFieldRealTime(
  field: EventForm.HHField,
  value: any,
  formData: Record<string, any>
): string | null {
  // For real-time validation, we might want to skip required checks
  // until the user has interacted with the field
  if (value === null || value === undefined || value === "") {
    // Don't show required errors in real-time until field is touched
    return null;
  }

  const error = validateField(field, value, formData);
  return error ? error.message : null;
}
