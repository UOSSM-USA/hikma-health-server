//! Persistence of an event's diagnoses onto the patient's problem list.
//!
//! [`crate::problems`] decides what belongs on the chart; this module reads the
//! rows that decision needs and writes the rows it implies. It mirrors
//! `apps/server/src/models/event-problems.ts`.
//!
//! Both entry points read the stored `events` row rather than a caller-supplied
//! copy, so an upsert that leaves a column untouched cannot put the chart out of
//! step with what was persisted.

use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use serde_json::Value;

use crate::problems::{self, Problem, RecordedProblem};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

/// What a reconciliation changed on the chart.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Reconciliation {
    pub created: usize,
    pub retired: usize,
}

/// Metadata key naming the event that put a problem on the chart. The mobile
/// app and the cloud server write the same key.
const EVENT_ID_METADATA_KEY: &str = "eventId";

/// An `events` row, narrowed to what the projection and the chart rows need.
/// Every column here is nullable in the schema.
struct StoredEvent {
    patient_id: Option<String>,
    form_id: Option<String>,
    visit_id: Option<String>,
    recorded_by_user_id: Option<String>,
    form_data: String,
}

/// Reads a JSON text column. A column that does not parse contributes nothing
/// rather than failing the save the clinician just made.
fn parse_json(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or(Value::Null)
}

/// A nullable column's value, treating the empty string as absent — the clients
/// send `""` for an unset id, and the cloud's uuid columns reject it.
fn present(value: Option<&String>) -> Option<&str> {
    value.map(String::as_str).filter(|v| !v.is_empty())
}

fn stored_event(conn: &Connection, event_id: &str) -> Result<Option<StoredEvent>> {
    let stored = conn
        .query_row(
            "SELECT patient_id, form_id, visit_id, recorded_by_user_id, form_data
             FROM events WHERE id = ?1",
            params![event_id],
            |row| {
                Ok(StoredEvent {
                    patient_id: row.get(0)?,
                    form_id: row.get(1)?,
                    visit_id: row.get(2)?,
                    recorded_by_user_id: row.get(3)?,
                    form_data: row.get(4)?,
                })
            },
        )
        .optional()?;

    Ok(stored)
}

/// The authored fields of an event form, or `Value::Null` when the hub has no
/// such form — which the projection reads as "records nothing", so a form that
/// has not synced yet cannot clear a chart.
///
/// Soft-deleted forms are read like any other: their fields still describe the
/// events already recorded against them.
fn form_fields(conn: &Connection, form_id: &str) -> Result<Value> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT form_fields FROM event_forms WHERE id = ?1",
            params![form_id],
            |row| row.get(0),
        )
        .optional()?;

    Ok(stored.as_deref().map(parse_json).unwrap_or(Value::Null))
}

/// The problems an event's stored `form_data` calls for, given its form.
fn projected(conn: &Connection, event: &StoredEvent) -> Result<problems::Projection> {
    let Some(form_id) = present(event.form_id.as_ref()) else {
        return Ok(problems::Projection {
            records_problems: false,
            problems: Vec::new(),
        });
    };

    let fields = form_fields(conn, form_id)?;
    Ok(problems::problems_from_form_data(
        &parse_json(&event.form_data),
        &fields,
    ))
}

/// The problems this event put on the chart that are still there.
///
/// Scoped by `patient_id`, which is indexed, then matched on the metadata key
/// in Rust — nothing else in the hub depends on SQLite's JSON functions.
fn recorded_by_event(
    conn: &Connection,
    patient_id: &str,
    event_id: &str,
) -> Result<Vec<RecordedProblem>> {
    let mut stmt = conn.prepare(
        "SELECT id, problem_code, problem_label, metadata
         FROM patient_problems
         WHERE patient_id = ?1 AND is_deleted = 0 AND local_server_deleted_at IS NULL",
    )?;

    let rows = stmt.query_map(params![patient_id], |row| {
        Ok((
            RecordedProblem {
                id: row.get(0)?,
                code: row.get(1)?,
                label: row.get(2)?,
            },
            row.get::<_, String>(3)?,
        ))
    })?;

    let mut recorded = Vec::new();
    for row in rows {
        let (problem, metadata) = row?;
        let owns_it = parse_json(&metadata)
            .get(EVENT_ID_METADATA_KEY)
            .and_then(Value::as_str)
            == Some(event_id);

        if owns_it {
            recorded.push(problem);
        }
    }

    Ok(recorded)
}

/// What the event stored under `event_id` asked to put on the chart. Empty for
/// an event the hub has never seen.
///
/// Must be read *before* a write overwrites `form_data`: a diagnosis this event
/// asked for once but that is no longer on the chart was taken off
/// deliberately, and saving again must not put it back.
pub fn previously_requested(conn: &Connection, event_id: &str) -> Result<Vec<Problem>> {
    let Some(event) = stored_event(conn, event_id)? else {
        return Ok(Vec::new());
    };

    Ok(projected(conn, &event)?.problems)
}

fn create(
    conn: &Connection,
    event: &StoredEvent,
    event_id: &str,
    patient_id: &str,
    problem: &Problem,
    now: i64,
) -> Result<()> {
    let row = problems::to_new_problem(problem);
    let metadata = Value::Object(
        [(
            EVENT_ID_METADATA_KEY.to_string(),
            Value::String(event_id.to_string()),
        )]
        .into_iter()
        .collect(),
    )
    .to_string();

    conn.execute(
        r#"INSERT INTO patient_problems (
            id, patient_id, visit_id,
            problem_code_system, problem_code, problem_label,
            clinical_status, verification_status,
            recorded_by_user_id, metadata, is_deleted,
            created_at, updated_at, last_modified, server_created_at,
            local_server_created_at, local_server_last_modified_at
        ) VALUES (
            ?1, ?2, ?3,
            ?4, ?5, ?6,
            ?7, ?8,
            ?9, ?10, 0,
            ?11, ?12, ?13, ?14,
            ?15, ?16
        )"#,
        params![
            uuid::Uuid::now_v7().to_string(),
            patient_id,
            present(event.visit_id.as_ref()),
            row.code_system,
            row.code,
            row.label,
            row.clinical_status,
            row.verification_status,
            present(event.recorded_by_user_id.as_ref()),
            metadata,
            now,
            now,
            now,
            now,
            now,
            now,
        ],
    )?;

    Ok(())
}

/// Takes problems off the chart with the soft delete the cloud push reads:
/// `local_server_deleted_at` is what puts a row in the deleted bucket.
fn retire(conn: &Connection, problem_ids: &[String], now: i64) -> Result<()> {
    for id in problem_ids {
        conn.execute(
            "UPDATE patient_problems
             SET is_deleted = 1, deleted_at = ?1, local_server_deleted_at = ?2
             WHERE id = ?3 AND is_deleted = 0",
            params![now, now, id],
        )?;
    }

    Ok(())
}

/// Bring the patient's problem list in line with the diagnoses on the stored
/// event, which the caller must already have written.
///
/// `already_requested` comes from [`previously_requested`], called ahead of that
/// write.
///
/// An unknown event, one with no patient, or a form with no field marked to
/// record all leave the chart untouched, so turning the flag off never erases
/// problems already recorded.
pub fn reconcile(
    conn: &Connection,
    event_id: &str,
    already_requested: &[Problem],
    now: i64,
) -> Result<Reconciliation> {
    let Some(event) = stored_event(conn, event_id)? else {
        return Ok(Reconciliation::default());
    };

    // `patient_problems.patient_id` is NOT NULL; an event with no patient has
    // no chart to write to.
    let Some(patient_id) = present(event.patient_id.as_ref()) else {
        return Ok(Reconciliation::default());
    };

    let projection = projected(conn, &event)?;
    if !projection.records_problems {
        return Ok(Reconciliation::default());
    }

    let existing = recorded_by_event(conn, patient_id, event_id)?;
    let diff = problems::diff_problems(&existing, &projection.problems, already_requested);

    for problem in &diff.to_create {
        create(conn, &event, event_id, patient_id, problem, now)?;
    }
    retire(conn, &diff.to_remove_ids, now)?;

    Ok(Reconciliation {
        created: diff.to_create.len(),
        retired: diff.to_remove_ids.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::setup_test_db;

    const PATIENT: &str = "p1";
    const EVENT: &str = "e1";
    const FORM: &str = "f1";

    const RECORDING_FIELDS: &str =
        r#"[{"id":"fld1","fieldType":"diagnosis","addToProblems":true}]"#;

    fn cholera_form_data() -> String {
        diagnoses(r#"{"code":"1A00","desc":"Cholera"}"#)
    }

    fn diagnoses(entries: &str) -> String {
        format!(r#"[{{"fieldId":"fld1","fieldType":"diagnosis","value":[{entries}]}}]"#)
    }

    fn insert_form(conn: &Connection, id: &str, form_fields: &str) {
        conn.execute(
            "INSERT INTO event_forms (
                id, name, description, language, is_editable, is_snapshot_form,
                form_fields, metadata, is_deleted, created_at, updated_at,
                local_server_created_at, local_server_last_modified_at
            ) VALUES (?1, 'Form', 'desc', 'en', 1, 0, ?2, '{}', 0, 1000, 1000, 1000, 1000)",
            params![id, form_fields],
        )
        .unwrap();
    }

    /// Writes the event row the reconciliation reads, replacing any earlier one.
    fn store_event(conn: &Connection, id: &str, form_data: &str) {
        store_event_for(conn, id, PATIENT, FORM, "v1", "u1", form_data);
    }

    fn store_event_for(
        conn: &Connection,
        id: &str,
        patient_id: &str,
        form_id: &str,
        visit_id: &str,
        recorded_by_user_id: &str,
        form_data: &str,
    ) {
        conn.execute(
            "INSERT INTO events (
                id, patient_id, form_id, visit_id, event_type, form_data, metadata,
                is_deleted, created_at, updated_at, recorded_by_user_id,
                local_server_created_at, local_server_last_modified_at
            ) VALUES (?1, ?2, ?3, ?4, 'form', ?5, '{}', 0, 1000, 1000, ?6, 1000, 1000)
            ON CONFLICT(id) DO UPDATE SET form_data = excluded.form_data",
            params![
                id,
                patient_id,
                form_id,
                visit_id,
                form_data,
                recorded_by_user_id
            ],
        )
        .unwrap();
    }

    /// Live problems on the chart, as `(code, label)`.
    fn chart(conn: &Connection) -> Vec<(String, String)> {
        let mut stmt = conn
            .prepare(
                "SELECT problem_code, problem_label FROM patient_problems
                 WHERE is_deleted = 0 ORDER BY problem_label",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    #[test]
    fn records_a_diagnosis_from_an_opted_in_field() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());

        let outcome = reconcile(&conn, EVENT, &[], 5000).unwrap();

        assert_eq!(
            outcome,
            Reconciliation {
                created: 1,
                retired: 0
            }
        );
        assert_eq!(chart(&conn), vec![("1A00".into(), "Cholera".into())]);
    }

    #[test]
    fn stores_the_values_both_clients_agreed_on() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());

        reconcile(&conn, EVENT, &[], 5000).unwrap();

        let (system, clinical, verification, metadata, visit, user): (
            String,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT problem_code_system, clinical_status, verification_status,
                        metadata, visit_id, recorded_by_user_id
                 FROM patient_problems",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(system, "icd11");
        assert_eq!(clinical, "active");
        assert_eq!(verification, "provisional");
        assert_eq!(metadata, r#"{"eventId":"e1"}"#);
        assert_eq!(visit.as_deref(), Some("v1"));
        assert_eq!(user.as_deref(), Some("u1"));
    }

    #[test]
    fn writes_null_rather_than_empty_ids() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event_for(&conn, EVENT, PATIENT, FORM, "", "", &cholera_form_data());

        reconcile(&conn, EVENT, &[], 5000).unwrap();

        let (visit, user): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT visit_id, recorded_by_user_id FROM patient_problems",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(visit, None);
        assert_eq!(user, None);
    }

    #[test]
    fn saving_the_same_event_twice_records_one_problem() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());

        reconcile(&conn, EVENT, &[], 5000).unwrap();
        let outcome = reconcile(&conn, EVENT, &[], 6000).unwrap();

        assert_eq!(outcome.created, 0);
        assert_eq!(chart(&conn).len(), 1);
    }

    #[test]
    fn retires_a_diagnosis_removed_from_the_event() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());
        reconcile(&conn, EVENT, &[], 5000).unwrap();

        store_event(&conn, EVENT, &diagnoses(""));
        let outcome = reconcile(&conn, EVENT, &[], 6000).unwrap();

        assert_eq!(outcome.retired, 1);
        assert_eq!(chart(&conn), vec![]);
    }

    // The cloud push reads its deleted bucket off `local_server_deleted_at`; a
    // retirement that leaves it null never reaches the chart on other devices.
    #[test]
    fn a_retired_problem_carries_the_columns_the_push_reads() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());
        reconcile(&conn, EVENT, &[], 5000).unwrap();

        store_event(&conn, EVENT, &diagnoses(""));
        reconcile(&conn, EVENT, &[], 6000).unwrap();

        let (is_deleted, deleted_at, local_deleted_at): (i64, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT is_deleted, deleted_at, local_server_deleted_at FROM patient_problems",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(is_deleted, 1);
        assert_eq!(deleted_at, Some(6000));
        assert_eq!(local_deleted_at, Some(6000));
    }

    // The failure mode that silently destroys chart data.
    #[test]
    fn turning_the_flag_off_does_not_erase_recorded_problems() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());
        reconcile(&conn, EVENT, &[], 5000).unwrap();

        conn.execute(
            "UPDATE event_forms SET form_fields = ?1 WHERE id = 'f1'",
            params![r#"[{"id":"fld1","fieldType":"diagnosis","addToProblems":false}]"#],
        )
        .unwrap();
        let outcome = reconcile(&conn, EVENT, &[], 6000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![("1A00".into(), "Cholera".into())]);
    }

    // A hub that has not pulled the form yet must not read "no opted-in fields"
    // as "remove everything".
    #[test]
    fn an_unsynced_form_leaves_the_chart_alone() {
        let conn = setup_test_db();
        store_event(&conn, EVENT, &cholera_form_data());

        let outcome = reconcile(&conn, EVENT, &[], 5000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![]);
    }

    #[test]
    fn an_unknown_event_leaves_the_chart_alone() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);

        let outcome = reconcile(&conn, "nope", &[], 5000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
    }

    // `patient_problems.patient_id` is NOT NULL, so there is no chart to write.
    #[test]
    fn an_event_without_a_patient_records_nothing() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event_for(&conn, EVENT, "", FORM, "v1", "u1", &cholera_form_data());

        let outcome = reconcile(&conn, EVENT, &[], 5000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![]);
    }

    #[test]
    fn does_not_recreate_a_problem_taken_off_the_chart_by_hand() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());
        reconcile(&conn, EVENT, &[], 5000).unwrap();

        conn.execute(
            "UPDATE patient_problems SET is_deleted = 1, deleted_at = 5500",
            [],
        )
        .unwrap();

        let requested = vec![Problem {
            code: "1A00".into(),
            label: "Cholera".into(),
        }];
        let outcome = reconcile(&conn, EVENT, &requested, 6000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![]);
    }

    #[test]
    fn leaves_another_events_problems_alone() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());
        reconcile(&conn, EVENT, &[], 5000).unwrap();

        store_event(&conn, "e2", &diagnoses(""));
        let outcome = reconcile(&conn, "e2", &[], 6000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![("1A00".into(), "Cholera".into())]);
    }

    #[test]
    fn tolerates_form_data_that_is_not_json() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, "not json at all");

        let outcome = reconcile(&conn, EVENT, &[], 5000).unwrap();

        assert_eq!(outcome, Reconciliation::default());
        assert_eq!(chart(&conn), vec![]);
    }

    #[test]
    fn previously_requested_is_empty_for_an_unknown_event() {
        let conn = setup_test_db();

        assert_eq!(previously_requested(&conn, "nope").unwrap(), vec![]);
    }

    #[test]
    fn previously_requested_reads_the_stored_events_diagnoses() {
        let conn = setup_test_db();
        insert_form(&conn, FORM, RECORDING_FIELDS);
        store_event(&conn, EVENT, &cholera_form_data());

        assert_eq!(
            previously_requested(&conn, EVENT).unwrap(),
            vec![Problem {
                code: "1A00".into(),
                label: "Cholera".into()
            }]
        );
    }

    #[test]
    fn previously_requested_ignores_a_field_that_opted_out() {
        let conn = setup_test_db();
        insert_form(
            &conn,
            FORM,
            r#"[{"id":"fld1","fieldType":"diagnosis","addToProblems":false}]"#,
        );
        store_event(&conn, EVENT, &cholera_form_data());

        assert_eq!(previously_requested(&conn, EVENT).unwrap(), vec![]);
    }
}
