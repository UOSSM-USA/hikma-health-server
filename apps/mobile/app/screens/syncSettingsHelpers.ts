/**
 * Pure display helpers for converting Peer.T to UI display shapes.
 * Extracted for testability — no React Native imports.
 */
import Peer from "@/models/Peer"

/** UI display type for the server list */
export type DisplayServerType = "local" | "cloud"

export type ServerDisplay = {
  id: string
  type: DisplayServerType
  url: string
  isActive: boolean
  lastSyncedAt: number | null
}

/**
 * Maps PeerType to the display type used in the UI.
 */
export const peerTypeToDisplayType = (peerType: Peer.PeerType): DisplayServerType => {
  switch (peerType) {
    case "sync_hub":
      return "local"
    case "cloud_server":
      return "cloud"
    default:
      return "cloud"
  }
}

/**
 * Extract a display URL from a Peer.T record.
 * Checks metadata.url first (used by both cloud and hub peers),
 * then falls back to ipAddress/port.
 */
export const peerDisplayUrl = (peer: Peer.T): string => {
  if (peer.metadata?.url) {
    return String(peer.metadata.url)
  }
  if (peer.ipAddress) {
    return peer.port ? `${peer.ipAddress}:${peer.port}` : peer.ipAddress
  }
  return ""
}

/**
 * Convert a Peer.T to the ServerDisplay shape the UI components expect.
 * `isActive` only reflects whether the peer's status is "active" —
 * use `markSyncTarget` to determine which peer is the actual sync target.
 */
export const peerToServerDisplay = (peer: Peer.T): ServerDisplay => ({
  id: peer.id,
  type: peerTypeToDisplayType(peer.peerType),
  url: peerDisplayUrl(peer),
  isActive: peer.status === "active",
  lastSyncedAt: peer.lastSyncedAt,
})

/**
 * Given a list of server displays, mark only the one the sync service
 * would actually pick as the sync target.
 *
 * When `activeSyncPeerId` is provided (user has explicitly chosen a peer),
 * that peer is marked as the target. Otherwise falls back to the default
 * priority: active hub first, then active cloud.
 */
// export const markSyncTarget = (
//   servers: ServerDisplay[],
// ): ServerDisplay[] => {
//     const activeHub = servers.find((s) => s.type === "local" && s.isActive)
//     targetId = activeHub?.id ?? servers.find((s) => s.type === "cloud" && s.isActive)?.id

//   return servers.map((s) => ({
//     ...s,
//     isActive: s.id === targetId,
//   }))
// }

export const getServerDisplayName = (type: DisplayServerType): string => {
  switch (type) {
    case "local":
      return "Local Server"
    case "cloud":
      return "Cloud Server"
    default:
      return "Unknown Server"
  }
}

// ── Manual sync ranges ────────────────────────────────────────────────

export type SyncRangeId = "24h" | "3d" | "7d" | "14d" | "30d" | "3mo" | "everything" | "custom"

export const SYNC_RANGES: { id: SyncRangeId; label: string; days: number | null }[] = [
  { id: "24h", label: "Last 24 hours", days: 1 },
  { id: "3d", label: "Last 3 days", days: 3 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "3mo", label: "Last 3 months", days: 90 },
  { id: "everything", label: "Everything", days: null },
]

/**
 * Days to count back from now, or null for no lower bound.
 *
 * Counting whole days back rather than parsing a typed date removes two live
 * bugs in what this replaces: the local-vs-UTC round trip between the old
 * formatter and parser, and the old parser returning 0 — "transfer the entire
 * database" — for anything it could not read, while the confirmation dialog
 * quoted the typo back to the user as though it had been understood.
 *
 * Every failure throws. Nothing here may widen the range on bad input.
 */
export function rangeToSinceDays(id: string, customDays?: number): number | null {
  if (id === "custom") {
    // Number.isInteger is false for NaN and Infinity, which is how an
    // unparseable text field actually arrives.
    if (customDays === undefined || !Number.isInteger(customDays) || customDays <= 0) {
      throw new Error("Enter a whole number of days greater than zero")
    }
    return customDays
  }

  const preset = SYNC_RANGES.find((r) => r.id === id)
  if (!preset) throw new Error(`Unknown sync range: ${id}`)
  return preset.days
}
