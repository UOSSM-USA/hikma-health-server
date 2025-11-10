import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/server-functions/auth";
import {
  getAllPrescriptionsWithDetails,
  togglePrescriptionStatus,
} from "@/lib/server-functions/prescriptions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { SelectInput } from "@/components/select-input";
import Prescription from "@/models/prescription";
import upperFirst from "lodash/upperFirst";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/prescriptions/")({
  component: RouteComponent,
  loader: async () => {
    return {
      prescriptions: await getAllPrescriptionsWithDetails(),
      currentUser: await getCurrentUser(),
    };
  },
});

function RouteComponent() {
  const router = useRouter();
  const { prescriptions } = Route.useLoaderData();

  const handleStatusChange = async (id: string, status: string) => {
    togglePrescriptionStatus({ data: { id, status } })
      .then(() => {
        toast.success("Status updated successfully");
        router.invalidate({ sync: true });
      })
      .catch(() => {
        toast.error("Failed to update status");
      });
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Prescriptions</h1>
        <Button asChild>
          <Link to="/app/prescriptions/edit/$" params={{ _splat: "new" }}>
            Add New Prescription
          </Link>
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>Provider Name</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prescribed At</TableHead>
                <TableHead>Expiration Date</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((item) => {
                const prescription = item.prescription || item;
                const patient = item.patient || {};
                const provider = item.provider || {};
                const clinic = item.clinic || {};
                
                return (
                  <TableRow key={prescription.id}>
                    <TableCell>
                      {(patient as any).given_name || ""} {(patient as any).surname || ""}
                    </TableCell>
                    <TableCell>
                      {provider.name || (provider as any).given_name || ""} {(provider as any).surname || ""}
                    </TableCell>
                    <TableCell>{clinic.name || "N/A"}</TableCell>
                    <TableCell>
                      <SelectInput
                        data={Prescription.statusValues.map((status) => ({
                          value: status,
                          label: upperFirst(status),
                        }))}
                        value={prescription.status}
                        onChange={(value) =>
                          handleStatusChange(prescription.id, value || "")
                        }
                        size="sm"
                        clearable={false}
                      />
                    </TableCell>
                    <TableCell>
                      {prescription.prescribed_at
                        ? format(new Date(prescription.prescribed_at), "PPP")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {prescription.expiration_date
                        ? format(new Date(prescription.expiration_date), "PPP")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {prescription.notes}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
