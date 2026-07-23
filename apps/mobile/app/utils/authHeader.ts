import { Buffer } from "buffer"
import * as SecureStore from "expo-secure-store"

/**
 * Authorization header for provider-authenticated requests, or null when no
 * credential is stored. Basic is only a fallback: the server validates it with a
 * bcrypt compare and a new token row per request, where Bearer is one indexed lookup.
 */
export const getProviderAuthHeader = async (): Promise<string | null> => {
  const [token, email, password] = await Promise.all([
    SecureStore.getItemAsync("provider_token"),
    SecureStore.getItemAsync("provider_email"),
    SecureStore.getItemAsync("provider_password"),
  ])

  if (token) return `Bearer ${token}`
  if (email && password) {
    return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`
  }
  return null
}
