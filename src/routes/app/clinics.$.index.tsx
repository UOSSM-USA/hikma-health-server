import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Archive,
  Trash2,
  Edit,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useTranslation, useLanguage } from "@/lib/i18n/context";
import { translateText } from "@/lib/server-functions/translate";
import If from "@/components/if";
import {
  createDepartment,
  getClinicById,
  toggleDepartmentCapability,
} from "@/lib/server-functions/clinics";
import { getFormsByClinic } from "@/lib/server-functions/event-forms";
import { getCurrentUser } from "@/lib/server-functions/auth";
import User from "@/models/user";
import type Clinic from "@/models/clinic";
import type ClinicDepartment from "@/models/clinic-department";
import type EventForm from "@/models/event-form";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/app/clinics/$/")({
  loader: async ({ params }) => {
    // Extract the clinic ID from the splat parameter
    const clinicId = params._splat;
    if (!clinicId) {
      throw new Error("Clinic ID is required");
    }

    const result: {
      data: {
        clinic: Clinic.EncodedT;
        departments: ClinicDepartment.EncodedT[];
      } | null;
      error: string | null;
    } = await getClinicById({ data: { id: clinicId } }) as any;
    
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.data) {
      throw new Error("Clinic not found");
    }

    const { clinic, departments } = result.data;

    // Load assigned forms (for super admins)
    let assignedForms: EventForm.EncodedT[] = [];
    let isSuperAdmin = false;
    try {
      const currentUser = await getCurrentUser();
      isSuperAdmin = currentUser?.role === User.ROLES.SUPER_ADMIN || currentUser?.role === User.ROLES.SUPER_ADMIN_2;
      if (isSuperAdmin) {
        try {
          assignedForms = await getFormsByClinic({ data: { clinicId } });
          console.log(`[Clinic Detail] Loaded ${assignedForms.length} assigned forms for clinic ${clinicId}`);
        } catch (formError: any) {
          console.error("Error loading assigned forms:", formError);
          // If it's a migration error, forms will be empty but page should still load
          if (formError?.code !== "42P01") {
            throw formError;
          }
        }
      } else {
        console.log(`[Clinic Detail] User is not super admin, skipping form loading`);
      }
    } catch (error) {
      console.error("Error checking user or loading forms:", error);
      // Don't fail the page load if forms can't be loaded
    }

    return { clinic, departments, assignedForms, isSuperAdmin };
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
  pendingComponent: LoadingComponent,
});

function LoadingComponent() {
  return (
    <div className="container mx-auto p-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <Card>
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Department Registration Form Component
interface ClinicRegistrationFormProps {
  formData: {
    name: string;
    code: string;
    description: string;
    can_perform_labs: boolean;
    can_dispense_medications: boolean;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      name: string;
      code: string;
      description: string;
      can_perform_labs: boolean;
      can_dispense_medications: boolean;
    }>
  >;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ClinicRegistrationForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  isSubmitting,
}: ClinicRegistrationFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="department-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="department-name"
          type="text"
          placeholder="e.g., Emergency Department"
          value={formData.name}
          onChange={(e) =>
            setFormData({
              ...formData,
              name: e.target.value,
            })
          }
          required
          disabled={isSubmitting}
        />
      </div>

      <div>
        <Label htmlFor="department-code">Code (optional)</Label>
        <Input
          id="department-code"
          type="text"
          placeholder="e.g., ED"
          value={formData.code}
          onChange={(e) =>
            setFormData({
              ...formData,
              code: e.target.value,
            })
          }
          disabled={isSubmitting}
        />
      </div>

      <div>
        <Label htmlFor="department-description">Description (optional)</Label>
        <Textarea
          id="department-description"
          placeholder="Brief description of the department"
          value={formData.description}
          onChange={(e) =>
            setFormData({
              ...formData,
              description: e.target.value,
            })
          }
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Checkbox
          label="Can Dispense Medications"
          checked={formData.can_dispense_medications}
          onCheckedChange={(checked) =>
            setFormData({
              ...formData,
              can_dispense_medications: checked as boolean,
            })
          }
          disabled={isSubmitting}
        />

        <Checkbox
          label="Can Perform Lab Tests"
          checked={formData.can_perform_labs}
          onCheckedChange={(checked) =>
            setFormData({
              ...formData,
              can_perform_labs: checked as boolean,
            })
          }
          disabled={isSubmitting}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Department"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  const t = useTranslation();
  return (
    <div className="container mx-auto p-6">
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">Error Loading Clinic</CardTitle>
          <CardDescription className="text-red-700">
            {error.message ||
              "An error occurred while loading the clinic details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/app/clinics">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("clinicDetail.backToClinics")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function RouteComponent() {
  const { clinic, departments, assignedForms, isSuperAdmin } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const route = useRouter();
  const t = useTranslation();
  const { language } = useLanguage();
  
  // Debug logging
  console.log("[Clinic Detail Component] isSuperAdmin:", isSuperAdmin);
  console.log("[Clinic Detail Component] assignedForms count:", assignedForms?.length || 0);

  // State for translated form names and descriptions
  const [translatedFormNames, setTranslatedFormNames] = useState<Record<string, string>>({});
  const [translatedFormDescriptions, setTranslatedFormDescriptions] = useState<Record<string, string>>({});

  // Clear translation cache when language changes
  useEffect(() => {
    setTranslatedFormNames({});
    setTranslatedFormDescriptions({});
  }, [language]);

  // Auto-translate event form names and descriptions to match UI language (en/ar)
  useEffect(() => {
    if (!assignedForms || !assignedForms.length) return;
    const targetLang = language === "ar" ? "ar" : "en";

    // Simple heuristic to detect Arabic script
    const hasArabicChars = (text: string) => /[\u0600-\u06FF]/.test(text);

    void (async () => {
      const nameUpdates: Record<string, string> = {};
      const descUpdates: Record<string, string> = {};

      for (const form of assignedForms) {
        const id = form.id;
        let name = form.name || "";
        let description = form.description || "";
        
        // Split name if it contains " // " (title // description format)
        if (name.includes(" // ")) {
          const parts = name.split(" // ");
          name = parts[0] || "";
          // If description is empty, use the part after " // " as description
          if (!description && parts.length > 1) {
            description = parts.slice(1).join(" // ");
          }
        }
        
        if (!id || (!name && !description)) continue;

        // Skip if we already have translations for this form and language
        const hasNameTranslation = name ? translatedFormNames[id] : true;
        const hasDescTranslation = description ? translatedFormDescriptions[id] : true;
        if (hasNameTranslation && hasDescTranslation) continue;

        // Determine stored language
        const storedLang: "en" | "ar" =
          form.language === "ar"
            ? "ar"
            : form.language === "en"
              ? "en"
              : hasArabicChars(name + description)
                ? "ar"
                : "en";

        // Translate name based on UI language
        if (name && !translatedFormNames[id]) {
          if (storedLang === targetLang) {
            nameUpdates[id] = name;
          } else {
            try {
              const nameRes = await translateText({
                data: {
                  text: name,
                  from: storedLang,
                  to: targetLang,
                },
              });
              const translatedName = nameRes.translated || name;
              nameUpdates[id] = translatedName;
            } catch (err) {
              // On failure or rate limit, fall back to original name
              console.error("Failed to translate form name:", err);
              nameUpdates[id] = name;
            }
          }
        }

        // Always translate description to Arabic (don't translate to English)
        if (description && !translatedFormDescriptions[id]) {
          const descHasArabic = hasArabicChars(description);
          if (descHasArabic) {
            // Description already has Arabic, keep it as is
            descUpdates[id] = description;
          } else {
            // Description is not in Arabic, translate it to Arabic
            const descStoredLang = storedLang === "ar" ? "ar" : "en";
            try {
              const descRes = await translateText({
                data: {
                  text: description,
                  from: descStoredLang,
                  to: "ar",
                },
              });
              const translatedDesc = descRes.translated || description;
              descUpdates[id] = translatedDesc;
            } catch (err) {
              // On failure or rate limit, fall back to original description
              console.error("Failed to translate form description:", err);
              descUpdates[id] = description;
            }
          }
        }
      }

      // Batch update state
      if (Object.keys(nameUpdates).length > 0) {
        setTranslatedFormNames((prev) => ({ ...prev, ...nameUpdates }));
      }
      if (Object.keys(descUpdates).length > 0) {
        setTranslatedFormDescriptions((prev) => ({ ...prev, ...descUpdates }));
      }
    })();
  }, [assignedForms, language]);

  const [departmentSectionState, setDepartmentSectionState] = useState<
    "view" | "edit"
  >("view");
  const [departmentFormData, setDepartmentFormData] = useState({
    name: "",
    code: "",
    description: "",
    can_perform_labs: false,
    can_dispense_medications: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    try {
      const dateObj = typeof date === "string" ? new Date(date) : date;
      return format(dateObj, "PPP p");
    } catch {
      return "Invalid date";
    }
  };

  const handleEditClinic = () => {
    navigate({ to: `/app/clinics/edit/${clinic.id}` });
  };

  const handleToggleCapability = async (
    clinicId: string,
    departmentId: string,
    capability: ClinicDepartment.DepartmentCapability,
  ) => {
    let toastId = toast.loading("Toggling capability...");
    try {
      console.log("Toggling capability:", capability);
      await toggleDepartmentCapability({
        data: { clinicId, departmentId, capability },
      });

      route.invalidate({ sync: true });
    } catch (error) {
      console.error(error);
      alert("Failed to toggle capability");
    } finally {
      toast.dismiss(toastId);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!departmentFormData.name.trim()) {
      alert(t("clinicDetail.departmentNameRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createDepartment({
        data: {
          clinicId: clinic.id,
          name: departmentFormData.name,
          code: departmentFormData.code || "",
          description: departmentFormData.description || "",
          can_perform_labs: departmentFormData.can_perform_labs,
          can_dispense_medications: departmentFormData.can_dispense_medications,
        },
      });

      if (result.success) {
        // Reset form and refresh the page to show new department
        setDepartmentFormData({
          name: "",
          code: "",
          description: "",
          can_perform_labs: false,
          can_dispense_medications: false,
        });
        setDepartmentSectionState("view");
        navigate({ to: ".", replace: true });
      }
    } catch (error) {
      console.error("Failed to create department:", error);
      alert(t("clinicDetail.failedToCreateDepartment"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Clinic Details</h1>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleEditClinic}
            variant="outline"
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Main clinic information card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                {clinic.name || t("clinicDetail.unnamedClinic")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("clinicDetail.id")}:{" "}
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {clinic.id}
                </code>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {clinic.is_archived && (
                <Badge variant="secondary" className="gap-1">
                  <Archive className="h-3 w-3" />
                  {t("clinicDetail.archived")}
                </Badge>
              )}
              {clinic.is_deleted && (
                <Badge variant="destructive" className="gap-1">
                  <Trash2 className="h-3 w-3" />
                  {t("clinicDetail.deleted")}
                </Badge>
              )}
              {!clinic.is_archived && !clinic.is_deleted && (
                <Badge variant="default" className="bg-green-600">
                  {t("clinicDetail.active")}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Timestamps section */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">{t("clinicDetail.timestamps")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">{t("clinicDetail.created")}:</span>
                  <span className="font-medium">
                    {formatDate(clinic.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">{t("clinicDetail.updated")}:</span>
                  <span className="font-medium">
                    {formatDate(clinic.updated_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">{t("clinicDetail.lastModified")}:</span>
                  <span className="font-medium">
                    {formatDate(clinic.last_modified)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">{t("clinicDetail.serverCreated")}:</span>
                  <span className="font-medium">
                    {formatDate(clinic.server_created_at)}
                  </span>
                </div>
                {clinic.deleted_at && (
                  <div className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Trash2 className="h-4 w-4 text-red-500" />
                    <span className="text-gray-600">{t("clinicDetail.deleted")}:</span>
                    <span className="font-medium text-red-600">
                      {formatDate(clinic.deleted_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Additional information */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">{t("clinicDetail.additionalInformation")}</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t("clinicDetail.status")}:</span>
                  <span className="font-medium">
                    {clinic.is_deleted
                      ? t("clinicDetail.deleted")
                      : clinic.is_archived
                        ? t("clinicDetail.archived")
                        : t("clinicDetail.active")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t("clinicDetail.clinicName")}:</span>
                  <span className="font-medium">
                    {clinic.name || t("common.notSpecified") || "Not specified"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinic Departments Information Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("clinicDetail.clinicDepartments")}</CardTitle>
          <CardDescription>{t("clinicDetail.manageDepartments")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {departments.map((department) => (
                <div
                  key={department.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h4 className="font-medium text-sm">{department.name}</h4>
                      {department.code && (
                        <p className="text-xs text-gray-500">
                          {t("clinicDetail.code")}: {department.code}
                        </p>
                      )}
                      {department.description && (
                        <p className="text-sm text-gray-600 mt-2">
                          {department.description}
                        </p>
                      )}

                      {/*Manage what the clinic can do directly here*/}

                      <div className="space-y-2">
                        <p className="text-sm text-gray-600 mt-2">
                          {t("clinicDetail.capabilities")}:
                        </p>
                        <Checkbox
                          label={t("clinicDetail.canDispenseMedications")}
                          size="sm"
                          checked={department.can_dispense_medications}
                          onCheckedChange={() =>
                            handleToggleCapability(
                              department.clinic_id,
                              department.id,
                              "can_dispense_medications",
                            )
                          }
                        />

                        <Checkbox
                          label={t("clinicDetail.canPerformLabs")}
                          size="sm"
                          checked={department.can_perform_labs}
                          onCheckedChange={() =>
                            handleToggleCapability(
                              department.clinic_id,
                              department.id,
                              "can_perform_labs",
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {department.can_dispense_medications && (
                        <Badge variant="secondary" className="text-xs">
                          {t("clinicDetail.canDispenseMedications")}
                        </Badge>
                      )}
                      {department.can_perform_labs && (
                        <Badge variant="secondary" className="text-xs">
                          {t("clinicDetail.canDoLabTests")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <div className="text-gray-500">{t("clinicDetail.noDepartmentsFound")}</div>
              )}
            </div>

            {/* New Department Form section */}
            <If show={departmentSectionState === "edit"}>
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">{t("clinicDetail.addDepartment")}</h3>
                {/* CREATE THE MINIMAL FORM HERE */}
                <ClinicRegistrationForm
                  formData={departmentFormData}
                  setFormData={setDepartmentFormData}
                  onSubmit={handleCreateDepartment}
                  onCancel={() => {
                    setDepartmentSectionState("view");
                    setDepartmentFormData({
                      name: "",
                      code: "",
                      description: "",
                      can_perform_labs: false,
                      can_dispense_medications: false,
                    });
                  }}
                  isSubmitting={isSubmitting}
                />
              </div>
            </If>
            <div className="flex flex-wrap gap-2">
              <If show={departmentSectionState === "view"}>
                <Button
                  onClick={() =>
                    departmentSectionState === "view"
                      ? setDepartmentSectionState("edit")
                      : setDepartmentSectionState("view")
                  }
                  variant="outline"
                >
                  {t("clinicDetail.addDepartment")}
                </Button>
              </If>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Event Forms Section (Super Admin Only) */}
      {isSuperAdmin ? (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("clinicDetail.assignedEventForms")}</CardTitle>
                <CardDescription>
                  {t("clinicDetail.assignedFormsDescription")}
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => navigate({ to: `/app/clinics/edit/${clinic.id}` })}
              >
                <Edit className="h-4 w-4" />
                {t("clinicDetail.manageForms")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!assignedForms || assignedForms.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-2">{t("clinicDetail.noFormsAssigned")}</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate({ to: `/app/clinics/edit/${clinic.id}` })}
                >
                  {t("clinicDetail.assignForms")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {assignedForms.map((form) => (
                  <div
                    key={form.id}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">
                        {(() => {
                          const translated = translatedFormNames[form.id];
                          if (translated) return translated;
                          // Fallback: split name if it contains " // "
                          const name = form.name || "";
                          return name.includes(" // ") ? name.split(" // ")[0] : name;
                        })()}
                      </h4>
                      {(() => {
                        const translated = translatedFormDescriptions[form.id];
                        const description = form.description || "";
                        const name = form.name || "";
                        const displayDesc = translated || description || (name.includes(" // ") ? name.split(" // ").slice(1).join(" // ") : "");
                        return displayDesc ? (
                          <p className="text-xs text-gray-500 mt-1">
                            {displayDesc}
                          </p>
                        ) : null;
                      })()}
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {form.language === "ar" ? t("language.arabic") : form.language === "en" ? t("language.english") : form.language}
                        </Badge>
                        {form.is_editable && (
                          <Badge variant="outline" className="text-xs">
                            {t("table.editable")}
                          </Badge>
                        )}
                        {form.is_snapshot_form && (
                          <Badge variant="outline" className="text-xs">
                            {t("table.snapshot")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => navigate({ to: `/app/event-forms/edit/${form.id}` })}
                    >
                      {t("clinicDetail.view")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Debug: Show if user is not super admin (remove in production)
        process.env.NODE_ENV === "development" && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <p className="text-sm text-yellow-800">
                Debug: Form assignment section hidden. isSuperAdmin: {String(isSuperAdmin)}
              </p>
            </CardContent>
          </Card>
        )
      )}

      {/* Action buttons */}
      <Card>
        <CardHeader>
          <CardTitle>{t("clinicDetail.actions")}</CardTitle>
          <CardDescription>{t("clinicDetail.manageClinic")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">{t("clinicDetail.viewPatients")}</Button>
            <Button variant="outline">{t("clinicDetail.viewStaff")}</Button>
            {!clinic.is_archived && (
              <Button
                variant="outline"
                className="text-yellow-600 hover:text-yellow-700"
              >
                <Archive className="h-4 w-4 mr-2" />
                {t("clinicDetail.archiveClinic")}
              </Button>
            )}
            {clinic.is_archived && (
              <Button
                variant="outline"
                className="text-green-600 hover:text-green-700"
              >
                {t("clinicDetail.restoreClinic")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
