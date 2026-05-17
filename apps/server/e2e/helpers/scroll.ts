import { type Locator, expect } from "@playwright/test";

// ----------------------------------------------------------------------------
// Scroll helpers
//
// Playwright auto-scrolls on action methods (.click() / .fill() / .check() /
// .hover() / .selectOption()) but NOT on assertion methods (.toBeVisible() /
// .toHaveText() / .toHaveAttribute()). Pages with multiple `overflow: auto`
// containers — sidebars, split panes, long forms, preview panes — therefore
// pass action-driven tests but fail assertion-driven ones for items below
// the fold of an inner scroll container.
//
// Use the helpers below whenever an *assertion* targets an element that
// might live below the fold. For pure DOM-presence checks (toHaveCount,
// toHaveText, toBeAttached) you don't need to scroll — those don't require
// visibility.
// ----------------------------------------------------------------------------

/**
 * Scroll the locator into its nearest scrollable ancestor's viewport, then
 * assert it's visible. `scrollIntoViewIfNeeded` walks all ancestor scroll
 * containers, so it works correctly even when several `overflow: auto`
 * panes are nested.
 *
 * Prefer this over a bare `toBeVisible()` whenever the target may live
 * inside an inner scroll container (preview panes, sidebars, modals with
 * scrollable bodies, etc.).
 */
export async function expectVisibleAfterScroll(
  locator: Locator,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
}

/**
 * Bring a region into view once so a batch of inner assertions can run
 * without each scrolling separately. Useful when asserting several
 * children of the same container (e.g. a preview field's label + buttons
 * + helper text).
 *
 * Returns the same locator for fluent chaining.
 */
export async function scrollIntoView(locator: Locator): Promise<Locator> {
  await locator.scrollIntoViewIfNeeded();
  return locator;
}
