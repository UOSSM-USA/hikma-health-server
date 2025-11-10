import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEventForms, getEventFormById } from "@/lib/server-functions/event-forms";
import { saveEvent } from "@/lib/server-functions/events";
import { getPatientById } from "@/lib/server-functions/patients";
import Event from "@/models/event";
import EventFormModel from "@/models/event-form";
import { v1 as uuidV1 } from "uuid";

export const Route = createFileRoute("/app/patients-event")({
  component: RouteComponent,
  loader: async () => {
    return {
      allForms: await getEventForms(),
    };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const { allForms } = Route.useLoaderData();
  
  const [patient, setPatient] = useState<any>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentForm, setCurrentForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!patient) {
    return <div>Patient not found</div>;
  }
  
  const patientId = patient.id;

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
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

    // Validate required fields
    const requiredFields = currentForm.form_fields.filter((f: any) => f.required);
    for (const field of requiredFields) {
      if (!formData[field.id]) {
        toast.error(`Please fill in required field: ${field.label || field.name}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Create event data
      const formFieldsData = currentForm.form_fields.map((field: any) => {
        const value = formData[field.id];
        return {
          fieldId: field.id,
          fieldName: field.label || field.name,
          fieldType: field.fieldType || field.type,
          value: value,
          required: field.required,
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

  const renderField = (field: any) => {
    const value = formData[field.id] || "";
    
    // Determine the field type - check multiple possible properties
    const fieldType = field._tag || field.fieldType || field.type;

    switch (fieldType) {
      case "text":
      case "free-text":
      case "short-text":
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

      case "textarea":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              className="w-full px-3 py-2 border rounded-md"
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              rows={3}
              required={field.required}
            />
          </div>
        );

      case "number":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              placeholder={field.placeholder || ""}
              value={value}
              onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value))}
              min={field.validation?.min}
              max={field.validation?.max}
              required={field.required}
            />
          </div>
        );

      case "select":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            >
              <option value="">Select an option</option>
              {field.options?.map((opt: any) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label || opt.value}
                </option>
              ))}
            </select>
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
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
                  />
                  <span>{opt.label || opt.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case "radio":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
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
                  />
                  <span>{opt.label || opt.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case "date":
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {field.name || field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border rounded-md"
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            />
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
            <h1 className="text-2xl font-bold">Submit Event Form</h1>
            <p className="text-muted-foreground mt-1">
              Patient: {patient.given_name || ""} {patient.surname || ""}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/app/patients/${patient.id}`;
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Form Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Event Form</CardTitle>
          <CardDescription>Choose the form template to use</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedFormId || ""}
            onChange={(e) => setSelectedFormId(e.target.value || null)}
          >
            <option value="">Select a form...</option>
            {allForms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Dynamic Form */}
      {currentForm && (
        <Card>
          <CardHeader>
            <CardTitle>{currentForm.name}</CardTitle>
            <CardDescription>{currentForm.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentForm.form_fields && Array.isArray(currentForm.form_fields) ? (
              currentForm.form_fields.map((field: any, index: number) => (
                <div key={field.id || index}>
                  {renderField(field)}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">
                No form fields available
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => window.location.href = `/app/patients/${patient.id}`}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Form"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

