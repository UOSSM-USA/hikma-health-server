/**
 * Sync Service Module
 *
 * This module provides a centralized interface for managing data synchronization
 * between the mobile app and the server (both local and cloud).
 *
 * Key features:
 * - Automatic detection of sync type (local vs cloud)
 * - State management through XState store
 * - Error handling and user notifications
 * - Prevention of concurrent sync operations
 *
 * @module services/syncService
 */

import { Alert } from "react-native"
import { hasUnsyncedChanges } from "@nozbe/watermelondb/sync"
import { getLastPulledAt } from "@nozbe/watermelondb/sync/impl"
import * as Sentry from "@sentry/react-native"
import Toast from "react-native-root-toast"

import database from "@/db"
import { runManualSync } from "@/db/cloudManualSync"
import { getCredentials, syncDB } from "@/db/peerSync"
import { translate } from "@/i18n/translate"
import Peer from "@/models/Peer"
import Sync from "@/models/Sync"
import User from "@/models/User"
import { operationModeStore } from "@/store/operationMode"
import { syncStore } from "@/store/sync"
import { withSyncLock, isSyncInFlight, currentSyncLabel } from "@/services/syncLock"
import { Logger } from "@hikmahealth/js-utils"

/**
 * Starts a sync operation with the configured server.
 * This function handles both local and remote sync scenarios.
 *
 * You can (probably should always) call startSync twice in a row.
 * The first sync does: PULL --> local data conflict resolution ---> PUSH
 * The second sync does: PULL ---> local data conflict resolution (no push since there are no changes)
 * The extra sync gets any updated counts in the server (like stock counts)
 *
 *
 * @param providerEmail - Optional email to check for test accounts
 * @param options.trigger - `"user"` (default) queues behind any sync already
 *   running; `"auto"` gives up instead. See {@link SyncTrigger}.
 * @returns Promise that resolves when sync is complete or rejects on error.
 *   An `auto` trigger also resolves — with nothing synced — when another sync
 *   holds the lock, so callers cannot infer from resolution alone that work
 *   happened.
 *
 * @throws {Error} When:
 * - Test account attempts to sync
 * - App is not activated
 * - Network connection fails
 * - Server returns an error
 */
let ordinarySyncInFlight: Promise<void> | null = null

/**
 * Who asked for this sync.
 *
 * `user` waits its turn — someone pressed a button and expects it to happen.
 * `auto` (connectivity settle, login, foreground) gives up instead of queueing
 * behind a long manual sync, since nobody is waiting on the result and several
 * stacked triggers would all fire at once on release.
 */
export type SyncTrigger = "user" | "auto"

/**
 * How long the unattended first-sync backfill may run before it is aborted.
 *
 * Not a transfer budget — a real first sync of a large clinic can legitimately
 * take many minutes. This exists so a hung socket or a device that never
 * regains connectivity cannot hold the sync lock forever, since this is the one
 * backfill with no user and no Cancel button behind it.
 */
const FIRST_SYNC_CEILING_MS = 30 * 60_000

export const startSync = async (
  providerEmail?: string,
  options?: { trigger?: SyncTrigger },
): Promise<void> => {
  // Skip sync in online mode — data flows directly via RPC
  if (operationModeStore.getSnapshot().context.mode === "online") {
    Logger.log("Skipping sync: app is in online mode")
    return Promise.resolve()
  }

  // Check if test account
  if (providerEmail === "tester.g@gmail.com") {
    Alert.alert("Please sign in with your server to continue syncing")
    return Promise.reject(new Error("Test account cannot sync"))
  }

  // Mutex. `ordinarySyncInFlight` is assigned below with no await in between, so
  // two callers racing across the login / netinfo settle both see it and join
  // rather than starting a second synchronize() that WatermelonDB would abort.
  // Checked before the lock so an automatic trigger keeps joining an ordinary
  // sync exactly as it did before the lock existed.
  if (ordinarySyncInFlight) {
    Logger.log("Sync already in progress, joining existing run...")
    return ordinarySyncInFlight
  }

  // Something else — a manual sync — holds the lock. Queueing an automatic
  // trigger behind it helps nobody, so drop it; the run it would have waited for
  // covers the same ground.
  if (options?.trigger === "auto" && isSyncInFlight()) {
    Logger.log(`Skipping automatic sync: "${currentSyncLabel()}" holds the sync lock`)
    return Promise.resolve()
  }

  // Defaults to queueing. A delayed sync is recoverable; a skipped one may not be.
  ordinarySyncInFlight = runFirstSyncThenOrdinary(providerEmail).finally(() => {
    ordinarySyncInFlight = null
  })
  return ordinarySyncInFlight
}

/**
 * Take the paged backfill when this device has never synced, then fall back to
 * the ordinary path if it did not complete.
 *
 * The two runs claim the sync lock in sequence, never nested. `runManualSync`
 * claims it itself, and `withSyncLock` has no owner tracking, so claiming from
 * inside a locked region deadlocks permanently.
 */
const runFirstSyncThenOrdinary = async (providerEmail?: string): Promise<void> => {
  const firstSyncPeer = await resolveFirstSyncPeer()
  if (firstSyncPeer && (await runFirstSyncBackfill(firstSyncPeer))) return

  await withSyncLock("ordinary", () => runSync(providerEmail))
}

/**
 * The active peer if this device has never synced and that peer is a cloud
 * server, otherwise null.
 *
 * `getLastPulledAt` returns null for never-synced and a number otherwise. A
 * watermark of 0 means "synced, everything since epoch" — collapsing it to null
 * would send those devices through a full backfill on every launch.
 */
const resolveFirstSyncPeer = async (): Promise<Peer.T | null> => {
  try {
    const activePeers = await Peer.DB.getActive()
    const activePeer = activePeers[activePeers.length - 1]
    if (!activePeer || activePeer.peerType !== "cloud_server") return null

    return (await getLastPulledAt(database)) === null ? activePeer : null
  } catch (error) {
    // Deciding the route must never be what stops a sync. Ordinary sync
    // resolves the peer again and reports its own failures.
    Logger.warn({ msg: "[Sync] Could not determine first-sync eligibility", error })
    return null
  }
}

/**
 * Pull the initial dataset through the paged backfill.
 *
 * Returns false if it did not complete, and the caller falls back to the
 * ordinary unbounded pull — what every device does today, so trying the paged
 * path first can only improve on it. Do not clear the resume cursor here: a
 * resumable failure leaves it in place so the next launch continues the paged
 * run rather than restarting it, and that is what makes the fallback safe.
 */
const runFirstSyncBackfill = async (peer: Peer.T): Promise<boolean> => {
  // Nobody is watching this run and there is no Cancel button, and `fetch` has
  // no timeout, so a socket that never answers would hold the sync lock for the
  // life of the process.
  const controller = new AbortController()
  const ceiling = setTimeout(() => controller.abort(), FIRST_SYNC_CEILING_MS)

  try {
    Logger.log({ msg: "[Sync] First sync — routing through the paged backfill", peer: peer.id })

    // syncCloud refreshes clinic and roles before syncing. This is the run where
    // the provider record is least established, so it matters most here.
    const { email, password } = await getCredentials()
    await User.signIn(email, password)

    const result = await runManualSync({
      peerId: peer.id,
      since: 0,
      signal: controller.signal,
      onProgress: (progress) => Logger.log({ msg: "[Sync] Backfill progress", ...progress }),
    })

    if (!result.ok) {
      Logger.warn({
        msg: "[Sync] First-sync backfill failed — falling back to the ordinary pull",
        error: result.error,
        resumable: result.resumable,
        timedOut: controller.signal.aborted,
      })
      Sentry.captureMessage(`First-sync backfill failed: ${result.error}`, { level: "warning" })
      return false
    }

    Logger.log({ msg: "[Sync] First-sync backfill complete", applied: result.recordsApplied })
    return true
  } catch (error) {
    Logger.warn({ msg: "[Sync] First-sync backfill threw — falling back", error })
    Sentry.captureException(error)
    return false
  } finally {
    // Or the timer keeps the JS context alive and eventually aborts a signal
    // nothing is listening to.
    clearTimeout(ceiling)
  }
}

const runSync = async (providerEmail?: string): Promise<void> => {
  try {
    // Find the active peer to sync with — prefer hub if available, fall back to cloud
    const activePeers = await Peer.DB.getActive()
    const activePeer = activePeers.pop()
    if (activePeers.length > 0) {
      // we dont care to await this, if it fails it should not impact the user
      Peer.DB.deactivatePeersById(activePeers.map((it) => it.id)).catch((error) =>
        Logger.log({ error }),
      )
    }
    if (!activePeer) {
      Alert.alert("No sync peer configured. Please pair with a hub or register a cloud server.")
      return Promise.reject(new Error("No active sync peer"))
    }

    const hasLocalChangesToPush = await hasUnsyncedChanges({ database })

    Toast.show(translate("common:syncStarted"), {
      position: Toast.positions.BOTTOM,
      containerStyle: {
        marginBottom: 100,
      },
    })

    const finishSync = () => syncStore.send({ type: "finish_sync" })

    return syncDB(activePeer.id, {
      hasLocalChangesToPush,
      setSyncStart: () => syncStore.send({ type: "start_sync" }),
      setSyncResolution: (fetched: number) => syncStore.send({ type: "start_resolve", fetched }),
      setPushStart: (pushed: number) => syncStore.send({ type: "start_push", pushed }),
      updateSyncStatistic: Logger.log,
      onSyncError: (error: string) => syncStore.send({ type: "error_sync", error }),
      onSyncCompleted: finishSync,
    }).catch((err) => {
      finishSync()
      Logger.error({ msg: "Sync error:", err })

      const isConcurrent = String(err).includes("Concurrent synchronization")
      if (!isConcurrent) {
        const isHub = activePeer.peerType === "sync_hub"
        Toast.show(
          isHub
            ? "Error syncing locally. Please make sure you are on the same network and Wi-Fi is enabled."
            : "Error syncing. Please make sure you have internet or contact your administrator.",
          {
            position: Toast.positions.BOTTOM,
            containerStyle: { marginBottom: 100 },
            duration: Toast.durations.LONG,
          },
        )
      }

      Sentry.captureException(err)
      throw err
    })
  } catch (error) {
    Logger.error({ msg: "Sync initialization error:", error })
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Checks if the app is properly configured for syncing.
 * Verifies that the app has been activated on the administrator portal.
 *
 * @returns Promise<boolean> - true if sync is available, false otherwise
 */
export const isSyncAvailable = async (): Promise<boolean> => {
  try {
    const peer = await Peer.DB.resolveActive()
    return peer !== null
  } catch {
    return false
  }
}

/**
 * Gets the current sync state from the store.
 *
 * @returns Current sync state: 'idle' | 'fetching' | 'resolving' | 'pushing' | 'error'
 */
export const getSyncState = (): Sync.StateT => {
  return syncStore.getSnapshot().context.state
}

/**
 * Checks if a sync operation is currently in progress.
 *
 * @returns true if syncing, false if idle or in error state
 */
export const isSyncing = (): boolean => {
  return getSyncState() !== Sync.State.IDLE
}
