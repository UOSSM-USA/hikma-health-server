import { EditableReportGrid } from "@/components/reports/editable-report-grid";
import { NewReportComponentDialog } from "@/components/reports/new-report-component-dialog";
import {
	type PromptEditorState,
	ReportPromptEditor,
	promptEditorInitialState,
	promptEditorReducer,
} from "@/components/reports/report-prompt-editor";
import { Button } from "@/components/ui/button";
import type { report as ReportType } from "@/lib/ai-service/report.gen";
import {
	type ComponentData,
	type ReportWithData,
	editReport,
	fetchAllComponentData,
	refineReportPrompt,
} from "@/lib/ai-service/reports-editor";
import { isUserSuperAdmin } from "@/lib/auth/request";
import { getCurrentUserId } from "@/lib/server-functions/auth";
import {
	getReport,
	saveReport,
	updateComponentSql,
} from "@/lib/server-functions/reports";
import Report from "@/models/report";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useImmerReducer } from "use-immer";

export const Route = createFileRoute("/app/reports/$id/edit")({
	component: RouteComponent,
	loader: async ({ params }) => {
		if (params.id === "new") {
			return { existingReport: null, existingData: null };
		}
		const report = await getReport({ data: { id: params.id } });
		if (!report) {
			return { existingReport: null, existingData: null };
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
		return { existingReport: report, existingData: data, isSuperAdmin };
	},
});

function reportToEditorState(report: ReportType): PromptEditorState {
	const isRolling = report.timeRange.type === "Rolling";
	const resolved = Report.resolveTimeRange(report.timeRange);
	return {
		...promptEditorInitialState,
		name: report.name,
		prompt: report.description ?? "",
		timeRangeMode: isRolling ? "rolling" : "fixed",
		startAt: isRolling ? "" : resolved.startAt.split("T")[0],
		endAt: isRolling ? "" : resolved.endAt.split("T")[0],
		windowDays: isRolling ? report.timeRange.windowDays : 30,
		hasRefined: true,
	};
}

function RouteComponent() {
	const { id } = Route.useParams();
	const { existingReport, existingData, isSuperAdmin } = Route.useLoaderData();
	const isNew = id === "new";

	const [state, dispatch] = useImmerReducer(
		promptEditorReducer,
		existingReport
			? reportToEditorState(existingReport)
			: promptEditorInitialState,
	);
	const [result, setResult] = useState<ReportWithData | null>(
		existingReport && existingData
			? { report: existingReport, data: existingData }
			: null,
	);
	const [saving, setSaving] = useState(false);

	const buildInput = useCallback(
		() => ({
			user_description: state.prompt,
			name: state.name,
			description: state.prompt || undefined,
			time_range:
				state.timeRangeMode === "rolling"
					? { type: "Rolling" as const, windowDays: state.windowDays }
					: {
							type: "Fixed" as const,
							startAt: new Date(state.startAt).toISOString(),
							endAt: new Date(state.endAt).toISOString(),
						},
		}),
		[
			state.prompt,
			state.name,
			state.timeRangeMode,
			state.startAt,
			state.endAt,
			state.windowDays,
		],
	);

	const handleRefine = useCallback(async () => {
		if (!state.prompt.trim()) return;
		dispatch({ type: "REFINE_START" });

		try {
			const res = await refineReportPrompt({
				data: buildInput(),
			});
			dispatch({
				type: "REFINE_SUCCESS",
				suggestions: res?.suggestions ?? [],
			});
		} catch (error) {
			dispatch({
				type: "REFINE_ERROR",
				error:
					error instanceof Error ? error.message : "Failed to refine prompt",
			});
		}
	}, [buildInput, dispatch, state.prompt]);

	const handleGenerate = useCallback(async () => {
		if (!state.prompt.trim()) return;
		dispatch({ type: "GENERATE_START" });

		try {
			const res = await editReport({
				data: buildInput(),
			});
			dispatch({ type: "GENERATE_SUCCESS" });
			setResult(res);
		} catch (error) {
			dispatch({
				type: "GENERATE_ERROR",
				error:
					error instanceof Error ? error.message : "Failed to generate report",
			});
		}
	}, [buildInput, dispatch, state.prompt]);

	const handleSave = useCallback(async () => {
		if (!result) return;
		setSaving(true);

		try {
			const userId = isNew ? await getCurrentUserId() : null;
			await saveReport({
				data: {
					report: {
						report: result.report,
						clinicId: null,
						createdBy: userId,
					},
				},
			});
			toast.success(isNew ? "Report created" : "Report updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save report",
			);
		} finally {
			setSaving(false);
		}
	}, [result, isNew]);

	return (
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-xl font-semibold">
					{isNew ? "Create Report" : "Edit Report"}
				</h1>
				<p className="text-sm text-zinc-400 mt-1">
					Describe the report you want to generate
				</p>
			</div>

			<ReportPromptEditor
				state={state}
				dispatch={dispatch}
				onRefine={handleRefine}
				onGenerate={handleGenerate}
			/>

			{result && (
				<>
					<div className="flex gap-2 items-center">
						<Button onClick={handleSave} disabled={saving}>
							{saving ? "Saving..." : "Save"}
						</Button>
						<NewReportComponentDialog
							reportId={result.report.id}
							existingComponentCount={result.report.components.length}
							gridColumns={result.report.layout.columns}
							onAdd={(component) => {
								setResult((prev) => {
									if (!prev) return prev;
									return {
										...prev,
										report: {
											...prev.report,
											components: [...prev.report.components, component],
										},
										data: [
											...prev.data,
											{ componentId: component.id, rows: [], error: null },
										],
									};
								});
							}}
						/>
					</div>
					<EditableReportGrid
						report={result.report}
						data={result.data}
						updateReport={setResult}
						isSuperAdmin={isSuperAdmin}
						isEditable={isSuperAdmin}
					/>
				</>
			)}
		</div>
	);
}
