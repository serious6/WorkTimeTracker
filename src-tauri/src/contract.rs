//! Contract between the Rust commands and the browser fallback.
//!
//! The cases in `contract/domain-rules.json` are executed here and by
//! `src/features/storage/domain-rules.contract.test.ts`. Whenever one side
//! changes a rule without the other, one of the two suites fails.

use serde::Deserialize;
use serde_json::Value;

use crate::{
    auth::{
        ARGON2_ITERATIONS, ARGON2_MEMORY_KIB, ARGON2_PARALLELISM, LOGIN_LOCKOUT_MINUTES,
        MAX_LOGIN_ATTEMPTS, SESSION_TIMEOUT_MINUTES,
    },
    models::{
        adjusted_daily_target, Absence, AbsenceAudit, AuditLogEntry, ComplianceLimits, Credentials,
        ListRange, OvertimeAudit, OvertimeEntry, Project, ProjectBudget, SaveAbsence,
        SaveOvertimeEntry, SaveProject, SaveProjectBudget, SaveTimeEntry, TimeEntry,
        TimeEntryAudit, User, WorkSettings, AUDIT_LOG_LIMIT, DEFAULT_LIST_LIMIT,
        GERMAN_COMPLIANCE_LIMITS, MAX_LIST_LIMIT,
    },
    store::{OvertimeWriteError, Store, StoreError},
    test_support::{test_store, unique_email, unique_tag},
};

const RULES: &str = include_str!("../../contract/domain-rules.json");
const ENTITIES: &str = include_str!("../../contract/entities.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecurityLimits {
    session_timeout_minutes: u64,
    max_login_attempts: u32,
    login_lockout_minutes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Argon2Params {
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyDerivation {
    argon2id: Argon2Params,
    #[allow(dead_code)]
    pbkdf2_sha256_iterations: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListRanges {
    default_limit: i64,
    max_limit: i64,
    audit_log_limit: i64,
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
    #[serde(default)]
    normalized_date: Option<String>,
}

/// A daily target before and after an absence neutralises it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AbsenceTargetCase {
    name: String,
    daily_target_minutes: f64,
    working_day: bool,
    absence_type: Option<String>,
    target_minutes: f64,
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
fn pins_the_key_derivation_parameters_of_the_contract() {
    let derivation: KeyDerivation =
        serde_json::from_value(rules()["keyDerivation"].clone()).unwrap();

    assert_eq!(derivation.argon2id.memory_kib, ARGON2_MEMORY_KIB);
    assert_eq!(derivation.argon2id.iterations, ARGON2_ITERATIONS);
    assert_eq!(derivation.argon2id.parallelism, ARGON2_PARALLELISM);
}

#[test]
fn bounds_the_list_commands_like_the_contract() {
    let limits: ListRanges = serde_json::from_value(rules()["listRanges"].clone()).unwrap();

    assert_eq!(limits.default_limit, DEFAULT_LIST_LIMIT);
    assert_eq!(limits.max_limit, MAX_LIST_LIMIT);
    assert_eq!(limits.audit_log_limit, AUDIT_LOG_LIMIT);

    let mut range = ListRange {
        limit: Some(limits.max_limit + 1),
        ..ListRange::default()
    };
    range.validate().unwrap();
    assert_eq!(range.limit(), limits.max_limit);
    assert_eq!(ListRange::default().limit(), limits.default_limit);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityField {
    name: String,
    #[serde(rename = "type")]
    field_type: String,
    nullable: bool,
}

#[derive(Deserialize)]
struct Entity {
    fields: Vec<EntityField>,
}

/// Asserts that a serialized model carries exactly the fields of the entity,
/// with the declared type and nullability. Every optional field of the sample
/// is `None`, so a field declared nullable has to serialize as `null`.
fn assert_entity(name: &str, sample: Value) {
    let entities: Value = serde_json::from_str(ENTITIES).expect("the entities are valid JSON");
    let entity: Entity =
        serde_json::from_value(entities["entities"][name].clone()).expect("the entity is declared");
    let object = sample.as_object().expect("a model serializes to an object");

    let mut declared: Vec<&str> = entity
        .fields
        .iter()
        .map(|field| field.name.as_str())
        .collect();
    let mut serialized: Vec<&str> = object.keys().map(String::as_str).collect();
    declared.sort_unstable();
    serialized.sort_unstable();
    assert_eq!(
        declared, serialized,
        "{name} drifted from contract/entities.json"
    );

    for field in &entity.fields {
        let value = &object[&field.name];
        if field.nullable {
            assert!(
                value.is_null(),
                "{name}.{} is declared nullable but did not serialize as null",
                field.name
            );
            continue;
        }
        let matches = match field.field_type.as_str() {
            "integer" => value.is_i64(),
            "string" => value.is_string(),
            "boolean" => value.is_boolean(),
            "array" => value.is_array(),
            "object" => value.is_object(),
            other => panic!("{name}.{}: unknown type {other}", field.name),
        };
        assert!(
            matches,
            "{name}.{} is declared {} but serialized as {value}",
            field.name, field.field_type
        );
    }
}

fn json<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).expect("a model is serializable")
}

/// `contract/entities.json` is the authority for the shape of every entity that
/// crosses the IPC boundary. The same file is checked against the Zod schemas by
/// `src/features/storage/entities.contract.test.ts`.
#[test]
fn serializes_the_models_of_the_entity_contract() {
    let moment = "2026-08-30T10:00:00.000Z".to_owned();

    assert_entity(
        "user",
        json(&User {
            id: 1,
            email: "user@example.com".into(),
            created_at: moment.clone(),
        }),
    );
    assert_entity(
        "project",
        json(&Project {
            id: 1,
            name: "Website".into(),
            description: None,
            color: "#112233".into(),
            active: true,
            created_at: moment.clone(),
            updated_at: moment.clone(),
        }),
    );
    assert_entity(
        "timeEntry",
        json(&TimeEntry {
            id: 1,
            project_id: None,
            start_time: moment.clone(),
            end_time: None,
            entry_type: "work".into(),
            note: None,
            created_at: moment.clone(),
            updated_at: moment.clone(),
        }),
    );
    assert_entity(
        "timeEntryAudit",
        json(&TimeEntryAudit {
            id: 1,
            time_entry_id: 2,
            action: "created".into(),
            actor: "user@example.com".into(),
            old_value: None,
            new_value: None,
            recorded_at: moment.clone(),
        }),
    );
    assert_entity(
        "auditLogEntry",
        json(&AuditLogEntry {
            id: 1,
            entity: "timeEntry".into(),
            entity_id: 2,
            action: "create".into(),
            old_value: None,
            new_value: None,
            created_at: moment.clone(),
        }),
    );
    assert_entity(
        "projectBudget",
        json(&ProjectBudget {
            id: 1,
            project_id: 2,
            budget_minutes: 600,
            due_date: "2026-09-30".into(),
            created_at: moment.clone(),
            updated_at: moment.clone(),
        }),
    );
    assert_entity(
        "absence",
        json(&Absence {
            id: 1,
            absence_type: "vacation".into(),
            date: "2026-09-01".into(),
            created_at: moment.clone(),
            updated_at: moment.clone(),
        }),
    );
    assert_entity(
        "absenceAudit",
        json(&AbsenceAudit {
            id: 1,
            absence_id: 2,
            action: "created".into(),
            actor: "user@example.com".into(),
            old_value: None,
            new_value: None,
            recorded_at: moment.clone(),
        }),
    );
    assert_entity(
        "overtimeEntry",
        json(&OvertimeEntry {
            id: 1,
            effective_date: "2026-09-01".into(),
            minutes: -90,
            kind: "opening".into(),
            origin: "manual".into(),
            note: None,
            created_at: moment.clone(),
            updated_at: moment.clone(),
        }),
    );
    assert_entity(
        "overtimeAudit",
        json(&OvertimeAudit {
            id: 1,
            overtime_entry_id: 2,
            action: "created".into(),
            actor: "user@example.com".into(),
            old_value: None,
            new_value: None,
            recorded_at: moment,
        }),
    );
    assert_entity(
        "workSettings",
        json(&WorkSettings {
            weekly_target_minutes: 2400,
            working_days: vec!["monday".into()],
            week_starts_on: "monday".into(),
            compliance_limits: GERMAN_COMPLIANCE_LIMITS,
        }),
    );
    assert_entity(
        "complianceLimits",
        json(&ComplianceLimits {
            ..GERMAN_COMPLIANCE_LIMITS
        }),
    );
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

#[test]
fn validates_absences_like_the_contract() {
    for case in cases("absences") {
        let absence = check::<SaveAbsence>(&case, SaveAbsence::validate);
        if let (Some(absence), Some(date)) = (absence, case.normalized_date.as_ref()) {
            assert_eq!(&absence.date, date, "{}", case.name);
        }
    }
}

#[test]
fn neutralises_absence_targets_like_the_contract() {
    let targets: Vec<AbsenceTargetCase> =
        serde_json::from_value(rules()["absenceTargets"].clone()).unwrap();

    for case in targets {
        assert_eq!(
            adjusted_daily_target(
                case.daily_target_minutes,
                case.working_day,
                case.absence_type.as_deref(),
            ),
            case.target_minutes,
            "{}",
            case.name
        );
    }
}

/// The uniqueness fixtures run through `Store` against a real Postgres, so the
/// database constraints - not just the fixtures - are covered. Skipped without
/// a reachable database and required in CI (see `test_support::test_store`).
#[test]
fn enforces_uniqueness_like_the_contract() {
    let Some(store) = test_store() else {
        return;
    };
    let uniqueness: Vec<UniquenessCase> =
        serde_json::from_value(rules()["uniqueness"].clone()).unwrap();

    for case in uniqueness {
        match case.kind.as_str() {
            "email" => {
                let credentials: Credentials = serde_json::from_value(case.input).unwrap();
                // The fixture address is fixed, so it is scoped to this run to
                // keep repeated runs against the same database independent.
                let email = format!("{}.{}", unique_tag(), credentials.email);
                store.register_user(&email, "hash-one").unwrap();

                let error = store.register_user(&email, "hash-two").unwrap_err();

                assert!(
                    matches!(error, StoreError::UniqueViolation),
                    "{}",
                    case.name
                );
            }
            "projectBudget" => {
                let fixture: SaveProjectBudget = serde_json::from_value(case.input).unwrap();
                let user = store.register_user(&unique_email(), "hash").unwrap();
                let project = store
                    .insert_project(
                        user.id,
                        &SaveProject {
                            name: "Contract budget project".into(),
                            description: None,
                            color: "#336699".into(),
                            active: true,
                        },
                    )
                    .unwrap();
                let budget = SaveProjectBudget {
                    project_id: project.id,
                    ..fixture
                };
                store.insert_project_budget(user.id, &budget).unwrap();

                let error = store.insert_project_budget(user.id, &budget).unwrap_err();

                assert!(
                    matches!(error, StoreError::UniqueViolation),
                    "{}",
                    case.name
                );
            }
            "absenceDay" => {
                let absence: SaveAbsence = serde_json::from_value(case.input).unwrap();
                let user = store.register_user(&unique_email(), "hash").unwrap();
                store.insert_absence(user.id, &absence).unwrap();

                let error = store.insert_absence(user.id, &absence).unwrap_err();

                assert!(
                    matches!(error, StoreError::UniqueViolation),
                    "{}",
                    case.name
                );
            }
            _ => panic!("{}: unknown uniqueness kind", case.name),
        }
    }
}

#[test]
fn round_trips_absence_changes_and_audits_in_postgres() {
    let Some(store) = test_store() else {
        return;
    };
    let first_user = store.register_user(&unique_email(), "hash").unwrap();
    let second_user = store.register_user(&unique_email(), "hash").unwrap();
    let created = store
        .insert_absence(
            first_user.id,
            &SaveAbsence {
                absence_type: "vacation".into(),
                date: "2026-09-01".into(),
            },
        )
        .unwrap();
    let updated = store
        .update_absence(
            created.id,
            first_user.id,
            &SaveAbsence {
                absence_type: "sick".into(),
                date: "2026-09-02".into(),
            },
        )
        .unwrap();
    store.delete_absence(updated.id, first_user.id).unwrap();

    let audits = store.list_absence_audits(first_user.id).unwrap();
    assert_eq!(
        audits
            .iter()
            .map(|audit| audit.action.as_str())
            .collect::<Vec<_>>(),
        ["deleted", "updated", "created"]
    );
    assert!(audits[1]
        .old_value
        .as_deref()
        .is_some_and(|value| value.contains("vacation")));
    assert!(audits[1]
        .new_value
        .as_deref()
        .is_some_and(|value| value.contains("sick")));
    assert!(store
        .list_absences(second_user.id, &ListRange::default())
        .unwrap()
        .is_empty());
    assert!(store
        .list_absence_audits(second_user.id)
        .unwrap()
        .is_empty());
}

/// The explicit overtime records are per user, keep their audit trail and turn
/// manual as soon as they are edited.
#[test]
fn round_trips_overtime_changes_and_audits_in_postgres() {
    let Some(store) = test_store() else {
        return;
    };
    let first_user = store.register_user(&unique_email(), "hash").unwrap();
    let second_user = store.register_user(&unique_email(), "hash").unwrap();
    let created = store
        .insert_overtime_entry(
            first_user.id,
            &SaveOvertimeEntry {
                effective_date: "2026-09-01".into(),
                minutes: 600,
                kind: "opening".into(),
                origin: Some("automatic".into()),
                note: None,
            },
        )
        .unwrap();
    assert_eq!(created.origin, "automatic");

    let duplicate = store.insert_overtime_entry(
        first_user.id,
        &SaveOvertimeEntry {
            effective_date: "2026-09-01".into(),
            minutes: 30,
            kind: "adjustment".into(),
            origin: None,
            note: None,
        },
    );
    assert!(matches!(
        duplicate,
        Err(OvertimeWriteError::Store(StoreError::UniqueViolation))
    ));

    let second_opening = store.insert_overtime_entry(
        first_user.id,
        &SaveOvertimeEntry {
            effective_date: "2026-09-02".into(),
            minutes: 30,
            kind: "opening".into(),
            origin: None,
            note: None,
        },
    );
    assert!(matches!(
        second_opening,
        Err(OvertimeWriteError::SecondOpening)
    ));

    // Editing an automatic record makes it manual, so the automatic
    // calculation never overwrites the correction again.
    let updated = store
        .update_overtime_entry(
            created.id,
            first_user.id,
            &SaveOvertimeEntry {
                effective_date: "2026-09-03".into(),
                minutes: -120,
                kind: "balance".into(),
                origin: Some("automatic".into()),
                note: Some("corrected".into()),
            },
        )
        .unwrap();
    assert_eq!(updated.origin, "manual");
    assert_eq!(updated.minutes, -120);
    store
        .delete_overtime_entry(updated.id, first_user.id)
        .unwrap();

    let audits = store.list_overtime_audits(first_user.id).unwrap();
    assert_eq!(
        audits
            .iter()
            .map(|audit| audit.action.as_str())
            .collect::<Vec<_>>(),
        ["deleted", "updated", "created"]
    );
    assert!(audits[1]
        .old_value
        .as_deref()
        .is_some_and(|value| value.contains("\"origin\":\"automatic\"")));
    assert!(audits[1]
        .new_value
        .as_deref()
        .is_some_and(|value| value.contains("\"origin\":\"manual\"")));
    assert!(store
        .list_overtime_entries(second_user.id)
        .unwrap()
        .is_empty());
    assert!(store
        .list_overtime_audits(second_user.id)
        .unwrap()
        .is_empty());
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
