import { createStore } from "@xstate/store"
import * as SecureStore from "expo-secure-store"
import * as Sentry from "@sentry/react-native"
import { Option } from "effect"

import { Logger } from "@hikmahealth/js-utils"

const LOCK_TIMEOUT = 1000 * 60 * 5 // 5 minutes
export const APP_STATE_STORAGE_KEY = "appStateStore"

type PersistedAppState = {
  notificationsEnabled: boolean
  lockWhenIdle: boolean
  hersEnabled: boolean
}

/**
 * Persist the storable subset of the context — projecting here keeps
 * `lastActiveTime`, an Option, out of the blob. Call from `enqueue.effect`:
 * @xstate/store v4 never runs `emits` handlers, so a side effect there is dead.
 */
const persist = (context: PersistedAppState): void => {
  const { notificationsEnabled, lockWhenIdle, hersEnabled } = context

  SecureStore.setItemAsync(
    APP_STATE_STORAGE_KEY,
    JSON.stringify({ notificationsEnabled, lockWhenIdle, hersEnabled }),
  ).catch((error) => {
    Logger.error({ msg: "[AppState] Failed to persist settings", error })
    Sentry.captureException(error)
  })
}

export const appStateStore = createStore({
  context: {
    notificationsEnabled: false,
    lockWhenIdle: false,
    lastActiveTime: Option.none<Date>(),
    hersEnabled: false,
  },
  on: {
    /**
     * Apply stored settings on cold start. Persists nothing on purpose: one
     * write per field races three unordered writes on one key, and the partial
     * payload landing last drops a setting.
     */
    HYDRATE: (context, event: PersistedAppState) => ({
      ...context,
      notificationsEnabled: event.notificationsEnabled,
      lockWhenIdle: event.lockWhenIdle,
      hersEnabled: event.hersEnabled,
    }),
    RESET: (_context, _event, enqueue) => {
      const next = {
        notificationsEnabled: false,
        lockWhenIdle: false,
        lastActiveTime: Option.none<Date>(),
        hersEnabled: false,
      }
      enqueue.effect(() => persist(next))
      return next
    },
    SET_NOTIFICATIONS_ENABLED: (context, event: { notificationsEnabled: boolean }, enqueue) => {
      const next = { ...context, notificationsEnabled: event.notificationsEnabled }
      enqueue.effect(() => persist(next))
      return next
    },
    SET_LOCK_WHEN_IDLE: (context, event: { lockWhenIdle: boolean }, enqueue) => {
      const next = { ...context, lockWhenIdle: event.lockWhenIdle }
      enqueue.effect(() => persist(next))
      return next
    },
    SET_HERS_ENABLED: (context, event: { hersEnabled: boolean }, enqueue) => {
      const next = { ...context, hersEnabled: event.hersEnabled }
      enqueue.effect(() => persist(next))
      return next
    },
    SET_LAST_ACTIVE_TIME: (context, event: { lastActiveTime: Date | null }) => ({
      ...context,
      lastActiveTime: Option.fromNullable(event.lastActiveTime),
    }),
  },
})

/** Hydrate appStateStore from SecureStore. Call once on cold start. */
export async function hydrateAppState(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(APP_STATE_STORAGE_KEY)
    if (!raw) return
    const stored: PersistedAppState = JSON.parse(raw)
    appStateStore.send({
      type: "HYDRATE",
      notificationsEnabled: stored.notificationsEnabled ?? false,
      lockWhenIdle: stored.lockWhenIdle ?? false,
      hersEnabled: stored.hersEnabled ?? false,
    })
  } catch {
    // On failure, keep defaults
  }
}

// TODO: add implementation for determining whether or not the screen is locked
