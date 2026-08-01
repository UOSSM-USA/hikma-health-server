/**
 * Initializes the operation mode from AppConfig on app startup.
 *
 * Reads the server-configured mode ("offline" | "online" | "user_choice")
 * from the app_config table. When "user_choice", falls back to the
 * user's persisted preference in MMKV (defaults to "offline").
 *
 * Should be called once in app.tsx.
 */

import { useEffect } from "react"
import AppConfig from "@/models/AppConfig"
import {
  ONLINE_MODE_ENABLED,
  operationModeStore,
  type ModeConfig,
  type OperationMode,
} from "@/store/operationMode"
import { loadString, saveString } from "@/utils/storage"

/** MMKV key for the user's preferred operation mode */
export const MODE_PREFERENCE_KEY = "operation_mode_preference"

const VALID_MODES: ModeConfig[] = ["offline", "online", "user_choice"]

/**
 * Resolve the stored preference into a mode, and say whether the stored value
 * should be rewritten.
 *
 * Two values get cleaned up. `"sync_hub"` was a conflated mode in earlier
 * versions — the hub peer still exists for sync resolution, so it maps to
 * offline. `"online"` is cleaned while online mode is disabled, so that a device
 * which opted in before the gate does not drop straight back into online mode
 * the moment the gate lifts, with no user action and nothing to warn them.
 */
export const resolvePreference = (
  stored: string | null,
): { mode: OperationMode; shouldClean: boolean } => {
  const wantsOnline = stored === "online"
  return {
    mode: wantsOnline && ONLINE_MODE_ENABLED ? "online" : "offline",
    shouldClean: stored === "sync_hub" || (wantsOnline && !ONLINE_MODE_ENABLED),
  }
}

export function useOperationModeInit() {
  useEffect(() => {
    async function init() {
      try {
        const raw = await AppConfig.DB.getValue(AppConfig.Namespaces.SYSTEM, "operation_mode")
        const serverConfig: ModeConfig =
          typeof raw === "string" && VALID_MODES.includes(raw as ModeConfig)
            ? (raw as ModeConfig)
            : "offline"

        operationModeStore.send({ type: "set_server_config", config: serverConfig })

        if (serverConfig === "user_choice") {
          const { mode, shouldClean } = resolvePreference(loadString(MODE_PREFERENCE_KEY))
          if (shouldClean) {
            saveString(MODE_PREFERENCE_KEY, "offline")
          }
          operationModeStore.send({ type: "set_mode", mode })
        }
      } catch {
        // On any failure, stay in offline mode (the default)
        operationModeStore.send({ type: "set_server_config", config: "offline" })
      }
    }

    init()
  }, [])
}
