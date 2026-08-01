import { createHash } from "node:crypto";
import { minutesToMilliseconds } from "date-fns";
import {
  createRateLimiter,
  getClientIp,
  type RateLimitResult,
} from "./rate-limiter";

/**
 * The paged-backfill procedures, by wire name.
 *
 * These are the only procedures a client calls thousands of times in sequence,
 * and the only ones that get the identity-keyed limiter.
 */
const BACKFILL_PROCEDURES: ReadonlySet<string> = new Set([
  "sync.backfillPull",
  "sync.backfillPush",
]);

/**
 * The procedure names a tRPC request path addresses.
 *
 * A batched request names several, comma-separated. Returns an empty list for
 * anything that is not a well-formed path under `endpoint` — callers must treat
 * that as "unknown", never as "none, therefore fine".
 */
function procedureNames(pathname: string, endpoint: string): string[] {
  const prefix = `${endpoint}/`;
  if (!pathname.startsWith(prefix)) return [];

  let tail: string;
  try {
    // Decoded before splitting: an encoded comma would otherwise smuggle a
    // second procedure past a check that only sees one name.
    tail = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return [];
  }

  if (tail.length === 0) return [];
  return tail.split(",").map((name) => name.trim());
}

/**
 * Whether every procedure this request addresses is a backfill procedure.
 *
 * False for a mixed batch, an unknown path, or an empty name — the strict
 * default. The permissive limiter is an explicit opt-in, so a path this cannot
 * parse falls back to whatever the route already did rather than to nothing.
 */
export function isBackfillOnly(pathname: string, endpoint: string): boolean {
  const names = procedureNames(pathname, endpoint);
  return names.length > 0 && names.every((name) => BACKFILL_PROCEDURES.has(name));
}

/**
 * Rate-limit key identifying the caller: the bearer token where there is one,
 * otherwise the client IP.
 *
 * A backfill is thousands of sequential requests from one device. Keyed on the
 * IP, a clinic behind a single NAT starves itself and everyone sharing the
 * connection.
 *
 * The token is hashed rather than truncated. Tokens are stored in plaintext and
 * matched by equality, so even a prefix sitting in a long-lived map is live
 * credential material.
 */
export function callerKey(request: Request): string {
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token.length > 0) {
      const digest = createHash("sha256").update(token).digest("hex");
      return `t:${digest.slice(0, 32)}`;
    }
  }
  return `ip:${getClientIp(request)}`;
}

/**
 * Per-device ceiling for the paged backfill.
 *
 * High enough that a multi-GB restore is a few minutes rather than an hour of
 * backoff. Keyed on the caller so a clinic behind one NAT does not starve
 * itself.
 */
const perCallerLimiter = createRateLimiter({
  windowMs: minutesToMilliseconds(1),
  maxRequests: 600,
});

/**
 * Per-IP backstop underneath the per-caller ceiling.
 *
 * `callerKey` reads the bearer token straight off the header and nothing has
 * validated it yet — the route runs before the procedure — so a caller sending
 * a fresh random token per request would otherwise mint a fresh 600/min bucket
 * every time. Sized for a large clinic all restoring at once (ten devices at
 * the full per-device rate), so no honest deployment reaches it while token
 * rotation from one address tops out here rather than at infinity.
 *
 * It also bounds the limiter's own memory: each distinct key holds an entry
 * until the 60s sweep clears it.
 */
const perIpLimiter = createRateLimiter({
  windowMs: minutesToMilliseconds(1),
  maxRequests: 6_000,
});

/**
 * Check a backfill request against both ceilings.
 *
 * The IP backstop is checked FIRST and the per-caller bucket is only consumed
 * if it passes: charging a device for a request the backstop already refused
 * would let one abusive process on a shared address exhaust an innocent
 * device's budget as well as the shared one.
 */
export function checkBackfillLimit(request: Request): RateLimitResult {
  const byIp = perIpLimiter.check(`ip:${getClientIp(request)}`);
  if (!byIp.allowed) return byIp;
  return perCallerLimiter.check(callerKey(request));
}
