/**
 * Operation mode store — controls whether the app uses offline (WatermelonDB)
 * or online (HTTP) data access.
 *
 * Mode is determined by:
 * 1. Server AppConfig ("offline" | "online" | "user_choice")
 * 2. Local user preference (MMKV) when server allows "user_choice"
 * Defaults to "offline" until initialized.
 */

import { createStore } from "@xstate/store"

export type OperationMode = "offline" | "online"

/** Admin-configured mode from AppConfig */
export type ModeConfig = "offline" | "online" | "user_choice"

/**
 * Online mode is disabled at the device.
 *
 * `rpcProvider` calls 18 distinct RPC procedures. Twelve have nothing to answer
 * them on the cloud server, and the hub — which is missing a different set —
 * has no `problems.*` either. The failures are not uniform, so the app renders
 * with parts of the clinical record silently absent: an empty problem list
 * reads exactly like a patient who has no problems.
 *
 * Uniform failure would be a bug; partial success on a clinical record is worse.
 * Until the missing procedures exist, every route into online mode resolves to
 * offline — including a server-set `app_config.system.operation_mode`, because
 * an admin cannot make a half-implemented mode safe by choosing it.
 *
 * Flip this to re-enable once those procedures land.
 */
export const ONLINE_MODE_ENABLED = false

/** Every route into "online" passes through here while the mode is disabled. */
const resolveMode = (mode: OperationMode): OperationMode => (ONLINE_MODE_ENABLED ? mode : "offline")

type ModeContext = {
  mode: OperationMode
  configSource: "local" | "server"
  serverConfig: ModeConfig
  isTransitioning: boolean
}

const initialContext: ModeContext = {
  mode: "offline",
  configSource: "local",
  serverConfig: "user_choice",
  isTransitioning: false,
}

export const operationModeStore = createStore({
  context: initialContext,
  on: {
    set_mode: (context, event: { mode: OperationMode }) => ({
      ...context,
      mode: resolveMode(event.mode),
      isTransitioning: false,
    }),

    // `serverConfig` records what the server actually said, untouched — the
    // gate belongs on `mode`, and coercing both would hide the disagreement.
    set_server_config: (context, event: { config: ModeConfig }) => ({
      ...context,
      serverConfig: event.config,
      configSource: "server" as const,
      ...(event.config !== "user_choice" ? { mode: resolveMode(event.config) } : {}),
    }),

    start_transition: (context) => ({
      ...context,
      isTransitioning: true,
    }),

    end_transition: (context, event: { mode: OperationMode }) => ({
      ...context,
      mode: resolveMode(event.mode),
      isTransitioning: false,
    }),

    reset: () => ({ ...initialContext }),
  },
})
