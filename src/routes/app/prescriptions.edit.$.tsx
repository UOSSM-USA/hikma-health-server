import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import Prescription from "@/models/prescription";
import { v1 as uuidV1 } from "uuid";
import { Schema } from "effect";
import { sql } from "kysely";
import db from "@/db";
import { toast } from "sonner";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkPrescriptionPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import Patient from "@/models/patient";
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
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SelectInput } from "@/components/select-input";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { getAllUsers } from "@/lib/server-functions/users";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { PatientSearchSelect } from "@/components/patient-search-select";
import Clinic from "@/models/clinic";
import User from "@/models/user";
import { useEffect, useMemo } from "react";
import { usePrescriptionPermissions } from "@/hooks/use-permissions";

// Create a save prescription server function
const savePrescription = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator(
    (data: {
      prescription: Prescription.EncodedT;
      id: string | null;
      currentUserName: string;
      currentClinicId: string;
    }) => data
  )
  .handler(async ({ data, context }) => {
    const { prescription, id, currentUserName, currentClinicId } = data;

    // Check permissions
    const permContext = createPermissionContext(context);
    const operation = id ? PermissionOperation.EDIT : PermissionOperation.ADD;
    
    // Get patient to check clinic context
    const patient = await Patient.API.getById(prescription.patient_id);
    if (!patient) {
      throw new Error("Patient not found");
    }

    checkPrescriptionPermission(permContext, operation, {
      clinicId: patient.primary_clinic_id,
      providerId: prescription.provider_id,
    });

    return Prescription.API.save(
      id,
      prescription,
      currentUserName,
      currentClinicId
    );
  });

// Get prescription by ID server function
const getPrescriptionById = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { id } = data;
    const res = await db
      .selectFrom(Prescription.Table.name)
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .selectAll()
      .executeTakeFirst();

    return res as unknown as Prescription.EncodedT | null;
  });

export const Route = createFileRoute("/app/prescriptions/edit/$")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const prescriptionId = params["_splat"];
    const result: {
      prescription: Prescription.EncodedT | null;
      users: User.EncodedT[];
      clinics: Clinic.EncodedT[];
      currentUser: User.EncodedT | null;
    } = { prescription: null, users: [], clinics: [], currentUser: null };

    if (prescriptionId && prescriptionId !== "new") {
      result.prescription = (await getPrescriptionById({
        data: { id: prescriptionId },
      })) as Prescription.EncodedT | null;
    }

    result.users = (await getAllUsers()) as User.EncodedT[];
    result.clinics = (await getAllClinics()) as Clinic.EncodedT[];
    result.currentUser = (await getCurrentUser()) as User.EncodedT | null;

    return result;
  },
});

// Priority options
const priorityOptions = [
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
  { label: "High", value: "high" },
  { label: "Emergency", value: "emergency" },
];

// Status options
const statusOptions = [
  { label: "Pending", value: "pending" },
  { label: "Prepared", value: "prepared" },
  { label: "Picked Up", value: "picked-up" },
  { label: "Not Picked Up", value: "not-picked-up" },
  { label: "Partially Picked Up", value: "partially-picked-up" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Other", value: "other" },
];

function RouteComponent() {
  const {
    prescription,
    users: providers,
    clinics,
    currentUser,
  } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const params = Route.useParams();
  const prescriptionId = params._splat;
  const isEditing = !!prescriptionId && prescriptionId !== "new";

  // Permissions
  const { canAdd, canEdit } = usePrescriptionPermissions(currentUser?.role);
  const isReadOnly = useMemo(() => {
    return isEditing ? !canEdit : !canAdd;
  }, [isEditing, canAdd, canEdit]);

  // If attempting to create but not allowed, redirect away
  useEffect(() => {
    if (!isEditing && !canAdd) {
      toast.error("You do not have permission to create prescriptions.");
      navigate({ to: "/app/prescriptions", replace: true });
    }
  }, [isEditing, canAdd, navigate]);

  const form = useForm<Prescription.EncodedT>({
    defaultValues: prescription || {
      id: uuidV1(),
      patient_id: "",
      provider_id: currentUser?.id || "",
      filled_by: null,
      pickup_clinic_id: "",
      visit_id: null,
      priority: "normal",
      expiration_date: null,
      prescribed_at: new Date(),
      filled_at: null,
      status: "pending",
      items: [],
      notes: "",
      metadata: {},
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      last_modified: new Date(),
      server_created_at: new Date(),
    },
  });

  console.log({ currentUser });

  // Handle form submission
  const onSubmit = async (values: Prescription.EncodedT) => {
    if (isReadOnly) {
      toast.error("You do not have permission to modify prescriptions.");
      return;
    }
    console.log({
      prescription: values,
      id: prescriptionId,
      currentUserName: currentUser?.name || "Unknown",
      currentClinicId: currentUser?.clinic_id || "Unknown",
    });
    try {
      await savePrescription({
        data: {
          prescription: values,
          id: prescriptionId || null,
          currentUserName: currentUser?.name || "Unknown",
          currentClinicId: currentUser?.clinic_id || "Unknown",
        },
      });

      toast.success(
        `Prescription ${isEditing ? "updated" : "created"} successfully`
      );

      navigate({ to: "/app/prescriptions" });
    } catch (error) {
      console.error(error);
      toast.error(`Failed to ${isEditing ? "update" : "create"} prescription`);
    }
  };

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">
        {isEditing ? "Edit" : "Create"} Prescription
      </h1>

      <div className="grid grid-cols-1 gap-6 max-w-2xl">
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <PatientSearchSelect
                        label="Patient"
                        value={field.value as Patient.EncodedT["id"] | null}
                        isMulti={false}
                        onChange={(value) => {
                          field.onChange(value?.id || null);
                        }}
                        isDisabled={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provider_id"
                render={({ field }) => (
                  <SelectInput
                    label="Provider"
                    data={providers.map((provider) => ({
                      label: provider.name,
                      value: provider.id,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Select provider"
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="pickup_clinic_id"
                render={({ field }) => (
                  <SelectInput
                    label="Pickup Clinic"
                    data={clinics.map((clinic) => ({
                      label: clinic.name,
                      value: clinic.id,
                    }))}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Select pickup clinic"
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <SelectInput
                    label="Priority"
                    data={priorityOptions}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Select priority"
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="expiration_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expiration Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isReadOnly}
                          >
                            {field.value ? (
                              format(new Date(field.value), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(date);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <SelectInput
                    label="Status"
                    data={statusOptions}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Select status"
                    className="w-full"
                    disabled={isReadOnly}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add prescription notes here"
                        className="resize-none"
                        {...field}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: "/app/prescriptions" })}
                >
                  Cancel
                </Button>
                {!isReadOnly && (
                  <Button type="submit">
                  {isEditing ? "Update Prescription" : "Create Prescription"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
