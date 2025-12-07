import { createFileRoute } from "@tanstack/react-router";
import EventForm from "@/models/event-form";
import { useSelector } from "@xstate/store/react";
import eventFormStore from "@/stores/event-form-builder";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import Language from "@/models/language";
import { nanoid } from "nanoid";
import {
  LucideBox,
  LucideCalendar,
  LucideList,
  LucideCircle,
  LucideFile,
  LucidePill,
  LucideStethoscope,
} from "lucide-react";
import {
  findDuplicatesStrings,
  isValidUUID,
} from "@/lib/utils";
import { DatePickerInput } from "@/components/date-picker-input";
import { Separator } from "@/components/ui/separator";
import { InputsConfiguration } from "@/components/form-builder/InputsConfiguration";
import { SelectInput, type SelectOption } from "@/components/select-input";
import { RadioInput, type RadioOption } from "@/components/radio-input";
import { MedicineInput } from "@/components/form-builder/MedicineInput";
import { DiagnosisSelect } from "@/components/form-builder/DiagnosisPicker";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMemo } from "react";
import { useEventFormPermissions } from "@/hooks/use-permissions";
import User from "@/models/user";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/event-forms/edit/$")({
  // ssr: false,
  component: RouteComponent,
  loader: async ({ params }) => {
    const {
      ensureCanAddEventForm,
      ensureCanEditEventForm,
      getEventFormForEditor,
    } = await import("@/lib/server-functions/event-form-editor");
    // Guard: deny access for users without proper permission
    const isNew = !params._splat || params._splat === "new";
    const ok = isNew
      ? await ensureCanAddEventForm()
      : await ensureCanEditEventForm();
    if (!ok) {
      throw redirect({ to: "/app/event-forms", replace: true });
    }
    const currentUser = (await getCurrentUser()) as User.EncodedT | null;
    const formId = params._splat;
    if (!formId || formId === "new") {
      return { form: null, currentUser };
    }
    return {
      form: await getEventFormForEditor({ data: { id: formId } }),
      currentUser,
    };
  },
});

// form title, form language, form description, is editable checkbox, is snapshot checkbox, (inputs custom component)m add form input buttoms

function RouteComponent() {
  const { form: initialForm, currentUser } = Route.useLoaderData() as {
    form: EventForm.EncodedT | null;
    currentUser: User.EncodedT | null;
  };
  console.log({ initialForm });
  const navigate = Route.useNavigate();
  const formId = Route.useParams()._splat;
  const isEditing = !!initialForm?.id;
  const { canAdd, canEdit } = useEventFormPermissions(currentUser?.role);
  const isReadOnly = useMemo(() => {
    return isEditing ? !canEdit : !canAdd;
  }, [isEditing, canAdd, canEdit]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const formState = useSelector(eventFormStore, (state) => state.context);
  const InputsConfigurationComponent = InputsConfiguration as any;

  useEffect(() => {
    // Scroll to top and prevent scrolling.
    // This screen has two panels that need to scroll independelty
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";
    return () => {
      // Reset scroll and allow scrolling.
      window.scrollTo(0, 0);
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (isEditing) {
      eventFormStore.send({ type: "set-form-state", payload: initialForm });
    }
    if (!isEditing || !initialForm || !formId) {
      eventFormStore.send({ type: "reset" });
    }
  }, [initialForm, isEditing, formId]);

  const handleSaveForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const duplicateFieldNames = findDuplicatesStrings(
      formState.form_fields.map((field) => field.name?.trim().toLowerCase()),
    );

    if (duplicateFieldNames.length > 0) {
      toast.error(
        `Duplicate field names found: ${duplicateFieldNames.join(", ")}`,
      );
      return;
    }

    const containsReservedFieldNames = formState.form_fields.some((field) =>
      EventForm.RESERVED_FIELD_NAMES.includes(field.name?.trim().toLowerCase()),
    );

    if (containsReservedFieldNames) {
      toast.error("Reserved field names are not allowed");
      return;
    }

    // For medicine fields, remove empty strings that might be added after semicolon separation
    // This cleaning happens at submission time as noted in InputsConfiguration component
    const cleanedFormFields = formState.form_fields.map((field) => {
      if (field._tag === "medicine") {
        const medicineField = field as any as EventForm.MedicineField;
        if (medicineField.options) {
          const cleanedOptions = (Array.isArray(medicineField.options) ? medicineField.options : [])
            .map((option: any) => {
              if (typeof option === "string") {
                return option.trim();
              } else if (typeof option === "object" && option !== null) {
                return {
                  ...option,
                  label: option.label?.trim() || "",
                  value: option.value?.trim() || "",
                };
              }
              return option;
            })
            .filter((value: any) => {
              if (typeof value === "string") {
                return value.trim() !== "";
              } else if (typeof value === "object" && value !== null) {
                return (value.value?.trim() || value.label?.trim() || "") !== "";
              }
              return true;
            });

          return {
            ...medicineField,
            options: cleanedOptions,
          };
        }
      }
      return field;
    });

    const updateFormId = (() => {
      if (typeof formId === "string" && isValidUUID(formId)) {
        return formId;
      }
      return null;
    })();
    try {
      setIsSubmitting(true);
      const { saveEventForm } = await import(
        "@/lib/server-functions/event-form-editor"
      );
      await saveEventForm({
        data: { form: { ...formState, form_fields: cleanedFormFields }, updateFormId },
      });
      toast.success("Form saved successfully");
      navigate({ to: "/app/event-forms" });
    } catch (error) {
      toast.error("Failed to save form");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addField = (field: EventForm.FieldData) => {
    eventFormStore.send({ type: "add-field", payload: field });
  };

  const handleFieldRemove = (fieldId: string) => {
    eventFormStore.send({ type: "remove-field", payload: fieldId });
  };

  const handleFieldChange = (fieldId: string, key: string, value: any) => {
    eventFormStore.send({
      type: "set-field-key-value",
      payload: { fieldId, key, value },
    });
  };

  const handleFieldOptionChange = (
    fieldId: string,
    options: EventForm.FieldOption[],
  ) => {
    eventFormStore.send({
      type: "set-dropdown-options",
      payload: { fieldId, value: options },
    });
  };

  const handleFieldUnitChange = (
    fieldId: string,
    units: EventForm.DoseUnit[] | false,
  ) => {
    if (!units) {
      eventFormStore.send({ type: "remove-units", payload: { fieldId } });
      return;
    }
    eventFormStore.send({
      type: "add-units",
      payload: { fieldId, value: units },
    });
  };

  const handleValidationChange = (
    fieldId: string,
    validation: EventForm.ValidationRule[] | undefined,
  ) => {
    eventFormStore.send({
      type: "set-field-key-value",
      payload: { fieldId, key: "validation", value: validation },
    });
  };

  const handleFieldsReorder = (ids: number[]) => {
    eventFormStore.send({ type: "reorder-fields", payload: { indices: ids } });
  };

  return (
    <div className="h-[calc(100vh-100px)] overflow-hidden">
      <div className="grid grid-cols-2 gap-4 h-full">
        {/* Left side - Form configuration */}
        <div
          className=" overflow-y-auto p-4"
          style={{ height: "100%", overflowY: "auto", flex: 1 }}
        >
          <form onSubmit={handleSaveForm} className="h-full space-y-4">
            <Input
              label="Form Title"
              type="text"
              name="name"
              value={formState.name}
              disabled={isReadOnly}
              onChange={(e) =>
                eventFormStore.send({
                  type: "set-form-name",
                  payload: e.target.value,
                })
              }
            />
            <SelectInput
              label="Form Language"
              className="w-full"
              value={formState.language}
              disabled={isReadOnly}
              onChange={(value) =>
                value &&
                eventFormStore.send({
                  type: "set-form-language",
                  payload: value,
                })
              }
              data={Object.entries(Language.defaultLanguages).map(
                ([key, value]) => ({
                  value: key,
                  label: value,
                }),
              )}
            />
            <Input
              label="Form Description"
              type="textarea"
              name="description"
              value={formState.description}
              disabled={isReadOnly}
              onChange={(e) =>
                eventFormStore.send({
                  type: "set-form-description",
                  payload: e.target.value,
                })
              }
            />
            <Checkbox
              label="Is Editable"
              name="is_editable"
              checked={formState.is_editable}
              disabled={isReadOnly}
            onCheckedChange={() =>
                eventFormStore.send({ type: "toggle-form-editable" })
              }
            />
            <Checkbox
              label="Is Snapshot"
              name="is_snapshot_form"
              checked={formState.is_snapshot_form}
              disabled={isReadOnly}
            onCheckedChange={() =>
                eventFormStore.send({ type: "toggle-form-snapshot" })
              }
            />
            <Separator className="my-6" />
            <InputsConfigurationComponent
              fields={formState.form_fields as any}
              onRemoveField={handleFieldRemove}
              onFieldChange={handleFieldChange}
              onFieldOptionChange={handleFieldOptionChange}
              onFieldUnitChange={handleFieldUnitChange}
              onReorder={handleFieldsReorder}
              onValidationChange={handleValidationChange}
            />
            <Separator className="my-6" />

            {!isReadOnly && <AddFormInputButtons addField={addField} />}
            {!isReadOnly && (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            )}
          </form>
        </div>
        {/* Right side - Form preview */}
        <div className="space-y-4 overflow-y-auto p-4 h-full">
          <div>
            <h3 className="text-2xl font-semibold">{formState.name}</h3>
            <p>{formState.description}</p>
          </div>

          {formState.form_fields.map((field) => {
            switch (field._tag) {
              case "free-text":
                return (
                  <div key={field.id}>
                    <Input
                      label={field.name}
                      description={field.description}
                      type={field.inputType}
                      required={field.required}
                    />
                  </div>
                );
              case "binary":
                return (
                  <div key={field.id}>
                    <Checkbox
                      label={field.name}
                      description={field.description}
                      required={field.required}
                    />
                  </div>
                );
              case "file":
                // FIXME: better file input
                return (
                  <div key={field.id}>
                    <Input
                      label={field.name}
                      description={field.description}
                      type={field.inputType}
                      required={field.required}
                    />
                  </div>
                );
              case "options":
                if (field.inputType === "radio") {
                  return (
                    <div key={field.id}>
                      <RadioInput
                        label={field.name}
                        description={field.description}
                        withAsterisk={field.required}
                        data={field.options as (string | RadioOption)[]}
                      />
                    </div>
                  );
                }
                return (
                  <div key={field.id}>
                    <SelectInput
                      withAsterisk={field.required}
                      data={field.options as (string | SelectOption)[]}
                      label={field.name}
                      description={field.description}
                      className="w-full"
                    />
                  </div>
                );
              case "date":
                return (
                  <div key={field.id}>
                    <DatePickerInput
                      label={field.name}
                      description={field.description}
                      withAsterisk={field.required}
                    />
                  </div>
                );
              case "medicine":
                return (
                  <div key={field.id} className="w-full">
                    <MedicineInput
                      name={field.name}
                      description={field.description}
                    />
                  </div>
                );
              case "diagnosis":
                return (
                  <div key={field.id}>
                    <DiagnosisSelect
                      name={field.name}
                      description={field.description}
                      withAsterisk={field.required}
                      required={field.required}
                      multi={(field as any).multi}
                    />
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      </div>

      <style>{`
          body {
            overflow-y: hidden;
          }
        `}</style>
    </div>
  );
}

function createComponent(
  field: () => EventForm.FieldData,
  opts: {
    label: string;
    icon?: React.ReactNode;
    // render: React.FC<{ field: FieldDescription }>;
  },
) {
  //   if (!opts.render) {
  //     throw new Error("missing `opts.render` please define or remove component");
  //   }

  return {
    id: String(Math.random() * 10000 + 1), // NOTE: might remove this
    field,
    button: {
      label: opts.label,
      // NOTE: might move this default definition out
      icon: opts.icon ?? <LucideBox />,
    },
    // render: opts.render,
  };
}

const ComponentRegistry = [
  // FIXME: Mobile app is not set up to render checkbox fields, update app to support checkbox fields
  // createComponent(
  //   () =>
  //     new EventForm.BinaryField2({
  //       inputType: "checkbox",
  //       options: [],
  //       id: nanoid(),
  //       name: "",
  //       description: "",
  //       required: false,
  //     }),
  //   {
  //     label: "Checkbox",
  //     icon: <LucideBox />,
  //     //   render: FreeTextInput,
  //   }
  // ),
  createComponent(
    () =>
      new EventForm.TextField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "text",
        length: "short",
        units: [],
      }),
    {
      label: "Text",
      icon: <LucideBox />,
      //   render: FreeTextInput,
    },
  ),
  createComponent(
    () =>
      new EventForm.DateField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "date",
      }),
    {
      label: "Date",
      icon: <LucideCalendar />,
      //   render: DateInput,
    },
  ),
  createComponent(
    () =>
      new EventForm.OptionsField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "select",
        multi: false,
        options: [],
      }),
    {
      label: "Select",
      icon: <LucideList />,
      //   render: SelectInput,
    },
  ),
  createComponent(
    () =>
      new EventForm.OptionsField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "radio",
        multi: false,
        options: [],
      }),
    {
      label: "Radio",
      icon: <LucideCircle />,
      //   render: SelectInput,
    },
  ),
  createComponent(
    () =>
      new EventForm.FileField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "file",
        allowedMimeTypes: null,
        multiple: false,
        minItems: 0,
        maxItems: 10,
      }),
    {
      label: "File",
      icon: <LucideFile />,
      //   render: FileInput,
    },
  ),
  createComponent(
    () =>
      new EventForm.MedicineField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "input-group",
        options: [],
        fields: {
          name: "Name",
          route: EventForm.medicineRoutes as unknown as string[],
          form: EventForm.medicineForms as unknown as string[],
          frequency: "",
          intervals: "",
          dose: "",
          doseUnits: EventForm.doseUnits as unknown as EventForm.DoseUnit[],
          duration: "",
          durationUnits: EventForm.durationUnits as unknown as EventForm.DurationUnit[],
        },
      }),
    {
      label: "Medicine",
      icon: <LucidePill />,
      //   render: FreeTextInput,
    },
  ),
  // Diagnoses
  createComponent(
    () =>
      new EventForm.DiagnosisField2({
        id: nanoid(),
        name: "",
        description: "",
        required: false,
        inputType: "select",
        options: [],
      }),
    {
      label: "Diagnosis",
      icon: <LucideStethoscope />,
      //   render: FreeTextInput,
    },
  ),
];

/**
 * Bottom row containing the list of components a user can choose from
 */
const AddFormInputButtons = ({
  addField,
}: {
  addField: (field: EventForm.FieldData) => void;
}) => {
  return (
    <div className="flex flex-row flex-wrap gap-2">
      <>
        {ComponentRegistry.map(({ button, field }, ix) => (
          <Button
            size="default"
            key={ix}
            onClick={() => addField(field())}
            type="button"
            // leftIcon={button.icon}
            className="primary"
          >
            {button.label}
          </Button>
        ))}
      </>
    </div>
  );
};
