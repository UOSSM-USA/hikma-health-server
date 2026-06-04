import { Logger } from "@hikmahealth/js-utils";
import { test as base, expect, type Page } from "@playwright/test";

// Define the fixtures type
type AuthFixtures = {
  authenticatedPage: Page;
};

// Extend the base test with our authentication fixture
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Get credentials from environment variables
    const email = process.env.VITE_ADMIN_EMAIL;
    const password = process.env.VITE_ADMIN_PASS;

    if (!email || !password) {
      throw new Error(
        "VITE_ADMIN_EMAIL and VITE_ADMIN_PASS environment variables must be set",
      );
    }

    page.on("dialog", (dialog) => Logger.log(dialog.message()));
    page.on("dialog", (dialog) => dialog.accept());

    // Clear cookies
    await page.context().clearCookies();

    // Navigate to the login page
    await page.goto("/");

    // Check that the login form elements are present
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#login-button")).toBeVisible();

    // Fill in the login form
    // await page.waitForTimeout(3000);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);

    expect(page.locator("#email")).toHaveValue(email);
    expect(page.locator("#password")).toHaveValue(password);

    // Wait for the button to be enabled and click it
    const loginButton = page.locator("#login-button");
    await expect(loginButton).toBeEnabled();

    // Click and wait for either navigation or error
    await Promise.all([
      // Wait for either navigation to /app or an API response
      page
        .waitForResponse(
          (response) =>
            response.url().includes("/api/auth/sign-in") &&
            response.status() === 200,
          { timeout: 10000 },
        )
        .catch(() => Logger.log("Sign-in API response timeout")),
      loginButton.click(),
    ]);

    // Wait for navigation to the dashboard. The /app dashboard loader runs
    // several count(*) aggregates, which can exceed a few seconds against a
    // remote DB, so this shares the same generous budget as the shell-render
    // wait below rather than the old 3s.
    await page.waitForURL("/app", { timeout: 15000 });

    // Wait for the app shell to render. Don't use networkidle — the
    // Tanstack Start + React 19 dev server keeps long-lived XHRs alive
    // (devtools, tRPC, HMR) and rarely hits idle inside the test budget.
    // The breadcrumb nav is part of every /app/* layout, rendered
    // synchronously from the router (no data fetch), and pinned at the
    // top of the main pane (always in viewport — unlike the sidebar
    // sign-out item, which lives below the fold in a scrolled list).
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" }),
    ).toBeVisible({ timeout: 15000 });

    // Use the authenticated page in the test
    await use(page);

    // After the test, attempt UI sign-out with a short timeout. This is
    // best-effort — the sidebar's "Sign out" affordance isn't reliably
    // addressable by `#sign-out-button` on every /app/* layout (the
    // snapshot on the form-builder route shows it as a plain generic
    // with no id), so the click can hang for the full action timeout.
    // The fixture clears cookies at the next test's start anyway, so a
    // failed UI sign-out doesn't leak session state between tests. The
    // short timeout keeps a hung teardown from eating into the next
    // test's budget.
    try {
      await page.locator("#sign-out-button").click({ timeout: 2000 });
      await page.waitForURL("/", { timeout: 2000 });
    } catch (error) {
      Logger.error({ msg: "Failed to sign out:", error });
    }
  },
});

// Re-export expect for convenience
export { expect } from "@playwright/test";
