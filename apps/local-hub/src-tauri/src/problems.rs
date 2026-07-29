//! Projection of an event's submitted diagnoses onto the patient's problem list.
//!
//! A port of `packages/hh-forms/src/Problems.res`, which the mobile client and
//! the cloud server share. The hub is offline-first and writes events of its
//! own, so it applies the rule locally rather than waiting for a relay. The
//! test table below mirrors that module's tests case for case, so the two
//! drifting apart shows up as a failure here.
//!
//! Nothing here touches storage.

use std::collections::HashSet;

use serde_json::Value;

/// A diagnosis destined for the patient's problem list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub code: String,
    pub label: String,
}

/// A problem already on the chart, carrying the id needed to retire it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordedProblem {
    pub id: String,
    pub code: String,
    pub label: String,
}

/// What an event's diagnoses should put on the patient's chart.
///
/// `records_problems` is false when no diagnosis field opts in. Callers must
/// then leave the problem list alone entirely rather than read an empty
/// `problems` as "remove everything", so that turning the flag off never
/// erases problems already recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Projection {
    pub records_problems: bool,
    pub problems: Vec<Problem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diff {
    pub to_create: Vec<Problem>,
    pub to_remove_ids: Vec<String>,
}

/// The chart row to write for a recorded diagnosis, with every value the
/// clients must agree on already decided.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewProblem {
    pub code_system: &'static str,
    pub code: String,
    pub label: String,
    pub clinical_status: &'static str,
    pub verification_status: &'static str,
}

const DIAGNOSIS_FIELD_TYPE: &str = "diagnosis";

/// Diagnoses come from one ICD-11 catalogue on every client, so the code
/// system is fixed.
const DIAGNOSIS_CODE_SYSTEM: &str = "icd11";

/// A diagnosis a provider entered on a form is an asserted, ongoing problem
/// that nobody has confirmed against a second source yet.
const DIAGNOSIS_CLINICAL_STATUS: &str = "active";
const DIAGNOSIS_VERIFICATION_STATUS: &str = "provisional";

/// Widths of the `problem_code` and `problem_label` columns upstream. A
/// free-text diagnosis is unbounded user input, and a clamped label beats a
/// row the cloud rejects on push.
const CODE_LENGTH_MAX: usize = 100;
const LABEL_LENGTH_MAX: usize = 255;

/// Identity of a problem within one event. The label is part of the key
/// because relabelling a diagnosis makes it a different entry on the chart —
/// and because events saved before free-text diagnoses got unique codes share
/// the bare "0000" placeholder, where the label is all that separates them.
fn key(code: &str, label: &str) -> String {
    format!("{code}::{label}")
}

fn problem_key(problem: &Problem) -> String {
    key(&problem.code, &problem.label)
}

fn recorded_key(problem: &RecordedProblem) -> String {
    key(&problem.code, &problem.label)
}

fn key_set<'a>(problems: impl IntoIterator<Item = &'a Problem>) -> HashSet<String> {
    problems.into_iter().map(problem_key).collect()
}

/// Ids of the authored fields that opted in to recording. Forms authored
/// before the flag existed carry no `addToProblems`, which reads as "do not
/// record".
fn recording_field_ids(form_fields: &Value) -> HashSet<&str> {
    let Some(fields) = form_fields.as_array() else {
        return HashSet::new();
    };

    fields
        .iter()
        .filter(|field| {
            field.get("fieldType").and_then(Value::as_str) == Some(DIAGNOSIS_FIELD_TYPE)
                && field.get("addToProblems").and_then(Value::as_bool) == Some(true)
        })
        .filter_map(|field| field.get("id").and_then(Value::as_str))
        .collect()
}

/// The diagnoses in one submitted value, dropping anything that is not a
/// `{code, desc}` pair with both parts present.
fn diagnosis_entries(value: Option<&Value>) -> Vec<Problem> {
    let Some(entries) = value.and_then(Value::as_array) else {
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(|entry| {
            let code = entry.get("code")?.as_str()?;
            let label = entry.get("desc")?.as_str()?;
            if code.is_empty() || label.is_empty() {
                return None;
            }
            Some(Problem {
                code: code.to_string(),
                label: label.to_string(),
            })
        })
        .collect()
}

/// Which problems an event's diagnoses should put on the patient's chart,
/// keeping only those whose form field is marked `addToProblems`.
///
/// Duplicates within one event collapse to a single problem. Both arguments
/// are raw JSON as it sits in the `events` and `event_forms` rows; anything
/// mis-shaped contributes nothing rather than failing.
pub fn problems_from_form_data(form_data: &Value, form_fields: &Value) -> Projection {
    let recording_ids = recording_field_ids(form_fields);
    if recording_ids.is_empty() {
        return Projection {
            records_problems: false,
            problems: Vec::new(),
        };
    }

    let items = form_data.as_array().map(Vec::as_slice).unwrap_or_default();

    let mut seen: HashSet<String> = HashSet::new();
    let mut problems: Vec<Problem> = Vec::new();

    for item in items {
        if item.get("fieldType").and_then(Value::as_str) != Some(DIAGNOSIS_FIELD_TYPE) {
            continue;
        }
        let Some(field_id) = item.get("fieldId").and_then(Value::as_str) else {
            continue;
        };
        if !recording_ids.contains(field_id) {
            continue;
        }

        for problem in diagnosis_entries(item.get("value")) {
            if seen.insert(problem_key(&problem)) {
                problems.push(problem);
            }
        }
    }

    Projection {
        records_problems: true,
        problems,
    }
}

/// Compare the problems an event already recorded against the ones it should
/// now record.
///
/// A diagnosis the event asked for last time but that is no longer on the
/// chart was taken off deliberately — by a clinician editing the problem list
/// or by an admin upstream. Re-saving the event must not undo that, so
/// `already_requested` suppresses the re-create. Only a diagnosis that is new
/// to this event produces a problem.
pub fn diff_problems(
    existing: &[RecordedProblem],
    desired: &[Problem],
    already_requested: &[Problem],
) -> Diff {
    let desired_keys = key_set(desired);
    let requested_keys = key_set(already_requested);
    let existing_keys: HashSet<String> = existing.iter().map(recorded_key).collect();

    let to_create = desired
        .iter()
        .filter(|problem| {
            let k = problem_key(problem);
            !existing_keys.contains(&k) && !requested_keys.contains(&k)
        })
        .cloned()
        .collect();

    let to_remove_ids = existing
        .iter()
        .filter(|problem| !desired_keys.contains(&recorded_key(problem)))
        .map(|problem| problem.id.clone())
        .collect();

    Diff {
        to_create,
        to_remove_ids,
    }
}

/// Clamp by characters rather than bytes: the upstream columns are
/// `varchar(n)`, which counts characters, and slicing bytes would split a
/// multi-byte one.
fn clamp(value: &str, length_max: usize) -> String {
    value.chars().take(length_max).collect()
}

/// The chart row to write for a recorded diagnosis.
pub fn to_new_problem(problem: &Problem) -> NewProblem {
    NewProblem {
        code_system: DIAGNOSIS_CODE_SYSTEM,
        code: clamp(&problem.code, CODE_LENGTH_MAX),
        label: clamp(&problem.label, LABEL_LENGTH_MAX),
        clinical_status: DIAGNOSIS_CLINICAL_STATUS,
        verification_status: DIAGNOSIS_VERIFICATION_STATUS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use serde_json::json;

    fn problem(code: &str, label: &str) -> Problem {
        Problem {
            code: code.to_string(),
            label: label.to_string(),
        }
    }

    fn recorded(id: &str, code: &str, label: &str) -> RecordedProblem {
        RecordedProblem {
            id: id.to_string(),
            code: code.to_string(),
            label: label.to_string(),
        }
    }

    fn cholera() -> Problem {
        problem("1A00", "Cholera")
    }

    fn diabetes() -> Problem {
        problem("5A11", "Type 2 diabetes")
    }

    fn diagnosis_field(id: &str, add_to_problems: Option<bool>) -> Value {
        match add_to_problems {
            Some(flag) => json!({ "id": id, "fieldType": "diagnosis", "addToProblems": flag }),
            None => json!({ "id": id, "fieldType": "diagnosis" }),
        }
    }

    fn diagnosis_data(field_id: &str, value: Value) -> Value {
        json!({ "fieldId": field_id, "fieldType": "diagnosis", "value": value })
    }

    #[test]
    fn records_the_diagnoses_of_a_field_marked_add_to_problems() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([{ "code": "1A00", "desc": "Cholera" }])
            )]),
            &json!([diagnosis_field("field-1", Some(true))]),
        );

        assert_eq!(
            result,
            Projection {
                records_problems: true,
                problems: vec![cholera()],
            }
        );
    }

    // Forms authored before the flag existed have no `addToProblems`; they must
    // not start writing to patients' charts on upgrade.
    #[test]
    fn records_nothing_when_the_field_omits_the_flag() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([{ "code": "1A00", "desc": "Cholera" }])
            )]),
            &json!([diagnosis_field("field-1", None)]),
        );

        assert_eq!(
            result,
            Projection {
                records_problems: false,
                problems: vec![],
            }
        );
    }

    #[test]
    fn records_nothing_when_the_field_opts_out() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([{ "code": "1A00", "desc": "Cholera" }])
            )]),
            &json!([diagnosis_field("field-1", Some(false))]),
        );

        assert_eq!(
            result,
            Projection {
                records_problems: false,
                problems: vec![],
            }
        );
    }

    #[test]
    fn ignores_diagnoses_submitted_against_a_field_that_opted_out() {
        let result = problems_from_form_data(
            &json!([
                diagnosis_data("opted-out", json!([{ "code": "1A00", "desc": "Cholera" }])),
                diagnosis_data(
                    "field-1",
                    json!([{ "code": "5A11", "desc": "Type 2 diabetes" }])
                ),
            ]),
            &json!([
                diagnosis_field("opted-out", Some(false)),
                diagnosis_field("field-1", Some(true)),
            ]),
        );

        assert_eq!(result.problems, vec![diabetes()]);
    }

    #[test]
    fn deduplicates_a_diagnosis_entered_twice() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([
                    { "code": "1A00", "desc": "Cholera" },
                    { "code": "1A00", "desc": "Cholera" },
                ])
            )]),
            &json!([diagnosis_field("field-1", Some(true))]),
        );

        assert_eq!(result.problems, vec![cholera()]);
    }

    // Free-text diagnoses get a unique `0000-…` code when created, but events
    // saved before that share the bare "0000" placeholder — those must still
    // come through as separate problems.
    #[test]
    fn keeps_free_text_diagnoses_that_share_a_code_but_differ_in_label() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([
                    { "code": "0000", "desc": "Snake bite" },
                    { "code": "0000", "desc": "Scorpion sting" },
                ])
            )]),
            &json!([diagnosis_field("field-1", Some(true))]),
        );

        assert_eq!(result.problems.len(), 2);
    }

    #[test]
    fn skips_entries_missing_a_code_or_a_label() {
        let result = problems_from_form_data(
            &json!([diagnosis_data(
                "field-1",
                json!([
                    { "code": "", "desc": "No code" },
                    { "code": "1A00", "desc": "" },
                    { "code": "1A00", "desc": "Cholera" },
                ])
            )]),
            &json!([diagnosis_field("field-1", Some(true))]),
        );

        assert_eq!(result.problems, vec![cholera()]);
    }

    #[test]
    fn tolerates_values_that_are_not_arrays_of_diagnoses() {
        let values = vec![
            json!("not an array"),
            json!(42),
            Value::Null,
            json!({}),
            json!([1, "two"]),
        ];

        for value in values {
            let result = problems_from_form_data(
                &json!([diagnosis_data("field-1", value.clone())]),
                &json!([diagnosis_field("field-1", Some(true))]),
            );
            assert_eq!(
                result.problems,
                vec![],
                "value {value} should record nothing"
            );
        }
    }

    #[test]
    fn tolerates_form_data_and_fields_that_are_not_arrays() {
        assert_eq!(
            problems_from_form_data(&json!("nonsense"), &json!("nonsense")),
            Projection {
                records_problems: false,
                problems: vec![],
            }
        );

        assert_eq!(
            problems_from_form_data(
                &json!("nonsense"),
                &json!([diagnosis_field("field-1", Some(true))])
            ),
            Projection {
                records_problems: true,
                problems: vec![],
            }
        );
    }

    #[test]
    fn ignores_a_non_diagnosis_item_carrying_a_recording_fields_id() {
        let result = problems_from_form_data(
            &json!([{
                "fieldId": "field-1",
                "fieldType": "options",
                "value": [{ "code": "1A00", "desc": "Cholera" }],
            }]),
            &json!([diagnosis_field("field-1", Some(true))]),
        );

        assert_eq!(result.problems, vec![]);
    }

    #[test]
    fn creates_what_is_new_and_retires_what_is_gone() {
        let result = diff_problems(
            &[
                recorded("p1", "1A00", "Cholera"),
                recorded("p2", "5A11", "Type 2 diabetes"),
            ],
            &[cholera(), problem("BA00", "Hypertension")],
            &[],
        );

        assert_eq!(
            result,
            Diff {
                to_create: vec![problem("BA00", "Hypertension")],
                to_remove_ids: vec!["p2".to_string()],
            }
        );
    }

    #[test]
    fn is_a_no_op_when_nothing_changed() {
        let result = diff_problems(
            &[recorded("p1", "1A00", "Cholera")],
            &[cholera()],
            &[cholera()],
        );

        assert_eq!(
            result,
            Diff {
                to_create: vec![],
                to_remove_ids: vec![],
            }
        );
    }

    #[test]
    fn retires_everything_when_all_diagnoses_are_removed() {
        let result = diff_problems(&[recorded("p1", "1A00", "Cholera")], &[], &[cholera()]);

        assert_eq!(result.to_remove_ids, vec!["p1".to_string()]);
        assert_eq!(result.to_create, vec![]);
    }

    // A relabelled code is a different problem: the label is what a clinician
    // reads on the chart.
    #[test]
    fn treats_a_changed_label_as_a_replacement() {
        let result = diff_problems(
            &[recorded("p1", "0000", "Snake bite")],
            &[problem("0000", "Snake bite, left arm")],
            &[problem("0000", "Snake bite")],
        );

        assert_eq!(
            result.to_create,
            vec![problem("0000", "Snake bite, left arm")]
        );
        assert_eq!(result.to_remove_ids, vec!["p1".to_string()]);
    }

    // A brand-new event has asked for nothing yet, so every diagnosis is new.
    #[test]
    fn creates_everything_when_the_event_has_no_history() {
        let result = diff_problems(&[], &[cholera()], &[]);

        assert_eq!(result.to_create, vec![cholera()]);
    }

    #[test]
    fn does_not_recreate_a_diagnosis_taken_off_the_chart_by_hand() {
        let result = diff_problems(&[], &[cholera()], &[cholera()]);

        assert_eq!(
            result,
            Diff {
                to_create: vec![],
                to_remove_ids: vec![],
            }
        );
    }

    #[test]
    fn still_creates_a_diagnosis_newly_added_alongside_one_taken_off() {
        let result = diff_problems(&[], &[cholera(), diabetes()], &[cholera()]);

        assert_eq!(result.to_create, vec![diabetes()]);
    }

    #[test]
    fn records_an_icd11_problem_asserted_but_not_yet_confirmed() {
        assert_eq!(
            to_new_problem(&cholera()),
            NewProblem {
                code_system: "icd11",
                code: "1A00".to_string(),
                label: "Cholera".to_string(),
                clinical_status: "active",
                verification_status: "provisional",
            }
        );
    }

    // A free-text diagnosis is unbounded user input, and the columns upstream
    // are varchar(100) / varchar(255).
    #[test]
    fn clamps_code_and_label_to_their_column_widths() {
        let row = to_new_problem(&problem(&"c".repeat(300), &"l".repeat(300)));

        assert_eq!(row.code.chars().count(), CODE_LENGTH_MAX);
        assert_eq!(row.label.chars().count(), LABEL_LENGTH_MAX);
    }

    #[test]
    fn clamps_on_character_boundaries() {
        let row = to_new_problem(&problem(&"é".repeat(300), &"ح".repeat(300)));

        assert_eq!(row.code.chars().count(), CODE_LENGTH_MAX);
        assert_eq!(row.label.chars().count(), LABEL_LENGTH_MAX);
    }

    proptest! {
        #[test]
        fn never_yields_a_problem_with_an_empty_code_or_label(
            entries in prop::collection::vec((".*", ".*"), 0..12)
        ) {
            let value: Vec<Value> = entries
                .iter()
                .map(|(code, desc)| json!({ "code": code, "desc": desc }))
                .collect();

            let result = problems_from_form_data(
                &json!([diagnosis_data("field-1", json!(value))]),
                &json!([diagnosis_field("field-1", Some(true))]),
            );

            prop_assert!(result
                .problems
                .iter()
                .all(|p| !p.code.is_empty() && !p.label.is_empty()));
        }

        #[test]
        fn never_both_creates_and_retires_the_same_problem(
            existing in prop::collection::vec(("[a-z]{1,4}", ".*", ".*"), 0..8),
            desired in prop::collection::vec((".*", ".*"), 0..8),
            already_requested in prop::collection::vec((".*", ".*"), 0..8),
        ) {
            let existing: Vec<RecordedProblem> = existing
                .iter()
                .map(|(id, code, label)| recorded(id, code, label))
                .collect();
            let desired: Vec<Problem> =
                desired.iter().map(|(c, l)| problem(c, l)).collect();
            let already_requested: Vec<Problem> =
                already_requested.iter().map(|(c, l)| problem(c, l)).collect();

            let diff = diff_problems(&existing, &desired, &already_requested);

            let removed_keys: HashSet<String> = existing
                .iter()
                .filter(|p| diff.to_remove_ids.contains(&p.id))
                .map(recorded_key)
                .collect();

            prop_assert!(diff
                .to_create
                .iter()
                .all(|p| !removed_keys.contains(&problem_key(p))));
        }

        #[test]
        fn leaves_values_within_the_column_widths_untouched(
            code in ".{0,100}",
            label in ".{0,255}",
        ) {
            let row = to_new_problem(&problem(&code, &label));

            prop_assert_eq!(row.code, code);
            prop_assert_eq!(row.label, label);
        }
    }
}
