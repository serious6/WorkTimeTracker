//! Contract between the Rust commands and the browser fallback.
//!
//! The cases in `contract/domain-rules.json` are executed here and by
//! `src/features/storage/domain-rules.contract.test.ts`. Whenever one side
//! changes a rule without the other, one of the two suites fails.

use serde::Deserialize;
use serde_json::Value;

use crate::{
    auth::{LOGIN_LOCKOUT_MINUTES, MAX_LOGIN_ATTEMPTS, SESSION_TIMEOUT_MINUTES},
    models::{Credentials, SaveProject, SaveProjectBudget, SaveTimeEntry, WorkSettings},
};

const RULES: &str = include_str!("../../contract/domain-rules.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecurityLimits {
    session_timeout_minutes: u64,
    max_login_attempts: u32,
    login_lockout_minutes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    name: String,
    input: Value,
    accepted: bool,
    #[serde(default)]
    registration: bool,
    #[serde(default)]
    normalized_email: Option<String>,
    #[serde(default)]
    normalized_name: Option<String>,
    #[serde(default)]
    normalized_working_days: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlapCase {
    name: String,
    existing: Vec<SaveTimeEntry>,
    candidate: SaveTimeEntry,
    exclude_index: Option<usize>,
    overlaps: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UniquenessCase {
    name: String,
    kind: String,
    input: Value,
}

fn rules() -> Value {
    serde_json::from_str(RULES).expect("the contract is valid JSON")
}

fn cases(section: &str) -> Vec<Case> {
    serde_json::from_value(rules()[section].clone()).expect("the contract lists cases")
}

fn check<Input: for<'de> Deserialize<'de>>(
    case: &Case,
    validate: impl FnOnce(&mut Input) -> Result<(), &'static str>,
) -> Option<Input> {
    let Ok(mut input) = serde_json::from_value::<Input>(case.input.clone()) else {
        assert!(!case.accepted, "{}: input was refused by serde", case.name);
        return None;
    };
    let result = validate(&mut input);
    assert_eq!(result.is_ok(), case.accepted, "{}: {result:?}", case.name);
    result.is_ok().then_some(input)
}

#[test]
fn shares_the_security_limits_with_the_browser_fallback() {
    let limits: SecurityLimits = serde_json::from_value(rules()["securityLimits"].clone()).unwrap();

    assert_eq!(limits.session_timeout_minutes, SESSION_TIMEOUT_MINUTES);
    assert_eq!(limits.max_login_attempts, MAX_LOGIN_ATTEMPTS);
    assert_eq!(limits.login_lockout_minutes, LOGIN_LOCKOUT_MINUTES);
}

#[test]
fn validates_credentials_like_the_contract() {
    for case in cases("credentials") {
        let registration = case.registration;
        let credentials = check::<Credentials>(&case, |input| {
            if registration {
                input.validate_registration()
            } else {
                input.validate()
            }
        });
        if let (Some(credentials), Some(email)) = (credentials, case.normalized_email.as_ref()) {
            assert_eq!(&credentials.email, email, "{}", case.name);
        }
    }
}

#[test]
fn validates_projects_like_the_contract() {
    for case in cases("projects") {
        let project = check::<SaveProject>(&case, SaveProject::validate);
        if let (Some(project), Some(name)) = (project, case.normalized_name.as_ref()) {
            assert_eq!(&project.name, name, "{}", case.name);
        }
    }
}

#[test]
fn validates_time_entries_like_the_contract() {
    for case in cases("timeEntries") {
        check::<SaveTimeEntry>(&case, SaveTimeEntry::validate);
    }
}

#[test]
fn validates_project_budgets_like_the_contract() {
    for case in cases("projectBudgets") {
        check::<SaveProjectBudget>(&case, SaveProjectBudget::validate);
    }
}

#[test]
fn validates_work_settings_like_the_contract() {
    for case in cases("workSettings") {
        let settings = check::<WorkSettings>(&case, WorkSettings::validate);
        if let (Some(settings), Some(days)) = (settings, case.normalized_working_days.as_ref()) {
            assert_eq!(&settings.working_days, days, "{}", case.name);
        }
    }
}

fn insert_unique_email(existing: &mut Vec<String>, candidate: String) -> bool {
    if existing.iter().any(|email| email == &candidate) {
        return false;
    }
    existing.push(candidate);
    true
}

fn insert_unique_project_budget(
    existing_project_ids: &mut Vec<i64>,
    candidate_project_id: i64,
) -> bool {
    if existing_project_ids.contains(&candidate_project_id) {
        return false;
    }
    existing_project_ids.push(candidate_project_id);
    true
}

#[test]
fn enforces_uniqueness_like_the_contract() {
    let uniqueness: Vec<UniquenessCase> =
        serde_json::from_value(rules()["uniqueness"].clone()).unwrap();

    for case in uniqueness {
        match case.kind.as_str() {
            "email" => {
                let credentials: Credentials = serde_json::from_value(case.input).unwrap();
                let mut existing = Vec::new();
                assert!(
                    insert_unique_email(&mut existing, credentials.email.clone()),
                    "{}",
                    case.name
                );
                assert!(
                    !insert_unique_email(&mut existing, credentials.email),
                    "{}",
                    case.name
                );
            }
            "projectBudget" => {
                let budget: SaveProjectBudget = serde_json::from_value(case.input).unwrap();
                let mut existing = Vec::new();
                assert!(
                    insert_unique_project_budget(&mut existing, budget.project_id),
                    "{}",
                    case.name
                );
                assert!(
                    !insert_unique_project_budget(&mut existing, budget.project_id),
                    "{}",
                    case.name
                );
            }
            _ => panic!("{}: unknown uniqueness kind", case.name),
        }
    }
}

const OPEN_END: &str = "9999-12-31T23:59:59.999Z";

fn overlaps_existing(
    existing: &[SaveTimeEntry],
    candidate: &SaveTimeEntry,
    exclude_index: Option<usize>,
) -> bool {
    let candidate_end = candidate.end_time.as_deref().unwrap_or(OPEN_END);
    existing.iter().enumerate().any(|(index, entry)| {
        // Contract fixtures use 1-based indices to mirror persisted record IDs.
        if exclude_index.is_some_and(|exclude| exclude == index + 1) {
            return false;
        }
        let entry_end = entry.end_time.as_deref().unwrap_or(OPEN_END);
        entry.start_time.as_str() < candidate_end && entry_end > candidate.start_time.as_str()
    })
}

#[test]
fn detects_overlaps_like_the_contract() {
    let overlaps: Vec<OverlapCase> = serde_json::from_value(rules()["overlaps"].clone()).unwrap();

    for case in overlaps {
        assert_eq!(
            overlaps_existing(&case.existing, &case.candidate, case.exclude_index),
            case.overlaps,
            "{}",
            case.name
        );
    }
}
