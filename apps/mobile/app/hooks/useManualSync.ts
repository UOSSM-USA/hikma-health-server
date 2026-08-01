import { useCallback, useRef } from "react"

import { useSelector } from "@xstate/react"

import { runManualSync } from "@/db/cloudManualSync"
import { manualSyncStore } from "@/store/manualSync"

const MILLISECONDS_PER_DAY = 86_400_000

/**
 * Screen-facing interface for a manual sync run.
 *
 * `start(sinceDays)` takes whole days to count back, or null for everything.
 * Days rather than a date string removes both the local-vs-UTC round trip and
 * the "unparseable date means everything" trap — the widest, most expensive
 * range is never something a parse failure can select.
 */
export function useManualSync(peerId: string) {
  const state = useSelector(manualSyncStore, (s) => s.context)
  const controllerRef = useRef<AbortController | null>(null)

  const startWith = useCallback(
    async (since: number) => {
      // Claimed synchronously, before any await. Without this a second tap
      // starts a second run that `withSyncLock` QUEUES rather than rejects —
      // two full backfills back to back — and overwrites the controller, so
      // Cancel would only ever reach the newer one.
      if (controllerRef.current) return
      const controller = new AbortController()
      controllerRef.current = controller

      manualSyncStore.trigger.begin({ since })

      try {
        const result = await runManualSync({
          peerId,
          since,
          signal: controller.signal,
          onProgress: (p) => manualSyncStore.trigger.progress(p),
        })

        if (result.ok) {
          manualSyncStore.trigger.finish({
            recordsPushed: result.recordsPushed,
            recordsApplied: result.recordsApplied,
            rejectedCount: Object.values(result.rejected).flat().length,
          })
        } else {
          manualSyncStore.trigger.fail({ error: result.error, resumable: result.resumable })
        }
      } catch (error) {
        // The driver returns failures rather than throwing, so reaching here is
        // a defect somewhere below. Resumable: the cursor, if any, still stands.
        manualSyncStore.trigger.fail({ error: String(error), resumable: true })
      } finally {
        controllerRef.current = null
      }
    },
    [peerId],
  )

  const start = useCallback(
    (sinceDays: number | null) =>
      startWith(sinceDays === null ? 0 : Date.now() - sinceDays * MILLISECONDS_PER_DAY),
    [startWith],
  )

  /**
   * Continue the run that just failed, from the same range.
   *
   * Not `start(sinceDays)`: that recomputes `since` from the clock, and the
   * driver only adopts a stored cursor when `resume.since` matches the range
   * being asked for. A few seconds' drift would therefore discard the cursor
   * and restart the whole backfill — defeating resume at the one place a user
   * ever reaches it.
   */
  const resume = useCallback(
    () => startWith(manualSyncStore.getSnapshot().context.since),
    [startWith],
  )

  const abort = useCallback(() => controllerRef.current?.abort(), [])

  return { state, start, resume, abort }
}
