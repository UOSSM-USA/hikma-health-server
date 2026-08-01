/**
 * Shared protocol types used by both hub and cloud RPC transports.
 */

/** Result type for all RPC operations */
export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcError }

export type RpcError = {
  code:
    | "HANDSHAKE_FAILED"
    | "ENCRYPTION_FAILED"
    | "DECRYPTION_FAILED"
    | "NETWORK_ERROR"
    | "AUTH_FAILED"
    | "HUB_UNREACHABLE"
    | "SESSION_EXPIRED"
    | "RATE_LIMITED"
    | "SERVER_ERROR"
    | "BAD_REQUEST"
    | "TIMEOUT"
  message: string
  /** True when retrying the identical request could plausibly succeed. */
  retryable?: boolean
  status?: number
  /** From a 429's `Retry-After`. Honour it rather than a fixed backoff. */
  retryAfterMs?: number
}

/**
 * Map an HTTP status onto our error taxonomy.
 *
 * `retryable` means retrying the *identical* request could plausibly succeed:
 * the server was busy, unreachable, or transiently broken. A 401 is deliberately
 * NOT retryable — retrying the same expired token is pointless. The caller may
 * refresh the token and issue a new request, which is a different decision made
 * one level up.
 *
 * Everything unrecognised, including a 2xx that reached here because a caller
 * misread `response.ok`, lands in the terminal bucket. Guessing "retryable" for
 * an unknown status spins forever on a response that will never change.
 */
export const classifyHttpStatus = (status: number): Pick<RpcError, "code" | "retryable"> => {
  if (status === 429) return { code: "RATE_LIMITED", retryable: true }
  // The two 4xx the server resolves on its own: the request timed out, or it
  // arrived too early. Retrying as-is is the documented remedy for both.
  if (status === 408) return { code: "TIMEOUT", retryable: true }
  if (status === 425) return { code: "SERVER_ERROR", retryable: true }
  if (status >= 500) return { code: "SERVER_ERROR", retryable: true }
  if (status === 401 || status === 403) return { code: "AUTH_FAILED", retryable: false }
  return { code: "BAD_REQUEST", retryable: false }
}

/** Login response — same shape from both hub and cloud */
export type LoginResponse = {
  token: string
  user_id: string
  clinic_id: string
  role: string
  provider_name?: string
  email?: string
}

/** QR code discriminated union */
export type HubQRData = { type: "sync_hub"; url: string; id: string; pk: string } // id: unique identifier for the sync hub, and pk: the public key
export type CloudQRData = { type: "cloud"; url: string }
export type QRData = HubQRData | CloudQRData

/** Hub handshake response */
export type HandshakeResponse = {
  hub_public_key: string // base64url
  hub_id: string
  hub_name: string
  success: boolean
}
