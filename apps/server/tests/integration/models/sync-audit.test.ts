import { describe, it, expect, vi, beforeAll } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import { recordManualSyncAudit } from "@/models/sync-audit";

// event_logs is append-only — a BEFORE DELETE trigger raises on any delete — so
// these rows outlive the run by design. Each test uses its own user id so it
// only ever sees its own row.
const userId = uuidV1();

const args = {
  userId,
  direction: "pull" as const,
  peerType: "android",
  since: 1_700_000_000_000,
  snapshotTs: 1_800_000_000_000,
  counts: { patients: 12, events: 3 },
  outcome: "completed" as const,
};

const rowsForUser = async (id: string) =>
  await testDb
    .selectFrom("event_logs")
    .where("user_id", "=", id)
    .selectAll()
    .execute();

beforeAll(async () => {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(testDb);
  await recordManualSyncAudit(args);
});

describe("recordManualSyncAudit against a real database", () => {
  it("writes exactly one row for the operation", async () => {
    const rows = await rowsForUser(userId);
    expect(rows).toHaveLength(1);
  });

  it("records the transfer as an EXPORT carrying the sync detail in metadata", async () => {
    const [row] = await rowsForUser(userId);
    expect(row.action_type).toBe("EXPORT");
    expect(row.app_id).toBe("manual_sync");
    const metadata = row.metadata as any;
    expect(metadata.feature).toBe("manual_sync");
    expect(metadata.direction).toBe("pull");
    expect(metadata.counts).toEqual({ patients: 12, events: 3 });
    expect(metadata.outcome).toBe("completed");
  });

  /**
   * The weekly verification job recomputes every row's hash in SQL and flags a
   * mismatch as tampering. An audit row that cannot reproduce its own hash is
   * worse than no row at all — it reads as evidence of tampering forever. The
   * digest below is the job's expression from `EventLog.verifyHashes`, scoped to
   * the one row so the assertion neither mutates nor depends on other rows.
   */
  it("writes a hash the verification job can reproduce", async () => {
    const [row] = await rowsForUser(userId);
    const result = await sql<{ computed_hash: string }>`
      SELECT
        encode(
          digest(
            concat_ws('|',
              id::text,
              transaction_id::text,
              action_type,
              table_name,
              row_id,
              changes::text,
              device_id,
              app_id,
              user_id,
              COALESCE(ip_address::text, ''),
              (extract(epoch from created_at) * 1000)::bigint::text
            ),
            'sha256'
          ),
          'hex'
        ) AS computed_hash
      FROM event_logs
      WHERE id = ${row.id}
    `.execute(testDb);

    expect(result.rows[0]?.computed_hash).toBe(row.hash);
  });

  it("still writes a row when the sync itself failed", async () => {
    const failedUserId = uuidV1();
    await recordManualSyncAudit({
      ...args,
      userId: failedUserId,
      outcome: "failed",
      error: "cursor expired",
    });

    const [row] = await rowsForUser(failedUserId);
    expect(row).toBeDefined();
    expect((row.metadata as any).outcome).toBe("failed");
    expect((row.metadata as any).error).toBe("cursor expired");
  });
});
