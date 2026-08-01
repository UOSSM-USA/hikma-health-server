/**
 * Process-wide sync mutex.
 *
 * Ordinary sync and manual sync both write the same tables through the same
 * WatermelonDB instance. Running them concurrently produces "Concurrent
 * synchronization is not allowed" at best and interleaved conflict resolution
 * at worst, so every sync operation serialises through here.
 *
 * Operations queue rather than fail: a manual sync started while an ordinary
 * sync is finishing waits its turn instead of asking the user to retry. Callers
 * with nobody waiting on them should use `tryWithSyncLock` instead.
 */

/** Labels of the running operation and everything queued behind it, in order. */
const waiting: string[] = []

/** Resolves when every operation claimed so far has settled. */
let tail: Promise<unknown> = Promise.resolve()

export const isSyncInFlight = (): boolean => waiting.length > 0

/** The running operation's label, or the next one about to run. */
export const currentSyncLabel = (): string | null => waiting[0] ?? null

/**
 * Run `fn` once every operation claimed before it has settled.
 *
 * The lock is claimed **synchronously**, before this returns. Callers decide
 * whether to queue, join, or skip on the line right after calling — with no
 * await in between — so a claim deferred to a microtask would let a second sync
 * start against the same database.
 */
export async function withSyncLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  waiting.push(name)

  // Swallow the predecessor's rejection: one failed operation must not reject
  // everything queued behind it.
  const run = tail
    .then(
      () => undefined,
      () => undefined,
    )
    .then(async () => {
      try {
        return await fn()
      } finally {
        // Execution is FIFO, so the operation finishing here is always the head.
        waiting.shift()
      }
    })

  tail = run.catch(() => undefined)
  return run
}

/**
 * Run `fn` only if nothing else holds the lock; otherwise skip and return null.
 *
 * For automatic triggers — connectivity settle, login, app foreground — where
 * nobody is waiting on the result. Queueing several of these behind a long
 * manual sync would fire them all at once the moment it completes.
 */
export async function tryWithSyncLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (isSyncInFlight()) return null
  return withSyncLock(name, fn)
}
