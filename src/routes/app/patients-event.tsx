import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEventForms, getEventFormById } from "@/lib/server-functions/event-forms";
import { saveEvent } from "@/lib/server-functions/events";
import { getPatientById } from "@/lib/server-functions/patients";
import Event from "@/models/event";
import { v1 as uuidV1 } from "uuid";
import { useLanguage, useTranslation } from "@/lib/i18n/context";
import Language from "@/models/language";
import { shouldShowField, trackSkippedFields } from "@/lib/form-utils/skip-logic";
import { validateForm, validateFieldRealTime } from "@/lib/form-utils/validation";
import { translateText } from "@/lib/server-functions/translate";

export const Route = createFileRoute("/app/patients-event")({
  component: RouteComponent,
  loader: async () => {
    return {
      allForms: await getEventForms(),
    };
  },
});

function RouteComponent() {
  const { allForms } = Route.useLoaderData();
  const { language } = useLanguage();
  const t = useTranslation();
  
  const [patient, setPatient] = useState<any>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentForm, setCurrentForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [translatedFormNames, setTranslatedFormNames] = useState<Record<string, string>>({});
  const [translatedFormHeader, setTranslatedFormHeader] = useState<
    Record<string, { name?: string; description?: string }>
  >({});

  // Load patient on mount
  useEffect(() => {
    const loadPatient = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const patientId = params.get("patientId");
        
        if (!patientId) {
          toast.error("Patient ID is required");
          return;
        }

        const patientResult = (await getPatientById({ data: { id: patientId } })) as any;
        setPatient(patientResult?.patient);
      } catch (error) {
        console.error("Failed to load patient:", error);
        toast.error("Failed to load patient");
      } finally {
        setLoading(false);
      }
    };
    
    loadPatient();
  }, []);

  // Load form details when selection changes
  useEffect(() => {
    if (selectedFormId) {
      const loadForm = async () => {
        try {
          const form = await getEventFormById({ data: { id: selectedFormId } });
          if (form) {
            setCurrentForm(form);
          } else {
            toast.error("Form not found");
          }
        } catch (error) {
          console.error("Failed to load form:", error);
          toast.error("Failed to load form details");
        }
      };
      loadForm();
    }
  }, [selectedFormId]);

  // Auto-translate event form names in the dropdown to match UI language (en/ar)
  useEffect(() => {
    if (!allForms || !allForms.length) return;
    const targetLang = language === "ar" ? "ar" : "en";

    // Simple heuristic to detect Arabic script
    const hasArabicChars = (text: string) => /[\u0600-\u06FF]/.test(text);

    void (async () => {
      const updates: Record<string, string> = {};

      for (const form of allForms as any[]) {
        const id = form.id as string;
        const name = (form.name as string) || "";
        if (!id || !name) continue;

        // Skip if we already have a translated name for this form and language
        if (translatedFormNames[id]) continue;

        const storedLang: "en" | "ar" =
          (form.language === "ar" ? "ar" : form.language === "en" ? "en" : hasArabicChars(name) ? "ar" : "en");

        // If stored language already matches UI language, just cache the original name
        if (storedLang === targetLang) {
          updates[id] = name;
          continue;
        }

        try {
          const res = await translateText({
            data: {
              text: name,
              from: storedLang,
              to: targetLang,
            },
          });
          const translated = res.translated || name;
          updates[id] = translated;
        } catch (err) {
          // On failure or rate limit, fall back to original name
          console.error("Failed to translate event form name:", err);
        }
      }

      if (Object.keys(updates).length > 0) {
        setTranslatedFormNames((prev) => ({ ...prev, ...updates }));
      }
    })();
  }, [allForms, language, translatedFormNames]);

  // Auto-translate the currently selected form's header (name + description)
  useEffect(() => {
    if (!currentForm || !currentForm.id) return;
    const targetLang = language === "ar" ? "ar" : "en";
    const id = currentForm.id as string;

    // If we already have translations for this form and language, skip
    const cached = translatedFormHeader[id];
    if (cached && cached.name && cached.description) return;

    const name: string = currentForm.name || "";
    const description: string = currentForm.description || "";
    if (!name && !description) return;

    const hasArabicChars = (text: string) => /[\u0600-\u06FF]/.test(text);
    const storedLang: "en" | "ar" =
      currentForm.language === "ar"
        ? "ar"
        : currentForm.language === "en"
          ? "en"
          : hasArabicChars(name + description)
            ? "ar"
            : "en";

    // If stored language already matches UI language, just cache originals
    if (storedLang === targetLang) {
      setTranslatedFormHeader((prev) => ({
        ...prev,
        [id]: { name, description },
      }));
      return;
    }

    void (async () => {
      try {
        let translatedName = name;
        let translatedDescription = description;

        if (name) {
          const resName = await translateText({
            data: { text: name, from: storedLang, to: targetLang },
          });
          translatedName = resName.translated || name;
        }

        if (description) {
          const resDesc = await translateText({
            data: { text: description, from: storedLang, to: targetLang },
          });
          translatedDescription = resDesc.translated || description;
        }

        setTranslatedFormHeader((prev) => ({
          ...prev,
          [id]: { name: translatedName, description: translatedDescription },
        }));
      } catch (err) {
        // On failure or rate limiting, keep originals
        console.error("Failed to translate event form header:", err);
      }
    })();
  }, [currentForm, language, translatedFormHeader]);

  // Get visible fields based on skip logic - MUST be called before any early returns
  const visibleFields = useMemo(() => {
    if (!currentForm?.form_fields) return [];
    return currentForm.form_fields.filter((field: any) => 
      shouldShowField(field, formData)
    );
  }, [currentForm, formData]);
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!patient) {
    return <div>Patient not found</div>;
  }

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        [fieldId]: value,
      };
      
      // Real-time validation for touched fields
      if (touchedFields.has(fieldId)) {
        const field = currentForm?.form_fields?.find((f: any) => f.id === fieldId);
        if (field) {
          const error = validateFieldRealTime(field, value, newData);
          setValidationErrors((prev) => {
            if (error) {
              return { ...prev, [fieldId]: error };
            } else {
              const { [fieldId]: _, ...rest } = prev;
              return rest;
            }
          });
        }
      }
      
      return newData;
    });
  };

  const handleFieldBlur = (fieldId: string) => {
    setTouchedFields((prev) => new Set(prev).add(fieldId));
    const field = currentForm?.form_fields?.find((f: any) => f.id === fieldId);
    if (field) {
      const value = formData[fieldId];
      const error = validateFieldRealTime(field, value, formData);
      setValidationErrors((prev) => {
        if (error) {
          return { ...prev, [fieldId]: error };
        } else {
          const { [fieldId]: _, ...rest } = prev;
          return rest;
        }
      });
    }
  };

  const handleSubmit = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      return;
    }

    if (!selectedFormId || !currentForm || !patient) {
      toast.error("Please select an event form");
      return;
    }

    // Mark all visible fields as touched for validation
    const allVisibleFieldIds = visibleFields.map((f: any) => f.id);
    setTouchedFields(new Set(allVisibleFieldIds));

    // Validate all visible fields
    const errors = validateForm(visibleFields, formData);
    if (errors.length > 0) {
      const errorMap: Record<string, string> = {};
      errors.forEach((error) => {
        // Get translated error message with parameter support
        let message = error.message;
        if (error.message.startsWith("validation.")) {
          const [key, param] = error.message.split("|");
          const translated = t(key as any) || key;
          message = param 
            ? translated.replace(/\{min\}/g, param).replace(/\{max\}/g, param)
            : translated;
        }
        errorMap[error.fieldId] = message;
      });
      setValidationErrors(errorMap);
      
      // Show first error
      const firstError = errors[0];
      const field = visibleFields.find((f: any) => f.id === firstError.fieldId);
      const fieldLabel = field ? getFieldLabel(field) : "Field";
      let firstErrorMessage = firstError.message;
      if (firstError.message.startsWith("validation.")) {
        const [key, param] = firstError.message.split("|");
        const translated = t(key as any) || key;
        firstErrorMessage = param 
          ? translated.replace(/\{min\}/g, param).replace(/\{max\}/g, param)
          : translated;
      }
      toast.error(`${fieldLabel}: ${firstErrorMessage}`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Track skipped fields for analytics
      const skippedFields = trackSkippedFields(currentForm.form_fields, formData);
      
      // Create event data - only include visible fields
      const formFieldsData = visibleFields.map((field: any) => {
        const value = formData[field.id];
        return {
          fieldId: field.id,
          fieldName: getFieldLabel(field),
          fieldType: field._tag || field.fieldType || field.type,
          value: value,
          required: field.required,
          skipped: skippedFields[field.id] || false,
        };
      });

      const eventData: Event.EncodedT = {
        id: uuidV1(),
        patient_id: patient.id,
        visit_id: null,
        form_id: selectedFormId,
        event_type: currentForm.name,
        form_data: formFieldsData,
        metadata: {
          submitted_at: new Date().toISOString(),
          form_name: currentForm.name,
          skipped_fields: skippedFields,
          validation_passed: true,
        },
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_modified: new Date(),
        server_created_at: new Date(),
        deleted_at: null,
      };

      await saveEvent({ data: { event: eventData } });
      
      toast.success("Event form submitted successfully!");
      
      // Clear form data to prevent duplicate submissions
      setFormData({});
      setValidationErrors({});
      setTouchedFields(new Set());
      setSelectedFormId(null);
      setCurrentForm(null);
      setIsSubmitting(false);
      
      // Redirect after a short delay to allow success message to be seen
      setTimeout(() => {
        window.location.href = `/app/patients/${patient.id}`;
      }, 800);
    } catch (error: any) {
      console.error("Failed to submit event:", error);
      toast.error(error?.message || "Failed to submit event form");
      setIsSubmitting(false);
    }
  };

  const getFieldLabel = (field: any): string => {
    // Check if field.label is a translation object (like patient registration forms)
    if (field.label && typeof field.label === "object" && !Array.isArray(field.label)) {
      // Prefer the current UI language (en/ar) when translation objects are present
      const targetLanguage = (language === "ar" ? "ar" : "en") as "en" | "ar";
      return Language.getTranslation(field.label, targetLanguage);
    }
    return field.name || field.label || "";
  };

  // Get form language for display
  const isFormInDifferentLanguage = currentForm?.language && currentForm.language !== language;

  const renderField = (field: any) => {
    // Check if field should be visible based on skip logic
    if (!shouldShowField(field, formData)) {
      return null; // Don't render hidden fields
    }

    const value = formData[field.id] || "";
    const error = validationErrors[field.id];
    const hasError = !!error;
    
    // Determine the field type - check multiple possible properties
    const fieldType = field._tag || field.fieldType || field.type;
    const fieldLabel = getFieldLabel(field);

    // Get error message (translate if it's a translation key)
    let errorMessage = error;
    if (error && error.startsWith("validation.")) {
      const [key, param] = error.split("|");
      const translated = t(key as any) || key;
      // Replace {min}, {max} placeholders with actual values
      errorMessage = param 
        ? translated.replace(/\{min\}/g, param).replace(/\{max\}/g, param)
        : translated;
    }

    switch (fieldType) {
      case "text":
      case "free-text":
      case "short-text":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="text"
              className={`w-full px-3 py-2 border rounded-md ${
                hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
              }`}
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              required={field.required}
            />
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "textarea":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              className={`w-full px-3 py-2 border rounded-md ${
                hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
              }`}
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              rows={3}
              required={field.required}
            />
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "number":
        // Get min/max from validation rules
        const minRule = field.validation?.find((r: any) => r.type === "min");
        const maxRule = field.validation?.find((r: any) => r.type === "max");
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="number"
              className={`w-full px-3 py-2 border rounded-md ${
                hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
              }`}
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value) || "")}
              onBlur={() => handleFieldBlur(field.id)}
              min={minRule?.value}
              max={maxRule?.value}
              required={field.required}
            />
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "select":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <select
              className={`w-full px-3 py-2 border rounded-md ${
                hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
              }`}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              required={field.required}
            >
              <option value="">{t("common.selectOption")}</option>
              {field.options?.map((opt: any) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label || opt.value}
                </option>
              ))}
            </select>
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <div className="space-y-2">
              {field.options?.map((opt: any) => (
                <label key={opt.value} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={(value || []).includes(opt.value)}
                    onChange={(e) => {
                      const currentValues = value || [];
                      const newValues = e.target.checked
                        ? [...currentValues, opt.value]
                        : currentValues.filter((v: any) => v !== opt.value);
                      handleFieldChange(field.id, newValues);
                    }}
                    onBlur={() => handleFieldBlur(field.id)}
                  />
                  <span>{opt.label || opt.value}</span>
                </label>
              ))}
            </div>
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "radio":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <div className="space-y-2">
              {field.options?.map((opt: any) => (
                <label key={opt.value} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name={field.id}
                    value={opt.value}
                    checked={value === opt.value}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    onBlur={() => handleFieldBlur(field.id)}
                  />
                  <span>{opt.label || opt.value}</span>
                </label>
              ))}
            </div>
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "date":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {fieldLabel}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="date"
              className={`w-full px-3 py-2 border rounded-md ${
                hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
              }`}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              required={field.required}
            />
            {hasError && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>
        );

      case "diagnosis":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            />
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            />
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("eventForm.submitEventForm")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("nav.patients")}: {patient.given_name || ""} {patient.surname || ""}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/app/patients/${patient.id}`;
            }}
          >
            {t("eventForm.cancel")}
          </Button>
        </div>
      </div>

      {/* Form Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("eventForm.selectEventForm")}</CardTitle>
          <CardDescription>{t("eventForm.selectEventFormDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedFormId || ""}
            onChange={(e) => setSelectedFormId(e.target.value || null)}
          >
            <option value="">{t("eventForm.selectFormPlaceholder")}</option>
            {allForms.map((form: any) => (
              <option key={form.id} value={form.id}>
                {translatedFormNames[form.id] || form.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Dynamic Form */}
      {currentForm && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>
                  {translatedFormHeader[currentForm.id]?.name || currentForm.name}
                </CardTitle>
                <CardDescription>
                  {translatedFormHeader[currentForm.id]?.description || currentForm.description}
                </CardDescription>
              </div>
              {isFormInDifferentLanguage && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">
                    {currentForm.language === "ar" ? "عربي" : "English"}
                  </span>
                  {" "}{t("eventForm.formLanguageIndicator")}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentForm.form_fields && Array.isArray(currentForm.form_fields) ? (
              visibleFields.length > 0 ? (
                visibleFields.map((field: any, index: number) => (
                  <div key={field.id || index}>
                    {renderField(field)}
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">
                  {t("eventForm.noFieldsVisible")}
                </div>
              )
            ) : (
              <div className="text-muted-foreground">
                {t("eventForm.noFieldsAvailable")}
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => window.location.href = `/app/patients/${patient.id}`}
              >
                {t("eventForm.cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? t("eventForm.submitting") : t("eventForm.submitForm")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

