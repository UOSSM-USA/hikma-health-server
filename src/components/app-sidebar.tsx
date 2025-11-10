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
          title: "File Storage",
          url: "/app/settings/file-storage",
        },
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

const organizationLevelClinic = {
  id: "organization",
  name: "Hikma Health",
  // logo: GalleryVerticalEnd,
  logo: () => <img src="/logo187.png" alt="Hikma Health" />,
  plan: "Entire Organization", // Replace with "Top level" or something like that
};

export function AppSidebar({
  clinics,
  currentUser,
  handleSignOut,
  ...props
}: AppSidebarProps) {
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

  const onBeforeNavigate = React.useCallback(
    (url: string) => {
      // Block Event Forms for users without VIEW permission
      if (url.startsWith("/app/event-forms") && !canViewEventForms) {
        toast.error("You do not have permission to access Event Forms.");
        return false; // prevent navigation
      }
      // Block Users for registrars or anyone without VIEW permission
      if (url.startsWith("/app/users") && !canViewUsers) {
        toast.error("You do not have permission to access Users.");
        return false;
      }
      // Block Clinics for registrars or anyone without VIEW permission
      if (url.startsWith("/app/clinics") && !canViewClinics) {
        toast.error("You do not have permission to access Clinics.");
        return false;
      }
      // Block Data Analysis routes without permission
      if (url.startsWith("/app/data") && !canViewDataAnalysis) {
        toast.error("You do not have permission to access Data Analysis.");
        return false;
      }
      // Block Settings routes without permission
      if (url.startsWith("/app/settings") && !canViewSettings) {
        toast.error("You do not have permission to access Settings.");
        return false;
      }
      return true;
    },
    [
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
              name: clinic.name || "",
              logo: () => <img src="/logo187.png" alt="Hikma Health" />,
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
          items={navData.navMain}
          handleSignOut={handleSignOut}
          onBeforeNavigate={onBeforeNavigate}
        />
        {/* <NavProjects projects={navData.projects} /> */}
      </SidebarContent>
      <SidebarFooter>
        {currentUser && <NavUser user={currentUser} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
