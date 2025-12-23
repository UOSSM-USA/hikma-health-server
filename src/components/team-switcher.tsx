import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useClinicContext } from "@/contexts/clinic-context";

export function TeamSwitcher({
  teams,
  onChangeActiveTeam,
}: {
  teams: {
    id: string;
    name: string;
    logo: React.ElementType;
    plan: string;
  }[];
  onChangeActiveTeam: (teamId: string) => void;
}) {
  const { isMobile } = useSidebar();
  const { selectedClinicId } = useClinicContext();
  
  // Find active team based on context
  const activeTeam = React.useMemo(() => {
    if (teams.length === 0) return null;
    const teamId = selectedClinicId || teams[0].id;
    return teams.find(t => t.id === teamId) || teams[0];
  }, [selectedClinicId, teams]);

  const handleTeamChange = (teamId: string) => {
    onChangeActiveTeam(teamId);
  };

  if (!activeTeam || teams.length === 0) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <activeTeam.logo />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeTeam.name}</span>
                {activeTeam.plan && (
                  <span className="truncate text-xs text-muted-foreground">{activeTeam.plan}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {teams.length > 1 ? "Select Clinic" : "Clinic"}
            </DropdownMenuLabel>
            {teams.map((team, index) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => handleTeamChange(team.id)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-sidebar-accent">
                  <team.logo />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{team.name}</span>
                  {team.plan && (
                    <span className="text-xs text-muted-foreground">{team.plan}</span>
                  )}
                </div>
                {index < 9 && <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
