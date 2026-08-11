import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired — the registration QR now lives on the Devices page. Kept as a
 * redirect so existing bookmarks do not 404.
 */
export const Route = createFileRoute("/app/settings/register-mobile-app")({
  beforeLoad: () => {
    throw redirect({ to: "/app/settings/devices", replace: true });
  },
});
