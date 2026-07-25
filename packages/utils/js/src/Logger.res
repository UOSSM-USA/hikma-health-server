/**
 * Dev-only logger. All methods are no-ops in production builds.
 *
 * Why: Prevents accidental credential and token leakage via console
 * output that persists in system logs (Logcat, iOS Console).
 *
 * Use `Logger.Production.*` to opt a single call out of that no-op.
 */
let noop = (_args: 'a) => ()

let isProduction: bool = %raw(`process.env.NODE_ENV === "production"`)

@genType
let log = isProduction ? noop : Console.log

@genType
let warn = isProduction ? noop : Console.warn

@genType
let error = isProduction ? noop : Console.error

@genType
let info = isProduction ? noop : Console.info

/**
 * Same four methods, but they reach the console in production too.
 *
 * These defeat the leakage protection above, so the payload must be known
 * free of PHI, credentials and tokens — operational signals only
 * (lifecycle, configuration, unrecoverable failures without their data).
 */
@genType
module Production = {
  let log = Console.log
  let warn = Console.warn
  let error = Console.error
  let info = Console.info
}
