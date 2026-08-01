/**
 * Retry policy for manual sync requests.
 *
 * Field tablets run on clinic wifi and cellular; transient failure is the
 * expected condition. Three rules matter:
 *
 *  - Only retry what the transport classified as retryable. Retrying a 400
 *    forever helps nobody.
 *  - Jitter the backoff. Several tablets in one clinic resuming after the same
 *    wifi drop would otherwise retry in lockstep and re-create the outage.
 *  - Pause rather than spend attempts while offline. A tablet carried out of
 *    range for two minutes should not exhaust its budget and fail.
 */

import NetInfo from "@react-native-community/netinfo"

import type { RpcResult } from "@/rpc/types"

const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 6

/**
 * Total time one `withRetry` call will spend parked waiting for connectivity.
 *
 * Bounded even though it does not consume the attempt budget. Unbounded, a
 * device carried out of range parks forever: it holds the sync lock,
 * `startSync`'s in-flight promise never settles, and because manual sync's
 * `force_reset()` sits in the `finally` of a callback that never returns, the
 * UI spins indefinitely.
 *
 * Five minutes covers a walk between buildings or a wifi/cellular handover.
 * Past that the run fails, the resume cursor stands, and the next trigger
 * continues from it — strictly better than a wedge.
 */
const MAX_OFFLINE_WAIT_MS = 300_000

export type RetryOptions = {
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
  isOnline?: () => Promise<boolean>
  random?: () => number
  /** Overridable so tests need not park for the real five minutes. */
  maxOfflineWaitMs?: number
}

/**
 * Exponential backoff with full jitter, raised to the server's Retry-After.
 *
 * Retry-After is a floor rather than an override: a server asking for 5s and a
 * schedule already at 30s means the server is content to be waited on longer.
 * It is still capped — a misconfigured Retry-After of an hour would park the run
 * with no way for the user to tell it from a hang.
 */
export function backoffDelay(
  attempt: number,
  retryAfterMs: number | undefined,
  random: () => number,
): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  const jittered = Math.round(exponential * (0.5 + random() * 0.5))
  if (retryAfterMs && retryAfterMs > jittered) return Math.min(retryAfterMs, MAX_DELAY_MS)
  return jittered
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const defaultIsOnline = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch()
    return state.isConnected !== false
  } catch {
    // A broken NetInfo read must not stall the run in the offline wait; let the
    // request itself decide whether the network is there.
    return true
  }
}

const cancelled = (): RpcResult<never> => ({
  ok: false,
  error: { code: "NETWORK_ERROR", message: "Cancelled", retryable: false },
})

/**
 * Run `op` until it succeeds, fails terminally, or the attempt budget runs out.
 *
 * Returns the last result rather than throwing, so callers keep the error
 * taxonomy. Time spent waiting for connectivity does not count against the
 * attempt budget, but it has a budget of its own — see MAX_OFFLINE_WAIT_MS.
 */
export async function withRetry<T>(
  op: () => Promise<RpcResult<T>>,
  signal: AbortSignal,
  opts: RetryOptions = {},
): Promise<RpcResult<T>> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const sleep = opts.sleep ?? defaultSleep
  const isOnline = opts.isOnline ?? defaultIsOnline
  const random = opts.random ?? Math.random

  // Counted in polls rather than measured against the clock, so an injected
  // `sleep` controls it exactly as it controls the backoff. The budget spans the
  // whole call: an operation that goes offline, recovers, and goes offline again
  // may not restart it.
  const maxOfflineWaits = Math.max(
    1,
    Math.floor((opts.maxOfflineWaitMs ?? MAX_OFFLINE_WAIT_MS) / BASE_DELAY_MS),
  )
  let offlineWaits = 0

  let last: RpcResult<T> | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) return cancelled()

    // Waiting out an outage must not consume the attempt budget — but it must
    // end. Once the offline budget is spent the request goes out regardless and
    // fails on its own, so the run finishes as a resumable error rather than
    // parking indefinitely.
    while (offlineWaits < maxOfflineWaits && !(await isOnline())) {
      if (signal.aborted) return cancelled()
      offlineWaits += 1
      await sleep(BASE_DELAY_MS)
    }

    last = await op()
    if (last.ok) return last
    if (last.error.retryable === false) return last
    if (signal.aborted) return last
    if (attempt === maxAttempts - 1) break

    await sleep(backoffDelay(attempt, last.error.retryAfterMs, random))
  }

  return (
    last ?? {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Request failed", retryable: true },
    }
  )
}
