import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import Clinic from "@/models/clinic";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  LucideArchive,
  LucideEdit,
  LucideTrash,
  LucideView,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n/context";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { Link } from "@tanstack/react-router";
import { permissionsMiddleware } from "@/middleware/auth";
import { createPermissionContext } from "@/lib/server-functions/permissions";
import { checkClinicPermission } from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import { redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { useClinicPermissions } from "@/hooks/use-permissions";

const deleteClinic = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    return Clinic.softDelete(data.id);
  });

export const archiveClinic = createServerFn({ method: "POST" })
  .validator((data: { id: string; isArchived: boolean }) => data)
  .handler(async ({ data }) => {
    return Clinic.API.setArchivedStatus(data.id, data.isArchived);
  });

// Top-level guard to avoid creating server functions inside loader
const ensureCanViewClinics = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    const permContext = createPermissionContext(context);
    checkClinicPermission(permContext, PermissionOperation.VIEW);
    return true;
  });

export const Route = createFileRoute("/app/clinics/")({
  component: RouteComponent,
  loader: async () => {
    // Guard: require VIEW permission for clinics
    const ok = await ensureCanViewClinics();
    if (!ok) {
      throw redirect({ to: "/app", replace: true });
    }
    const clinics = await getAllClinics();
    const currentUser = await getCurrentUser();
    return { clinics, currentUser };
  },
});

function RouteComponent() {
  const { clinics, currentUser } = Route.useLoaderData() as {
    clinics: Clinic.EncodedT[];
    currentUser: { role: any } | null;
  };
  const navigate = useNavigate();
  const router = useRouter();
  const { canAdd, canEdit, canDelete } = useClinicPermissions(
    currentUser?.role,
  );
  const t = useTranslation();

  console.log("Clinics:", clinics);

  const handleEdit = (id: string) => {
    navigate({ to: `/app/clinics/edit/${id}` });
  };

  const handleOpen = (id: string) => {
    navigate({ to: `/app/clinics/${id}` });
  };

  const handleDelete = (id: string) => {
    return;
    if (!window.confirm(t("clinicsList.deleteConfirm"))) {
      return;
    }

    deleteClinic({ data: { id } })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || t("clinicsList.clinicDeleteError"));
      })
      .then(() => {
        toast.success(t("clinicsList.clinicDeletedSuccess"));
        router.invalidate({ sync: true });
      });
  };

  const handleArchive = (id: string) => {
    const usersCount =
      clinics.find((clinic) => clinic.id === id)?.users?.length || 0;
    if (usersCount > 0) {
      toast.error(t("clinicsList.cannotArchiveWithUsers"));
      return;
    }
    if (!window.confirm(t("clinicsList.archiveConfirm"))) {
      return;
    }

    archiveClinic({ data: { id, isArchived: true } })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || t("clinicsList.clinicArchiveError"));
      })
      .then(() => {
        toast.success(t("clinicsList.clinicArchivedSuccess"));
        router.invalidate({ sync: true });
      });
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("clinicsList.title")}</h1>
        {canAdd && (
          <Button asChild>
            <Link to="/app/clinics/edit/$" params={{ _splat: "new" }}>
              {t("clinicsList.addClinic")}
            </Link>
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("clinicsList.nameHeader")}</TableHead>
              <TableHead>{t("clinicsList.usersHeader")}</TableHead>
              <TableHead>{t("clinicsList.actionsHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinics?.map((clinic) => (
              <TableRow key={clinic.id} className="py-2">
                <TableCell>{clinic.name}</TableCell>
                <TableCell align="center">
                  {clinic?.users?.length || 0}
                </TableCell>
                <TableCell className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => handleOpen(clinic.id)}
                  >
                    <LucideView className="mr-2" />
                    {t("clinicsList.openButton")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleEdit(clinic.id)}
                  >
                    <LucideEdit className="mr-2" />
                    {t("clinicsList.editButton")}
                  </Button>
                  {/* DELETE IS NOT ALLOWED */}
                  {/*<Button
                    variant="outline"
                    className="text-red-500"
                    onClick={() => handleDelete(clinic.id)}
                  >
                    <LucideTrash className="mr-2" />
                    Delete
                  </Button>*/}
                  <Button
                    variant="outline"
                    className="text-red-500"
                    onClick={() => handleArchive(clinic.id)}
                  >
                    <LucideArchive className="mr-2" />
                    {t("clinicsList.archiveButton")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
