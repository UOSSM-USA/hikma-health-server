import db from "@/db";
import EventLog from "@/models/event-logs";
import { Logger } from "@hikmahealth/js-utils";

export type ManualSyncAuditArgs = {
  userId: string;
  direction: "pull" | "push";
  peerType: string;
  since: number;
  snapshotTs: number;
  counts: Record<string, number>;
  /**
   * Per-table accepted/rejected breakdown, where the operation has one. A push
   * knows both halves; a paged pull knows only what it delivered.
   */
  byTable?: Record<string, { accepted: number; rejected: number }>;
  outcome: "started" | "completed" | "failed";
  error?: string;
};

// The shared db is typed from the codegen'd schema, while logEvent declares its
// own event_logs shape. Kysely's generic is invariant, so the structurally
// equivalent types need a cast at the boundary.
type EventLogDatabase = Parameters<typeof EventLog.logEvent>[0];

/**
 * Record one manual-sync operation in the server's audit log.
 *
 * A bulk PHI transfer needs a durable record of what moved, to whom and on
 * whose instruction (§164.312(b)). The device-side journal cannot serve that
 * purpose — it dies with the device.
 *
 * `action_type` is EXPORT in both directions because the enum has no IMPORT and
 * widening it would need a migration; the direction lives in metadata.
 *
 * `changes` is left empty deliberately. It is the only payload column in the
 * integrity hash, and the verification job recomputes it from the *jsonb*
 * rendering of the column — which re-spaces anything non-empty and so would
 * never match the hash computed here from `JSON.stringify`. `{}` renders
 * identically on both sides. What the sync actually did lives in metadata,
 * which is outside the hash.
 *
 * `ipAddress` is null because the tRPC context carries only the Authorization
 * header — no request, no headers.
 *
 * This never throws. An audit write that failed must not also fail the sync the
 * user asked for; a missing row against a present "started" row is itself the
 * signal that something went wrong.
 */
export async function recordManualSyncAudit(
  args: ManualSyncAuditArgs,
): Promise<void> {
  try {
    await EventLog.logEvent(
      db as unknown as EventLogDatabase,
      {
        actionType: "EXPORT",
        tableName: "*",
        rowId: "*",
        changes: {},
        userId: args.userId,
        metadata: {
          feature: "manual_sync",
          direction: args.direction,
          peer_type: args.peerType,
          since: args.since,
          snapshot_ts: args.snapshotTs,
          counts: args.counts,
          ...(args.byTable ? { by_table: args.byTable } : {}),
          outcome: args.outcome,
          ...(args.error ? { error: args.error } : {}),
        },
      },
      {
        ipAddress: null,
        deviceId: args.peerType,
        appId: "manual_sync",
      },
    );
  } catch (error) {
    Logger.error({ msg: "[sync-audit] failed to record manual sync", error });
  }
}
