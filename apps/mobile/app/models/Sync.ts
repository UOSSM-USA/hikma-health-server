import { MigrationSyncChanges } from "@nozbe/watermelondb/Schema/migrations/getSyncChanges"
import {
  SyncDatabaseChangeSet,
  SyncPullResult,
  SyncPushResult,
  Timestamp,
} from "@nozbe/watermelondb/sync"
import { Exit, Match, Option, pipe } from "effect"
import { result } from "es-toolkit/compat"

import { storage } from "@/utils/storage"
import Peer from "@/models/Peer"
import { Logger } from "@hikmahealth/js-utils"

namespace Sync {
  export type StateT = "idle" | "fetching" | "resolving" | "pushing" | "error"

  export const State: { [key in Uppercase<StateT>]: StateT } = {
    IDLE: "idle",
    FETCHING: "fetching",
    RESOLVING: "resolving",
    PUSHING: "pushing",
    ERROR: "error",
  }

  export type ServerType = "local" | "cloud"

  export const ServerType: { [key in Uppercase<ServerType>]: ServerType } = {
    LOCAL: "local",
    CLOUD: "cloud",
  }

  export namespace Server {
    export type Key = `${ServerType}-sync-server`
    export type T = {
      id: string
      name: ServerType
      type: ServerType
      url: string
      isActive: boolean
    }

    /**
     * Given a SyncPullResult, return the changes and timestamp
     * @param {SyncPullResult} result
     * @returns {Option.Option<{changes: SyncDatabaseChangeSet, timestamp: Timestamp}>}
     */
    export function getChangesAndTimestamp(
      result: SyncPullResult,
    ): Option.Option<{ changes: SyncDatabaseChangeSet; timestamp: Timestamp }> {
      return Match.value(result).pipe(
        Match.when(
          (v) => "timestamp" in v && "changes" in v,
          ({ changes, timestamp }) => Option.some({ changes, timestamp }),
        ),
        Match.orElse(() => Option.none()),
      )
    }

    /**
     * Sync Pull data from the server
     * @param {number} lastPulledAt
     * @param {number} schemaVersion
     * @param {MigrationSyncChanges} migration
     * @param {Headers} headers
     * @returns {Promise<Exit<SyncPullResult, string>>}
     */
    export async function syncPull(
      lastPulledAt: number,
      schemaVersion: number,
      migration: MigrationSyncChanges,
      headers: Headers,
    ): Promise<Exit.Exit<SyncPullResult, string>> {
      const urlParams = `last_pulled_at=${lastPulledAt}&schema_version=${schemaVersion}&migration=${encodeURIComponent(
        JSON.stringify(migration),
      )}`

      const HH_API = await Peer.getActiveUrl()
      if (!HH_API) {
        throw new Error("HH API URL not found")
      }
      const SYNC_API = `${HH_API}/api/v2/sync`

      Logger.warn({ msg: "SYNC_API:", SYNC_API })

      const result = await fetch(`${SYNC_API}?${urlParams}`, {
        // Headers include the username and password in base64 encoded string
        headers: headers,
      })

      if (!result.ok) {
        Logger.error({ msg: "Error fetching data from the server", result })
        return Exit.fail(await result.text())
      }

      const syncPullResult = (await result.json()) as SyncPullResult

      return Exit.succeed(syncPullResult)
    }

    /**
     * Sync Push data to the server
     * @param {number} lastPulledAt
     * @param {SyncDatabaseChangeSet} changes
     * @param {Headers} headers
     * @returns {Promise<Exit<SyncPushResult, string>>}
     */
    export async function syncPush(
      lastPulledAt: number,
      changes: SyncDatabaseChangeSet,
      headers: Headers,
    ): Promise<Exit.Exit<SyncPushResult, string>> {
      const HH_API = await Peer.getActiveUrl()
      if (!HH_API) {
        throw new Error("HH API URL not found")
      }
      const SYNC_API = `${HH_API}/api/v2/sync`
      const result = await fetch(`${SYNC_API}?last_pulled_at=${lastPulledAt}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(changes),
      })

      if (!result.ok) {
        Logger.error({ msg: "Error pushing data to the server", result })
        return Exit.fail(await result.text())
      }

      const syncPushResult = (await result.json()) as SyncPushResult
      return Exit.succeed(syncPushResult)
    }
  }
}

export default Sync
