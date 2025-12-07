import EventForm from "@/models/event-form";

/**
 * Evaluates a single skip condition
 */
function evaluateCondition(
  condition: EventForm.SkipCondition,
  formData: Record<string, any>
): boolean {
  const fieldValue = formData[condition.fieldId];
  const compareValue = condition.value;

  switch (condition.operator) {
    case "equals":
      return fieldValue === compareValue;
    case "notEquals":
      return fieldValue !== compareValue;
    case "contains":
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(compareValue);
      }
      if (typeof fieldValue === "string") {
        return fieldValue.includes(String(compareValue));
      }
      return false;
    case "notContains":
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(compareValue);
      }
      if (typeof fieldValue === "string") {
        return !fieldValue.includes(String(compareValue));
      }
      return true;
    case "greaterThan":
      return Number(fieldValue) > Number(compareValue);
    case "lessThan":
      return Number(fieldValue) < Number(compareValue);
    case "greaterThanOrEqual":
      return Number(fieldValue) >= Number(compareValue);
    case "lessThanOrEqual":
      return Number(fieldValue) <= Number(compareValue);
    case "isEmpty":
      return (
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === "" ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );
    case "isNotEmpty":
      return !(
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === "" ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );
    default:
      return false;
  }
}

/**
 * Determines if a field should be visible based on skip logic
 * @param field The field to check
 * @param formData Current form data
 * @returns true if field should be visible, false otherwise
 */
export function shouldShowField(
  field: EventForm.HHField,
  formData: Record<string, any>
): boolean {
  if (!field.skipLogic) {
    return true; // No skip logic means always show
  }

  const { showWhen, hideWhen } = field.skipLogic;

  // If hideWhen conditions exist, check if any are true (OR logic)
  if (hideWhen && hideWhen.length > 0) {
    const shouldHide = hideWhen.some((condition) =>
      evaluateCondition(condition, formData)
    );
    if (shouldHide) {
      return false;
    }
  }

  // If showWhen conditions exist, all must be true (AND logic)
  if (showWhen && showWhen.length > 0) {
    const shouldShow = showWhen.every((condition) =>
      evaluateCondition(condition, formData)
    );
    return shouldShow;
  }

  // If no conditions, show by default
  return true;
}

/**
 * Gets all field IDs that a field depends on for skip logic
 * @param field The field to check
 * @returns Array of field IDs this field depends on
 */
export function getFieldDependencies(field: EventForm.HHField): string[] {
  if (!field.skipLogic) {
    return [];
  }

  const dependencies: string[] = [];
  if (field.skipLogic.showWhen) {
    dependencies.push(...field.skipLogic.showWhen.map((c) => c.fieldId));
  }
  if (field.skipLogic.hideWhen) {
    dependencies.push(...field.skipLogic.hideWhen.map((c) => c.fieldId));
  }
  return [...new Set(dependencies)]; // Remove duplicates
}

/**
 * Tracks which fields were skipped during form submission
 * @param fields All form fields
 * @param formData Final form data
 * @returns Object mapping field IDs to whether they were skipped
 */
export function trackSkippedFields(
  fields: EventForm.HHField[],
  formData: Record<string, any>
): Record<string, boolean> {
  const skipped: Record<string, boolean> = {};
  
  fields.forEach((field) => {
    const wasVisible = shouldShowField(field, formData);
    skipped[field.id] = !wasVisible;
  });

  return skipped;
}
