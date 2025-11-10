import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { createServerFn } from "@tanstack/react-start";
import { permissionsMiddleware } from "@/middleware/auth";
import { createPermissionContext, checkSettingsPermission } from "@/lib/server-functions/permissions";
import { PermissionOperation } from "@/models/permissions";
import { redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { useSettingsPermissions } from "@/hooks/use-permissions";

const ensureCanViewSettings = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    const permContext = createPermissionContext(context);
    checkSettingsPermission(permContext, PermissionOperation.VIEW);
    return true;
  });

export const Route = createFileRoute("/app/settings/register-mobile-app")({
  component: RouteComponent,
  loader: async () => {
    const ok = await ensureCanViewSettings();
    if (!ok) {
      throw redirect({ to: "/app", replace: true });
    }
    const currentUser = await getCurrentUser();
    return { currentUser };
  },
});

function RouteComponent() {
  const { currentUser } = Route.useLoaderData() as {
    currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  };
  const { canView } = useSettingsPermissions(currentUser?.role);
  if (!canView) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Register Mobile App</h1>
        <p className="text-muted-foreground">
          You do not have permission to view Settings.
        </p>
      </div>
    );
  }
  // the code is the current URL base URL
  const { hostname, protocol, origin } = window.location;
  // const code = `${protocol}//${hostname}`;
  const code = origin;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Register Mobile App</h1>
      <p className="mb-6">
        Scan the QR code with the mobile app to register it.
      </p>
      <QRCodeSVG
        style={{ padding: 20 }}
        bgColor={"#fff"}
        value={code}
        level="M"
        size={400}
        marginSize={4}
      />
    </div>
  );
}
