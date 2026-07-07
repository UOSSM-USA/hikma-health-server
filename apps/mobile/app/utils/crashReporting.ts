import { Logger } from "@hikmahealth/js-utils"
import * as Sentry from "@sentry/react-native"

/**
 * How bad an error was, used to sort and filter it in Sentry.
 */
export enum ErrorType {
  /** Left the app unusable - a crashed render, or anything the user can only escape by restarting. */
  FATAL = "Fatal",
  /** Caught and recovered from, but still worth knowing about. */
  HANDLED = "Handled",
}

/**
 * Send an error to Sentry, and to the console in development.
 *
 * Pass `componentStack` from an error boundary's `ErrorInfo` to see the React tree next to
 * the stack trace in Sentry. Render errors reach Sentry only this way, because React catches
 * them before the global handler ever sees them.
 *
 * Calling this before `Sentry.init` is harmless - the event is dropped.
 */
export const reportCrash = (
  error: Error,
  type: ErrorType = ErrorType.FATAL,
  componentStack?: string | null,
) => {
  if (__DEV__) {
    const message = error.message || "Unknown"
    Logger.error(error)
    Logger.log({ message, type })
  }

  Sentry.captureException(error, {
    level: type === ErrorType.FATAL ? "fatal" : "error",
    tags: { errorType: type },
    contexts: componentStack ? { react: { componentStack } } : undefined,
  })
}
