// import { getCookieToken } from '@/lib/auth/request'
import { AppSidebar } from "@/components/app-sidebar";
import { useTranslation } from "@/lib/i18n/context";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import React from "react";
// import { createServerFileRoute } from '@tanstack/react-start/server'
import { getCurrentUser } from "@/lib/server-functions/auth";
import { getAllClinics } from "@/lib/server-functions/clinics";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    // let clinic = Clinic.Table.name;
    const isValidToken = await fetch(`/api/auth/is-valid-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await isValidToken.json();
    console.log({ isValidToken, data });
    if (!data.isValid) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: RouteComponent,
  loader: async () => {
    const user = await getCurrentUser();
    return { currentUser: user, clinics: await getAllClinics() };
  },
});

function RouteComponent() {
  const { currentUser, clinics } = Route.useLoaderData();
  const t = useTranslation();
  const handleSignOut = () => {
    if (window.confirm(t("messages.signOutConfirm"))) {
      fetch(`/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then(() => {
          // Redirect to login page
          window.location.href = "/";
        })
        .catch((error) => {
          console.error("Error during sign-out:", error);
        });
    }
  };

  const route = useRouter();
  const breadcrumbs = getBreadcrumbs(route.latestLocation.pathname, t);

  return (
    <SidebarProvider>
      {currentUser && (
        <AppSidebar
          currentUser={currentUser}
          clinics={clinics}
          handleSignOut={handleSignOut}
        />
      )}
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.url || crumb.name}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {index === breadcrumbs.length - 1 ? (
                        <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={crumb.url || "#"}>
                          {crumb.name}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="px-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Get friendly named breadcrumbs
 * @param {string} path - current pathname
 * @param {Function} t - translation function
 */
function getBreadcrumbs(path: string, t: (key: string) => string) {
  // If path is just /app, return Dashboard
  if (path === "/app") {
    return [{ name: t("nav.dashboard"), url: "/app" }];
  }

  const breadcrumbs: { name: string; url: string }[] = [];
  const pathParts = path.split("/").filter(Boolean);

  // Skip the "app" part as it's the base
  if (pathParts[0] === "app") {
    pathParts.shift();
  }

  if (pathParts.length === 0) {
    return breadcrumbs;
  }

  // Map path segments to translation keys
  const sectionTranslations: Record<string, string> = {
    patients: t("nav.patients"),
    "event-forms": t("nav.eventForms"),
    users: t("nav.users"),
    clinics: t("nav.clinics"),
    appointments: t("nav.appointments"),
    prescriptions: t("nav.prescriptions"),
    data: t("nav.dataAnalysis"),
    settings: t("nav.settings"),
  };

  const subSectionTranslations: Record<string, string> = {
    register: t("nav.registerNewPatient"),
    "customize-registration-form": t("nav.registrationForm"),
    edit: pathParts[0] === "users" ? t("nav.newUser") : pathParts[0] === "clinics" ? t("nav.newClinic") : pathParts[0] === "appointments" ? t("nav.newAppointment") : pathParts[0] === "prescriptions" ? t("nav.newPrescription") : pathParts[0] === "event-forms" ? t("nav.registerNewForm") : "",
    reports: t("nav.reports"),
    events: t("nav.exploreEvents"),
    "register-mobile-app": t("nav.mobileApps"),
    "file-storage": t("nav.fileStorage"),
  };

  // First level - main section
  const mainSection = pathParts[0];
  const mainTitle = sectionTranslations[mainSection] || mainSection;
  
  breadcrumbs.push({
    name: mainTitle,
    url: `/app/${mainSection}`,
  });

  // Second level - sub section if exists
  if (pathParts.length > 1) {
    const subSection = pathParts[1];
    const subTitle = subSectionTranslations[subSection] || subSection;
    breadcrumbs.push({
      name: subTitle,
      url: `/app/${pathParts.join("/")}`,
    });
  }

  return breadcrumbs;
}
