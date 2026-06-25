// WatermelonDB-compatible sync: pull (query) and push (command).
//
// Extracted from the legacy REST handlers in lib.rs so that both
// REST and encrypted RPC share a single code path.

use rusqlite::Connection;
use serde::Deserialize;

use super::HandlerResult;

/// Tables a mobile client IS allowed to write via sync push (deny-by-default).
///
/// This is an **allowlist**: any table not listed here is silently ignored on
/// push, because everything else is server-authoritative (reference data, user
/// accounts, form definitions, clinic config). Mobile may only author its own
/// patient-care records.
///
/// Source of truth — keep in sync with the server's `ENTITIES_TO_PULL_FROM_MOBILE`
/// (`apps/server/src/models/sync.ts`), which defines the exact set the cloud
/// accepts from mobile. Enforcing it here too means one mobile device can't
/// poison reference data (clinics, drug_catalogue, …) for every other LAN peer
/// in the window before cloud sync would have rejected it.
const SYNC_PUSH_ALLOWED_TABLES: &[&str] = &[
    "patients",
    "patient_additional_attributes",
    "visits",
    "events",
    "appointments",
    "prescriptions",
    "patient_vitals",
    "patient_problems",
    "dispensing_records",
    "prescription_items",
];

/// Columns stripped from the pull changeset, per table.
///
/// These are secrets the hub must hold locally (e.g. `users.hashed_password`,
/// needed by `handle_login` to authenticate devices offline) but must NEVER be
/// shipped to mobile clients. Redacting here only affects the mobile-facing pull
/// — the hub-local `users` row and offline login are untouched. Mirrors the
/// authoritative server, which never sends `hashed_password` to clients
/// (`apps/server/src/models/user.ts` `secureMask`). Mobile's `users` schema has
/// no `hashed_password` column, so dropping it is invisible to mobile.
const SYNC_PULL_REDACTED_COLUMNS: &[(&str, &[&str])] = &[("users", &["hashed_password"])];

/// Returns the columns to strip from `table`'s pull changeset (empty if none).
fn redacted_pull_columns(table: &str) -> &'static [&'static str] {
    SYNC_PULL_REDACTED_COLUMNS
        .iter()
        .find(|(t, _)| *t == table)
        .map(|(_, cols)| *cols)
        .unwrap_or(&[])
}

// ============================================================================
// Payloads
// ============================================================================

/// Parameters for the `sync_pull` query.
/// Accepts either `last_pulled_at` or `lastPulledAt` (WatermelonDB convention).
#[derive(Debug, Deserialize)]
pub struct SyncPullParams {
    #[serde(default, alias = "lastPulledAt")]
    pub last_pulled_at: i64,
}

/// Payload for the `sync_push` command.
#[derive(Debug, Deserialize)]
pub struct SyncPushPayload {
    #[serde(default, alias = "lastPulledAt")]
    pub last_pulled_at: i64,
    pub changes: crate::SyncDatabaseChangeSet,
}

// ============================================================================
// Handlers
// ============================================================================

/// Gathers all changes across syncable tables since `last_pulled_at`.
///
/// Returns `{ "changes": { ... }, "timestamp": <now> }` matching the
/// WatermelonDB pull response shape.
pub fn handle_sync_pull(params: &SyncPullParams, conn: &Connection) -> HandlerResult {
    let last_pulled_at = params.last_pulled_at;
    println!("[sync_pull] last_pulled_at={last_pulled_at}");
    let mut changes = crate::SyncDatabaseChangeSet::new();

    for &table_name in crate::cloud_sync::SYNCABLE_TABLES {
        let mut columns = crate::sync_utils::get_data_columns(conn, table_name)?;
        // Strip secrets that must never leave the hub to mobile clients
        // (e.g. users.hashed_password). See SYNC_PULL_REDACTED_COLUMNS.
        let redacted = redacted_pull_columns(table_name);
        if !redacted.is_empty() {
            columns.retain(|c| !redacted.contains(&c.as_str()));
        }
        if columns.is_empty() {
            continue;
        }

        let col_list = columns
            .iter()
            .map(|c| format!("\"{c}\""))
            .collect::<Vec<_>>()
            .join(", ");

        let mut table_changes = crate::SyncTableChangeSet::new();

        // Created records (arrived after last pull)
        let sql_created = format!(
            "SELECT {col_list} FROM \"{table_name}\" \
             WHERE local_server_created_at > ?1 AND local_server_deleted_at IS NULL"
        );
        table_changes.created =
            crate::sync_utils::query_records(conn, &sql_created, last_pulled_at, &columns)?;

        // Updated records (modified after last pull but created before)
        let sql_updated = format!(
            "SELECT {col_list} FROM \"{table_name}\" \
             WHERE local_server_last_modified_at > ?1 \
             AND local_server_created_at <= ?1 AND local_server_deleted_at IS NULL"
        );
        table_changes.updated =
            crate::sync_utils::query_records(conn, &sql_updated, last_pulled_at, &columns)?;

        // Deleted record IDs
        let sql_deleted =
            format!("SELECT id FROM \"{table_name}\" WHERE local_server_deleted_at > ?1");
        if let Ok(mut stmt) = conn.prepare(&sql_deleted) {
            if let Ok(rows) = stmt.query_map([last_pulled_at], |row| row.get::<_, String>(0)) {
                table_changes.deleted = rows.filter_map(|r| r.ok()).collect();
            }
        }

        let (c, u, d) = (
            table_changes.created.len(),
            table_changes.updated.len(),
            table_changes.deleted.len(),
        );
        if c + u + d > 0 {
            println!("[sync_pull] {table_name} -> {c} created, {u} updated, {d} deleted");
        }
        changes.add_table_changes(table_name, table_changes);
    }

    Ok(serde_json::json!({
        "changes": changes,
        "timestamp": crate::timestamp(),
    }))
}

/// Applies client changes (upserts + soft-deletes) across all tables.
///
/// Returns `{}` on success — WatermelonDB ignores the push response body.
/// Only writes to client-authored tables (see `SYNC_PUSH_ALLOWED_TABLES`);
/// everything else (server-authoritative reference/config/account data) is
/// silently ignored.
pub fn handle_sync_push(payload: &SyncPushPayload, conn: &Connection) -> HandlerResult {
    let now = crate::timestamp();

    let allowed: std::collections::HashSet<&str> =
        SYNC_PUSH_ALLOWED_TABLES.iter().copied().collect();

    let mut total_upserts = 0usize;
    let mut total_deletes = 0usize;

    for (table, changeset) in payload.changes.iter() {
        if !allowed.contains(table.as_str()) {
            // Server-authoritative (or unknown) table — clients may not write it.
            println!("[sync_push] ignoring non-client-writable table '{table}'");
            continue;
        }

        let valid_columns = crate::sync_utils::get_all_columns(conn, table)?;
        if valid_columns.is_empty() {
            println!("[sync_push] WARN: skipping unknown table '{table}'");
            continue;
        }

        for record in changeset.created.iter().chain(changeset.updated.iter()) {
            crate::upsert_client_record(conn, table, record, &valid_columns, now)?;
            total_upserts += 1;
        }

        for id in &changeset.deleted {
            crate::soft_delete_client_record(conn, table, id, now)?;
            total_deletes += 1;
        }

        let (c, u, d) = (
            changeset.created.len(),
            changeset.updated.len(),
            changeset.deleted.len(),
        );
        if c + u + d > 0 {
            println!("[sync_push] {table} -> {} upserts, {d} deletes", c + u);
        }
    }

    println!("[sync_push] total: {total_upserts} upserts, {total_deletes} deletes");

    Ok(serde_json::json!({}))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::setup_test_db;
    use std::collections::HashMap;

    // -- sync_pull tests --

    #[test]
    fn pull_empty_database_returns_empty_changes() {
        let conn = setup_test_db();
        let params = SyncPullParams { last_pulled_at: 0 };
        let result = handle_sync_pull(&params, &conn).unwrap();
        assert!(result.get("timestamp").is_some());
        assert!(result["timestamp"].as_i64().unwrap() > 0);
    }

    #[test]
    fn pull_returns_created_records_after_timestamp() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO clinics (id, name, created_at, updated_at, is_deleted, is_archived, \
             attributes, metadata, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('c1', 'Test Clinic', 1000, 2000, 0, 0, '[]', '{}', 5000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: 3000,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();
        let clinics = &result["changes"]["clinics"];
        assert_eq!(clinics["created"].as_array().unwrap().len(), 1);
        assert_eq!(clinics["updated"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn pull_redacts_hashed_password_from_users() {
        let conn = setup_test_db();
        // One user created after the cursor, one updated after the cursor —
        // covers both the `created` and `updated` branches of the pull.
        conn.execute(
            "INSERT INTO users (id, clinic_id, name, role, email, hashed_password, \
             created_at, updated_at, is_deleted, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('u-new', 'c1', 'Dr New', 'provider', 'new@example.com', \
             '$2b$12$secretbcrypthashvalueAAAAAAAAAAAAAAAAAAAAAAAAAAAA', \
             1000, 2000, 0, 5000, 5000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, clinic_id, name, role, email, hashed_password, \
             created_at, updated_at, is_deleted, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('u-upd', 'c1', 'Dr Upd', 'provider', 'upd@example.com', \
             '$2b$12$anothersecretbcrypthashBBBBBBBBBBBBBBBBBBBBBBBBBBBB', \
             1000, 2000, 0, 1000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: 3000,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();

        let created = result["changes"]["users"]["created"].as_array().unwrap();
        let updated = result["changes"]["users"]["updated"].as_array().unwrap();
        assert_eq!(created.len(), 1, "expected one created user");
        assert_eq!(updated.len(), 1, "expected one updated user");

        for (label, user) in [("created", &created[0]), ("updated", &updated[0])] {
            // Secret must never reach the client...
            assert!(
                user.get("hashed_password").is_none(),
                "hashed_password leaked to client in {label} record: {user}"
            );
            // ...but non-secret fields the mobile app needs are preserved.
            assert!(user.get("email").is_some(), "email missing in {label} record");
            assert!(user.get("name").is_some(), "name missing in {label} record");
            assert!(user.get("role").is_some(), "role missing in {label} record");
        }
    }

    #[test]
    fn pull_returns_updated_records_correctly() {
        let conn = setup_test_db();
        // created_at=1000 (before timestamp), but modified_at=5000 (after)
        conn.execute(
            "INSERT INTO clinics (id, name, created_at, updated_at, is_deleted, is_archived, \
             attributes, metadata, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('c2', 'Updated Clinic', 1000, 2000, 0, 0, '[]', '{}', 1000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: 3000,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();
        let clinics = &result["changes"]["clinics"];
        assert_eq!(clinics["created"].as_array().unwrap().len(), 0);
        assert_eq!(clinics["updated"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn pull_returns_deleted_ids() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO clinics (id, name, created_at, updated_at, is_deleted, is_archived, \
             attributes, metadata, \
             local_server_created_at, local_server_last_modified_at, local_server_deleted_at) \
             VALUES ('c-del', 'Gone', 1000, 2000, 0, 0, '[]', '{}', 1000, 1000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: 3000,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();
        let deleted = result["changes"]["clinics"]["deleted"].as_array().unwrap();
        assert!(deleted.contains(&serde_json::json!("c-del")));
    }

    #[test]
    fn pull_excludes_soft_deleted_from_created_and_updated() {
        let conn = setup_test_db();
        // Record was created AND deleted after the timestamp — should appear
        // only in deleted, not in created
        conn.execute(
            "INSERT INTO clinics (id, name, created_at, updated_at, is_deleted, is_archived, \
             attributes, metadata, \
             local_server_created_at, local_server_last_modified_at, local_server_deleted_at) \
             VALUES ('c-ghost', 'Deleted', 1000, 2000, 0, 0, '[]', '{}', 5000, 5000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: 3000,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();
        let clinics = &result["changes"]["clinics"];
        assert_eq!(clinics["created"].as_array().unwrap().len(), 0);
        assert!(clinics["deleted"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("c-ghost")));
    }

    // -- sync_push tests --

    #[test]
    fn push_upserts_records() {
        // Positive case: a client-authored (allowlisted) table writes through.
        let conn = setup_test_db();
        let mut data = HashMap::new();
        data.insert("patient_id".to_string(), serde_json::json!("p1"));
        data.insert("metadata".to_string(), serde_json::json!("{\"a\":1}"));
        data.insert("is_deleted".to_string(), serde_json::json!(0));

        let mut changes = crate::SyncDatabaseChangeSet::new();
        changes.add_table_changes(
            "visits",
            crate::SyncTableChangeSet {
                created: vec![crate::RawRecord {
                    id: "push-v1".to_string(),
                    created_at: 1000,
                    updated_at: 2000,
                    data,
                }],
                updated: vec![],
                deleted: vec![],
            },
        );

        let payload = SyncPushPayload {
            last_pulled_at: 0,
            changes,
        };
        let result = handle_sync_push(&payload, &conn).unwrap();
        assert_eq!(result, serde_json::json!({}));

        let patient_id: String = conn
            .query_row(
                "SELECT patient_id FROM visits WHERE id = 'push-v1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(patient_id, "p1");
    }

    #[test]
    fn push_ignores_protected_tables() {
        // Every server-authoritative table mobile might push must be dropped.
        // `clinic_departments` is the one the old narrow denylist let through.
        const PROTECTED: &[&str] = &[
            "users",
            "clinics",
            "drug_catalogue",
            "clinic_inventory",
            "clinic_departments",
            "registration_forms",
            "event_forms",
        ];

        for &table in PROTECTED {
            assert!(
                !SYNC_PUSH_ALLOWED_TABLES.contains(&table),
                "{table} must not be in the push allowlist"
            );

            let conn = setup_test_db();
            let mut changes = crate::SyncDatabaseChangeSet::new();
            changes.add_table_changes(
                table,
                crate::SyncTableChangeSet {
                    created: vec![crate::RawRecord {
                        id: "should-not-exist".to_string(),
                        created_at: 1000,
                        updated_at: 2000,
                        data: HashMap::new(),
                    }],
                    updated: vec![],
                    deleted: vec![],
                },
            );

            let payload = SyncPushPayload {
                last_pulled_at: 0,
                changes,
            };
            handle_sync_push(&payload, &conn).unwrap();

            let count: i64 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM \"{table}\" WHERE id = 'should-not-exist'"),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "{table} push was not ignored");
        }
    }

    #[test]
    fn push_soft_deletes_records() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO visits (id, patient_id, metadata, created_at, updated_at, is_deleted, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('del-me', 'p1', '{}', 1000, 2000, 0, 1000, 1000)",
            [],
        )
        .unwrap();

        let mut changes = crate::SyncDatabaseChangeSet::new();
        changes.add_table_changes(
            "visits",
            crate::SyncTableChangeSet {
                created: vec![],
                updated: vec![],
                deleted: vec!["del-me".to_string()],
            },
        );

        let payload = SyncPushPayload {
            last_pulled_at: 0,
            changes,
        };
        handle_sync_push(&payload, &conn).unwrap();

        let deleted_at: Option<i64> = conn
            .query_row(
                "SELECT local_server_deleted_at FROM visits WHERE id = 'del-me'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some());
    }

    #[test]
    fn push_unknown_table_is_silently_skipped() {
        let conn = setup_test_db();
        let mut changes = crate::SyncDatabaseChangeSet::new();
        changes.add_table_changes(
            "nonexistent_table_xyz",
            crate::SyncTableChangeSet {
                created: vec![crate::RawRecord {
                    id: "ghost".to_string(),
                    created_at: 1000,
                    updated_at: 2000,
                    data: HashMap::new(),
                }],
                updated: vec![],
                deleted: vec![],
            },
        );

        let payload = SyncPushPayload {
            last_pulled_at: 0,
            changes,
        };
        let result = handle_sync_push(&payload, &conn).unwrap();
        assert_eq!(result, serde_json::json!({}));
    }

    // -- Adversarial tests --

    #[test]
    fn push_sql_injection_in_table_name_is_safe() {
        let conn = setup_test_db();
        let mut changes = crate::SyncDatabaseChangeSet::new();
        changes.add_table_changes(
            "clinics; DROP TABLE patients; --",
            crate::SyncTableChangeSet {
                created: vec![crate::RawRecord {
                    id: "x".to_string(),
                    created_at: 1000,
                    updated_at: 2000,
                    data: HashMap::new(),
                }],
                updated: vec![],
                deleted: vec![],
            },
        );

        let payload = SyncPushPayload {
            last_pulled_at: 0,
            changes,
        };
        // Should not panic or drop tables
        let _ = handle_sync_push(&payload, &conn);

        // patients table still exists and is accessible
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn pull_with_negative_timestamp() {
        let conn = setup_test_db();
        let params = SyncPullParams { last_pulled_at: -1 };
        let result = handle_sync_pull(&params, &conn).unwrap();
        assert!(result.get("timestamp").is_some());
    }

    #[test]
    fn pull_with_far_future_timestamp_returns_empty() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO clinics (id, name, created_at, updated_at, is_deleted, is_archived, \
             attributes, metadata, \
             local_server_created_at, local_server_last_modified_at) \
             VALUES ('c1', 'Test', 1000, 2000, 0, 0, '[]', '{}', 5000, 5000)",
            [],
        )
        .unwrap();

        let params = SyncPullParams {
            last_pulled_at: i64::MAX - 1,
        };
        let result = handle_sync_pull(&params, &conn).unwrap();
        let changes = &result["changes"];
        // No tables should have any records matching a far-future timestamp
        let empty = vec![];
        if let Some(obj) = changes.as_object() {
            for (_, table_changes) in obj {
                let created = table_changes["created"].as_array().unwrap_or(&empty);
                let updated = table_changes["updated"].as_array().unwrap_or(&empty);
                assert!(created.is_empty());
                assert!(updated.is_empty());
            }
        }
    }

    #[test]
    fn pull_params_accepts_camel_case_alias() {
        let json = serde_json::json!({ "lastPulledAt": 42000 });
        let params: SyncPullParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.last_pulled_at, 42000);
    }

    #[test]
    fn pull_params_defaults_to_zero_when_missing() {
        let json = serde_json::json!({});
        let params: SyncPullParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.last_pulled_at, 0);
    }

    #[test]
    fn push_payload_accepts_camel_case_alias() {
        let json = serde_json::json!({
            "lastPulledAt": 42000,
            "changes": {}
        });
        let payload: SyncPushPayload = serde_json::from_value(json).unwrap();
        assert_eq!(payload.last_pulled_at, 42000);
    }

    #[test]
    fn push_empty_changeset_is_noop() {
        let conn = setup_test_db();
        let payload = SyncPushPayload {
            last_pulled_at: 0,
            changes: crate::SyncDatabaseChangeSet::new(),
        };
        let result = handle_sync_push(&payload, &conn).unwrap();
        assert_eq!(result, serde_json::json!({}));
    }

    // -- Property-based tests --

    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(20))]

        /// Push N client-authored records then pull — all should appear as created.
        #[test]
        fn push_then_pull_roundtrip(n_records in 1usize..=5) {
            let conn = setup_test_db();
            let before_push = crate::timestamp();

            let records: Vec<crate::RawRecord> = (0..n_records)
                .map(|i| {
                    let mut data = HashMap::new();
                    data.insert("patient_id".to_string(), serde_json::json!(format!("p{i}")));
                    data.insert("metadata".to_string(), serde_json::json!("{}"));
                    data.insert("is_deleted".to_string(), serde_json::json!(0));
                    crate::RawRecord {
                        id: format!("roundtrip-{i}"),
                        created_at: 1000,
                        updated_at: 2000,
                        data,
                    }
                })
                .collect();

            let mut changes = crate::SyncDatabaseChangeSet::new();
            changes.add_table_changes(
                "visits",
                crate::SyncTableChangeSet {
                    created: records,
                    updated: vec![],
                    deleted: vec![],
                },
            );

            let push_payload = SyncPushPayload {
                last_pulled_at: 0,
                changes,
            };
            handle_sync_push(&push_payload, &conn).unwrap();

            // Pull with timestamp just before the push
            let pull_params = SyncPullParams {
                last_pulled_at: before_push - 1,
            };
            let result = handle_sync_pull(&pull_params, &conn).unwrap();
            let created = result["changes"]["visits"]["created"]
                .as_array()
                .unwrap();
            prop_assert_eq!(created.len(), n_records);
        }

        /// Server-authoritative tables are never written by sync push.
        /// Includes `clinic_departments`, `drug_catalogue`, `clinic_inventory`,
        /// `clinics` — tables mobile pushes but must not be allowed to author
        /// (the gap the old narrow denylist left open).
        #[test]
        fn ignored_tables_never_written(table_idx in 0usize..7) {
            // Server-authoritative tables that exist in the test DB schema.
            const SERVER_AUTHORITATIVE: &[&str] = &[
                "users",
                "clinics",
                "drug_catalogue",
                "clinic_inventory",
                "clinic_departments",
                "registration_forms",
                "event_forms",
            ];
            let table = SERVER_AUTHORITATIVE[table_idx];
            // None of these may be in the push allowlist.
            prop_assert!(!SYNC_PUSH_ALLOWED_TABLES.contains(&table));
            let conn = setup_test_db();

            let mut changes = crate::SyncDatabaseChangeSet::new();
            changes.add_table_changes(
                table,
                crate::SyncTableChangeSet {
                    created: vec![crate::RawRecord {
                        id: "should-not-exist".to_string(),
                        created_at: 1000,
                        updated_at: 2000,
                        data: HashMap::new(),
                    }],
                    updated: vec![],
                    deleted: vec![],
                },
            );

            let payload = SyncPushPayload {
                last_pulled_at: 0,
                changes,
            };
            handle_sync_push(&payload, &conn).unwrap();

            let count: i64 = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM \"{table}\" WHERE id = 'should-not-exist'"
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            prop_assert_eq!(count, 0);
        }

        /// Returned pull timestamp is always >= the input timestamp.
        #[test]
        fn pull_timestamp_monotonic(last_pulled_at in 0i64..100_000_000) {
            let conn = setup_test_db();
            let params = SyncPullParams { last_pulled_at };
            let result = handle_sync_pull(&params, &conn).unwrap();
            let ts = result["timestamp"].as_i64().unwrap();
            prop_assert!(ts >= last_pulled_at);
        }
    }
}
