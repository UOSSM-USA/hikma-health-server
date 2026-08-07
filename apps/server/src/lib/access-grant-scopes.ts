/**
 * The parts of the access-grant contract a browser may hold. Split from
 * `models/access-grant`, which imports `node:crypto` and so cannot be reached
 * from a client component's import graph.
 */

export const ACCESS_GRANT_QUERY_PARAM = "t";

/** Adding a capability means adding an entry here and to SCOPE_EXPIRY_DAYS_MAX. */
export const ACCESS_GRANT_SCOPES = {
  /** Read event-form attachments. Never accepted by an upload or delete route. */
  EVENT_FORM_ATTACHMENTS_READ: "event_form_attachments:read",
} as const;

export type AccessGrantScope =
  (typeof ACCESS_GRANT_SCOPES)[keyof typeof ACCESS_GRANT_SCOPES];

const SCOPE_EXPIRY_DAYS_MAX: Record<AccessGrantScope, number> = {
  [ACCESS_GRANT_SCOPES.EVENT_FORM_ATTACHMENTS_READ]: 30,
};

export const EXPIRY_DAYS_MIN = 1;

export const expiryDaysMax = (scope: AccessGrantScope): number =>
  SCOPE_EXPIRY_DAYS_MAX[scope];

/** Malformed input shortens a grant's life rather than throwing or extending it. */
export const clampExpiryDays = (
  scope: AccessGrantScope,
  days: number,
): number => {
  if (!Number.isFinite(days)) return EXPIRY_DAYS_MIN;
  const whole = Math.floor(days);
  if (whole < EXPIRY_DAYS_MIN) return EXPIRY_DAYS_MIN;
  const max = expiryDaysMax(scope);
  return whole > max ? max : whole;
};
