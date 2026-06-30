import { Model } from "@nozbe/watermelondb"
import PeerAppModel from "@/models/Peer"
import { field, text, date, readonly, json } from "@nozbe/watermelondb/decorators"

const sanitizeMetadata = (raw: unknown): PeerAppModel.PeerMetadata => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PeerAppModel.PeerMetadata
  }
  return {}
}

export default class Peer extends Model {
  static table = "peers"

  /** Stable identity — survives IP changes */
  @text("peer_id") peerId!: string

  @text("name") name!: string

  /** Ephemeral — may change on router reassignment */
  @text("ip_address") ipAddress!: string | null

  @field("port") port!: number | null

  /** Used for encryption and identity verification */
  @text("public_key") publicKey!: string

  @field("last_synced_at") lastSyncedAt!: number | null
  @text("peer_type") peerType!: PeerAppModel.PeerType
  @field("is_leader") isLeader!: boolean
  @text("status") status!: PeerAppModel.PeerStatus
  @text("protocol_version") protocolVersion!: string
  @json("metadata", sanitizeMetadata) metadata!: PeerAppModel.PeerMetadata

  @readonly @date("created_at") createdAt!: Date
  @readonly @date("updated_at") updatedAt!: Date
}
