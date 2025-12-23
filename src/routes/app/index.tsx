// import { getCookieToken } from '@/lib/auth/request'
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Users, FileText, Activity, ClipboardList, Calendar, Pill, Building2 } from "lucide-react";
// no date-fns needed after removing trends
import { createServerFn } from "@tanstack/react-start";
import db from "@/db";
import { sql } from "kysely";
import { useTranslation } from "@/lib/i18n/context";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { useState, useEffect } from "react";
import User from "@/models/user";
import { useClinicContext } from "@/contexts/clinic-context";

const getSummaryStats = createServerFn({ method: "GET" })
  .validator((data: { clinicId?: string } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    const isSuperAdmin =
      user?.role === User.ROLES.SUPER_ADMIN ||
      user?.role === User.ROLES.SUPER_ADMIN_2;

    // determine allowed clinic filter
    const clinicFilter = data?.clinicId
      ? data.clinicId
      : isSuperAdmin
        ? undefined
        : user?.clinic_id || null;

    const whereVisits = clinicFilter
      ? sql`WHERE clinic_id = ${clinicFilter} AND is_deleted = FALSE`
      : sql`WHERE is_deleted = FALSE`;
    const whereAppointments = clinicFilter
      ? sql`WHERE clinic_id = ${clinicFilter} AND is_deleted = FALSE`
      : sql`WHERE is_deleted = FALSE`;
    const wherePrescriptions = clinicFilter
      ? sql`WHERE pickup_clinic_id = ${clinicFilter} AND is_deleted = FALSE`
      : sql`WHERE is_deleted = FALSE`;
    const wherePatients = clinicFilter
      ? sql`WHERE clinic_id = ${clinicFilter} AND is_deleted = FALSE`
      : sql`WHERE is_deleted = FALSE`;
    const whereUsers = clinicFilter
      ? sql`WHERE clinic_id = ${clinicFilter} AND is_deleted = FALSE`
      : sql`WHERE is_deleted = FALSE`;

    const query = sql`
      SELECT
        (SELECT count(*) FROM users ${whereUsers}) as user_count,
        (SELECT count(DISTINCT patient_id) FROM visits ${wherePatients}) as patient_count,
        (SELECT count(*) FROM visits ${whereVisits}) as visit_count,
        (SELECT count(*) FROM event_forms WHERE is_deleted = FALSE) as form_count,
        (SELECT count(*) FROM appointments ${whereAppointments}) as appointment_count,
        (SELECT count(*) FROM prescriptions ${wherePrescriptions}) as prescription_count,
        (SELECT count(*) FROM events WHERE is_deleted = FALSE) as event_count,
        (SELECT count(*) FROM clinics WHERE is_deleted = FALSE) as clinic_count
    `.compile(db);

    const result = await db.executeQuery<{
      user_count: number;
      patient_count: number;
      visit_count: number;
      form_count: number;
      appointment_count: number;
      prescription_count: number;
      event_count: number;
      clinic_count: number;
    }>(query);

    const {
      user_count,
      patient_count,
      visit_count,
      form_count,
      appointment_count,
      prescription_count,
      event_count,
      clinic_count,
    } = result.rows[0];

    // Visit trends per clinic (last 30 days, filtered)
    const visitTrendsQuery = sql`
      SELECT 
        DATE(v.created_at) as date,
        v.clinic_id,
        c.name as clinic_name,
        COUNT(*) as count
      FROM visits v
      LEFT JOIN clinics c ON c.id = v.clinic_id
      WHERE v.is_deleted = FALSE
        AND v.created_at >= NOW() - INTERVAL '30 days'
        ${clinicFilter ? sql`AND v.clinic_id = ${clinicFilter}` : sql``}
      GROUP BY DATE(v.created_at), v.clinic_id, c.name
      ORDER BY date ASC
    `.compile(db);

    const visitTrends = await db.executeQuery<{
      date: Date;
      clinic_id: string | null;
      clinic_name: string | null;
      count: number;
    }>(visitTrendsQuery);

    // Clinic performance metrics (filtered if clinic selected, else all)
    const clinicPerformanceQuery = sql`
      SELECT 
        c.id as clinic_id,
        c.name as clinic_name,
        COUNT(DISTINCT v.patient_id) as unique_patients,
        COUNT(v.id) as total_visits,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT p.id) as total_prescriptions
      FROM clinics c
      LEFT JOIN visits v ON v.clinic_id = c.id AND v.is_deleted = FALSE
      LEFT JOIN appointments a ON a.clinic_id = c.id AND a.is_deleted = FALSE
      LEFT JOIN prescriptions p ON p.pickup_clinic_id = c.id AND p.is_deleted = FALSE
      WHERE c.is_deleted = FALSE
        ${clinicFilter ? sql`AND c.id = ${clinicFilter}` : sql``}
      GROUP BY c.id, c.name
      ORDER BY total_visits DESC
      LIMIT 10
    `.compile(db);

    const clinicPerformance = await db.executeQuery<{
      clinic_id: string;
      clinic_name: string;
      unique_patients: number;
      total_visits: number;
      total_appointments: number;
      total_prescriptions: number;
    }>(clinicPerformanceQuery);

    // If a specific clinic is selected, ensure performance aligns with summary
    const performanceRows =
      clinicFilter && clinicPerformance.rows
        ? [
            {
              clinic_id: clinicFilter,
              clinic_name: clinicPerformance.rows[0]?.clinic_name || "",
              unique_patients: patient_count,
              total_visits: visit_count,
              total_appointments: appointment_count,
              total_prescriptions: prescription_count,
            },
          ]
        : clinicPerformance.rows || [];

    return {
      clinicUsers: user_count,
      totalPatients: patient_count,
      totalVisits: visit_count,
      totalForms: form_count,
      totalAppointments: appointment_count,
      totalPrescriptions: prescription_count,
      totalEvents: event_count,
      totalClinics: clinic_count,
      visitTrends: visitTrends.rows || [],
      clinicPerformance: performanceRows,
    };
  });

export const Route = createFileRoute("/app/")({
  component: RouteComponent,
  loader: async () => {
    const user = await getCurrentUser();
    const allClinics = await getAllClinics();
    const clinics =
      user?.role === User.ROLES.SUPER_ADMIN ||
      user?.role === User.ROLES.SUPER_ADMIN_2
        ? allClinics
        : user?.clinic_id
          ? allClinics.filter((c: any) => c.id === user.clinic_id)
          : [];
    const defaultClinicId =
      user?.role === User.ROLES.SUPER_ADMIN ||
      user?.role === User.ROLES.SUPER_ADMIN_2
        ? undefined
        : user?.clinic_id || undefined;
    const stats = await getSummaryStats({ data: { clinicId: defaultClinicId } });
    return { stats, user, clinics };
  },
});

interface StatsCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
}

function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card className="">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
          {title}
        </h3>
        <div className="text-zinc-400">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-zinc-400 mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function RouteComponent() {
  const { stats: initialStats, user, clinics } = Route.useLoaderData() as any;
  const t = useTranslation();
  const { selectedClinicId } = useClinicContext();

  const isSuperAdmin =
    user?.role === User.ROLES.SUPER_ADMIN ||
    user?.role === User.ROLES.SUPER_ADMIN_2;
  const [stats, setStats] = useState(initialStats);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      // For non-super admins, ensure we only query clinics they have access to
      const clinicId =
        selectedClinicId === "all" || selectedClinicId === null ? undefined : selectedClinicId;
      const res = await getSummaryStats({ data: { clinicId } });
      setStats(res);
      setIsLoading(false);
    };
    load();
  }, [selectedClinicId]);

  const {
    clinicUsers,
    totalPatients,
    totalVisits,
    totalForms,
    totalAppointments,
    totalPrescriptions,
    totalEvents,
    totalClinics,
    clinicPerformance,
  } = stats;

  // Calculate visit trend (last 7 days vs previous 7 days)
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title={t("dashboard.clinicUsers")}
          value={clinicUsers}
          description={t("dashboard.clinicUsersDescription")}
          icon={<Users size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalPatients")}
          value={totalPatients}
          description={t("dashboard.totalPatientsDescription")}
          icon={<FileText size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalVisits")}
          value={totalVisits}
          description={t("dashboard.totalVisitsDescription")}
          icon={<Activity size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalForms")}
          value={totalForms}
          description={t("dashboard.totalFormsDescription")}
          icon={<ClipboardList size={20} />}
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title={t("dashboard.totalAppointments") || "Appointments"}
          value={totalAppointments}
          description={t("dashboard.totalAppointmentsDescription") || "Total scheduled appointments"}
          icon={<Calendar size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalPrescriptions") || "Prescriptions"}
          value={totalPrescriptions}
          description={t("dashboard.totalPrescriptionsDescription") || "Total prescriptions issued"}
          icon={<Pill size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalEvents") || "Events"}
          value={totalEvents}
          description={t("dashboard.totalEventsDescription") || "Total clinical events"}
          icon={<Activity size={20} />}
        />
        <StatsCard
          title={t("dashboard.totalClinics") || "Clinics"}
          value={totalClinics}
          description={t("dashboard.totalClinicsDescription") || "Active clinics"}
          icon={<Building2 size={20} />}
        />
      </div>

      {/* Analytics Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Clinic Performance */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium">
              {t("dashboard.clinicPerformance") || "Clinic Performance"}
            </h3>
          </CardHeader>
          <CardContent>
            {clinicPerformance.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {clinicPerformance.map(
                  (
                    clinic: {
                      clinic_name: string;
                      unique_patients: number;
                      total_visits: number;
                      total_appointments: number;
                      total_prescriptions: number;
                    },
                    index: number,
                  ) => (
                    <div key={clinic.clinic_name || index} className="border-b pb-3 last:border-0">
                    <div className="font-medium text-sm">{clinic.clinic_name}</div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-1">
                      <div>
                        {t("dashboard.uniquePatients") || "Patients"}:{" "}
                        {clinic.unique_patients}
                      </div>
                      <div>
                        {t("dashboard.visits") || "Visits"}: {clinic.total_visits}
                      </div>
                      <div>
                        {t("dashboard.appointments") || "Appointments"}:{" "}
                        {clinic.total_appointments}
                      </div>
                      <div>
                        {t("dashboard.prescriptions") || "Prescriptions"}:{" "}
                        {clinic.total_prescriptions}
                      </div>
                    </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-zinc-400">
                {t("dashboard.noClinicData") || "No clinic data available"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
