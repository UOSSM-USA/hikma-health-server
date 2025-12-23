import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import db from "@/db";
import Clinic from "@/models/clinic";
import { useTranslation } from "@/lib/i18n/context";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { assignFormsToClinic, unassignFormsFromClinic, getEventForms } from "@/lib/server-functions/event-forms";
import EventForm from "@/models/event-form";
import User from "@/models/user";

// Define the form schema
const formSchema = z.object({
  name: z.string().min(1, "Clinic name is required"),
});

// Type for the form values
type FormValues = z.infer<typeof formSchema>;

// Server function to get a clinic by ID
const getClinicById = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const clinic = await db
      .selectFrom("clinics")
      .where("id", "=", data.id)
      .where("is_deleted", "=", false)
      .selectAll()
      .executeTakeFirst();

    return clinic;
  });

// Server function to create or update a clinic
const saveClinic = createServerFn({ method: "POST" })
  .validator((data: { id?: string; name: string }) => data)
  .handler(async ({ data }) => {
    return await Clinic.save({ id: data.id, name: data.name });
  });

export const Route = createFileRoute("/app/clinics/edit/$")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const clinicId = params["_splat"];
    
    // Get current user - need to call the server function properly
    let currentUser = null;
    let isSuperAdmin = false;
    try {
      currentUser = await getCurrentUser();
      isSuperAdmin = currentUser?.role === User.ROLES.SUPER_ADMIN || currentUser?.role === User.ROLES.SUPER_ADMIN_2;
    } catch (error) {
      console.error("Error getting current user:", error);
    }
    
    let clinic = null;
    let allForms: EventForm.EncodedT[] = [];
    let assignedFormIds: string[] = [];
    
    if (clinicId && clinicId !== "new") {
      clinic = await getClinicById({ data: { id: clinicId } });
      
      // Load forms and assignments for super admins
      if (isSuperAdmin && clinic) {
        try {
          // Use EventForm.API directly in loader (bypasses clinic filtering)
          const EventFormModel = (await import("@/models/event-form")).default;
          allForms = await EventFormModel.API.getAll();
          console.log(`[Clinic Edit Loader] Loaded ${allForms.length} forms for super admin (clinic: ${clinicId})`);
          
          // Get assigned forms for this clinic
          // Check if migration has been run (table exists)
          const ClinicEventFormModel = (await import("@/models/clinic-event-form")).default;
          try {
            assignedFormIds = await ClinicEventFormModel.API.getFormIdsByClinic(clinic.id);
            console.log(`[Clinic Edit Loader] Found ${assignedFormIds.length} assigned forms for clinic ${clinic.id}`);
          } catch (migrationError: any) {
            // If table doesn't exist, migration hasn't been run
            const errorMessage = migrationError?.message || String(migrationError);
            const errorCode = migrationError?.code;
            if (errorMessage.includes("does not exist") || 
                errorCode === "42P01" ||
                errorMessage.includes("relation") && errorMessage.includes("clinic_event_forms")) {
              console.warn("[Clinic Edit Loader] clinic_event_forms table does not exist. Please run migrations: pnpm run db:migrate");
              assignedFormIds = [];
            } else {
              console.error("[Clinic Edit Loader] Error loading assigned forms:", migrationError);
              assignedFormIds = [];
            }
          }
        } catch (error) {
          console.error("[Clinic Edit Loader] Error loading forms for assignment:", error);
          // Don't fail the page load, just log the error
          allForms = [];
        }
      } else {
        console.log(`[Clinic Edit Loader] Not loading forms - isSuperAdmin: ${isSuperAdmin}, clinic: ${!!clinic}`);
      }
    } else if (isSuperAdmin) {
      // For new clinics, load all forms
      try {
        const EventFormModel = (await import("@/models/event-form")).default;
        allForms = await EventFormModel.API.getAll();
        console.log(`[Clinic Edit Loader] Loaded ${allForms.length} forms for new clinic`);
      } catch (error) {
        console.error("[Clinic Edit Loader] Error loading forms:", error);
      }
    }
    
    return { 
      clinic, 
      allForms, 
      assignedFormIds,
      isSuperAdmin 
    };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const { clinic, allForms: loaderAllForms, assignedFormIds: initialAssignedFormIds, isSuperAdmin } = loaderData;
  const params = Route.useParams();
  const clinicId = params._splat;
  const isEditing = !!clinicId && clinicId !== "new";
  const t = useTranslation();

  // State for form assignments (only for super admins)
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(
    new Set(initialAssignedFormIds || [])
  );
  const [isSavingForms, setIsSavingForms] = useState(false);
  const [allForms, setAllForms] = useState<EventForm.EncodedT[]>(loaderAllForms || []);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const hasAttemptedLoad = useRef(false);

  // Load forms when component mounts or clinic changes
  useEffect(() => {
    // Reset when clinic changes
    hasAttemptedLoad.current = false;
    
    // If we have forms from loader, use them
    if (loaderAllForms && loaderAllForms.length > 0) {
      setAllForms(loaderAllForms);
      setIsLoadingForms(false);
      hasAttemptedLoad.current = true;
      return;
    }
    
    // If super admin editing and no forms loaded yet, load them
    if (isSuperAdmin && isEditing && clinic && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true;
      setIsLoadingForms(true);
      void (async () => {
        try {
          // Use server function instead of direct API call (works from client)
          const forms = await getEventForms();
          setAllForms(forms);
          console.log(`[Clinic Edit] Loaded ${forms.length} forms for clinic ${clinicId}`);
        } catch (error) {
          console.error("[Clinic Edit] Error loading forms:", error);
          toast.error("Failed to load event forms");
        } finally {
          setIsLoadingForms(false);
        }
      })();
    }
  }, [clinicId, loaderAllForms, isSuperAdmin, isEditing, clinic]);

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: clinic?.name || "",
    },
  });

  // Update selected forms when assignedFormIds change
  useEffect(() => {
    if (initialAssignedFormIds) {
      setSelectedFormIds(new Set(initialAssignedFormIds));
    }
  }, [initialAssignedFormIds]);

  // Handle form submission
  const onSubmit = async (values: FormValues) => {
    try {
      await saveClinic({
        data: {
          id: clinic?.id || undefined,
          name: values.name,
        },
      });

      // For super admins editing existing clinic, save form assignments
      if (isSuperAdmin && isEditing && clinic?.id) {
        await handleSaveFormAssignments(clinic.id);
      }

      toast.success(
        isEditing
          ? t("messages.clinicUpdated")
          : t("messages.clinicCreated"),
      );
      
      // For new clinics, navigate to the clinic list (form assignments can be done after creation)
      // For existing clinics, stay on the page to allow form assignment changes
      if (!isEditing) {
        navigate({ to: "/app/clinics" });
      } else {
        // Refresh the page data
        window.location.reload();
      }
    } catch (error) {
      console.error("Error saving clinic:", error);
      toast.error(t("messages.clinicSaveError"));
    }
  };

  // Handle form assignment changes (super admin only)
  const handleFormToggle = (formId: string, checked: boolean) => {
    setSelectedFormIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(formId);
      } else {
        newSet.delete(formId);
      }
      return newSet;
    });
  };

  // Save form assignments
  const handleSaveFormAssignments = async (targetClinicId: string) => {
    if (!isSuperAdmin || !isEditing) return;

    setIsSavingForms(true);
    try {
      const currentAssigned = new Set(initialAssignedFormIds || []);
      const toAssign: string[] = [];
      const toUnassign: string[] = [];

      // Find forms to assign
      selectedFormIds.forEach((formId) => {
        if (!currentAssigned.has(formId)) {
          toAssign.push(formId);
        }
      });

      // Find forms to unassign
      currentAssigned.forEach((formId) => {
        if (!selectedFormIds.has(formId)) {
          toUnassign.push(formId);
        }
      });

      // Perform assignments/unassignments
      if (toAssign.length > 0) {
        await assignFormsToClinic({ data: { clinicId: targetClinicId, eventFormIds: toAssign } });
      }
      if (toUnassign.length > 0) {
        await unassignFormsFromClinic({ data: { clinicId: targetClinicId, eventFormIds: toUnassign } });
      }

      if (toAssign.length > 0 || toUnassign.length > 0) {
        toast.success(t("clinicForm.formsAssignedSuccess") || "Forms assigned successfully");
        // Refresh the page to show updated assignments
        window.location.reload();
      } else {
        toast.info("No changes to save");
      }
    } catch (error: any) {
      console.error("Error saving form assignments:", error);
      const errorMessage = error?.message || t("clinicForm.formsAssignedError") || "Failed to assign forms";
      toast.error(errorMessage);
    } finally {
      setIsSavingForms(false);
    }
  };

  return (
    <div className="container py-4">
      <div className="max-w-md">
        <h1 className="text-xl font-bold mb-2">
          {isEditing ? t("clinicForm.titleEdit") : t("clinicForm.titleCreate")}
        </h1>
        <p className="text-muted-foreground mb-6">
          {isEditing
            ? t("clinicForm.subtitleEdit")
            : t("clinicForm.subtitleCreate")}
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("clinic.clinicName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("clinicForm.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("clinicForm.nameDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/app/clinics" })}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                {isEditing
                  ? t("clinicForm.buttons.update")
                  : t("clinicForm.buttons.create")}
              </Button>
            </div>
          </form>
        </Form>

        {/* Form Assignment Section (Super Admin Only) */}
        {isSuperAdmin && isEditing && clinic && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("clinicForm.assignForms") || "Assign Event Forms"}</CardTitle>
              <CardDescription>
                {t("clinicForm.assignFormsDescription") || "Select which event forms are available to this clinic. Forms can be assigned to multiple clinics."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingForms ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("common.loading") || "Loading forms..."}
                  </p>
                </div>
              ) : allForms.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("clinicForm.noFormsAvailable") || "No event forms available"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setIsLoadingForms(true);
                      hasAttemptedLoad.current = false; // Reset flag
                      try {
                        // Invalidate route first to refresh loader data
                        await router.invalidate();
                        // Then manually load as fallback using server function
                        const forms = await getEventForms();
                        setAllForms(forms);
                        console.log(`[Clinic Edit] Manually loaded ${forms.length} forms`);
                      } catch (error) {
                        console.error("[Clinic Edit] Error refreshing forms:", error);
                        toast.error("Failed to load forms");
                      } finally {
                        setIsLoadingForms(false);
                      }
                    }}
                  >
                    {t("common.refresh") || "Refresh"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {allForms.map((form) => (
                    <div key={form.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`form-${form.id}`}
                        checked={selectedFormIds.has(form.id)}
                        onCheckedChange={(checked) =>
                          handleFormToggle(form.id, checked === true)
                        }
                      />
                      <label
                        htmlFor={`form-${form.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                      >
                        {form.name || `Form ${form.id.substring(0, 8)}`}
                        {form.description && (
                          <span className="text-xs text-muted-foreground block mt-1">
                            {form.description}
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSaveFormAssignments(clinic.id)}
                  disabled={isSavingForms}
                >
                  {isSavingForms
                    ? t("common.saving") || "Saving..."
                    : t("clinicForm.saveFormAssignments") || "Save Form Assignments"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
