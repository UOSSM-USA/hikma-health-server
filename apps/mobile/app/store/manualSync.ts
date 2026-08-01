/**
 * Progress for a manual ("Sync from…") run.
 *
 * Separate from `syncStore` deliberately. That store models a four-state
 * fetch → resolve → push cycle with guarded transitions; manual sync pushes
 * FIRST and then applies many pages, which those guards reject. It also needs
 * richer progress — pages, current table, conflicts — than the shared store
 * carries. `syncStore` is still bracketed by the hook so existing consumers do
 * not show "idle" during a ten-minute operation.
 *
 * Every handler assigns fields explicitly rather than spreading the event: the
 * event object carries its own `type` key, and this context is rendered
 * directly by a screen.
 */

import { createStore } from "@xstate/store"

export type ManualSyncPhase = "idle" | "pushing" | "pulling" | "done" | "error"

export type ManualSyncContext = {
  phase: ManualSyncPhase
  since: number
  table: string
  pagesApplied: number
  recordsApplied: number
  recordsPushed: number
  rejectedCount: number
  tablesRemaining: number
  error: string | null
  resumable: boolean
}

const initial: ManualSyncContext = {
  phase: "idle",
  since: 0,
  table: "",
  pagesApplied: 0,
  recordsApplied: 0,
  recordsPushed: 0,
  rejectedCount: 0,
  tablesRemaining: 0,
  error: null,
  resumable: false,
}

export const manualSyncStore = createStore({
  context: { ...initial },
  on: {
    reset: (): ManualSyncContext => ({ ...initial }),

    // Starts from `initial`, not from the current context: a new run must not
    // inherit the previous one's totals or its error.
    begin: (_context, event: { since: number }): ManualSyncContext => ({
      ...initial,
      phase: "pushing",
      since: event.since,
    }),

    progress: (
      context,
      event: {
        phase: "pushing" | "pulling" | "done"
        table: string
        pagesApplied: number
        recordsApplied: number
        recordsPushed: number
        rejectedCount: number
        tablesRemaining: number
      },
    ): ManualSyncContext => ({
      ...context,
      phase: event.phase,
      table: event.table,
      pagesApplied: event.pagesApplied,
      recordsApplied: event.recordsApplied,
      recordsPushed: event.recordsPushed,
      rejectedCount: event.rejectedCount,
      tablesRemaining: event.tablesRemaining,
      // Progress means the run is live, so any earlier error is stale. Nothing
      // emits progress after a failure today; this keeps the context coherent
      // if something ever does, rather than leaving a screen showing an error
      // beside a moving page count.
      error: null,
      resumable: false,
    }),

    finish: (
      context,
      event: { recordsPushed: number; recordsApplied: number; rejectedCount: number },
    ): ManualSyncContext => ({
      ...context,
      phase: "done",
      recordsPushed: event.recordsPushed,
      recordsApplied: event.recordsApplied,
      rejectedCount: event.rejectedCount,
      error: null,
      resumable: false,
    }),

    fail: (context, event: { error: string; resumable: boolean }): ManualSyncContext => ({
      ...context,
      phase: "error",
      error: event.error,
      resumable: event.resumable,
    }),
  },
})
