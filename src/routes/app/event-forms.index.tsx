import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EventForm from "@/models/event-form";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { permissionsMiddleware } from "@/middleware/auth";
import {
  createPermissionContext,
  checkEventFormPermission,
} from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import { redirect } from "@tanstack/react-router";
import User from "@/models/user";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { useMemo } from "react";
import { useEventFormPermissions } from "@/hooks/use-permissions";

const deleteForm = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    // Check permissions - only super admin can delete event forms
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.DELETE);
    
    return EventForm.API.softDelete(data.id);
  });

const toggleFormDetail = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator(
    (d: { id: string; field: "snapshot" | "editable"; value: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    // Check permissions - editing form settings requires edit permission
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.EDIT);
    
    switch (data.field) {
      case "snapshot":
        return await EventForm.API.toggleSnapshot({
          id: data.id,
          isSnapshot: data.value,
        });
      case "editable":
        return await EventForm.API.toggleEditable({
          id: data.id,
          isEditable: data.value,
        });
      default:
        throw Error("Unknown field");
    }
  });

// top-level guard to avoid creating server fn inside loader
const ensureCanViewEventForms = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    const permContext = createPermissionContext(context);
    checkEventFormPermission(permContext, PermissionOperation.VIEW);
    return true;
  });

export const Route = createFileRoute("/app/event-forms/")({
  component: RouteComponent,
  loader: async () => {
    // Deny access to users without VIEW permission (e.g., registrar)
    const canView = await ensureCanViewEventForms();
    if (!canView) {
      throw redirect({ to: "/app", replace: true });
    }
    const currentUser = (await getCurrentUser()) as User.EncodedT | null;
    return {
      forms: await getEventForms(),
      currentUser,
    };
  },
});

function RouteComponent() {
  const { forms, currentUser } = Route.useLoaderData() as {
    forms: EventForm.EncodedT[];
    currentUser: User.EncodedT | null;
  };
  const route = useRouter();
  const { canAdd, canEdit, canDelete } = useEventFormPermissions(
    currentUser?.role,
  );
  const canConfigure = useMemo(() => canEdit, [canEdit]);

  const handleSnapshotToggle = (id: string, isSnapshot: boolean) => {
    toggleFormDetail({ data: { id, field: "snapshot", value: isSnapshot } })
      .then(() => {
        toast.success("Form snapshot mode toggled successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error("Failed to toggle form snapshot mode");
        console.error(error);
      });
  };

  const handleEditableToggle = (id: string, isEditable: boolean) => {
    toggleFormDetail({ data: { id, field: "editable", value: isEditable } })
      .then(() => {
        toast.success("Form editable mode toggled successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error("Failed to toggle form editable mode");
        console.error(error);
      });
  };

  const handleDelete = (id: string) => {
    deleteForm({ data: { id } })
      .then(() => {
        toast.success("Form deleted successfully");
        route.invalidate({ sync: true });
      })
      .catch((error) => {
        toast.error("Failed to delete form");
        console.error(error);
      });
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Event Forms</h1>
        {canAdd && (
          <Link to="/app/event-forms/edit/$" params={{ _splat: "new" }}>
            <Button>Create New Form</Button>
          </Link>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableCaption>Event Forms</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Snapshot</TableHead>
                <TableHead>Editable</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No forms available
                  </TableCell>
                </TableRow>
              ) : (
                forms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell>
                      {canConfigure ? (
                        <Checkbox
                          checked={form.is_snapshot_form}
                          onCheckedChange={() =>
                            handleSnapshotToggle(
                              form.id,
                              !form.is_snapshot_form,
                            )
                          }
                        />
                      ) : (
                        <Checkbox checked={form.is_snapshot_form} disabled />
                      )}
                    </TableCell>
                    <TableCell>
                      {canConfigure ? (
                        <Checkbox
                          checked={form.is_editable}
                          onCheckedChange={() =>
                            handleEditableToggle(form.id, !form.is_editable)
                          }
                        />
                      ) : (
                        <Checkbox checked={form.is_editable} disabled />
                      )}
                    </TableCell>
                    <TableCell>{form.name || "—"}</TableCell>
                    <TableCell>{form.description || "—"}</TableCell>
                    <TableCell>
                      {format(form.created_at, "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      {format(form.updated_at, "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell className="space-x-2">
                      {canEdit && (
                        <Link
                          to="/app/event-forms/edit/$"
                          params={{ _splat: form.id }}
                        >
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </Link>
                      )}
                      {canDelete && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(form.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
