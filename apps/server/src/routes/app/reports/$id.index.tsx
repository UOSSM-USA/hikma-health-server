import { NewReportComponentDialog } from "@/components/reports/new-report-component-dialog";
import { ReportGrid } from "@/components/reports/report-grid";
import { Button } from "@/components/ui/button";
import type { report as ReportType } from "@/lib/ai-service/report.gen";
import {
	type ComponentData,
	fetchAllComponentData,
} from "@/lib/ai-service/reports-editor";
import { isUserSuperAdmin } from "@/lib/auth/request";
import { deleteReport, getReport } from "@/lib/server-functions/reports";
import Report from "@/models/report";
import { Logger } from "@hikmahealth/js-utils";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LucideTrash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/reports/$id/")({
	component: RouteComponent,
	loader: async ({ params }) => {
		const report = await getReport({ data: { id: params.id } });
		if (!report) {
			return { report: null, data: [] as ComponentData[] };
		}
		const { startAt, endAt } = Report.resolveTimeRange(report.timeRange);
		const isSuperAdmin = await isUserSuperAdmin();
		const data = await fetchAllComponentData({
			data: {
				components: report.components,
				startAt,
				endAt,
			},
		});
		return { report, data, isSuperAdmin };
	},
});

function RouteComponent() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const {
		report: loaderReport,
		data: loaderData,
		isSuperAdmin,
	} = Route.useLoaderData();
	const [report, setReport] = useState<ReportType | null>(loaderReport);
	const [data, setData] = useState<ComponentData[]>(loaderData);
	const [isDeleting, setIsDeleting] = useState(false);

	if (!report) {
		return (
			<div className="p-6">
				<p className="text-sm text-zinc-500">Report not found.</p>
			</div>
		);
	}

	const handleDeleteReport = async () => {
		if (
			!window.confirm(
				"Are you sure you want to delete this report? You cannot undo this later",
			)
		) {
			return;
		}

		setIsDeleting(true);
		try {
			await deleteReport({ data: { id } });
			toast.success("Report deleted successfully");
			navigate({ to: "/app/reports" });
		} catch (error) {
			Logger.error({ msg: "Error deleting report:", error });
			toast.error("Failed to delete report");
			setIsDeleting(false);
		}
	};

	return (
		<div className="p-6 space-y-6">
			<div className="">
				<div>
					<h1 className="text-xl font-semibold">{report.name}</h1>

					<p className="text-sm text-zinc-800 mt-1">{report.description}</p>
				</div>
				<div className="flex gap-2 items-center mt-2">
					<Link to="/app/reports/$id/edit" params={{ id }}>
						<Button variant="outline">Edit</Button>
					</Link>
					<Button
						variant="destructive"
						onClick={handleDeleteReport}
						disabled={isDeleting}
					>
						<LucideTrash2 />
						{isDeleting ? "Deleting…" : "Delete"}
					</Button>
					{/*<NewReportComponentDialog
            reportId={report.id}
            existingComponents={report.components}
            gridColumns={report.layout.columns}
            onAdd={(component) => {
              setReport((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  components: [...prev.components, component],
                };
              });
              setData((prev) => [
                ...prev,
                { componentId: component.id, rows: [], error: null },
              ]);
            }}
          />*/}
				</div>
			</div>

			<ReportGrid
				report={report}
				data={data}
				isSuperAdmin={isSuperAdmin}
				isEditable={false}
				onDeleteComponent={(componentId) => {
					setReport((prev) => {
						if (!prev) return prev;
						return {
							...prev,
							components: prev.components.filter((c) => c.id !== componentId),
						};
					});
					setData((prev) => prev.filter((d) => d.componentId !== componentId));
				}}
			/>
		</div>
	);
}
