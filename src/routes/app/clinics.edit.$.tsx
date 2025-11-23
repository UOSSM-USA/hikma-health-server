import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import db from "@/db";
import Clinic from "@/models/clinic";
import { useTranslation } from "@/lib/i18n/context";

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
    if (!clinicId || clinicId === "new") {
      return { clinic: null };
    }
    return { clinic: await getClinicById({ data: { id: clinicId } }) };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const { clinic } = Route.useLoaderData();
  const params = Route.useParams();
  const clinicId = params._splat;
  const isEditing = !!clinicId && clinicId !== "new";
  const t = useTranslation();

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: clinic?.name || "",
    },
  });

  // Handle form submission
  const onSubmit = async (values: FormValues) => {
    try {
      await saveClinic({
        data: {
          id: clinic?.id || undefined,
          name: values.name,
        },
      });

      toast.success(
        isEditing
          ? t("messages.clinicUpdated")
          : t("messages.clinicCreated"),
      );
      navigate({ to: "/app/clinics" });
    } catch (error) {
      console.error("Error saving clinic:", error);
      toast.error(t("messages.clinicSaveError"));
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
      </div>
    </div>
  );
}
