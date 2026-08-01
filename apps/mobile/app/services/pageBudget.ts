/**
 * How many bytes of sync payload to request per page.
 *
 * `page_bytes` is not the response size. The server sums `JSON.stringify(row)`
 * before superjson and before the envelope, and superjson tags every timestamp
 * column of every row, so the wire runs ~1.3-1.4x the number sent. Peak device
 * memory is a further 3-4x that: the response string, the parsed object, the
 * sanitizedRaw copies and the prepared batch all coexist briefly. `large`
 * therefore peaks nearer 55 MB than 40 MB — still safe on a device that dies
 * above 1 GB, and the ceiling's real job is that nothing accumulates ACROSS
 * pages.
 *
 * Both limits apply per table bucket, not per page: the server takes whole
 * tables in order until one has rows left over, then returns. A page can exceed
 * `page_bytes` by whatever the already-exhausted tables contributed.
 *
 * These budgets only bind while callers send `page_rows` explicitly — the
 * server's default of 500 rows caps a bucket near 450 KB, below even `small`,
 * which would make this module decorative. See `PULL_PAGE_ROWS`.
 *
 * Every unknown resolves downward. A wrong-but-small page costs an extra round
 * trip; a wrong-but-large one costs the whole operation on a low-memory device.
 */

import NetInfo from "@react-native-community/netinfo"
import DeviceInfo from "react-native-device-info"

/**
 * `getDeltaPage` clamps `page_bytes` to this. Asking for more is silently
 * reduced server-side, leaving the client's accounting wrong rather than loud.
 * Mirrors `MAX_PAGE_BYTES` in `apps/server/src/models/sync-paged.ts`.
 */
export const SERVER_MAX_PAGE_BYTES = 12_000_000

export const PAGE_BUDGETS = {
  small: 2_000_000,
  medium: 5_000_000,
  large: 10_000_000,
} as const

export type BudgetInput = {
  availableMemoryBytes: number | null
  connection: "wifi" | "cellular-fast" | "cellular-slow" | "unknown" | "offline"
}

/** Pure policy, so it can be tested without a device. */
export function choosePageBytes(input: BudgetInput): number {
  const { availableMemoryBytes, connection } = input

  // NaN and Infinity both reach here from arithmetic on a failed memory read,
  // and both would slip past a plain `<= 0` check.
  if (
    availableMemoryBytes === null ||
    !Number.isFinite(availableMemoryBytes) ||
    availableMemoryBytes <= 0
  ) {
    return PAGE_BUDGETS.small
  }

  const byMemory =
    availableMemoryBytes >= 1_500_000_000
      ? PAGE_BUDGETS.large
      : availableMemoryBytes >= 600_000_000
        ? PAGE_BUDGETS.medium
        : PAGE_BUDGETS.small

  const ceiling =
    connection === "wifi"
      ? PAGE_BUDGETS.large
      : connection === "cellular-fast"
        ? PAGE_BUDGETS.medium
        : PAGE_BUDGETS.small

  return Math.min(byMemory, ceiling)
}

/**
 * Read device state and choose a budget.
 *
 * `getUsedMemory` is app-scoped on iOS rather than system-wide, so the derived
 * "available" figure is advisory. Any read that throws or returns something
 * implausible falls through to the smallest budget.
 */
export async function pickPageBudget(): Promise<number> {
  let availableMemoryBytes: number | null = null
  try {
    const [total, used] = await Promise.all([
      DeviceInfo.getTotalMemory(),
      DeviceInfo.getUsedMemory(),
    ])
    const free = total - used
    availableMemoryBytes = Number.isFinite(free) && free > 0 ? free : null
  } catch {
    availableMemoryBytes = null
  }

  let connection: BudgetInput["connection"] = "unknown"
  try {
    const state = await NetInfo.fetch()
    if (state.isConnected === false) connection = "offline"
    else if (state.type === "wifi" || state.type === "ethernet") connection = "wifi"
    else if (state.type === "cellular") {
      const generation = (state.details as { cellularGeneration?: string } | null)
        ?.cellularGeneration
      connection = generation === "4g" || generation === "5g" ? "cellular-fast" : "cellular-slow"
    }
  } catch {
    connection = "unknown"
  }

  return choosePageBytes({ availableMemoryBytes, connection })
}
