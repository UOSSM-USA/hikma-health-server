import * as React from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Building2,
  Calendar,
  Pill,
  BarChart3,
  LogOut,
  FolderCog,
  LucideFormInput,
  LucideListChecks,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import type User from "@/models/user";
import type Clinic from "@/models/clinic";
import {
  useEventFormPermissions,
  useUserPermissions,
  useClinicPermissions,
  useDataAnalysisPermissions,
  useSettingsPermissions,
} from "@/hooks/use-permissions";
import { toast } from "sonner";
import { useTranslation, useLanguage } from "@/lib/i18n/context";
import { LanguageToggle } from "@/components/language-toggle";

type AppSidebarProps = {
  clinics: Clinic.EncodedT[];
  currentUser: User.EncodedT | null;
  handleSignOut: () => void;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  clinics,
  currentUser,
  handleSignOut,
  ...props
}: AppSidebarProps) {
  const t = useTranslation();
  const { language } = useLanguage();
  const organizationLevelClinic = React.useMemo(
    () => ({
      id: "organization",
      name: t("sidebar.organizationName"),
      logo: () => <img src="/logo187.png" alt={t("sidebar.organizationName")} />,
      plan: t("sidebar.organizationPlan"),
    }),
    [t, language], // Include language to ensure it updates when language changes
  );
  const { canView: canViewEventForms } = useEventFormPermissions(
    currentUser?.role,
  );
  const { canView: canViewUsers } = useUserPermissions(currentUser?.role);
  const { canView: canViewClinics } = useClinicPermissions(currentUser?.role);
  const { canView: canViewDataAnalysis } = useDataAnalysisPermissions(
    currentUser?.role,
  );
  const { canView: canViewSettings } = useSettingsPermissions(
    currentUser?.role,
  );

  // Generate navigation data with translations
  const navMain = React.useMemo(
    () => [
      {
        title: t("nav.dashboard"),
        url: "/app",
        icon: LayoutDashboard,
        isActive: true,
        items: [],
      },
      {
        title: t("nav.patients"),
        url: "#",
        icon: Users,
        isActive: true,
        items: [
          {
            title: t("nav.patientsList"),
            url: "/app/patients",
          },
          {
            title: t("nav.registerNewPatient"),
            url: "/app/patients/register",
          },
          {
            title: t("nav.registrationForm"),
            url: "/app/patients/customize-registration-form",
          },
        ],
      },
      {
        title: t("nav.eventForms"),
        url: "#",
        icon: LucideListChecks,
        isActive: true,
        items: [
          {
            title: t("nav.formsList"),
            url: "/app/event-forms",
          },
          {
            title: t("nav.registerNewForm"),
            url: "/app/event-forms/edit",
          },
        ],
      },
      {
        title: t("nav.users"),
        url: "#",
        icon: UserPlus,
        isActive: true,
        items: [
          {
            title: t("nav.usersList"),
            url: "/app/users",
          },
          {
            title: t("nav.newUser"),
            url: "/app/users/edit",
          },
        ],
      },
      {
        title: t("nav.clinics"),
        url: "#",
        icon: Building2,
        isActive: true,
        items: [
          {
            title: t("nav.clinicsList"),
            url: "/app/clinics",
          },
          {
            title: t("nav.newClinic"),
            url: "/app/clinics/edit",
          },
        ],
      },
      {
        title: t("nav.appointments"),
        url: "#",
        icon: Calendar,
        isActive: true,
        items: [
          {
            title: t("nav.appointmentsList"),
            url: "/app/appointments",
          },
          {
            title: t("nav.newAppointment"),
            url: "/app/appointments/edit",
          },
        ],
      },
      {
        title: t("nav.prescriptions"),
        url: "#",
        icon: Pill,
        isActive: true,
        items: [
          {
            title: t("nav.prescriptionsList"),
            url: "/app/prescriptions",
          },
          {
            title: t("nav.newPrescription"),
            url: "/app/prescriptions/edit",
          },
        ],
      },
      {
        title: t("nav.dataAnalysis"),
        url: "#",
        icon: BarChart3,
        isActive: true,
        items: [
          {
            title: t("nav.reports"),
            url: "/app/data/reports",
          },
          {
            title: t("nav.exploreEvents"),
            url: "/app/data/events",
          },
        ],
      },
      {
        title: t("nav.settings"),
        url: "#",
        icon: FolderCog,
        isActive: true,
        items: [
          {
            title: t("nav.mobileApps"),
            url: "/app/settings/register-mobile-app",
          },
          {
            title: t("nav.fileStorage"),
            url: "/app/settings/file-storage",
          },
        ],
      },
    ],
    [t]
  );

  const onBeforeNavigate = React.useCallback(
    (url: string) => {
      // Block Event Forms for users without VIEW permission
      if (url.startsWith("/app/event-forms") && !canViewEventForms) {
        toast.error(t("messages.noPermission"));
        return false; // prevent navigation
      }
      // Block Users for registrars or anyone without VIEW permission
      if (url.startsWith("/app/users") && !canViewUsers) {
        toast.error(t("messages.noPermission"));
        return false;
      }
      // Block Clinics for registrars or anyone without VIEW permission
      if (url.startsWith("/app/clinics") && !canViewClinics) {
        toast.error(t("messages.noPermission"));
        return false;
      }
      // Block Data Analysis routes without permission
      if (url.startsWith("/app/data") && !canViewDataAnalysis) {
        toast.error(t("messages.noPermission"));
        return false;
      }
      // Block Settings routes without permission
      if (url.startsWith("/app/settings") && !canViewSettings) {
        toast.error(t("messages.noPermission"));
        return false;
      }
      return true;
    },
    [
      t,
      canViewEventForms,
      canViewUsers,
      canViewClinics,
      canViewDataAnalysis,
      canViewSettings,
    ],
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={[
            organizationLevelClinic,
            ...clinics.map((clinic) => ({
              id: clinic.id,
              name: clinic.name || t("sidebar.unknownClinic"),
              logo: () => <img src="/logo187.png" alt={t("sidebar.organizationName")} />,
              // url: `/app/clinics/${clinic.id}`,
              plan: "",
            })),
          ]}
          onChangeActiveTeam={(id) => {
            if (id === organizationLevelClinic.id) {
              // Handle organization-level actions
            } else {
              // Handle clinic-level actions
            }
          }}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={navMain}
          handleSignOut={handleSignOut}
          onBeforeNavigate={onBeforeNavigate}
        />
        {/* <NavProjects projects={navData.projects} /> */}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2">
          <LanguageToggle />
        </div>
        {currentUser && <NavUser user={currentUser} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
