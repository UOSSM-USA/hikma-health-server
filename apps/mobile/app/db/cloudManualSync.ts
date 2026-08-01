/**
 * Manual ("Sync from…") cloud sync.
 *
 * A user-initiated recovery operation: push everything pending, then pull a
 * keyset-paginated backfill from a chosen point in time, applying one page per
 * write transaction so memory never grows with the size of the transfer.
 *
 * Deliberately separate from `peerSync.ts`, which stays as the reference
 * implementation and rollback target. Shared pure helpers live in
 * `syncNormalize.ts`; this module must not import from `peerSync.ts`.
 *
 * Unlike ordinary sync this is push-then-pull. Recovery devices carry a backlog
 * of unpushed edits, and offering them to the server BEFORE overwriting local
 * state with a wide historical window is what stops the server's staleness
 * guard silently discarding them.
 */

import { Platform } from "react-native"

import { SyncDatabaseChangeSet, SyncLocalChanges, SyncRejectedIds } from "@nozbe/watermelondb/sync"
import {
  applyRemoteChanges,
  fetchLocalChanges,
  getLastPulledAt,
  markLocalChangesAsSynced,
  setLastPulledAt,
} from "@nozbe/watermelondb/sync/impl"
import { Logger } from "@hikmahealth/js-utils"

import Peer from "@/models/Peer"
import { createTrpcCloudTransport } from "@/rpc/transport"
import type { RpcResult } from "@/rpc/types"
import { pickPageBudget } from "@/services/pageBudget"
import { syncStore } from "@/store/sync"
import { withRetry } from "@/services/syncRetry"
import { withSyncLock } from "@/services/syncLock"
import { getBearerToken, refreshBearerToken } from "@/utils/authHeader"

import database from "."
import { INBOUND_TABLES, OUTBOUND_TABLES } from "./localSync"
import { countRecordsInChanges, updateDates } from "./syncNormalize"

/**
 * Rows to request per table bucket — mirrors the server's `MAX_PAGE_ROWS`.
 *
 * Must be sent explicitly. Omitting it gets `DEFAULT_PAGE_ROWS = 500`, which at
 * ~900 decoded bytes a record caps a bucket near 450 KB — under even the
 * smallest byte budget, so every `pickPageBudget` tier would produce identical
 * pages and the OOM margin would rest on a server default rather than on the
 * budget. Asking for more than the server's ceiling is silently clamped, so
 * this must move with that constant.
 */
const PULL_PAGE_ROWS = 2_000

/**
 * Records per push request.
 *
 * `fetchLocalChanges` materialises every pending record at once and upstream
 * offers no way to page it, so this does not bound the fetch — it bounds the
 * multiplier on top of it: the JSON string, the request body and the server's
 * parse of them. Same size as a pull page, so both directions move work in
 * comparable units.
 */
const PUSH_CHUNK_RECORDS = 2_000

/**
 * Pages one pull may walk before giving up.
 *
 * Far above any real dataset — at `PULL_PAGE_ROWS` this is 200 million records.
 * It exists so a server bug that returns a constant non-null cursor ends as a
 * resumable failure rather than spinning until the user happens to cancel.
 */
const MAX_PULL_PAGES = 100_000

type RawRow = Record<string, unknown>
type Bucket = { created: RawRow[]; updated: RawRow[]; deleted: string[] }

export type PullPage = {
  changes: SyncDatabaseChangeSet
  next_cursor: string | null
  timestamp: number
  progress: { table: string; bucket: string; tables_remaining: number } | null
}

type FetchPageFn = (args: { since: number; cursor: string | null }) => Promise<RpcResult<PullPage>>

export type PullLoopResult =
  | { ok: true; recordsApplied: number; pagesApplied: number; snapshotTs: number | null }
  | { ok: false; error: string; resumable: boolean }

export type ManualSyncProgress = {
  phase: "pushing" | "pulling" | "done"
  table: string
  pagesApplied: number
  recordsApplied: number
  recordsPushed: number
  rejectedCount: number
  tablesRemaining: number
}

export type ManualSyncResult =
  | { ok: true; recordsPushed: number; recordsApplied: number; rejected: SyncRejectedIds }
  | { ok: false; error: string; resumable: boolean }

/**
 * Normalise one inbound page before handing it to upstream.
 *
 * Three things happen here, each guarding a way upstream would otherwise fail:
 *
 * 1. `created` is merged into `updated`. The server classifies created-vs-updated
 *    relative to the CURSOR, not relative to what this device has, so the split
 *    carries no trustworthy information. Merging makes every row an upsert and
 *    avoids upstream's per-record logError during a large backfill.
 * 2. Tables outside INBOUND_TABLES, or absent from `knownTables`, are dropped.
 *    Upstream calls `db.get(tableName)` directly and throws on an unknown table,
 *    which would roll back the whole page.
 * 3. `_status` / `_changed` are stripped and `__proto__`-bearing records dropped.
 *    Upstream treats both as fatal invariants.
 *
 * `knownTables` is a parameter rather than a read of the database so this stays
 * pure and testable; `runManualSync` supplies the live schema.
 */
export function prepareInboundPage(
  changes: SyncDatabaseChangeSet,
  knownTables: ReadonlySet<string>,
): SyncDatabaseChangeSet {
  const out: Record<string, Bucket> = {}

  for (const [table, bucket] of Object.entries(changes ?? {})) {
    if (!INBOUND_TABLES.has(table)) {
      Logger.warn({ msg: "[manualSync] Ignoring table a peer may not write", table })
      continue
    }
    if (!knownTables.has(table)) {
      Logger.warn({ msg: "[manualSync] Ignoring table absent from local schema", table })
      continue
    }

    const b = (bucket ?? {}) as Partial<Bucket>
    const rows = [...(b.created ?? []), ...(b.updated ?? [])]
      .filter((raw) => {
        if (!raw || typeof raw !== "object") return false
        if (Object.prototype.hasOwnProperty.call(raw, "__proto__")) {
          Logger.warn({ msg: "[manualSync] Dropping record with own __proto__", table })
          return false
        }
        return true
      })
      .map((raw) => {
        const { _status, _changed, ...rest } = raw as RawRow
        return rest
      })

    const deleted = b.deleted ?? []
    if (rows.length === 0 && deleted.length === 0) continue

    out[table] = { created: [], updated: rows, deleted }
  }

  return out as SyncDatabaseChangeSet
}

/**
 * Split pending local changes into requests of at most `maxRecords` rows,
 * keeping only tables this device is allowed to send.
 *
 * `fetchLocalChanges` reports pending records for every collection, including
 * device-local ones — `peers` holds hub URLs and public keys — so the filter is
 * not optional. It happens in the same pass as the split rather than over a
 * filtered copy, because materialising a second full changeset is exactly the
 * memory cost this is here to avoid.
 *
 * Each chunk carries the `affectedRecords` its own rows refer to, because
 * `markLocalChangesAsSynced` looks every raw up by id and table and logs an
 * error for any it cannot find. Splitting per chunk also keeps that lookup from
 * scanning the whole pending set once per record.
 *
 * Deletions are tombstone ids with no model behind them, so they are chunked by
 * id alone.
 */
export function chunkLocalChanges(
  local: SyncLocalChanges,
  maxRecords: number,
  allowedTables: ReadonlySet<string> = OUTBOUND_TABLES,
): SyncLocalChanges[] {
  const modelsByKey = new Map<string, unknown>()
  for (const model of local.affectedRecords ?? []) {
    const m = model as unknown as { id: string; table: string }
    modelsByKey.set(`${m.table}/${m.id}`, model)
  }

  const chunks: SyncLocalChanges[] = []
  let changes: Record<string, Bucket> = {}
  let affected: unknown[] = []
  let count = 0

  const bucketFor = (table: string): Bucket => {
    if (!changes[table]) changes[table] = { created: [], updated: [], deleted: [] }
    return changes[table]
  }

  const flush = () => {
    if (count === 0) return
    chunks.push({ changes, affectedRecords: affected } as SyncLocalChanges)
    changes = {}
    affected = []
    count = 0
  }

  for (const [table, bucket] of Object.entries(
    (local.changes ?? {}) as Record<string, Partial<Bucket>>,
  )) {
    if (!allowedTables.has(table)) continue

    // The created/updated split is preserved. Inbound it carries no trustworthy
    // information — the server classifies against the cursor, not against what
    // this device holds — but outbound this device genuinely knows which rows it
    // created, and ordinary sync sends the split intact. The server concatenates
    // the two and upserts either way, so merging would discard accurate
    // information for nothing.
    for (const bucketKey of ["created", "updated"] as const) {
      for (const row of bucket[bucketKey] ?? []) {
        bucketFor(table)[bucketKey].push(row)
        const model = modelsByKey.get(`${table}/${(row as { id: string }).id}`)
        if (model) affected.push(model)
        if (++count >= maxRecords) flush()
      }
    }
    for (const id of bucket.deleted ?? []) {
      bucketFor(table).deleted.push(id)
      if (++count >= maxRecords) flush()
    }
  }
  flush()

  return chunks
}

/**
 * Walk the server's pages until it stops issuing cursors.
 *
 * Each page is applied and its resume cursor persisted before the next request,
 * so an interrupted run continues rather than restarting. The cursor for the
 * FINAL page is not persisted — the run is complete, and the caller advances the
 * real sync cursors instead.
 *
 * Dependencies are arguments so this is testable without a database or network.
 */
export async function pullLoop(args: {
  fetchPage: FetchPageFn
  since: number
  startCursor: string | null
  signal: AbortSignal
  apply: (changes: SyncDatabaseChangeSet) => Promise<number>
  saveResume: (state: Peer.ResumeState) => Promise<void>
  onProgress: (p: {
    table: string
    pagesApplied: number
    recordsApplied: number
    tablesRemaining: number
  }) => void
}): Promise<PullLoopResult> {
  const { fetchPage, since, startCursor, signal, apply, saveResume, onProgress } = args

  let cursor = startCursor
  let pagesApplied = 0
  let recordsApplied = 0
  let snapshotTs: number | null = null

  for (;;) {
    if (signal.aborted) return { ok: false, error: "Cancelled", resumable: true }

    const result = await fetchPage({ since, cursor })
    if (!result.ok) {
      // Cancelling surfaces as a non-retryable error, so resumability cannot be
      // read from `retryable` alone: an aborted run's cursor is still good.
      if (signal.aborted) return { ok: false, error: "Cancelled", resumable: true }
      // Retries happen inside fetchPage; reaching here means it gave up. A
      // retryable class of failure is still resumable — the cursor stands.
      return {
        ok: false,
        error: result.error.message,
        resumable: result.error.retryable !== false,
      }
    }

    const page = result.data
    snapshotTs = page.timestamp

    recordsApplied += await apply(page.changes)
    pagesApplied += 1

    onProgress({
      table: page.progress?.table ?? "",
      pagesApplied,
      recordsApplied,
      tablesRemaining: page.progress?.tables_remaining ?? 0,
    })

    cursor = page.next_cursor
    if (cursor === null) return { ok: true, recordsApplied, pagesApplied, snapshotTs }

    if (pagesApplied >= MAX_PULL_PAGES) {
      return { ok: false, error: "Server kept issuing pages", resumable: true }
    }

    // Aborting between apply and save would lose one page of progress, not
    // correctness — every applied record is `synced` and idempotent.
    await saveResume({ cursor, since, snapshotTs, pagesApplied, recordsApplied })
  }
}

/**
 * Apply one page inside a single write transaction.
 *
 * Upstream's applyRemoteChanges does NOT open its own transaction — it calls
 * db.batch and expects a caller-supplied write. One write per page is what
 * bounds memory; wrapping the whole run in one transaction would not.
 *
 * `sendCreatedAsUpdated: true` matches prepareInboundPage having moved every row
 * into the `updated` bucket.
 */
async function applyPage(
  changes: SyncDatabaseChangeSet,
  knownTables: ReadonlySet<string>,
): Promise<number> {
  const prepared = prepareInboundPage(changes, knownTables)
  if (Object.keys(prepared).length === 0) return 0

  updateDates(prepared)
  await database.write(async () => {
    await applyRemoteChanges(prepared, { db: database, sendCreatedAsUpdated: true })
  })

  return countRecordsInChanges(prepared)
}

/**
 * The peer_type the server should attribute this run to.
 *
 * Only `sync_hub` changes which entities the server returns; the rest are
 * equivalent to `unknown`. Sending the real platform is what makes the audit
 * trail worth reading.
 */
const devicePeerType = (): string => (Platform.OS === "ios" ? "ios" : "android")

/**
 * Run a request, re-authenticating once if the token has expired.
 *
 * A backfill can run for ten minutes and outlive its token. The resume cursor
 * makes recovery cheap, but silently failing the run would not be.
 */
async function withAuthRefresh<T>(
  call: () => Promise<RpcResult<T>>,
  refresh: () => Promise<boolean>,
): Promise<RpcResult<T>> {
  const first = await call()
  if (first.ok) return first
  if (first.error.code !== "AUTH_FAILED") return first
  if (!(await refresh())) return first
  return call()
}

/**
 * Push everything pending, then backfill from `since`.
 *
 * Holds the process-wide sync lock for the whole run, so ordinary sync queues
 * behind it rather than interleaving. Returns the outcome instead of throwing;
 * `resumable` says whether retrying would continue from the stored cursor.
 */
export async function runManualSync(args: {
  peerId: string
  since: number
  signal: AbortSignal
  onProgress: (p: ManualSyncProgress) => void
}): Promise<ManualSyncResult> {
  const { peerId, since, signal, onProgress } = args

  // Brackets the shared store from INSIDE the lock, so existing consumers do
  // not read "idle" through a ten-minute operation. Inside matters: bracketing
  // from the caller would let the lock release first, so a queued ordinary sync
  // could set FETCHING before the reset lands and the store would read IDLE for
  // the whole of that run.
  return withSyncLock("manual", async () => {
    syncStore.trigger.start_sync()
    try {
      return await runLocked()
    } finally {
      syncStore.trigger.force_reset()
    }
  })

  async function runLocked(): Promise<ManualSyncResult> {
    const peer = await Peer.DB.getById(peerId)
    if (peer.status !== "active") {
      return { ok: false as const, error: "This server is not active", resumable: false }
    }
    // This transport speaks tRPC; a hub speaks its own protocol at the same
    // paths, so pointing it at one produces confusing 404s rather than a clear
    // refusal.
    if (peer.peerType !== "cloud_server") {
      return { ok: false as const, error: "Manual sync requires a cloud server", resumable: false }
    }
    const baseUrl = Peer.getUrl(peer)
    if (!baseUrl) {
      return { ok: false as const, error: "This server has no address", resumable: false }
    }

    const transport = createTrpcCloudTransport(baseUrl, getBearerToken)
    const refresh = () => refreshBearerToken(transport)
    const peerType = devicePeerType()
    const knownTables = new Set(Object.keys(database.schema.tables))

    // A device that has never held a token would otherwise spend its first
    // request discovering that, on the operation least able to afford one.
    if ((await getBearerToken()) === "") {
      await refresh()
    }

    const pageBytes = await pickPageBudget()

    let recordsPushed = 0
    // Accumulated across push chunks. SyncRejectedIds is keyed by known table
    // names, which is too narrow to build up one table at a time.
    const rejected: Record<string, string[]> = {}
    const rejectedCount = () => Object.values(rejected).flat().length

    const report = (phase: ManualSyncProgress["phase"], p: Partial<ManualSyncProgress> = {}) =>
      onProgress({
        phase,
        table: "",
        pagesApplied: 0,
        recordsApplied: 0,
        tablesRemaining: 0,
        ...p,
        recordsPushed,
        rejectedCount: rejectedCount(),
      })

    // Offer local work to the server at its real timestamps BEFORE the pull
    // overwrites local state.
    report("pushing")

    const local = await fetchLocalChanges(database)

    for (const chunk of chunkLocalChanges(local, PUSH_CHUNK_RECORDS)) {
      if (signal.aborted) {
        return { ok: false as const, error: "Cancelled", resumable: true }
      }

      const pushResult = await withAuthRefresh(
        () =>
          withRetry(
            () =>
              transport.sendCommand<{
                accepted: number
                rejected: Record<string, string[]>
                by_table: Record<string, { accepted: number; rejected: number }>
              }>("sync.backfillPush", {
                changes: chunk.changes,
                since,
                peer_type: peerType,
              }),
            signal,
          ),
        refresh,
      )

      if (!pushResult.ok) {
        return { ok: false as const, error: pushResult.error.message, resumable: true }
      }

      const chunkRejected = pushResult.data.rejected ?? {}
      for (const [table, ids] of Object.entries(chunkRejected)) {
        rejected[table] = [...(rejected[table] ?? []), ...ids]
      }

      // Rejected rows keep their `_status`/`_changed`, and rejected deletions
      // keep their tombstone, so neither is marked synced and a later pull
      // cannot silently overwrite them. Marking per chunk is what lets an
      // interrupted push keep its progress.
      await markLocalChangesAsSynced(database, chunk, chunkRejected as SyncRejectedIds)

      // What the server took, not what was offered: a rejected row is still
      // pending afterwards, so counting it as pushed would overstate progress.
      const offered = countRecordsInChanges(chunk.changes)
      const refused = Object.values(chunkRejected).flat().length
      recordsPushed += Math.max(0, offered - refused)
      report("pushing")
    }

    const resume = await Peer.DB.getResumeState(peerId)
    const startCursor = resume && resume.since === since ? resume.cursor : null

    const pull = await pullLoop({
      since,
      startCursor,
      signal,
      fetchPage: ({ since: from, cursor }) =>
        withAuthRefresh(
          () =>
            withRetry(
              () =>
                transport.sendQuery<PullPage>("sync.backfillPull", {
                  since: from,
                  cursor,
                  page_bytes: pageBytes,
                  page_rows: PULL_PAGE_ROWS,
                  peer_type: peerType,
                }),
              signal,
            ),
          refresh,
        ),
      apply: (changes) => applyPage(changes, knownTables),
      saveResume: (state) => Peer.DB.saveResumeState(peerId, state),
      onProgress: (p) =>
        report("pulling", {
          table: p.table,
          pagesApplied: p.pagesApplied,
          recordsApplied: p.recordsApplied,
          tablesRemaining: p.tablesRemaining,
        }),
    })

    if (!pull.ok) {
      // A cursor the server will never accept again — it encodes an entity list,
      // so a redeploy or schema change invalidates it — would otherwise be read
      // back by every subsequent run against the same range and fail identically
      // forever. Only a resumable failure leaves it in place.
      if (!pull.resumable) await Peer.DB.clearResumeState(peerId)
      return { ok: false as const, error: pull.error, resumable: pull.resumable }
    }

    // Cursors advance only now, and only as far as this run established. These
    // two values are ordinary sync's `since`, so having pulled [since,
    // snapshotTs] the device is complete to snapshotTs only if `since` reaches
    // back to where it was already complete. A bounded range starting after
    // that leaves an unfetched gap, and moving the watermark past it hides that
    // gap from ordinary sync forever.
    //
    // Each watermark is guarded against ITS OWN prior value: `last_synced_at`
    // holds the client clock (`Date.now()` in peerSync) while
    // `__watermelon_last_pulled_at` holds the server's timestamp. Comparing
    // `since` against the wrong one lets clock skew wave a bounded range past
    // the guard.
    if (pull.snapshotTs !== null) {
      const priorPeer = peer.lastSyncedAt ?? 0
      if (since <= priorPeer) {
        await Peer.DB.updateLastSyncedAt(peerId, pull.snapshotTs)
      }
      const priorPulled = (await getLastPulledAt(database)) ?? 0
      if (since <= priorPulled) {
        await setLastPulledAt(database, pull.snapshotTs)
      }
    }
    await Peer.DB.clearResumeState(peerId)

    // Carries the run's real totals: a "done" that reset the page count to zero
    // would leave the completion screen reporting nothing was transferred.
    report("done", { recordsApplied: pull.recordsApplied, pagesApplied: pull.pagesApplied })

    return {
      ok: true as const,
      recordsPushed,
      recordsApplied: pull.recordsApplied,
      rejected,
    }
  }
}
