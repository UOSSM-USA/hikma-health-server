/**
 * Dev-only logger. All methods are no-ops in production builds.
 *
 * Why: Prevents accidental credential and token leakage via console
 * output that persists in system logs (Logcat, iOS Console).
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
