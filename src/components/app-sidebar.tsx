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
  Box,
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

// This is sample data.
export const navData = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  // replace with clinics ?
  teams: [
    {
      name: "Hikma Health",
      // logo: GalleryVerticalEnd,
      logo: () => <img src="/logo187.png" alt="Hikma Health" />,
      plan: "Primary Clinic", // Replace with "Top level" or something like that
    },
    // {
    //   name: "Hikma Health South America Location",
    //   logo: AudioWaveform,
    //   plan: "Startup",
    // },
    // {
    //   name: "Hikma Health Africa Location",
    //   logo: Command,
    //   plan: "Free",
    // },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/app",
      icon: LayoutDashboard,
      isActive: true,
      items: [],
    },
    {
      title: "Patients",
      url: "#",
      icon: Users,
      isActive: true,
      items: [
        {
          title: "Patients List",
          url: "/app/patients",
        },
        {
          title: "Register New Patient",
          url: "/app/patients/register",
        },
        {
          title: "Registration Form",
          url: "/app/patients/customize-registration-form",
        },
      ],
    },
    {
      title: "Event Forms",
      url: "#",
      icon: LucideListChecks,
      isActive: true,
      items: [
        {
          title: "Forms List",
          url: "/app/event-forms",
        },
        {
          title: "Register New Form",
          url: "/app/event-forms/edit",
        },
      ],
    },
    {
      title: "Users",
      url: "#",
      icon: UserPlus,
      isActive: true,
      items: [
        {
          title: "Users List",
          url: "/app/users",
        },
        {
          title: "New User",
          url: "/app/users/edit",
        },
      ],
    },
    {
      title: "Clinics",
      url: "#",
      icon: Building2,
      isActive: true,
      items: [
        {
          title: "Clinics List",
          url: "/app/clinics",
        },
        {
          title: "New Clinic",
          url: "/app/clinics/edit",
        },
      ],
    },
    {
      title: "Appointments",
      url: "#",
      icon: Calendar,
      isActive: true,
      items: [
        {
          title: "Appointments List",
          url: "/app/appointments",
        },
        {
          title: "New Appointment",
          url: "/app/appointments/edit",
        },
      ],
    },
    {
      title: "Inventory",
      url: "#",
      icon: Box,
      isActive: true,
      items: [
        {
          title: "Drug Catalogue",
          url: "/app/inventory/drug-catalogue",
        },
        {
          title: "Clinic Inventory",
          url: "/app/inventory/clinic-inventory",
        },
      ],
    },
    {
      title: "Prescriptions",
      url: "#",
      icon: Pill,
      isActive: true,
      items: [
        {
          title: "Prescriptions List",
          url: "/app/prescriptions",
        },
        {
          title: "New Prescription",
          url: "/app/prescriptions/edit",
        },
      ],
    },
    {
      title: "Data Analysis",
      url: "#",
      icon: BarChart3,
      isActive: true,
      items: [
        {
          title: "Reports (?)",
          url: "/app/data/reports",
        },
        {
          title: "Explore Events",
          url: "/app/data/events",
        },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: FolderCog,
      isActive: true,
      items: [
        {
          title: "Mobile Apps",
          url: "/app/settings/register-mobile-app",
        },
        {
          title: "Configuration",
          url: "/app/settings/configurations",
        },
        // {
        //   title: "File Storage",
        //   url: "/app/settings/file-storage",
        // },
      ],
    },
    // {
    //   title: "Sign Out",
    //   url: "#",
    //   icon: LogOut,
    //   isActive: true,
    //   items: [],
    // },
  ],
  projects: [
    // {
    //   name: "Initiative A for funder X",
    //   url: "#",
    //   icon: Frame,
    // },
  ],
};

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
  const organizationLevelClinic = React.useMemo(
    () => ({
      id: "organization",
      name: t("sidebar.organizationName"),
      logo: () => <img src="/logo187.png" alt={t("sidebar.organizationName")} />,
      plan: t("sidebar.organizationPlan"),
    }),
    [t],
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
