// Visit, event, and vitals domain: CRUD for visits, events, and patient vitals.

use rusqlite::Connection;
use serde::Deserialize;

use super::serde_flexible::{
    double_option, flexible_opt_timestamp, flexible_timestamp, stringify_json,
};
use super::{now_millis, HandlerResult};

// ============================================================================
// Payloads
// ============================================================================

/// Create an event for a patient within a visit.
#[derive(Debug, Deserialize)]
pub struct CreateEventCommand {
    pub id: String,
    pub patient_id: String,
    pub form_id: String,
    pub visit_id: String,
    pub event_type: String,
    #[serde(deserialize_with = "stringify_json")]
    pub form_data: String, // JSON text
    #[serde(deserialize_with = "stringify_json")]
    pub metadata: String, // JSON text
    #[serde(deserialize_with = "flexible_timestamp")]
    pub created_at: i64,
    #[serde(deserialize_with = "flexible_timestamp")]
    pub updated_at: i64,
    pub recorded_by_user_id: String,
}

/// Get visits for a given patient.
#[derive(Debug, Deserialize)]
pub struct GetVisitsQuery {
    pub patient_id: String,
}

/// Get events for a given patient + visit.
#[derive(Debug, Deserialize)]
pub struct GetVisitEventsQuery {
    pub patient_id: String,
    pub visit_id: String,
}

/// Update an existing visit.
#[derive(Debug, Deserialize)]
pub struct UpdateVisitCommand {
    pub id: String,
    pub provider_id: Option<String>,
    pub provider_name: Option<String>,
    #[serde(default, deserialize_with = "flexible_opt_timestamp")]
    pub check_in_timestamp: Option<i64>,
    pub metadata: Option<String>,
    pub clinic_id: Option<String>,
    #[serde(default, deserialize_with = "flexible_opt_timestamp")]
    pub updated_at: Option<i64>,
}

/// Update an existing vitals record.
///
/// Measurements are `Option<Option<_>>` (see `double_option`): the client omits
/// a field it isn't changing and sends `null` to clear a reading. Collapsing
/// those to one `None` would silently drop the clear, leaving a reading the
/// clinician believes they deleted — and diverging from the central server,
/// which does honour an explicit null.
#[derive(Debug, Deserialize)]
pub struct UpdateVitalsCommand {
    pub id: String,
    #[serde(default, deserialize_with = "double_option")]
    pub systolic_bp: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub diastolic_bp: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub bp_position: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub height_cm: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub weight_kg: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub bmi: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub waist_circumference_cm: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub heart_rate: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub pulse_rate: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub oxygen_saturation: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub respiratory_rate: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub temperature_celsius: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub pain_level: Option<Option<f64>>,
    // Not double-optioned: the mobile update payload never carries metadata, so
    // there is no clear-vs-absent case to distinguish yet. An explicit null here
    // is still ignored rather than clearing — unlike the central server.
    pub metadata: Option<String>,
    #[serde(default, deserialize_with = "flexible_opt_timestamp")]
    pub updated_at: Option<i64>,
}

/// Record a new vitals entry for a patient.
#[derive(Debug, Deserialize)]
pub struct CreateVitalsCommand {
    /// Supplying this on a retry makes the insert idempotent; absent, the hub
    /// generates one.
    pub id: Option<String>,
    pub patient_id: String,
    pub visit_id: Option<String>,
    #[serde(deserialize_with = "flexible_timestamp")]
    pub timestamp: i64,
    pub systolic_bp: Option<f64>,
    pub diastolic_bp: Option<f64>,
    pub bp_position: Option<String>,
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub bmi: Option<f64>,
    pub waist_circumference_cm: Option<f64>,
    pub heart_rate: Option<f64>,
    pub pulse_rate: Option<f64>,
    pub oxygen_saturation: Option<f64>,
    pub respiratory_rate: Option<f64>,
    pub temperature_celsius: Option<f64>,
    pub pain_level: Option<f64>,
    pub recorded_by_user_id: Option<String>,
    #[serde(deserialize_with = "stringify_json")]
    pub metadata: String, // JSON text
}

/// List a patient's vitals records.
#[derive(Debug, Deserialize)]
pub struct ListVitalsQuery {
    pub patient_id: String,
}

// ============================================================================
// Handlers
// ============================================================================

pub fn handle_create_event(payload: &CreateEventCommand, conn: &Connection) -> HandlerResult {
    let now = now_millis();

    conn.execute(
        r#"INSERT INTO events (
            id, patient_id, form_id, visit_id, event_type,
            form_data, metadata, is_deleted,
            created_at, updated_at, recorded_by_user_id,
            local_server_created_at, local_server_last_modified_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, 0,
            ?8, ?9, ?10,
            ?11, ?12
        )
        ON CONFLICT(id) DO UPDATE SET
            form_data = excluded.form_data,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at,
            local_server_last_modified_at = excluded.local_server_last_modified_at
        "#,
        rusqlite::params![
            payload.id,
            payload.patient_id,
            payload.form_id,
            payload.visit_id,
            payload.event_type,
            payload.form_data,
            payload.metadata,
            payload.created_at,
            payload.updated_at,
            payload.recorded_by_user_id,
            now,
            now,
        ],
    )?;

    Ok(serde_json::json!({ "event_id": payload.id }))
}

pub fn handle_get_visits(payload: &GetVisitsQuery, conn: &Connection) -> HandlerResult {
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, clinic_id, provider_id, provider_name,
                check_in_timestamp, metadata, created_at, updated_at
         FROM visits
         WHERE patient_id = ?1 AND is_deleted = 0 AND local_server_deleted_at IS NULL
         ORDER BY check_in_timestamp DESC",
    )?;

    let rows = stmt.query_map(rusqlite::params![payload.patient_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "patient_id": row.get::<_, String>(1)?,
            "clinic_id": row.get::<_, String>(2)?,
            "provider_id": row.get::<_, String>(3)?,
            "provider_name": row.get::<_, String>(4)?,
            "check_in_timestamp": row.get::<_, i64>(5)?,
            "metadata": row.get::<_, String>(6)?,
            "created_at": row.get::<_, i64>(7)?,
            "updated_at": row.get::<_, i64>(8)?,
        }))
    })?;

    let data: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::json!({ "data": data }))
}

pub fn handle_get_visit_events(payload: &GetVisitEventsQuery, conn: &Connection) -> HandlerResult {
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, form_id, visit_id, event_type,
                form_data, metadata, created_at, updated_at, recorded_by_user_id
         FROM events
         WHERE patient_id = ?1 AND visit_id = ?2
           AND is_deleted = 0 AND local_server_deleted_at IS NULL
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(
        rusqlite::params![payload.patient_id, payload.visit_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "patient_id": row.get::<_, String>(1)?,
                "form_id": row.get::<_, String>(2)?,
                "visit_id": row.get::<_, String>(3)?,
                "event_type": row.get::<_, String>(4)?,
                "form_data": row.get::<_, String>(5)?,
                "metadata": row.get::<_, String>(6)?,
                "created_at": row.get::<_, i64>(7)?,
                "updated_at": row.get::<_, i64>(8)?,
                "recorded_by_user_id": row.get::<_, String>(9)?,
            }))
        },
    )?;

    let data: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::json!({ "data": data }))
}

/// Updates mutable fields on an existing visit.
pub fn handle_update_visit(payload: &UpdateVisitCommand, conn: &Connection) -> HandlerResult {
    let now = now_millis();
    let mut sets = vec!["local_server_last_modified_at = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
    let mut idx = 2;

    macro_rules! set_if_some {
        ($field:ident, $col:expr) => {
            if let Some(ref val) = payload.$field {
                sets.push(format!("{} = ?{idx}", $col));
                params.push(Box::new(val.clone()));
                idx += 1;
            }
        };
    }

    set_if_some!(provider_id, "provider_id");
    set_if_some!(provider_name, "provider_name");
    set_if_some!(check_in_timestamp, "check_in_timestamp");
    set_if_some!(metadata, "metadata");
    set_if_some!(clinic_id, "clinic_id");

    let updated_at = payload.updated_at.unwrap_or(now);
    sets.push(format!("updated_at = ?{idx}"));
    params.push(Box::new(updated_at));
    idx += 1;

    params.push(Box::new(payload.id.clone()));

    let sql = format!(
        "UPDATE visits SET {} WHERE id = ?{idx} AND is_deleted = 0 AND local_server_deleted_at IS NULL",
        sets.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|p| p.as_ref()).collect();
    let changed = conn.execute(&sql, param_refs.as_slice())?;

    if changed == 0 {
        return Err(format!("Visit '{}' not found", payload.id).into());
    }

    // Return updated visit
    let row = conn.query_row(
        "SELECT id, patient_id, clinic_id, provider_id, provider_name,
                check_in_timestamp, metadata, created_at, updated_at
         FROM visits WHERE id = ?1",
        rusqlite::params![payload.id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "patient_id": row.get::<_, String>(1)?,
                "clinic_id": row.get::<_, String>(2)?,
                "provider_id": row.get::<_, String>(3)?,
                "provider_name": row.get::<_, String>(4)?,
                "check_in_timestamp": row.get::<_, i64>(5)?,
                "metadata": row.get::<_, String>(6)?,
                "created_at": row.get::<_, i64>(7)?,
                "updated_at": row.get::<_, i64>(8)?,
            }))
        },
    )?;
    Ok(row)
}

/// Updates mutable fields on an existing vitals record.
pub fn handle_update_vitals(payload: &UpdateVitalsCommand, conn: &Connection) -> HandlerResult {
    let now = now_millis();
    let mut sets = vec!["local_server_last_modified_at = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
    let mut idx = 2;

    // Present-but-null writes SQL NULL; absent leaves the column untouched.
    // `Option<T>` implements ToSql as NULL for None, so the inner option can be
    // bound directly.
    macro_rules! set_if_present {
        ($field:ident, $col:expr) => {
            if let Some(ref val) = payload.$field {
                sets.push(format!("{} = ?{idx}", $col));
                params.push(Box::new(val.clone()));
                idx += 1;
            }
        };
    }

    set_if_present!(systolic_bp, "systolic_bp");
    set_if_present!(diastolic_bp, "diastolic_bp");
    set_if_present!(bp_position, "bp_position");
    set_if_present!(height_cm, "height_cm");
    set_if_present!(weight_kg, "weight_kg");
    set_if_present!(bmi, "bmi");
    set_if_present!(waist_circumference_cm, "waist_circumference_cm");
    set_if_present!(heart_rate, "heart_rate");
    set_if_present!(pulse_rate, "pulse_rate");
    set_if_present!(oxygen_saturation, "oxygen_saturation");
    set_if_present!(respiratory_rate, "respiratory_rate");
    set_if_present!(temperature_celsius, "temperature_celsius");
    set_if_present!(pain_level, "pain_level");
    // Still single-option: absent and null both leave metadata alone.
    set_if_present!(metadata, "metadata");

    let updated_at = payload.updated_at.unwrap_or(now);
    sets.push(format!("updated_at = ?{idx}"));
    params.push(Box::new(updated_at));
    idx += 1;

    params.push(Box::new(payload.id.clone()));

    let sql = format!(
        "UPDATE patient_vitals SET {} WHERE id = ?{idx} AND is_deleted = 0 AND local_server_deleted_at IS NULL",
        sets.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|p| p.as_ref()).collect();
    let changed = conn.execute(&sql, param_refs.as_slice())?;

    if changed == 0 {
        return Err(format!("Vitals record '{}' not found", payload.id).into());
    }

    Ok(serde_json::json!({ "ok": true, "id": payload.id }))
}

/// Record a new vitals entry, returning its id. Upserts on id so a retry cannot
/// leave two readings behind for one measurement.
pub fn handle_create_vitals(payload: &CreateVitalsCommand, conn: &Connection) -> HandlerResult {
    let now = now_millis();
    let id = payload
        .id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());

    conn.execute(
        r#"INSERT INTO patient_vitals (
            id, patient_id, visit_id, timestamp, systolic_bp, diastolic_bp,
            bp_position, height_cm, weight_kg, bmi, waist_circumference_cm,
            heart_rate, pulse_rate, oxygen_saturation, respiratory_rate,
            temperature_celsius, pain_level, recorded_by_user_id, metadata,
            is_deleted, created_at, updated_at, last_modified, server_created_at,
            local_server_created_at, local_server_last_modified_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6,
            ?7, ?8, ?9, ?10, ?11,
            ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19,
            0, ?20, ?21, ?22, ?23,
            ?24, ?25
        )
        ON CONFLICT(id) DO UPDATE SET
            visit_id = excluded.visit_id,
            timestamp = excluded.timestamp,
            systolic_bp = excluded.systolic_bp,
            diastolic_bp = excluded.diastolic_bp,
            bp_position = excluded.bp_position,
            height_cm = excluded.height_cm,
            weight_kg = excluded.weight_kg,
            bmi = excluded.bmi,
            waist_circumference_cm = excluded.waist_circumference_cm,
            heart_rate = excluded.heart_rate,
            pulse_rate = excluded.pulse_rate,
            oxygen_saturation = excluded.oxygen_saturation,
            respiratory_rate = excluded.respiratory_rate,
            temperature_celsius = excluded.temperature_celsius,
            pain_level = excluded.pain_level,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at,
            local_server_last_modified_at = excluded.local_server_last_modified_at"#,
        rusqlite::params![
            id,
            payload.patient_id,
            payload.visit_id,
            payload.timestamp,
            payload.systolic_bp,
            payload.diastolic_bp,
            payload.bp_position,
            payload.height_cm,
            payload.weight_kg,
            payload.bmi,
            payload.waist_circumference_cm,
            payload.heart_rate,
            payload.pulse_rate,
            payload.oxygen_saturation,
            payload.respiratory_rate,
            payload.temperature_celsius,
            payload.pain_level,
            payload.recorded_by_user_id,
            payload.metadata,
            now,
            now,
            now,
            now,
            now,
            now,
        ],
    )?;

    Ok(serde_json::json!({ "id": id }))
}

/// List a patient's vitals, newest first. Absent readings are emitted as explicit
/// nulls — a missing key reads as "not recorded" and vanishes from the chart — and
/// the excluded rows are exactly those `handle_update_vitals` refuses.
pub fn handle_list_vitals(payload: &ListVitalsQuery, conn: &Connection) -> HandlerResult {
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, visit_id, timestamp, systolic_bp, diastolic_bp,
                bp_position, height_cm, weight_kg, bmi, waist_circumference_cm,
                heart_rate, pulse_rate, oxygen_saturation, respiratory_rate,
                temperature_celsius, pain_level, recorded_by_user_id, metadata,
                is_deleted, created_at, updated_at, deleted_at
         FROM patient_vitals
         WHERE patient_id = ?1 AND is_deleted = 0 AND local_server_deleted_at IS NULL
         ORDER BY timestamp DESC",
    )?;

    let rows = stmt.query_map(rusqlite::params![payload.patient_id], |row| {
        let metadata: String = row.get(18)?;
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "patient_id": row.get::<_, String>(1)?,
            "visit_id": row.get::<_, Option<String>>(2)?,
            "timestamp": row.get::<_, i64>(3)?,
            "systolic_bp": row.get::<_, Option<f64>>(4)?,
            "diastolic_bp": row.get::<_, Option<f64>>(5)?,
            "bp_position": row.get::<_, Option<String>>(6)?,
            "height_cm": row.get::<_, Option<f64>>(7)?,
            "weight_kg": row.get::<_, Option<f64>>(8)?,
            "bmi": row.get::<_, Option<f64>>(9)?,
            "waist_circumference_cm": row.get::<_, Option<f64>>(10)?,
            "heart_rate": row.get::<_, Option<f64>>(11)?,
            "pulse_rate": row.get::<_, Option<f64>>(12)?,
            "oxygen_saturation": row.get::<_, Option<f64>>(13)?,
            "respiratory_rate": row.get::<_, Option<f64>>(14)?,
            "temperature_celsius": row.get::<_, Option<f64>>(15)?,
            "pain_level": row.get::<_, Option<f64>>(16)?,
            "recorded_by_user_id": row.get::<_, Option<String>>(17)?,
            // Stored as JSON text, but the client expects an object.
            "metadata": serde_json::from_str::<serde_json::Value>(&metadata)
                .unwrap_or_else(|_| serde_json::json!({})),
            "is_deleted": row.get::<_, i64>(19)? != 0,
            "created_at": row.get::<_, i64>(20)?,
            "updated_at": row.get::<_, i64>(21)?,
            "deleted_at": row.get::<_, Option<i64>>(22)?,
        }))
    })?;

    let data: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::json!({ "data": data }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::setup_test_db;
    use rusqlite::Connection;

    fn insert_test_patient(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO patients (
                id, given_name, surname, date_of_birth, citizenship, hometown,
                phone, sex, additional_data, metadata, is_deleted,
                government_id, external_patient_id,
                created_at, updated_at,
                local_server_created_at, local_server_last_modified_at
            ) VALUES (?1, 'Test', 'Patient', '1990-01-01', 'X', 'Town',
                      '555', 'M', '{}', '{}', 0,
                      'GOV', 'EXT',
                      1000, 2000, 1000, 2000)",
            rusqlite::params![id],
        )
        .unwrap();
    }

    fn insert_test_visit(conn: &Connection, id: &str, patient_id: &str) {
        conn.execute(
            "INSERT INTO visits (
                id, patient_id, clinic_id, provider_id, provider_name,
                check_in_timestamp, metadata, is_deleted,
                created_at, updated_at,
                local_server_created_at, local_server_last_modified_at
            ) VALUES (?1, ?2, 'clinic1', 'prov1', 'Dr Test',
                      1000, '{}', 0,
                      1000, 2000, 1000, 2000)",
            rusqlite::params![id, patient_id],
        )
        .unwrap();
    }

    fn make_test_event(id: &str, patient_id: &str, visit_id: &str) -> CreateEventCommand {
        CreateEventCommand {
            id: id.to_string(),
            patient_id: patient_id.to_string(),
            form_id: "form1".to_string(),
            visit_id: visit_id.to_string(),
            event_type: "vitals".to_string(),
            form_data: r#"{"bp":"120/80"}"#.to_string(),
            metadata: "{}".to_string(),
            created_at: 1000,
            updated_at: 2000,
            recorded_by_user_id: "user1".to_string(),
        }
    }

    #[test]
    fn create_event_inserts() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd = make_test_event("e1", "p1", "v1");
        let result = handle_create_event(&cmd, &conn).unwrap();
        assert_eq!(result["event_id"], "e1");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM events WHERE id = 'e1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn create_event_upsert_updates() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd = make_test_event("e2", "p1", "v1");
        handle_create_event(&cmd, &conn).unwrap();

        // Update form_data via upsert
        let mut cmd2 = make_test_event("e2", "p1", "v1");
        cmd2.form_data = r#"{"bp":"130/85"}"#.to_string();
        cmd2.updated_at = 3000;
        handle_create_event(&cmd2, &conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM events WHERE id = 'e2'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);

        let form_data: String = conn
            .query_row("SELECT form_data FROM events WHERE id = 'e2'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(form_data.contains("130/85"));
    }

    #[test]
    fn get_visits_for_patient() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");
        insert_test_visit(&conn, "v2", "p1");

        let query = GetVisitsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_get_visits(&query, &conn).unwrap();
        assert_eq!(result["data"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn get_visits_excludes_other_patients() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_patient(&conn, "p2");
        insert_test_visit(&conn, "v1", "p1");
        insert_test_visit(&conn, "v2", "p2");

        let query = GetVisitsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_get_visits(&query, &conn).unwrap();
        let visits = result["data"].as_array().unwrap();
        assert_eq!(visits.len(), 1);
        assert_eq!(visits[0]["id"], "v1");
    }

    #[test]
    fn get_visits_empty() {
        let conn = setup_test_db();
        let query = GetVisitsQuery {
            patient_id: "nonexistent".to_string(),
        };
        let result = handle_get_visits(&query, &conn).unwrap();
        assert!(result["data"].as_array().unwrap().is_empty());
    }

    #[test]
    fn get_visit_events_correct() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd1 = make_test_event("e1", "p1", "v1");
        let cmd2 = make_test_event("e2", "p1", "v1");
        handle_create_event(&cmd1, &conn).unwrap();
        handle_create_event(&cmd2, &conn).unwrap();

        let query = GetVisitEventsQuery {
            patient_id: "p1".to_string(),
            visit_id: "v1".to_string(),
        };
        let result = handle_get_visit_events(&query, &conn).unwrap();
        assert_eq!(result["data"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn get_visit_events_excludes_soft_deleted() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd = make_test_event("e_del", "p1", "v1");
        handle_create_event(&cmd, &conn).unwrap();

        // Soft-delete the event
        conn.execute(
            "UPDATE events SET local_server_deleted_at = 9999 WHERE id = 'e_del'",
            [],
        )
        .unwrap();

        let query = GetVisitEventsQuery {
            patient_id: "p1".to_string(),
            visit_id: "v1".to_string(),
        };
        let result = handle_get_visit_events(&query, &conn).unwrap();
        assert!(result["data"].as_array().unwrap().is_empty());
    }

    #[test]
    fn get_visits_excludes_soft_deleted() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");
        insert_test_visit(&conn, "v2", "p1");

        // Soft-delete one visit
        conn.execute(
            "UPDATE visits SET local_server_deleted_at = 9999 WHERE id = 'v1'",
            [],
        )
        .unwrap();

        let query = GetVisitsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_get_visits(&query, &conn).unwrap();
        let visits = result["data"].as_array().unwrap();
        assert_eq!(visits.len(), 1);
        assert_eq!(visits[0]["id"], "v2");
    }

    #[test]
    fn get_visits_excludes_is_deleted_flag() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        // Mark as deleted via the is_deleted flag
        conn.execute("UPDATE visits SET is_deleted = 1 WHERE id = 'v1'", [])
            .unwrap();

        let query = GetVisitsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_get_visits(&query, &conn).unwrap();
        assert!(result["data"].as_array().unwrap().is_empty());
    }

    #[test]
    fn create_event_preserves_all_fields() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd = CreateEventCommand {
            id: "ef1".to_string(),
            patient_id: "p1".to_string(),
            form_id: "form_abc".to_string(),
            visit_id: "v1".to_string(),
            event_type: "lab_result".to_string(),
            form_data: r#"{"result":"positive"}"#.to_string(),
            metadata: r#"{"source":"mobile"}"#.to_string(),
            created_at: 5000,
            updated_at: 6000,
            recorded_by_user_id: "doc42".to_string(),
        };
        handle_create_event(&cmd, &conn).unwrap();

        let (form_id, event_type, form_data, recorded_by): (String, String, String, String) = conn
            .query_row(
                "SELECT form_id, event_type, form_data, recorded_by_user_id FROM events WHERE id = 'ef1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(form_id, "form_abc");
        assert_eq!(event_type, "lab_result");
        assert!(form_data.contains("positive"));
        assert_eq!(recorded_by, "doc42");
    }

    // ========================================================================
    // Property-based tests
    // ========================================================================

    // ========================================================================
    // Visit update tests
    // ========================================================================

    #[test]
    fn update_visit_changes_fields() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_visit(&conn, "v1", "p1");

        let cmd = UpdateVisitCommand {
            id: "v1".to_string(),
            provider_id: Some("new_prov".to_string()),
            provider_name: Some("Dr. New".to_string()),
            check_in_timestamp: None,
            metadata: None,
            clinic_id: None,
            updated_at: None,
        };
        let result = handle_update_visit(&cmd, &conn).unwrap();
        assert_eq!(result["provider_id"], "new_prov");
        assert_eq!(result["provider_name"], "Dr. New");
    }

    #[test]
    fn update_visit_not_found() {
        let conn = setup_test_db();
        let cmd = UpdateVisitCommand {
            id: "ghost".to_string(),
            provider_id: None,
            provider_name: None,
            check_in_timestamp: None,
            metadata: None,
            clinic_id: None,
            updated_at: None,
        };
        assert!(handle_update_visit(&cmd, &conn).is_err());
    }

    // ========================================================================
    // Vitals update tests
    // ========================================================================

    fn insert_test_vitals(conn: &Connection, id: &str, patient_id: &str) {
        conn.execute(
            "INSERT INTO patient_vitals (
                id, patient_id, timestamp, metadata, is_deleted,
                created_at, updated_at, last_modified, server_created_at,
                local_server_created_at, local_server_last_modified_at
            ) VALUES (?1, ?2, 1000, '{}', 0,
                      1000, 1000, 1000, 1000, 1000, 1000)",
            rusqlite::params![id, patient_id],
        )
        .unwrap();
    }

    /// An update that touches nothing. Tests set only the fields under test, so
    /// what a case is asserting stays visible.
    fn empty_update_vitals_cmd(id: &str) -> UpdateVitalsCommand {
        UpdateVitalsCommand {
            id: id.to_string(),
            systolic_bp: None,
            diastolic_bp: None,
            bp_position: None,
            height_cm: None,
            weight_kg: None,
            bmi: None,
            waist_circumference_cm: None,
            heart_rate: None,
            pulse_rate: None,
            oxygen_saturation: None,
            respiratory_rate: None,
            temperature_celsius: None,
            pain_level: None,
            metadata: None,
            updated_at: None,
        }
    }

    fn read_opt_f64(conn: &Connection, col: &str, id: &str) -> Option<f64> {
        conn.query_row(
            &format!("SELECT {col} FROM patient_vitals WHERE id = ?1"),
            rusqlite::params![id],
            |r| r.get::<_, Option<f64>>(0),
        )
        .unwrap()
    }

    #[test]
    fn update_vitals_changes_fields() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_vitals(&conn, "vit1", "p1");

        let cmd = UpdateVitalsCommand {
            systolic_bp: Some(Some(120.0)),
            diastolic_bp: Some(Some(80.0)),
            bp_position: Some(Some("sitting".to_string())),
            weight_kg: Some(Some(75.5)),
            ..empty_update_vitals_cmd("vit1")
        };
        let result = handle_update_vitals(&cmd, &conn).unwrap();
        assert_eq!(result["ok"], true);

        assert_eq!(read_opt_f64(&conn, "systolic_bp", "vit1"), Some(120.0));
    }

    #[test]
    fn update_vitals_not_found() {
        let conn = setup_test_db();
        let cmd = UpdateVitalsCommand {
            systolic_bp: Some(Some(120.0)),
            ..empty_update_vitals_cmd("ghost")
        };
        assert!(handle_update_vitals(&cmd, &conn).is_err());
    }

    /// An explicit null must clear the reading. A clinician deleting a mistyped
    /// value has to see it gone — dropping the clear leaves the wrong number in
    /// the record while reporting success.
    #[test]
    fn update_vitals_explicit_null_clears_the_value() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_vitals(&conn, "vit1", "p1");

        handle_update_vitals(
            &UpdateVitalsCommand {
                systolic_bp: Some(Some(120.0)),
                ..empty_update_vitals_cmd("vit1")
            },
            &conn,
        )
        .unwrap();
        assert_eq!(read_opt_f64(&conn, "systolic_bp", "vit1"), Some(120.0));

        handle_update_vitals(
            &UpdateVitalsCommand {
                systolic_bp: Some(None),
                ..empty_update_vitals_cmd("vit1")
            },
            &conn,
        )
        .unwrap();
        assert_eq!(read_opt_f64(&conn, "systolic_bp", "vit1"), None);
    }

    /// An omitted field is not a clear — the stored reading survives.
    #[test]
    fn update_vitals_absent_field_leaves_value_untouched() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_vitals(&conn, "vit1", "p1");

        handle_update_vitals(
            &UpdateVitalsCommand {
                systolic_bp: Some(Some(120.0)),
                diastolic_bp: Some(Some(80.0)),
                ..empty_update_vitals_cmd("vit1")
            },
            &conn,
        )
        .unwrap();

        // Only diastolic is mentioned; systolic must be left alone.
        handle_update_vitals(
            &UpdateVitalsCommand {
                diastolic_bp: Some(Some(85.0)),
                ..empty_update_vitals_cmd("vit1")
            },
            &conn,
        )
        .unwrap();

        assert_eq!(read_opt_f64(&conn, "systolic_bp", "vit1"), Some(120.0));
        assert_eq!(read_opt_f64(&conn, "diastolic_bp", "vit1"), Some(85.0));
    }

    /// The wire-format half of the same contract: the JSON the mobile client
    /// actually sends must deserialize into the three distinct states, since
    /// that is where a plain `Option` silently collapses null into absent.
    #[test]
    fn update_vitals_payload_distinguishes_absent_from_null() {
        let absent: UpdateVitalsCommand =
            serde_json::from_value(serde_json::json!({ "id": "vit1" })).unwrap();
        assert_eq!(absent.systolic_bp, None);

        let cleared: UpdateVitalsCommand =
            serde_json::from_value(serde_json::json!({ "id": "vit1", "systolic_bp": null }))
                .unwrap();
        assert_eq!(cleared.systolic_bp, Some(None));

        let set: UpdateVitalsCommand =
            serde_json::from_value(serde_json::json!({ "id": "vit1", "systolic_bp": 118.0 }))
                .unwrap();
        assert_eq!(set.systolic_bp, Some(Some(118.0)));
    }

    fn make_create_vitals_cmd(id: Option<&str>, patient_id: &str) -> CreateVitalsCommand {
        CreateVitalsCommand {
            id: id.map(|s| s.to_string()),
            patient_id: patient_id.to_string(),
            visit_id: None,
            timestamp: 2000,
            systolic_bp: Some(120.0),
            diastolic_bp: Some(80.0),
            bp_position: Some("sitting".to_string()),
            height_cm: None,
            weight_kg: None,
            bmi: None,
            waist_circumference_cm: None,
            heart_rate: None,
            pulse_rate: Some(72.0),
            oxygen_saturation: None,
            respiratory_rate: None,
            temperature_celsius: None,
            pain_level: None,
            recorded_by_user_id: Some("user-1".to_string()),
            metadata: "{}".to_string(),
        }
    }

    #[test]
    fn create_vitals_inserts_and_is_readable_by_list() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");

        let result = handle_create_vitals(&make_create_vitals_cmd(None, "p1"), &conn).unwrap();
        let id = result["id"].as_str().unwrap();
        assert!(!id.is_empty());

        let listed = handle_list_vitals(
            &ListVitalsQuery {
                patient_id: "p1".to_string(),
            },
            &conn,
        )
        .unwrap();
        let data = listed["data"].as_array().unwrap();

        assert_eq!(data.len(), 1);
        assert_eq!(data[0]["id"], id);
        assert_eq!(data[0]["systolic_bp"], 120.0);
        assert_eq!(data[0]["pulse_rate"], 72.0);
        assert_eq!(data[0]["recorded_by_user_id"], "user-1");
    }

    #[test]
    fn create_vitals_with_repeated_id_does_not_duplicate_the_reading() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");

        handle_create_vitals(&make_create_vitals_cmd(Some("vit1"), "p1"), &conn).unwrap();
        let mut retry = make_create_vitals_cmd(Some("vit1"), "p1");
        retry.systolic_bp = Some(135.0);
        handle_create_vitals(&retry, &conn).unwrap();

        let listed = handle_list_vitals(
            &ListVitalsQuery {
                patient_id: "p1".to_string(),
            },
            &conn,
        )
        .unwrap();
        let data = listed["data"].as_array().unwrap();

        assert_eq!(data.len(), 1);
        assert_eq!(data[0]["systolic_bp"], 135.0);
    }

    #[test]
    fn list_vitals_returns_patient_rows_newest_first() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_vitals(&conn, "older", "p1");
        insert_test_vitals(&conn, "newer", "p1");
        conn.execute(
            "UPDATE patient_vitals SET timestamp = 5000 WHERE id = 'newer'",
            [],
        )
        .unwrap();

        let query = ListVitalsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_list_vitals(&query, &conn).unwrap();
        let data = result["data"].as_array().unwrap();

        assert_eq!(data.len(), 2);
        assert_eq!(data[0]["id"], "newer");
        assert_eq!(data[1]["id"], "older");
    }

    #[test]
    fn list_vitals_excludes_other_patients_and_deleted_rows() {
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_patient(&conn, "p2");
        insert_test_vitals(&conn, "mine", "p1");
        insert_test_vitals(&conn, "theirs", "p2");
        insert_test_vitals(&conn, "soft_deleted", "p1");
        insert_test_vitals(&conn, "hub_deleted", "p1");
        conn.execute(
            "UPDATE patient_vitals SET is_deleted = 1 WHERE id = 'soft_deleted'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE patient_vitals SET local_server_deleted_at = 1 WHERE id = 'hub_deleted'",
            [],
        )
        .unwrap();

        let query = ListVitalsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_list_vitals(&query, &conn).unwrap();
        let data = result["data"].as_array().unwrap();

        assert_eq!(data.len(), 1);
        assert_eq!(data[0]["id"], "mine");
    }

    #[test]
    fn list_vitals_returns_empty_for_unknown_patient() {
        let conn = setup_test_db();
        let query = ListVitalsQuery {
            patient_id: "ghost".to_string(),
        };
        let result = handle_list_vitals(&query, &conn).unwrap();
        assert_eq!(result["data"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn list_vitals_emits_every_field_the_client_decodes() {
        // A missing key reads as "not recorded", so absent readings must arrive
        // as explicit nulls.
        let conn = setup_test_db();
        insert_test_patient(&conn, "p1");
        insert_test_vitals(&conn, "vit1", "p1");
        conn.execute(
            "UPDATE patient_vitals SET systolic_bp = 120, bp_position = 'sitting',
                 metadata = '{\"source\":\"mobile\"}' WHERE id = 'vit1'",
            [],
        )
        .unwrap();

        let query = ListVitalsQuery {
            patient_id: "p1".to_string(),
        };
        let result = handle_list_vitals(&query, &conn).unwrap();
        let row = &result["data"][0];

        for key in [
            "id",
            "patient_id",
            "visit_id",
            "timestamp",
            "systolic_bp",
            "diastolic_bp",
            "bp_position",
            "height_cm",
            "weight_kg",
            "bmi",
            "waist_circumference_cm",
            "heart_rate",
            "pulse_rate",
            "oxygen_saturation",
            "respiratory_rate",
            "temperature_celsius",
            "pain_level",
            "recorded_by_user_id",
            "metadata",
            "is_deleted",
            "created_at",
            "updated_at",
            "deleted_at",
        ] {
            assert!(
                row.get(key).is_some(),
                "field '{}' missing from vitals.list payload",
                key
            );
        }

        assert_eq!(row["systolic_bp"], 120.0);
        assert!(row["diastolic_bp"].is_null());
        assert_eq!(row["bp_position"], "sitting");
        // stored as JSON text, but must decode as an object
        assert_eq!(row["metadata"]["source"], "mobile");
        assert_eq!(row["is_deleted"], false);
    }

    use proptest::prelude::*;

    proptest! {
        /// Property: creating N events for a visit results in exactly N retrievable events
        #[test]
        fn create_n_events_then_retrieve(n in 1u32..15) {
            let conn = setup_test_db();
            insert_test_patient(&conn, "pp1");
            insert_test_visit(&conn, "pv1", "pp1");

            for i in 0..n {
                let cmd = make_test_event(&format!("pe{}", i), "pp1", "pv1");
                handle_create_event(&cmd, &conn).unwrap();
            }

            let query = GetVisitEventsQuery {
                patient_id: "pp1".to_string(),
                visit_id: "pv1".to_string(),
            };
            let result = handle_get_visit_events(&query, &conn).unwrap();
            prop_assert_eq!(result["data"].as_array().unwrap().len(), n as usize);
        }

        /// Property: events for different visits are isolated
        #[test]
        fn events_isolated_per_visit(
            n_v1 in 0u32..10,
            n_v2 in 0u32..10,
        ) {
            let conn = setup_test_db();
            insert_test_patient(&conn, "iso_p");
            insert_test_visit(&conn, "iso_v1", "iso_p");
            insert_test_visit(&conn, "iso_v2", "iso_p");

            for i in 0..n_v1 {
                let cmd = make_test_event(&format!("v1e{}", i), "iso_p", "iso_v1");
                handle_create_event(&cmd, &conn).unwrap();
            }
            for i in 0..n_v2 {
                let cmd = make_test_event(&format!("v2e{}", i), "iso_p", "iso_v2");
                handle_create_event(&cmd, &conn).unwrap();
            }

            let q1 = GetVisitEventsQuery {
                patient_id: "iso_p".to_string(),
                visit_id: "iso_v1".to_string(),
            };
            let q2 = GetVisitEventsQuery {
                patient_id: "iso_p".to_string(),
                visit_id: "iso_v2".to_string(),
            };
            let r1 = handle_get_visit_events(&q1, &conn).unwrap();
            let r2 = handle_get_visit_events(&q2, &conn).unwrap();
            prop_assert_eq!(r1["data"].as_array().unwrap().len(), n_v1 as usize);
            prop_assert_eq!(r2["data"].as_array().unwrap().len(), n_v2 as usize);
        }

        /// Property: creating N visits for a patient results in exactly N retrievable visits
        #[test]
        fn create_n_visits_then_retrieve(n in 1u32..15) {
            let conn = setup_test_db();
            insert_test_patient(&conn, "pvp");

            for i in 0..n {
                insert_test_visit(&conn, &format!("pvv{}", i), "pvp");
            }

            let query = GetVisitsQuery {
                patient_id: "pvp".to_string(),
            };
            let result = handle_get_visits(&query, &conn).unwrap();
            prop_assert_eq!(result["data"].as_array().unwrap().len(), n as usize);
        }

        /// Property: upsert is idempotent — re-inserting same event doesn't duplicate
        #[test]
        fn event_upsert_idempotent(repeats in 1u32..5) {
            let conn = setup_test_db();
            insert_test_patient(&conn, "idem_p");
            insert_test_visit(&conn, "idem_v", "idem_p");

            let cmd = make_test_event("idem_e", "idem_p", "idem_v");
            for _ in 0..repeats {
                handle_create_event(&cmd, &conn).unwrap();
            }

            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM events WHERE id = 'idem_e'", [], |r| r.get(0))
                .unwrap();
            prop_assert_eq!(count, 1);
        }
    }
}
