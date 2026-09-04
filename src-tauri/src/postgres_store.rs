//! Postgres backend through a small `r2d2` pool.
//!
//! Ownership checks stay inside the SQL: caller-supplied record ids are matched
//! with `AND user_id = $n`, and foreign keys supplied by the caller are checked
//! the same way. Foreign and unknown ids both return [`StoreError::NotFound`].
//! Statements without a `user_id` predicate either run before a session exists
//! (`users`, `login_attempts`, auth audit inserts) or describe database
//! state (`app_metadata`, `schema_migrations`).

use std::time::Duration;

use chrono::Utc;
use postgres::error::SqlState;
use r2d2::{Pool, PooledConnection};
use r2d2_postgres::PostgresConnectionManager;
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::{
    auth::LOGIN_LOCKOUT_MINUTES,
    config::DbConfig,
    connection,
    models::{
        Absence, AbsenceAudit, AuditLogEntry, ComplianceLimits, ListRange, OvertimeAudit,
        OvertimeEntry, Project, ProjectBudget, SaveAbsence, SaveOvertimeEntry, SaveProject,
        SaveProjectBudget, SaveTimeEntry, SecurityAudit, TimeEntry, TimeEntryAudit, User,
        WorkSettings, AUDIT_LOG_LIMIT, AUTH_AUDIT_ENTITY, AUTH_AUDIT_RETENTION_DAYS,
        BUDGET_AUDIT_ENTITY, DEFAULT_WORKING_DAYS, ENTRY_TYPE_BREAK, GERMAN_COMPLIANCE_LIMITS,
        LOCKED_OUT_ACTION, OVERTIME_ORIGIN_MANUAL, PROJECT_AUDIT_ENTITY, USER_AUDIT_ENTITY,
        WORK_SETTINGS_AUDIT_ENTITY,
    },
    store::{
        LoginAttempt, LoginAttemptStore, OvertimeWriteError, Store, StoreError, SwitchEntryError,
        TimeEntryWriteError,
    },
};

const OPEN_END: &str = "9999-12-31T23:59:59.999Z";
const APP_VERSION_KEY: &str = "app_version";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Ordered migrations, applied exactly once each and tracked in
/// `schema_migrations`. `0000_init` is the complete current baseline schema.
/// `migrate` runs them inside one transaction, so a migration must not use a
/// statement that Postgres refuses in a transaction block, such as
/// `CREATE INDEX CONCURRENTLY` or `CREATE DATABASE`.
const MIGRATIONS: &[(&str, &str)] = &[("0000_init", include_str!("../../drizzle/0000_init.sql"))];

/// Arbitrary but stable key for the advisory lock that serializes `migrate`.
const MIGRATION_LOCK_KEY: i64 = 0x776f_726b_7469_6d65;

type Manager = PostgresConnectionManager<MakeRustlsConnect>;

pub struct PostgresStore {
    pool: Pool<Manager>,
}

/// Timestamp string in the ISO 8601 UTC/millisecond format expected by the frontend.
fn now_iso() -> String {
    iso(Utc::now())
}

fn iso(moment: chrono::DateTime<Utc>) -> String {
    moment.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

impl From<postgres::Error> for StoreError {
    fn from(error: postgres::Error) -> Self {
        if error
            .code()
            .is_some_and(|code| *code == SqlState::UNIQUE_VIOLATION)
        {
            Self::UniqueViolation
        } else {
            Self::Backend(error.to_string())
        }
    }
}

impl From<r2d2::Error> for StoreError {
    fn from(error: r2d2::Error) -> Self {
        Self::Backend(error.to_string())
    }
}

impl PostgresStore {
    /// Opens the configured database. Development and the test suites reach a
    /// local server without TLS; a production deployment reaches its remote
    /// server only over a verified TLS connection (`connection::prepare`).
    pub fn open(config: &DbConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let (postgres_config, tls) = connection::prepare(
            &config.database_url,
            config.mode,
            config.root_cert.as_deref(),
        )?;
        let manager = PostgresConnectionManager::new(postgres_config, tls);
        let pool = Pool::builder()
            .max_size(4)
            .connection_timeout(Duration::from_secs(5))
            .build(manager)?;
        let store = Self { pool };
        {
            let mut client = store.conn()?;
            if config.run_migrations {
                migrate(&mut client)?;
                // Only the process that applies the migrations records a
                // version: the row says which release established the schema,
                // and a client of a shared database must not overwrite it.
                write_app_version(&mut *client, APP_VERSION)?;
            } else {
                verify_migrations(&mut client)?;
            }
        }
        Ok(store)
    }

    /// Opens a local development database, the only kind the tests use.
    #[cfg(test)]
    pub fn connect(database_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        Self::open(&DbConfig {
            mode: crate::config::DeploymentMode::Development,
            database_url: database_url.to_owned(),
            root_cert: None,
            run_migrations: true,
        })
    }

    fn conn(&self) -> Result<PooledConnection<Manager>, StoreError> {
        Ok(self.pool.get()?)
    }

    fn assert_owns_project(
        client: &mut impl postgres::GenericClient,
        user_id: i64,
        project_id: Option<i64>,
    ) -> Result<(), StoreError> {
        let Some(project_id) = project_id else {
            return Ok(());
        };
        let owned: bool = client
            .query_one(
                "SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND user_id = $2)",
                &[&project_id, &user_id],
            )?
            .get(0);
        if owned {
            Ok(())
        } else {
            Err(StoreError::NotFound)
        }
    }
}

fn project_from_row(row: &postgres::Row) -> Project {
    Project {
        id: row.get(0),
        name: row.get(1),
        description: row.get(2),
        color: row.get(3),
        active: row.get(4),
        created_at: row.get(5),
        updated_at: row.get(6),
    }
}

fn entry_from_row(row: &postgres::Row) -> TimeEntry {
    TimeEntry {
        id: row.get(0),
        project_id: row.get(1),
        start_time: row.get(2),
        end_time: row.get(3),
        entry_type: row.get(4),
        note: row.get(5),
        created_at: row.get(6),
        updated_at: row.get(7),
    }
}

fn budget_from_row(row: &postgres::Row) -> ProjectBudget {
    ProjectBudget {
        id: row.get(0),
        project_id: row.get(1),
        budget_minutes: row.get(2),
        due_date: row.get(3),
        created_at: row.get(4),
        updated_at: row.get(5),
    }
}

fn audit_from_row(row: &postgres::Row) -> TimeEntryAudit {
    TimeEntryAudit {
        id: row.get(0),
        time_entry_id: row.get(1),
        action: row.get(2),
        actor: row.get(3),
        old_value: row.get(4),
        new_value: row.get(5),
        recorded_at: row.get(6),
    }
}

/// Collects the parameters of a list query. `$1` is always the user and `$2`
/// the row limit, the optional range bounds follow from `$3` on.
struct Params<'a> {
    values: Vec<&'a (dyn postgres::types::ToSql + Sync)>,
}

impl<'a> Params<'a> {
    fn new(user_id: &'a i64, limit: &'a i64) -> Self {
        Self {
            values: vec![user_id, limit],
        }
    }

    /// Adds a value and answers its placeholder number.
    fn push(&mut self, value: &'a String) -> usize {
        self.values.push(value);
        self.values.len()
    }

    fn as_slice(&self) -> &[&'a (dyn postgres::types::ToSql + Sync)] {
        &self.values
    }
}

/// The window of an audit trail, appended to a `WHERE user_id = $1` clause.
fn recorded_at_filter<'a>(range: &'a ListRange, params: &mut Params<'a>) -> String {
    let mut filter = String::new();
    if let Some(from) = &range.from {
        filter.push_str(&format!(" AND recorded_at >= ${}", params.push(from)));
    }
    if let Some(to) = &range.to {
        filter.push_str(&format!(" AND recorded_at < ${}", params.push(to)));
    }
    filter
}

const PROJECT_COLUMNS: &str = "id, name, description, color, active, created_at, updated_at";
const ENTRY_COLUMNS: &str =
    "id, project_id, start_time, end_time, entry_type, note, created_at, updated_at";
const BUDGET_COLUMNS: &str = "id, project_id, budget_minutes, due_date, created_at, updated_at";
const AUDIT_COLUMNS: &str = "id, time_entry_id, action, actor, old_value, new_value, recorded_at";
const ABSENCE_COLUMNS: &str = "id, absence_type, absence_date, created_at, updated_at";
const ABSENCE_AUDIT_COLUMNS: &str =
    "id, absence_id, action, actor, old_value, new_value, recorded_at";

fn absence_from_row(row: &postgres::Row) -> Absence {
    Absence {
        id: row.get(0),
        absence_type: row.get(1),
        date: row.get(2),
        created_at: row.get(3),
        updated_at: row.get(4),
    }
}

fn absence_audit_from_row(row: &postgres::Row) -> AbsenceAudit {
    AbsenceAudit {
        id: row.get(0),
        absence_id: row.get(1),
        action: row.get(2),
        actor: row.get(3),
        old_value: row.get(4),
        new_value: row.get(5),
        recorded_at: row.get(6),
    }
}

fn absence_snapshot(absence: &Absence) -> Option<String> {
    serde_json::to_string(absence).ok()
}

fn record_absence_audit(
    transaction: &mut postgres::Transaction,
    user_id: i64,
    absence_id: i64,
    action: &str,
    old_value: Option<&Absence>,
    new_value: Option<&Absence>,
) -> Result<(), StoreError> {
    let actor = actor(transaction, user_id)?;
    transaction.execute(
        "INSERT INTO absence_audits (user_id, absence_id, action, actor, old_value, new_value, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[
            &user_id,
            &absence_id,
            &action,
            &actor,
            &old_value.and_then(absence_snapshot),
            &new_value.and_then(absence_snapshot),
            &now_iso(),
        ],
    )?;
    Ok(())
}

fn read_absence(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<Absence, StoreError> {
    let row = client
        .query_opt(
            &format!("SELECT {ABSENCE_COLUMNS} FROM absences WHERE id = $1 AND user_id = $2"),
            &[&id, &user_id],
        )?
        .ok_or(StoreError::NotFound)?;
    Ok(absence_from_row(&row))
}

const OVERTIME_COLUMNS: &str =
    "id, effective_date, minutes, kind, origin, note, created_at, updated_at";
const OVERTIME_AUDIT_COLUMNS: &str =
    "id, overtime_entry_id, action, actor, old_value, new_value, recorded_at";

fn overtime_from_row(row: &postgres::Row) -> OvertimeEntry {
    OvertimeEntry {
        id: row.get(0),
        effective_date: row.get(1),
        minutes: row.get(2),
        kind: row.get(3),
        origin: row.get(4),
        note: row.get(5),
        created_at: row.get(6),
        updated_at: row.get(7),
    }
}

fn overtime_audit_from_row(row: &postgres::Row) -> OvertimeAudit {
    OvertimeAudit {
        id: row.get(0),
        overtime_entry_id: row.get(1),
        action: row.get(2),
        actor: row.get(3),
        old_value: row.get(4),
        new_value: row.get(5),
        recorded_at: row.get(6),
    }
}

/// The snapshot carries the origin, so a switch from `automatic` to `manual`
/// stays traceable in the trail.
fn overtime_snapshot(entry: &OvertimeEntry) -> Option<String> {
    serde_json::to_string(entry).ok()
}

fn record_overtime_audit(
    transaction: &mut postgres::Transaction,
    user_id: i64,
    overtime_entry_id: i64,
    action: &str,
    old_value: Option<&OvertimeEntry>,
    new_value: Option<&OvertimeEntry>,
) -> Result<(), StoreError> {
    let actor = actor(transaction, user_id)?;
    transaction.execute(
        "INSERT INTO overtime_audits (user_id, overtime_entry_id, action, actor, old_value, new_value, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[
            &user_id,
            &overtime_entry_id,
            &action,
            &actor,
            &old_value.and_then(overtime_snapshot),
            &new_value.and_then(overtime_snapshot),
            &now_iso(),
        ],
    )?;
    Ok(())
}

fn read_overtime_entry(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<OvertimeEntry, StoreError> {
    let row = client
        .query_opt(
            &format!(
                "SELECT {OVERTIME_COLUMNS} FROM overtime_entries WHERE id = $1 AND user_id = $2"
            ),
            &[&id, &user_id],
        )?
        .ok_or(StoreError::NotFound)?;
    Ok(overtime_from_row(&row))
}

/// Only one opening balance can exist per user; the check runs inside the
/// writing transaction and the partial unique index
/// `overtime_entries_opening_unique` backs it, so a second one cannot slip in
/// beside a concurrent writer either.
fn has_other_opening(
    client: &mut impl postgres::GenericClient,
    user_id: i64,
    exclude_id: Option<i64>,
) -> Result<bool, StoreError> {
    let row = client.query_one(
        "SELECT EXISTS (
             SELECT 1 FROM overtime_entries
             WHERE user_id = $1 AND kind = 'opening' AND ($2::BIGINT IS NULL OR id <> $2)
         )",
        &[&user_id, &exclude_id],
    )?;
    Ok(row.get(0))
}

/// Name of the partial unique index that keeps a user's opening balance unique.
const OPENING_UNIQUE_INDEX: &str = "overtime_entries_opening_unique";

/// Maps a failed overtime write, so the index that guards the single opening
/// balance reports the same conflict as the check inside the transaction.
fn overtime_write_error(error: postgres::Error) -> OvertimeWriteError {
    if error
        .as_db_error()
        .and_then(|db_error| db_error.constraint())
        .is_some_and(|constraint| constraint == OPENING_UNIQUE_INDEX)
    {
        return OvertimeWriteError::SecondOpening;
    }
    OvertimeWriteError::Store(StoreError::from(error))
}

fn entry_snapshot(entry: &TimeEntry) -> Option<String> {
    serde_json::to_string(entry).ok()
}

const SECURITY_AUDIT_COLUMNS: &str =
    "id, entity, entity_id, action, actor, old_value, new_value, recorded_at";

fn security_audit_from_row(row: &postgres::Row) -> SecurityAudit {
    SecurityAudit {
        id: row.get(0),
        entity: row.get(1),
        entity_id: row.get(2),
        action: row.get(3),
        actor: row.get(4),
        old_value: row.get(5),
        new_value: row.get(6),
        recorded_at: row.get(7),
    }
}

/// The audited fields of a project. `id` and the timestamps are left out: the
/// trail records what the user changed, not the bookkeeping of the row.
fn project_payload(project: &Project) -> serde_json::Value {
    serde_json::json!({
        "name": project.name,
        "description": project.description,
        "color": project.color,
        "active": project.active,
    })
}

fn budget_payload(budget: &ProjectBudget) -> serde_json::Value {
    serde_json::json!({
        "projectId": budget.project_id,
        "budgetMinutes": budget.budget_minutes,
        "dueDate": budget.due_date,
    })
}

fn settings_payload(settings: &WorkSettings) -> serde_json::Value {
    let limits = settings.compliance_limits;
    serde_json::json!({
        "weeklyTargetMinutes": settings.weekly_target_minutes,
        "workingDays": settings.working_days,
        "weekStartsOn": settings.week_starts_on,
        "breakThresholdMinutes": limits.break_threshold_minutes,
        "requiredBreakMinutes": limits.required_break_minutes,
        "longBreakThresholdMinutes": limits.long_break_threshold_minutes,
        "requiredLongBreakMinutes": limits.required_long_break_minutes,
        "minBreakBlockMinutes": limits.min_break_block_minutes,
        "maxContinuousWorkMinutes": limits.max_continuous_work_minutes,
        "maxDailyWorkMinutes": limits.max_daily_work_minutes,
        "minRestMinutes": limits.min_rest_minutes,
    })
}

/// The fields that differ between two payloads, so a wide record is stored as
/// its changed fields instead of two full snapshots. `None` means nothing
/// changed, which suppresses the record: saving without an edit writes no row.
fn field_diff(old: &serde_json::Value, new: &serde_json::Value) -> Option<(String, String)> {
    let empty = serde_json::Map::new();
    let old = old.as_object().unwrap_or(&empty);
    let new = new.as_object().unwrap_or(&empty);
    let mut changed_old = serde_json::Map::new();
    let mut changed_new = serde_json::Map::new();
    for field in old.keys().chain(new.keys()) {
        let before = old.get(field).unwrap_or(&serde_json::Value::Null);
        let after = new.get(field).unwrap_or(&serde_json::Value::Null);
        if before != after {
            changed_old.insert(field.clone(), before.clone());
            changed_new.insert(field.clone(), after.clone());
        }
    }
    if changed_new.is_empty() {
        return None;
    }
    Some((
        serde_json::Value::Object(changed_old).to_string(),
        serde_json::Value::Object(changed_new).to_string(),
    ))
}

/// One record of the shared trail, before it is appended.
struct SecurityAuditRecord<'a> {
    /// `None` for an event that belongs to no account, such as a failed login
    /// of an unknown e-mail.
    user_id: Option<i64>,
    actor: &'a str,
    entity: &'a str,
    /// `None` where the action names no row, such as the work settings.
    entity_id: Option<i64>,
    action: &'a str,
    old_value: Option<&'a str>,
    new_value: Option<&'a str>,
}

/// Appends to the shared trail of identity and configuration changes. Every
/// write path goes through this one place, so the recorded shape cannot drift.
/// The values carry the audited fields only and never a password or a hash.
fn record_security_audit(
    client: &mut impl postgres::GenericClient,
    record: SecurityAuditRecord<'_>,
) -> Result<(), StoreError> {
    client.execute(
        "INSERT INTO security_audits (user_id, entity, entity_id, action, actor, old_value, new_value, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        &[
            &record.user_id,
            &record.entity,
            &record.entity_id,
            &record.action,
            &record.actor,
            &record.old_value,
            &record.new_value,
            &now_iso(),
        ],
    )?;
    Ok(())
}

/// Records the change of a configuration record of the signed in user, with
/// the changed fields only. An update without a change writes nothing.
fn record_config_audit(
    client: &mut impl postgres::GenericClient,
    user_id: i64,
    entity: &str,
    entity_id: Option<i64>,
    action: &str,
    old_value: Option<serde_json::Value>,
    new_value: Option<serde_json::Value>,
) -> Result<(), StoreError> {
    let (old_text, new_text) = match (&old_value, &new_value) {
        (Some(old), Some(new)) => match field_diff(old, new) {
            None => return Ok(()),
            Some((old, new)) => (Some(old), Some(new)),
        },
        (old, new) => (
            old.as_ref().map(ToString::to_string),
            new.as_ref().map(ToString::to_string),
        ),
    };
    let actor = actor(client, user_id)?;
    record_security_audit(
        client,
        SecurityAuditRecord {
            user_id: Some(user_id),
            actor: &actor,
            entity,
            entity_id,
            action,
            old_value: old_text.as_deref(),
            new_value: new_text.as_deref(),
        },
    )
}

/// Answers whether the running lockout of this email is already recorded, so
/// the repeated attempts it rejects add no further record.
fn locked_out_recently(
    client: &mut impl postgres::GenericClient,
    email: &str,
) -> Result<bool, StoreError> {
    let since = iso(Utc::now() - chrono::Duration::minutes(LOGIN_LOCKOUT_MINUTES as i64));
    let row = client.query_one(
        "SELECT EXISTS (
           SELECT 1 FROM security_audits
           WHERE entity = $1 AND action = $2 AND actor = $3 AND recorded_at > $4
         )",
        &[&AUTH_AUDIT_ENTITY, &LOCKED_OUT_ACTION, &email, &since],
    )?;
    Ok(row.get(0))
}

/// Deletes the auth events that served their retention. It never touches the
/// records of another entity, so the compliance trails are out of its reach.
fn prune_auth_audits(client: &mut impl postgres::GenericClient) -> Result<(), StoreError> {
    let expiry = iso(Utc::now() - chrono::Duration::days(AUTH_AUDIT_RETENTION_DAYS));
    client.execute(
        "DELETE FROM security_audits WHERE entity = $1 AND recorded_at < $2",
        &[&AUTH_AUDIT_ENTITY, &expiry],
    )?;
    Ok(())
}

/// The email of the signed in user identifies the actor of a change.
fn actor(client: &mut impl postgres::GenericClient, user_id: i64) -> Result<String, StoreError> {
    let email: Option<String> = client
        .query_opt("SELECT email FROM users WHERE id = $1", &[&user_id])?
        .map(|row| row.get(0));
    Ok(email.unwrap_or_else(|| format!("user:{user_id}")))
}

/// Applies every not yet recorded migration in order, all within one
/// transaction that first takes a transaction-scoped advisory lock. The lock
/// serializes concurrent starts before any DDL runs, because
/// `CREATE TABLE IF NOT EXISTS` is not race free in Postgres: two sessions
/// creating the same table at once make one of them fail with a duplicate key
/// on `pg_type`. A second process therefore waits and then sees the already
/// recorded versions.
fn migrate(client: &mut postgres::Client) -> Result<(), StoreError> {
    let mut transaction = client.transaction()?;
    transaction.execute("SELECT pg_advisory_xact_lock($1)", &[&MIGRATION_LOCK_KEY])?;
    transaction.batch_execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version TEXT PRIMARY KEY,
           applied_at TEXT NOT NULL
         )",
    )?;
    for (version, sql) in MIGRATIONS {
        let applied: bool = transaction
            .query_one(
                "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)",
                &[version],
            )?
            .get(0);
        if !applied {
            transaction.batch_execute(sql)?;
            transaction.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)",
                &[version, &now_iso()],
            )?;
        }
    }
    transaction.commit()?;
    Ok(())
}

/// The production database is migrated by a deliberate, separately approved
/// step, so a starting client only checks that the schema it expects is
/// already there instead of changing a shared database on its own.
fn verify_migrations(client: &mut postgres::Client) -> Result<(), StoreError> {
    let recorded: bool = client
        .query_one("SELECT to_regclass('schema_migrations') IS NOT NULL", &[])?
        .get(0);
    let missing: Vec<&str> = if recorded {
        let applied: Vec<String> = client
            .query("SELECT version FROM schema_migrations", &[])?
            .iter()
            .map(|row| row.get(0))
            .collect();
        MIGRATIONS
            .iter()
            .map(|(version, _)| *version)
            .filter(|version| !applied.iter().any(|entry| entry == version))
            .collect()
    } else {
        MIGRATIONS.iter().map(|(version, _)| *version).collect()
    };
    if missing.is_empty() {
        Ok(())
    } else {
        Err(StoreError::Backend(format!(
            "the database is missing the migrations {}; apply them with the migration role before starting the application",
            missing.join(", ")
        )))
    }
}

fn write_app_version(
    client: &mut impl postgres::GenericClient,
    version: &str,
) -> Result<(), StoreError> {
    client.execute(
        "INSERT INTO app_metadata (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2 WHERE app_metadata.value <> $2",
        &[&APP_VERSION_KEY, &version],
    )?;
    Ok(())
}

fn record_audit(
    transaction: &mut postgres::Transaction,
    user_id: i64,
    time_entry_id: i64,
    action: &str,
    old_value: Option<&TimeEntry>,
    new_value: Option<&TimeEntry>,
) -> Result<(), StoreError> {
    let actor = actor(transaction, user_id)?;
    transaction.execute(
        "INSERT INTO time_entry_audits (user_id, time_entry_id, action, actor, old_value, new_value, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[
            &user_id,
            &time_entry_id,
            &action,
            &actor,
            &old_value.and_then(entry_snapshot),
            &new_value.and_then(entry_snapshot),
            &now_iso(),
        ],
    )?;
    Ok(())
}

/// Reads the row an update or a delete is about to change and locks it until
/// the transaction ends. Without the lock two concurrent updates could read the
/// same original value, and the trail would record a transition that never
/// happened.
fn find_budget(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<Option<ProjectBudget>, StoreError> {
    Ok(client
        .query_opt(
            &format!(
                "SELECT {BUDGET_COLUMNS} FROM project_budgets
                 WHERE id = $1 AND user_id = $2 FOR UPDATE"
            ),
            &[&id, &user_id],
        )?
        .as_ref()
        .map(budget_from_row))
}

/// Locks the project for the rest of the transaction, like [`find_budget`].
fn find_project(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<Option<Project>, StoreError> {
    Ok(client
        .query_opt(
            &format!(
                "SELECT {PROJECT_COLUMNS} FROM projects
                 WHERE id = $1 AND user_id = $2 FOR UPDATE"
            ),
            &[&id, &user_id],
        )?
        .as_ref()
        .map(project_from_row))
}

/// The budgets a project delete takes with it, locked so the cascade cannot
/// remove a row this transaction has not recorded.
fn budgets_of_project(
    client: &mut impl postgres::GenericClient,
    project_id: i64,
    user_id: i64,
) -> Result<Vec<ProjectBudget>, StoreError> {
    Ok(client
        .query(
            &format!(
                "SELECT {BUDGET_COLUMNS} FROM project_budgets
                 WHERE project_id = $1 AND user_id = $2 FOR UPDATE"
            ),
            &[&project_id, &user_id],
        )?
        .iter()
        .map(budget_from_row)
        .collect())
}

fn read_entry(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<TimeEntry, StoreError> {
    let row = client
        .query_opt(
            &format!("SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND user_id = $2"),
            &[&id, &user_id],
        )?
        .ok_or(StoreError::NotFound)?;
    Ok(entry_from_row(&row))
}

fn entry_is_break(
    client: &mut impl postgres::GenericClient,
    id: i64,
    user_id: i64,
) -> Result<bool, StoreError> {
    Ok(read_entry(client, id, user_id)?.entry_type == ENTRY_TYPE_BREAK)
}

fn overlaps_tx(
    client: &mut impl postgres::GenericClient,
    user_id: i64,
    start_time: &str,
    end_time: Option<&str>,
    exclude_id: Option<i64>,
) -> Result<bool, StoreError> {
    let row = client.query_one(
        "SELECT EXISTS (
           SELECT 1 FROM time_entries
           WHERE user_id = $5
             AND ($3::BIGINT IS NULL OR id <> $3)
             AND start_time < $2
             AND COALESCE(end_time, $4) > $1
         )",
        &[
            &start_time,
            &end_time.unwrap_or(OPEN_END),
            &exclude_id,
            &OPEN_END,
            &user_id,
        ],
    )?;
    Ok(row.get(0))
}

impl LoginAttemptStore for PostgresStore {
    fn read_login_attempt(&self, email: &str) -> Result<Option<LoginAttempt>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT failures, last_failure FROM login_attempts WHERE email = $1",
                &[&email],
            )?
            .map(|row| LoginAttempt {
                failures: row.get(0),
                last_failure: row.get(1),
            }))
    }

    fn reserve_login_attempt(
        &self,
        email: &str,
        now: &str,
        expired_before: &str,
        limit: i64,
    ) -> Result<i64, StoreError> {
        let mut client = self.conn()?;
        // One transaction, so the counter another login reads already contains
        // this attempt. The upsert takes the row lock of the email, which
        // serializes the concurrent attempts of one account.
        let mut transaction = client.transaction()?;
        transaction.execute(
            "DELETE FROM login_attempts WHERE last_failure <= $1",
            &[&expired_before],
        )?;
        let row = transaction.query_one(
            "INSERT INTO login_attempts (email, failures, last_failure) VALUES ($1, 1, $2)
             ON CONFLICT (email) DO UPDATE SET
               failures = CASE
                 WHEN login_attempts.failures > $3 THEN login_attempts.failures
                 ELSE login_attempts.failures + 1
               END,
               last_failure = CASE
                 WHEN login_attempts.failures > $3 THEN login_attempts.last_failure
                 ELSE EXCLUDED.last_failure
               END
             RETURNING failures",
            &[&email, &now, &limit],
        )?;
        transaction.commit()?;
        Ok(row.get(0))
    }

    fn clear_login_attempts(&self, email: &str) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        client.execute("DELETE FROM login_attempts WHERE email = $1", &[&email])?;
        Ok(())
    }
}

fn read_settings_of(
    client: &mut impl postgres::GenericClient,
    user_id: i64,
) -> Result<WorkSettings, StoreError> {
    let row = client.query_opt(
        "SELECT weekly_target_minutes, working_days, week_starts_on,
                break_threshold_minutes, required_break_minutes, long_break_threshold_minutes,
                required_long_break_minutes, min_break_block_minutes, max_continuous_work_minutes,
                max_daily_work_minutes, min_rest_minutes
         FROM work_settings WHERE user_id = $1",
        &[&user_id],
    )?;
    let Some(row) = row else {
        return Ok(WorkSettings {
            weekly_target_minutes: 2_400,
            working_days: DEFAULT_WORKING_DAYS
                .iter()
                .map(|day| (*day).to_owned())
                .collect(),
            week_starts_on: "monday".into(),
            compliance_limits: GERMAN_COMPLIANCE_LIMITS,
        });
    };
    let working_days_text: String = row.get(1);
    let working_days: Vec<String> = working_days_text
        .split(',')
        .map(str::trim)
        .filter(|day| !day.is_empty())
        .map(str::to_owned)
        .collect();
    Ok(WorkSettings {
        weekly_target_minutes: row.get(0),
        working_days: if working_days.is_empty() {
            DEFAULT_WORKING_DAYS
                .iter()
                .map(|day| (*day).to_owned())
                .collect()
        } else {
            working_days
        },
        week_starts_on: row.get(2),
        compliance_limits: ComplianceLimits {
            break_threshold_minutes: row.get(3),
            required_break_minutes: row.get(4),
            long_break_threshold_minutes: row.get(5),
            required_long_break_minutes: row.get(6),
            min_break_block_minutes: row.get(7),
            max_continuous_work_minutes: row.get(8),
            max_daily_work_minutes: row.get(9),
            min_rest_minutes: row.get(10),
        },
    })
}

impl Store for PostgresStore {
    fn list_projects(&self, user_id: i64) -> Result<Vec<Project>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE user_id = $1 ORDER BY name"),
            &[&user_id],
        )?;
        Ok(rows.iter().map(project_from_row).collect())
    }

    fn insert_project(&self, user_id: i64, input: &SaveProject) -> Result<Project, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO projects (user_id, name, description, color, active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING {PROJECT_COLUMNS}"
            ),
            &[
                &user_id,
                &input.name,
                &input.description,
                &input.color,
                &input.active,
                &now,
            ],
        )?;
        let project = project_from_row(&row);
        // The audit is written in the same transaction as the change, so a
        // committed change can never be missing from the trail.
        record_config_audit(
            &mut transaction,
            user_id,
            PROJECT_AUDIT_ENTITY,
            Some(project.id),
            "project.created",
            None,
            Some(project_payload(&project)),
        )?;
        transaction.commit()?;
        Ok(project)
    }

    fn update_project(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProject,
    ) -> Result<Project, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = find_project(&mut transaction, id, user_id)?.ok_or(StoreError::NotFound)?;
        let row = transaction
            .query_opt(
                &format!(
                    "UPDATE projects SET name = $3, description = $4, color = $5, active = $6, updated_at = $7
                     WHERE id = $1 AND user_id = $2 RETURNING {PROJECT_COLUMNS}"
                ),
                &[
                    &id,
                    &user_id,
                    &input.name,
                    &input.description,
                    &input.color,
                    &input.active,
                    &now_iso(),
                ],
            )?
            .ok_or(StoreError::NotFound)?;
        let updated = project_from_row(&row);
        record_config_audit(
            &mut transaction,
            user_id,
            PROJECT_AUDIT_ENTITY,
            Some(updated.id),
            "project.updated",
            Some(project_payload(&current)),
            Some(project_payload(&updated)),
        )?;
        transaction.commit()?;
        Ok(updated)
    }

    fn delete_project(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        // The delete is refused before anything is read when the id names no
        // project of this user, so a foreign id cannot be told apart from an
        // unknown one.
        let deleted = find_project(&mut transaction, id, user_id)?.ok_or(StoreError::NotFound)?;
        let affected: Vec<TimeEntry> = transaction
            .query(
                &format!(
                    "SELECT {ENTRY_COLUMNS} FROM time_entries WHERE project_id = $1 AND user_id = $2"
                ),
                &[&id, &user_id],
            )?
            .iter()
            .map(entry_from_row)
            .collect();
        // The delete cascades to the budget of the project, so it is read
        // before the cascade and recorded as the deletion it is.
        let budgets = budgets_of_project(&mut transaction, id, user_id)?;
        transaction.execute(
            "DELETE FROM projects WHERE id = $1 AND user_id = $2",
            &[&id, &user_id],
        )?;
        // The trail keeps the name of the project, so it stays readable after
        // the row is gone and the entries show as belonging to no project.
        record_config_audit(
            &mut transaction,
            user_id,
            PROJECT_AUDIT_ENTITY,
            Some(id),
            "project.deleted",
            Some(project_payload(&deleted)),
            None,
        )?;
        for budget in &budgets {
            record_config_audit(
                &mut transaction,
                user_id,
                BUDGET_AUDIT_ENTITY,
                Some(budget.id),
                "budget.deleted",
                Some(budget_payload(budget)),
                None,
            )?;
        }
        for current in affected {
            let updated = read_entry(&mut transaction, current.id, user_id)?;
            record_audit(
                &mut transaction,
                user_id,
                current.id,
                "updated",
                Some(&current),
                Some(&updated),
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    fn list_time_entries(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<TimeEntry>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        // An entry counts for the window when it overlaps it, so an entry that
        // started before `from` and still runs is part of the answer.
        let mut filter = String::new();
        if let Some(from) = &range.from {
            filter.push_str(&format!(
                " AND (end_time IS NULL OR end_time > ${})",
                params.push(from)
            ));
        }
        if let Some(to) = &range.to {
            filter.push_str(&format!(" AND start_time < ${}", params.push(to)));
        }
        let mut client = self.conn()?;
        // The newest rows are the interesting ones, the outer order stays
        // ascending so that callers keep their chronological list.
        let rows = client.query(
            &format!(
                "SELECT * FROM (
                     SELECT {ENTRY_COLUMNS} FROM time_entries WHERE user_id = $1{filter}
                     ORDER BY start_time DESC LIMIT $2
                 ) AS ranged ORDER BY start_time"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(entry_from_row).collect())
    }

    fn overlaps(
        &self,
        user_id: i64,
        start_time: &str,
        end_time: Option<&str>,
        exclude_id: Option<i64>,
    ) -> Result<bool, StoreError> {
        let mut client = self.conn()?;
        overlaps_tx(&mut *client, user_id, start_time, end_time, exclude_id)
    }

    fn create_time_entry(
        &self,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO time_entries (user_id, project_id, start_time, end_time, entry_type, note, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING {ENTRY_COLUMNS}"
            ),
            &[
                &user_id,
                &input.project_id,
                &input.start_time,
                &input.end_time,
                &input.entry_type(),
                &input.note,
                &now,
            ],
        ).map_err(StoreError::from)?;
        let entry = entry_from_row(&row);
        record_audit(
            &mut transaction,
            user_id,
            entry.id,
            "created",
            None,
            Some(&entry),
        )
        .map_err(TimeEntryWriteError::from)?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(entry)
    }

    fn update_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        if input.project_id.is_some()
            && input.entry_type.is_none()
            && entry_is_break(&mut transaction, id, user_id)?
        {
            return Err(TimeEntryWriteError::InvalidBreak);
        }
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            Some(id),
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)?;
        let current = read_entry(&mut transaction, id, user_id)?;
        let entry_type = input
            .entry_type
            .as_deref()
            .unwrap_or(current.entry_type.as_str());
        transaction
            .execute(
                "UPDATE time_entries SET project_id = $3, start_time = $4, end_time = $5, entry_type = $6, note = $7, updated_at = $8
                 WHERE id = $1 AND user_id = $2",
                &[
                    &id,
                    &user_id,
                    &input.project_id,
                    &input.start_time,
                    &input.end_time,
                    &entry_type,
                    &input.note,
                    &now_iso(),
                ],
            )
            .map_err(StoreError::from)?;
        let updated = read_entry(&mut transaction, id, user_id)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "updated",
            Some(&current),
            Some(&updated),
        )?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(updated)
    }

    fn update_time_entry_note(
        &self,
        id: i64,
        user_id: i64,
        note: Option<&str>,
    ) -> Result<TimeEntry, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = read_entry(&mut transaction, id, user_id)?;
        transaction.execute(
            "UPDATE time_entries SET note = $3, updated_at = $4 WHERE id = $1 AND user_id = $2",
            &[&id, &user_id, &note, &now_iso()],
        )?;
        let updated = read_entry(&mut transaction, id, user_id)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "updated",
            Some(&current),
            Some(&updated),
        )?;
        transaction.commit()?;
        Ok(updated)
    }

    fn switch_running_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, SwitchEntryError> {
        let mut client = self.conn().map_err(SwitchEntryError::from)?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        let current = read_entry(&mut transaction, id, user_id).map_err(SwitchEntryError::from)?;
        if current.end_time.is_some()
            || input.project_id.is_none()
            || input.end_time.is_some()
            || input.start_time <= current.start_time
        {
            return Err(SwitchEntryError::InvalidTimer);
        }
        transaction
            .execute(
                "UPDATE time_entries SET end_time = $3, updated_at = $4 WHERE id = $1 AND user_id = $2",
                &[&id, &user_id, &input.start_time, &now_iso()],
            )
            .map_err(StoreError::from)?;
        if overlaps_tx(
            &mut transaction,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )
        .map_err(SwitchEntryError::from)?
        {
            return Err(SwitchEntryError::Overlap);
        }
        let closed = read_entry(&mut transaction, id, user_id).map_err(SwitchEntryError::from)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "updated",
            Some(&current),
            Some(&closed),
        )
        .map_err(SwitchEntryError::from)?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, input.project_id)
            .map_err(SwitchEntryError::from)?;
        let now = now_iso();
        let row = transaction
            .query_one(
                &format!(
                    "INSERT INTO time_entries (user_id, project_id, start_time, end_time, entry_type, note, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING {ENTRY_COLUMNS}"
                ),
                &[
                    &user_id,
                    &input.project_id,
                    &input.start_time,
                    &input.end_time,
                    &input.entry_type(),
                    &input.note,
                    &now,
                ],
            )
            .map_err(StoreError::from)?;
        let created = entry_from_row(&row);
        record_audit(
            &mut transaction,
            user_id,
            created.id,
            "created",
            None,
            Some(&created),
        )
        .map_err(SwitchEntryError::from)?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(created)
    }

    fn delete_time_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        // The snapshot comes out of the delete itself, so a concurrent delete
        // of the same row cannot leave a second trail entry behind: only the
        // transaction that removed the row gets one back.
        let current = transaction
            .query_opt(
                &format!(
                    "DELETE FROM time_entries WHERE id = $1 AND user_id = $2
                     RETURNING {ENTRY_COLUMNS}"
                ),
                &[&id, &user_id],
            )?
            .map(|row| entry_from_row(&row))
            .ok_or(StoreError::NotFound)?;
        record_audit(
            &mut transaction,
            user_id,
            id,
            "deleted",
            Some(&current),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn list_time_entry_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<TimeEntryAudit>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        let filter = recorded_at_filter(range, &mut params);
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {AUDIT_COLUMNS} FROM time_entry_audits WHERE user_id = $1{filter}
                 ORDER BY recorded_at DESC, id DESC LIMIT $2"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(audit_from_row).collect())
    }

    fn list_audit_log(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<AuditLogEntry>, StoreError> {
        let range = ListRange {
            from: range.from.clone(),
            to: range.to.clone(),
            limit: Some(range.limit.unwrap_or(AUDIT_LOG_LIMIT).min(AUDIT_LOG_LIMIT)),
        };
        Ok(self
            .list_time_entry_audits(user_id, &range)?
            .into_iter()
            .map(|audit| AuditLogEntry {
                id: audit.id,
                entity: "timeEntry".into(),
                entity_id: audit.time_entry_id,
                action: audit.action.trim_end_matches('d').into(),
                old_value: audit.old_value,
                new_value: audit.new_value,
                created_at: audit.recorded_at,
            })
            .collect())
    }

    fn list_project_budgets(&self, user_id: i64) -> Result<Vec<ProjectBudget>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {BUDGET_COLUMNS} FROM project_budgets WHERE user_id = $1 ORDER BY due_date"
            ),
            &[&user_id],
        )?;
        Ok(rows.iter().map(budget_from_row).collect())
    }

    fn insert_project_budget(
        &self,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, Some(input.project_id))?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO project_budgets (user_id, project_id, budget_minutes, due_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $5) RETURNING {BUDGET_COLUMNS}"
            ),
            &[&user_id, &input.project_id, &input.budget_minutes, &input.due_date, &now],
        )?;
        let budget = budget_from_row(&row);
        record_config_audit(
            &mut transaction,
            user_id,
            BUDGET_AUDIT_ENTITY,
            Some(budget.id),
            "budget.created",
            None,
            Some(budget_payload(&budget)),
        )?;
        transaction.commit()?;
        Ok(budget)
    }

    fn update_project_budget(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        PostgresStore::assert_owns_project(&mut transaction, user_id, Some(input.project_id))?;
        let current = find_budget(&mut transaction, id, user_id)?.ok_or(StoreError::NotFound)?;
        let row = transaction
            .query_opt(
                &format!(
                    "UPDATE project_budgets SET project_id = $3, budget_minutes = $4, due_date = $5, updated_at = $6
                     WHERE id = $1 AND user_id = $2 RETURNING {BUDGET_COLUMNS}"
                ),
                &[
                    &id,
                    &user_id,
                    &input.project_id,
                    &input.budget_minutes,
                    &input.due_date,
                    &now_iso(),
                ],
            )?
            .ok_or(StoreError::NotFound)?;
        let updated = budget_from_row(&row);
        record_config_audit(
            &mut transaction,
            user_id,
            BUDGET_AUDIT_ENTITY,
            Some(updated.id),
            "budget.updated",
            Some(budget_payload(&current)),
            Some(budget_payload(&updated)),
        )?;
        transaction.commit()?;
        Ok(updated)
    }

    fn delete_project_budget(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let deleted = find_budget(&mut transaction, id, user_id)?.ok_or(StoreError::NotFound)?;
        transaction.execute(
            "DELETE FROM project_budgets WHERE id = $1 AND user_id = $2",
            &[&id, &user_id],
        )?;
        record_config_audit(
            &mut transaction,
            user_id,
            BUDGET_AUDIT_ENTITY,
            Some(id),
            "budget.deleted",
            Some(budget_payload(&deleted)),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn list_absences(&self, user_id: i64, range: &ListRange) -> Result<Vec<Absence>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        let mut filter = String::new();
        if let Some(from) = &range.from {
            filter.push_str(&format!(" AND absence_date >= ${}", params.push(from)));
        }
        if let Some(to) = &range.to {
            filter.push_str(&format!(" AND absence_date < ${}", params.push(to)));
        }
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT * FROM (
                     SELECT {ABSENCE_COLUMNS} FROM absences WHERE user_id = $1{filter}
                     ORDER BY absence_date DESC LIMIT $2
                 ) AS ranged ORDER BY absence_date"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(absence_from_row).collect())
    }

    fn insert_absence(&self, user_id: i64, input: &SaveAbsence) -> Result<Absence, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let now = now_iso();
        let row = transaction.query_one(
            &format!(
                "INSERT INTO absences (user_id, absence_type, absence_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $4) RETURNING {ABSENCE_COLUMNS}"
            ),
            &[&user_id, &input.absence_type, &input.date, &now],
        )?;
        let absence = absence_from_row(&row);
        record_absence_audit(
            &mut transaction,
            user_id,
            absence.id,
            "created",
            None,
            Some(&absence),
        )?;
        transaction.commit()?;
        Ok(absence)
    }

    fn update_absence(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveAbsence,
    ) -> Result<Absence, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = read_absence(&mut transaction, id, user_id)?;
        let row = transaction
            .query_opt(
                &format!(
                    "UPDATE absences SET absence_type = $3, absence_date = $4, updated_at = $5
                     WHERE id = $1 AND user_id = $2 RETURNING {ABSENCE_COLUMNS}"
                ),
                &[&id, &user_id, &input.absence_type, &input.date, &now_iso()],
            )?
            .ok_or(StoreError::NotFound)?;
        let absence = absence_from_row(&row);
        record_absence_audit(
            &mut transaction,
            user_id,
            id,
            "updated",
            Some(&current),
            Some(&absence),
        )?;
        transaction.commit()?;
        Ok(absence)
    }

    fn save_absences(
        &self,
        user_id: i64,
        inputs: &[SaveAbsence],
        replacement_ids: &[i64],
        update_id: Option<i64>,
    ) -> Result<Vec<Absence>, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let mut replacements = Vec::with_capacity(replacement_ids.len());
        for id in replacement_ids {
            replacements.push(read_absence(&mut transaction, *id, user_id)?);
        }
        let current = update_id
            .map(|id| read_absence(&mut transaction, id, user_id))
            .transpose()?;
        for absence in &replacements {
            transaction.execute(
                "DELETE FROM absences WHERE id = $1 AND user_id = $2",
                &[&absence.id, &user_id],
            )?;
            record_absence_audit(
                &mut transaction,
                user_id,
                absence.id,
                "deleted",
                Some(absence),
                None,
            )?;
        }
        let now = now_iso();
        let mut saved = Vec::with_capacity(inputs.len());
        for (index, input) in inputs.iter().enumerate() {
            let absence = if index == 0 && current.is_some() {
                let current = current.as_ref().expect("checked above");
                let row = transaction
                    .query_opt(
                        &format!(
                            "UPDATE absences SET absence_type = $3, absence_date = $4, updated_at = $5
                             WHERE id = $1 AND user_id = $2 RETURNING {ABSENCE_COLUMNS}"
                        ),
                        &[&current.id, &user_id, &input.absence_type, &input.date, &now],
                    )?
                    .ok_or(StoreError::NotFound)?;
                let updated = absence_from_row(&row);
                record_absence_audit(
                    &mut transaction,
                    user_id,
                    current.id,
                    "updated",
                    Some(current),
                    Some(&updated),
                )?;
                updated
            } else {
                let row = transaction.query_one(
                    &format!(
                        "INSERT INTO absences (user_id, absence_type, absence_date, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $4) RETURNING {ABSENCE_COLUMNS}"
                    ),
                    &[&user_id, &input.absence_type, &input.date, &now],
                )?;
                let created = absence_from_row(&row);
                record_absence_audit(
                    &mut transaction,
                    user_id,
                    created.id,
                    "created",
                    None,
                    Some(&created),
                )?;
                created
            };
            saved.push(absence);
        }
        transaction.commit()?;
        Ok(saved)
    }

    fn delete_absence(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        // The snapshot comes out of the delete itself, so a concurrent delete
        // of the same row cannot leave a second trail entry behind.
        let current = transaction
            .query_opt(
                &format!(
                    "DELETE FROM absences WHERE id = $1 AND user_id = $2
                     RETURNING {ABSENCE_COLUMNS}"
                ),
                &[&id, &user_id],
            )?
            .map(|row| absence_from_row(&row))
            .ok_or(StoreError::NotFound)?;
        record_absence_audit(
            &mut transaction,
            user_id,
            id,
            "deleted",
            Some(&current),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn list_absence_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<AbsenceAudit>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        let filter = recorded_at_filter(range, &mut params);
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {ABSENCE_AUDIT_COLUMNS} FROM absence_audits WHERE user_id = $1{filter}
                 ORDER BY recorded_at DESC, id DESC LIMIT $2"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(absence_audit_from_row).collect())
    }

    fn list_overtime_entries(&self, user_id: i64) -> Result<Vec<OvertimeEntry>, StoreError> {
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {OVERTIME_COLUMNS} FROM overtime_entries WHERE user_id = $1
                 ORDER BY effective_date DESC, id DESC"
            ),
            &[&user_id],
        )?;
        Ok(rows.iter().map(overtime_from_row).collect())
    }

    fn insert_overtime_entry(
        &self,
        user_id: i64,
        input: &SaveOvertimeEntry,
    ) -> Result<OvertimeEntry, OvertimeWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        if input.kind == "opening" && has_other_opening(&mut transaction, user_id, None)? {
            return Err(OvertimeWriteError::SecondOpening);
        }
        let now = now_iso();
        let row = transaction
            .query_one(
                &format!(
                    "INSERT INTO overtime_entries (user_id, effective_date, minutes, kind, origin, note, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING {OVERTIME_COLUMNS}"
                ),
                &[
                    &user_id,
                    &input.effective_date,
                    &input.minutes,
                    &input.kind,
                    &input.origin(),
                    &input.note,
                    &now,
                ],
            )
            .map_err(overtime_write_error)?;
        let entry = overtime_from_row(&row);
        record_overtime_audit(
            &mut transaction,
            user_id,
            entry.id,
            "created",
            None,
            Some(&entry),
        )?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(entry)
    }

    /// An edited record becomes `manual`, so the automatic calculation never
    /// overwrites the correction again.
    fn update_overtime_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveOvertimeEntry,
    ) -> Result<OvertimeEntry, OvertimeWriteError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction().map_err(StoreError::from)?;
        let current = read_overtime_entry(&mut transaction, id, user_id)?;
        if input.kind == "opening" && has_other_opening(&mut transaction, user_id, Some(id))? {
            return Err(OvertimeWriteError::SecondOpening);
        }
        let row = transaction
            .query_one(
                &format!(
                    "UPDATE overtime_entries
                     SET effective_date = $3, minutes = $4, kind = $5, origin = $6, note = $7, updated_at = $8
                     WHERE id = $1 AND user_id = $2 RETURNING {OVERTIME_COLUMNS}"
                ),
                &[
                    &id,
                    &user_id,
                    &input.effective_date,
                    &input.minutes,
                    &input.kind,
                    &OVERTIME_ORIGIN_MANUAL,
                    &input.note,
                    &now_iso(),
                ],
            )
            .map_err(overtime_write_error)?;
        let entry = overtime_from_row(&row);
        record_overtime_audit(
            &mut transaction,
            user_id,
            id,
            "updated",
            Some(&current),
            Some(&entry),
        )?;
        transaction.commit().map_err(StoreError::from)?;
        Ok(entry)
    }

    fn delete_overtime_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        // The snapshot comes out of the delete itself, so a concurrent delete
        // of the same row cannot leave a second trail entry behind.
        let current = transaction
            .query_opt(
                &format!(
                    "DELETE FROM overtime_entries WHERE id = $1 AND user_id = $2
                     RETURNING {OVERTIME_COLUMNS}"
                ),
                &[&id, &user_id],
            )?
            .map(|row| overtime_from_row(&row))
            .ok_or(StoreError::NotFound)?;
        record_overtime_audit(
            &mut transaction,
            user_id,
            id,
            "deleted",
            Some(&current),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn list_overtime_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<OvertimeAudit>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        let filter = recorded_at_filter(range, &mut params);
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {OVERTIME_AUDIT_COLUMNS} FROM overtime_audits WHERE user_id = $1{filter}
                 ORDER BY recorded_at DESC, id DESC LIMIT $2"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(overtime_audit_from_row).collect())
    }

    fn read_settings(&self, user_id: i64) -> Result<WorkSettings, StoreError> {
        let mut client = self.conn()?;
        read_settings_of(&mut *client, user_id)
    }

    fn write_settings(
        &self,
        user_id: i64,
        settings: &WorkSettings,
    ) -> Result<WorkSettings, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let current = read_settings_of(&mut transaction, user_id)?;
        let limits = settings.compliance_limits;
        transaction.execute(
            "INSERT INTO work_settings (user_id, weekly_target_minutes, working_days, week_starts_on,
               break_threshold_minutes, required_break_minutes, long_break_threshold_minutes,
               required_long_break_minutes, min_break_block_minutes, max_continuous_work_minutes,
               max_daily_work_minutes, min_rest_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (user_id) DO UPDATE
             SET weekly_target_minutes = $2, working_days = $3, week_starts_on = $4,
                 break_threshold_minutes = $5, required_break_minutes = $6,
                 long_break_threshold_minutes = $7, required_long_break_minutes = $8,
                 min_break_block_minutes = $9, max_continuous_work_minutes = $10,
                 max_daily_work_minutes = $11, min_rest_minutes = $12",
            &[
                &user_id,
                &settings.weekly_target_minutes,
                &settings.working_days.join(","),
                &settings.week_starts_on,
                &limits.break_threshold_minutes,
                &limits.required_break_minutes,
                &limits.long_break_threshold_minutes,
                &limits.required_long_break_minutes,
                &limits.min_break_block_minutes,
                &limits.max_continuous_work_minutes,
                &limits.max_daily_work_minutes,
                &limits.min_rest_minutes,
            ],
        )?;
        let updated = read_settings_of(&mut transaction, user_id)?;
        // Saving the settings without changing a value records nothing, so a
        // repeated save cannot flood the trail.
        record_config_audit(
            &mut transaction,
            user_id,
            WORK_SETTINGS_AUDIT_ENTITY,
            None,
            "work_settings.updated",
            Some(settings_payload(&current)),
            Some(settings_payload(&updated)),
        )?;
        transaction.commit()?;
        Ok(updated)
    }

    fn read_user(&self, id: i64) -> Result<Option<User>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT id, email, created_at FROM users WHERE id = $1",
                &[&id],
            )?
            .map(|row| User {
                id: row.get(0),
                email: row.get(1),
                created_at: row.get(2),
            }))
    }

    fn read_password_hash(&self, email: &str) -> Result<Option<(i64, String)>, StoreError> {
        let mut client = self.conn()?;
        Ok(client
            .query_opt(
                "SELECT id, password_hash FROM users WHERE email = $1",
                &[&email],
            )?
            .map(|row| (row.get(0), row.get(1))))
    }

    fn list_security_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<SecurityAudit>, StoreError> {
        let limit = range.limit();
        let mut params = Params::new(&user_id, &limit);
        let filter = recorded_at_filter(range, &mut params);
        let mut client = self.conn()?;
        let rows = client.query(
            &format!(
                "SELECT {SECURITY_AUDIT_COLUMNS} FROM security_audits
                 WHERE user_id = $1{filter} ORDER BY recorded_at DESC, id DESC LIMIT $2"
            ),
            params.as_slice(),
        )?;
        Ok(rows.iter().map(security_audit_from_row).collect())
    }

    fn record_auth_event(&self, email: &str, action: &str) -> Result<(), StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        // Evidence of a failed sign in stays after the counter of the lockout
        // is evicted, and it is kept for the retention of the auth events.
        prune_auth_audits(&mut transaction)?;
        // Every attempt during a lockout is rejected as rate limited, so only
        // the first one is recorded: one record per lockout, instead of one
        // per request of an unauthenticated caller.
        if action == LOCKED_OUT_ACTION && locked_out_recently(&mut transaction, email)? {
            return Ok(());
        }
        let user_id: Option<i64> = transaction
            .query_opt("SELECT id FROM users WHERE email = $1", &[&email])?
            .map(|row| row.get(0));
        record_security_audit(
            &mut transaction,
            SecurityAuditRecord {
                user_id,
                actor: email,
                entity: AUTH_AUDIT_ENTITY,
                entity_id: user_id,
                action,
                old_value: None,
                new_value: None,
            },
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn register_user(&self, email: &str, password_hash: &str) -> Result<User, StoreError> {
        let mut client = self.conn()?;
        let mut transaction = client.transaction()?;
        let first_user: i64 = transaction
            .query_one("SELECT COUNT(*) FROM users", &[])?
            .get(0);
        let now = now_iso();
        let row = transaction.query_one(
            "INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3)
             RETURNING id, email, created_at",
            &[&email, &password_hash, &now],
        )?;
        let user = User {
            id: row.get(0),
            email: row.get(1),
            created_at: row.get(2),
        };
        // The email identifies the account; the password and its hash are
        // never part of an audit record.
        let registered = serde_json::json!({ "email": user.email }).to_string();
        record_security_audit(
            &mut transaction,
            SecurityAuditRecord {
                user_id: Some(user.id),
                actor: &user.email,
                entity: USER_AUDIT_ENTITY,
                entity_id: Some(user.id),
                action: "user.registered",
                old_value: None,
                new_value: Some(&registered),
            },
        )?;
        if first_user == 0 {
            for table in [
                "projects",
                "time_entries",
                "project_budgets",
                "work_settings",
            ] {
                transaction.execute(
                    &format!("UPDATE {table} SET user_id = $1 WHERE user_id IS NULL"),
                    &[&user.id],
                )?;
            }
        }
        transaction.commit()?;
        Ok(user)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use postgres::NoTls;

    use crate::{
        config::DeploymentMode,
        models::{
            SaveAbsence, SaveOvertimeEntry, SaveProject, SaveProjectBudget, SaveTimeEntry,
            LOCKED_OUT_ACTION, LOGIN_FAILED_ACTION,
        },
        test_support::{fresh_database, test_store, unique_email},
    };

    /// A remote host is rejected by `connection::plan`, whose own tests cover
    /// the rules; this one keeps the store honest about using it.
    #[test]
    fn refuses_to_open_a_remote_database_outside_production() {
        let error = PostgresStore::connect("postgresql://user@db.codehub.org/database")
            .err()
            .expect("a remote host must be rejected before connecting");

        assert!(error.to_string().contains("is not local"), "{error}");
    }

    /// No DATABASE_URL/live server needed: guards the exact ISO 8601 format
    /// the frontend expects,
    /// e.g. `2024-01-01T12:34:56.789Z`. Regression test for a bug where a
    /// missing `%S` dropped the whole-seconds field.
    #[test]
    fn now_iso_matches_the_expected_timestamp_format() {
        let timestamp = now_iso();
        assert_eq!(timestamp.len(), "2024-01-01T12:34:56.789Z".len());
        assert_eq!(&timestamp[4..5], "-");
        assert_eq!(&timestamp[7..8], "-");
        assert_eq!(&timestamp[10..11], "T");
        assert_eq!(&timestamp[13..14], ":");
        assert_eq!(&timestamp[16..17], ":");
        assert_eq!(&timestamp[19..20], ".");
        assert_eq!(&timestamp[23..24], "Z");
        assert!(
            timestamp[0..4]
                .chars()
                .chain(timestamp[5..7].chars())
                .chain(timestamp[8..10].chars())
                .chain(timestamp[11..13].chars())
                .chain(timestamp[14..16].chars())
                .chain(timestamp[17..19].chars())
                .chain(timestamp[20..23].chars())
                .all(|c| c.is_ascii_digit()),
            "expected only digits in the numeric fields of {timestamp}"
        );
    }

    /// The counters behind the login lockout survive a restart of the process,
    /// so they must be readable through a second connection and disappear once
    /// their lockout has been served. An isolated database prevents concurrent
    /// tests from evicting this counter.
    #[test]
    fn counts_and_evicts_login_attempts_in_postgres() {
        let Some(database) = fresh_database() else {
            return;
        };
        let store = PostgresStore::connect(database.url()).unwrap();
        let email = unique_email();
        let kept = "1971-01-01T09:00:00.000Z";

        assert_eq!(
            store
                .reserve_login_attempt(&email, "1971-01-01T10:00:00.000Z", kept, 5)
                .unwrap(),
            1
        );
        assert_eq!(
            store
                .reserve_login_attempt(&email, "1971-01-01T10:01:00.000Z", kept, 5)
                .unwrap(),
            2
        );

        assert_eq!(
            store.read_login_attempt(&email).unwrap(),
            Some(LoginAttempt {
                failures: 2,
                last_failure: "1971-01-01T10:01:00.000Z".to_owned(),
            })
        );

        // An attempt of another email evicts the counters that served their
        // lockout, so the table cannot grow without bound.
        store
            .reserve_login_attempt(
                &unique_email(),
                "1971-01-01T10:31:00.000Z",
                "1971-01-01T10:30:00.000Z",
                5,
            )
            .unwrap();
        assert_eq!(store.read_login_attempt(&email).unwrap(), None);
    }

    /// The check and the count are one operation, so parallel logins of one
    /// email cannot pass the limit together.
    #[test]
    fn counts_concurrent_login_attempts_exactly_once_each() {
        let Some(store) = test_store() else {
            return;
        };
        let email = unique_email();
        let store = &store;
        let email = &email;

        let mut counted: Vec<i64> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    scope.spawn(|| {
                        store
                            .reserve_login_attempt(
                                email,
                                "2099-01-01T10:00:00.000Z",
                                "2099-01-01T09:00:00.000Z",
                                1000,
                            )
                            .unwrap()
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect()
        });
        counted.sort_unstable();

        assert_eq!(counted, (1..=8).collect::<Vec<i64>>());
    }

    /// The check inside the transaction cannot see an opening balance that a
    /// concurrent transaction has not committed yet, so the partial unique
    /// index has to reject the second one - as the same conflict.
    #[test]
    fn keeps_one_opening_balance_under_concurrent_writes() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let store = &store;

        let results: Vec<_> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|day| {
                    scope.spawn(move || {
                        store.insert_overtime_entry(
                            user.id,
                            &SaveOvertimeEntry {
                                effective_date: format!("2026-09-0{}", day + 1),
                                minutes: 60,
                                kind: "opening".into(),
                                origin: None,
                                note: None,
                            },
                        )
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect()
        });

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        for error in results.into_iter().filter_map(Result::err) {
            assert!(
                matches!(error, OvertimeWriteError::SecondOpening),
                "{error:?}"
            );
        }
        assert_eq!(store.list_overtime_entries(user.id).unwrap().len(), 1);
    }

    /// A list command must not answer with the whole table: the window is
    /// pushed into SQL and the limit bounds what is left.
    #[test]
    fn lists_only_the_entries_of_the_asked_window() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let project = store
            .insert_project(
                user.id,
                &SaveProject {
                    name: "Range".into(),
                    description: None,
                    color: "#112233".into(),
                    active: true,
                },
            )
            .unwrap();
        let entry = |day: &str| SaveTimeEntry {
            project_id: Some(project.id),
            start_time: format!("{day}T08:00:00.000Z"),
            end_time: Some(format!("{day}T09:00:00.000Z")),
            note: None,
            entry_type: None,
        };
        for day in ["2026-01-05", "2026-02-05", "2026-03-05"] {
            store.create_time_entry(user.id, &entry(day)).unwrap();
        }

        let window = ListRange {
            from: Some("2026-02-01".into()),
            to: Some("2026-03-01".into()),
            limit: None,
        };
        let found = store.list_time_entries(user.id, &window).unwrap();
        assert_eq!(found.len(), 1, "{found:?}");
        assert!(found[0].start_time.starts_with("2026-02-05"));

        let all = store
            .list_time_entries(user.id, &ListRange::default())
            .unwrap();
        assert_eq!(all.len(), 3);

        let newest = store
            .list_time_entries(
                user.id,
                &ListRange {
                    limit: Some(2),
                    ..ListRange::default()
                },
            )
            .unwrap();
        assert_eq!(newest.len(), 2);
        assert!(newest[0].start_time.starts_with("2026-02-05"));
        assert!(newest[1].start_time.starts_with("2026-03-05"));
    }

    #[test]
    fn forgets_the_login_attempts_of_one_email_only() {
        let Some(store) = test_store() else {
            return;
        };
        let email = unique_email();
        let other = unique_email();
        let kept = "1971-01-01T00:00:00.000Z";
        store
            .reserve_login_attempt(&email, "2026-08-30T10:00:00.000Z", kept, 5)
            .unwrap();
        store
            .reserve_login_attempt(&other, "2026-08-30T10:00:00.000Z", kept, 5)
            .unwrap();

        store.clear_login_attempts(&email).unwrap();

        assert_eq!(store.read_login_attempt(&email).unwrap(), None);
        assert!(store.read_login_attempt(&other).unwrap().is_some());
    }

    /// `CREATE TABLE IF NOT EXISTS` is not race free in Postgres, so several
    /// app instances starting against a fresh database at the same time used
    /// to fail with a duplicate key on `pg_type`.
    #[test]
    fn migrates_concurrent_connections_to_a_fresh_database() {
        let Some(database) = fresh_database() else {
            return;
        };
        let url = database.url();
        let failures: Vec<String> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    scope.spawn(|| {
                        PostgresStore::connect(url)
                            .err()
                            .map(|error| error.to_string())
                    })
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|handle| handle.join().unwrap())
                .collect()
        });

        assert!(
            failures.is_empty(),
            "concurrent migrations failed: {failures:?}"
        );

        let mut client = postgres::Client::connect(url, NoTls).unwrap();
        let versions: Vec<String> = client
            .query(
                "SELECT version FROM schema_migrations ORDER BY version",
                &[],
            )
            .unwrap()
            .into_iter()
            .map(|row| row.get(0))
            .collect();
        assert_eq!(versions, ["0000_init"]);
    }

    /// A production client never migrates a shared database on its own: it
    /// refuses to start until the deliberate migration step has run.
    #[test]
    fn refuses_an_unmigrated_database_when_it_may_not_migrate() {
        let Some(database) = fresh_database() else {
            return;
        };
        let config = DbConfig {
            mode: DeploymentMode::Development,
            database_url: database.url().to_owned(),
            root_cert: None,
            run_migrations: false,
        };

        let error = PostgresStore::open(&config)
            .err()
            .expect("an empty database is refused");
        assert!(
            error.to_string().contains("0000_init"),
            "{error} should name the missing migration"
        );

        PostgresStore::connect(database.url()).expect("the migration step applies the schema");
        PostgresStore::open(&config).expect("the migrated database is accepted");
    }

    #[test]
    fn round_trips_a_project_through_postgres() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();

        let created = store
            .insert_project(
                user.id,
                &SaveProject {
                    name: "Postgres project".into(),
                    description: None,
                    color: "#336699".into(),
                    active: true,
                },
            )
            .unwrap();
        assert_eq!(created.name, "Postgres project");
        // ISO 8601 UTC with milliseconds.
        assert!(created.created_at.ends_with('Z'));

        let listed = store.list_projects(user.id).unwrap();
        assert!(listed.iter().any(|project| project.id == created.id));

        store.delete_project(created.id, user.id).unwrap();
        assert!(store.list_projects(user.id).unwrap().is_empty());
    }

    #[test]
    fn detects_overlapping_time_entries() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let project = store
            .insert_project(
                user.id,
                &SaveProject {
                    name: "Overlap project".into(),
                    description: None,
                    color: "#336699".into(),
                    active: true,
                },
            )
            .unwrap();

        store
            .create_time_entry(
                user.id,
                &SaveTimeEntry {
                    project_id: Some(project.id),
                    start_time: "2024-01-01T09:00:00.000Z".into(),
                    end_time: Some("2024-01-01T10:00:00.000Z".into()),
                    entry_type: None,
                    note: None,
                },
            )
            .unwrap();

        let error = store
            .create_time_entry(
                user.id,
                &SaveTimeEntry {
                    project_id: Some(project.id),
                    start_time: "2024-01-01T09:30:00.000Z".into(),
                    end_time: Some("2024-01-01T10:30:00.000Z".into()),
                    entry_type: None,
                    note: None,
                },
            )
            .unwrap_err();

        assert!(matches!(error, TimeEntryWriteError::Overlap));
    }
    fn a_project(name: &str) -> SaveProject {
        SaveProject {
            name: name.into(),
            description: None,
            color: "#112233".into(),
            active: true,
        }
    }

    fn audit_actions(store: &PostgresStore, user_id: i64) -> Vec<String> {
        store
            .list_security_audits(user_id, &ListRange::default())
            .unwrap()
            .into_iter()
            .map(|audit| audit.action)
            .collect()
    }

    /// The registration is evidence of how an account came to be, so it has to
    /// be recorded - but never with the credential it was created with.
    #[test]
    fn records_a_registration_without_any_credential() {
        let Some(store) = test_store() else {
            return;
        };
        let email = unique_email();
        let user = store
            .register_user(&email, "argon2-hash-of-a-secret")
            .unwrap();

        let audits = store
            .list_security_audits(user.id, &ListRange::default())
            .unwrap();
        assert_eq!(audits.len(), 1, "{audits:?}");
        assert_eq!(audits[0].action, "user.registered");
        assert_eq!(audits[0].actor, email);
        assert_eq!(audits[0].entity_id, Some(user.id));
        let payload = format!("{:?}{:?}", audits[0].old_value, audits[0].new_value);
        assert!(!payload.contains("argon2"), "{payload}");
        assert!(!payload.contains("hash"), "{payload}");
    }

    /// The lockout counter is evicted once it is served, so the failed sign in
    /// has to leave a record of its own.
    #[test]
    fn records_the_auth_events_of_an_account() {
        let Some(store) = test_store() else {
            return;
        };
        let email = unique_email();
        let user = store.register_user(&email, "hash").unwrap();

        store
            .record_auth_event(&email, LOGIN_FAILED_ACTION)
            .unwrap();
        store.record_auth_event(&email, LOCKED_OUT_ACTION).unwrap();
        // Every further attempt is rejected as locked out; recording each of
        // them would let an unauthenticated caller flood the trail.
        store.record_auth_event(&email, LOCKED_OUT_ACTION).unwrap();
        store.record_auth_event(&email, LOCKED_OUT_ACTION).unwrap();
        // An unknown email must not be attributed to any account.
        store
            .record_auth_event(&unique_email(), LOGIN_FAILED_ACTION)
            .unwrap();

        assert_eq!(
            audit_actions(&store, user.id),
            vec![
                LOCKED_OUT_ACTION.to_owned(),
                LOGIN_FAILED_ACTION.to_owned(),
                "user.registered".to_owned(),
            ]
        );
    }

    /// Every configuration change is one record, and the trail of a deleted
    /// project stays readable after its row is gone.
    #[test]
    fn records_the_life_cycle_of_a_project_and_its_budget() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let project = store.insert_project(user.id, &a_project("Trail")).unwrap();
        store
            .update_project(project.id, user.id, &a_project("Renamed"))
            .unwrap();
        let budget = store
            .insert_project_budget(
                user.id,
                &SaveProjectBudget {
                    project_id: project.id,
                    budget_minutes: 600,
                    due_date: "2026-12-31".into(),
                },
            )
            .unwrap();
        store
            .update_project_budget(
                budget.id,
                user.id,
                &SaveProjectBudget {
                    project_id: project.id,
                    budget_minutes: 900,
                    due_date: "2026-12-31".into(),
                },
            )
            .unwrap();
        store.delete_project(project.id, user.id).unwrap();

        let audits = store
            .list_security_audits(user.id, &ListRange::default())
            .unwrap();
        let actions: Vec<&str> = audits.iter().map(|audit| audit.action.as_str()).collect();
        assert_eq!(
            actions,
            vec![
                // Deleting the project deletes its budget, which is recorded
                // as the configuration deletion it is.
                "budget.deleted",
                "project.deleted",
                "budget.updated",
                "budget.created",
                "project.updated",
                "project.created",
                "user.registered",
            ],
            "{audits:?}"
        );
        assert_eq!(audits[0].entity_id, Some(budget.id));
        assert!(
            audits[0].old_value.as_deref().unwrap().contains("900"),
            "{:?}",
            audits[0]
        );

        let update = audits
            .iter()
            .find(|audit| audit.action == "project.updated")
            .unwrap();
        // A change records the changed field only, not a full snapshot.
        assert_eq!(update.old_value.as_deref(), Some(r#"{"name":"Trail"}"#));
        assert_eq!(update.new_value.as_deref(), Some(r#"{"name":"Renamed"}"#));

        let deleted = &audits[1];
        assert!(
            deleted.old_value.as_deref().unwrap().contains("Renamed"),
            "{deleted:?}"
        );
    }

    /// Saving the settings unchanged is a no-op, so it must not flood the
    /// trail; a real change records the changed field only.
    #[test]
    fn records_only_the_settings_that_actually_changed() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let settings = store.read_settings(user.id).unwrap();

        store.write_settings(user.id, &settings).unwrap();
        store.write_settings(user.id, &settings).unwrap();
        assert_eq!(audit_actions(&store, user.id), vec!["user.registered"]);

        let changed = WorkSettings {
            weekly_target_minutes: settings.weekly_target_minutes + 60,
            working_days: settings.working_days.clone(),
            week_starts_on: settings.week_starts_on.clone(),
            compliance_limits: settings.compliance_limits,
        };
        store.write_settings(user.id, &changed).unwrap();
        store.write_settings(user.id, &changed).unwrap();

        let audits = store
            .list_security_audits(user.id, &ListRange::default())
            .unwrap();
        assert_eq!(audits[0].action, "work_settings.updated");
        assert_eq!(audits.len(), 2, "{audits:?}");
        assert_eq!(
            audits[0].new_value.as_deref(),
            Some(
                format!(
                    r#"{{"weeklyTargetMinutes":{}}}"#,
                    changed.weekly_target_minutes
                )
                .as_str()
            )
        );
    }

    /// The trails of two accounts never mix.
    #[test]
    fn keeps_the_trail_scoped_to_its_user() {
        let Some(store) = test_store() else {
            return;
        };
        let first = store.register_user(&unique_email(), "hash").unwrap();
        let second = store.register_user(&unique_email(), "hash").unwrap();
        store
            .insert_project(second.id, &a_project("Other"))
            .unwrap();

        assert_eq!(audit_actions(&store, first.id), vec!["user.registered"]);
    }

    /// One account holding a record of every entity, so the tests below can try
    /// to reach them from another account.
    struct Records {
        user_id: i64,
        project: Project,
        entry: TimeEntry,
        budget: ProjectBudget,
        absence: Absence,
        overtime: OvertimeEntry,
    }

    fn an_entry(project_id: i64, day: u32) -> SaveTimeEntry {
        SaveTimeEntry {
            project_id: Some(project_id),
            start_time: format!("2026-05-{day:02}T08:00:00.000Z"),
            end_time: Some(format!("2026-05-{day:02}T09:00:00.000Z")),
            entry_type: None,
            note: None,
        }
    }

    /// A new account with one record per entity. The days are apart per
    /// account, so a rejected cross-account write cannot be mistaken for the
    /// overlap or the uniqueness of the caller's own records.
    fn records_of_a_new_user(store: &PostgresStore, day: u32) -> Records {
        let user = store.register_user(&unique_email(), "hash").unwrap();
        let project = store
            .insert_project(user.id, &a_project(&format!("Scoped {day}")))
            .unwrap();
        let entry = store
            .create_time_entry(user.id, &an_entry(project.id, day))
            .unwrap();
        let budget = store
            .insert_project_budget(
                user.id,
                &SaveProjectBudget {
                    project_id: project.id,
                    budget_minutes: 600,
                    due_date: "2026-12-31".into(),
                },
            )
            .unwrap();
        let absence = store
            .insert_absence(
                user.id,
                &SaveAbsence {
                    absence_type: "vacation".into(),
                    date: format!("2026-05-{:02}", day + 1),
                },
            )
            .unwrap();
        let overtime = store
            .insert_overtime_entry(
                user.id,
                &SaveOvertimeEntry {
                    effective_date: format!("2026-05-{:02}", day + 2),
                    minutes: 30,
                    kind: "adjustment".into(),
                    origin: None,
                    note: None,
                },
            )
            .unwrap();
        Records {
            user_id: user.id,
            project,
            entry,
            budget,
            absence,
            overtime,
        }
    }

    /// Every list answers the records of its caller only, so the rows of
    /// another account are invisible instead of merely unwritable.
    #[test]
    fn reads_the_records_of_the_calling_user_only() {
        let Some(store) = test_store() else {
            return;
        };
        let owner = records_of_a_new_user(&store, 4);
        let other = records_of_a_new_user(&store, 14);
        let window = ListRange::default();

        assert_eq!(
            store
                .list_projects(other.user_id)
                .unwrap()
                .iter()
                .map(|project| project.id)
                .collect::<Vec<i64>>(),
            vec![other.project.id]
        );
        assert_eq!(
            store
                .list_time_entries(other.user_id, &window)
                .unwrap()
                .iter()
                .map(|entry| entry.id)
                .collect::<Vec<i64>>(),
            vec![other.entry.id]
        );
        assert_eq!(
            store
                .list_project_budgets(other.user_id)
                .unwrap()
                .iter()
                .map(|budget| budget.id)
                .collect::<Vec<i64>>(),
            vec![other.budget.id]
        );
        assert_eq!(
            store
                .list_absences(other.user_id, &window)
                .unwrap()
                .iter()
                .map(|absence| absence.id)
                .collect::<Vec<i64>>(),
            vec![other.absence.id]
        );
        assert_eq!(
            store
                .list_overtime_entries(other.user_id)
                .unwrap()
                .iter()
                .map(|entry| entry.id)
                .collect::<Vec<i64>>(),
            vec![other.overtime.id]
        );

        // The trails are read the same way, so a record of another account
        // cannot be read through its audit either.
        for entry_id in store
            .list_time_entry_audits(other.user_id, &window)
            .unwrap()
            .iter()
            .map(|audit| audit.time_entry_id)
        {
            assert_ne!(entry_id, owner.entry.id);
        }
        for absence_id in store
            .list_absence_audits(other.user_id, &window)
            .unwrap()
            .iter()
            .map(|audit| audit.absence_id)
        {
            assert_ne!(absence_id, owner.absence.id);
        }
        for overtime_id in store
            .list_overtime_audits(other.user_id, &window)
            .unwrap()
            .iter()
            .map(|audit| audit.overtime_entry_id)
        {
            assert_ne!(overtime_id, owner.overtime.id);
        }
        // The ids of the entities come from independent sequences, so the pair
        // of entity and id is what tells one record from another.
        for record in store
            .list_security_audits(other.user_id, &window)
            .unwrap()
            .iter()
            .filter_map(|audit| audit.entity_id.map(|id| (audit.entity.as_str(), id)))
        {
            assert_ne!(record, (PROJECT_AUDIT_ENTITY, owner.project.id));
            assert_ne!(record, (BUDGET_AUDIT_ENTITY, owner.budget.id));
        }
        assert!(store
            .list_audit_log(other.user_id, &window)
            .unwrap()
            .iter()
            .all(|audit| audit.entity_id != owner.entry.id));

        // The settings are one row per account, so the account without its own
        // row reads the defaults instead of the row of the other one.
        let changed = WorkSettings {
            weekly_target_minutes: 1_800,
            ..store.read_settings(owner.user_id).unwrap()
        };
        store.write_settings(owner.user_id, &changed).unwrap();
        assert_eq!(
            store
                .read_settings(other.user_id)
                .unwrap()
                .weekly_target_minutes,
            2_400
        );
    }

    /// An update names a record by an id the caller supplies, so a foreign id
    /// has to answer like an unknown one and leave the record untouched.
    #[test]
    fn answers_not_found_when_another_user_updates_a_record() {
        let Some(store) = test_store() else {
            return;
        };
        let owner = records_of_a_new_user(&store, 4);
        let other = records_of_a_new_user(&store, 14);
        let user = other.user_id;

        assert!(matches!(
            store
                .update_project(owner.project.id, user, &a_project("Taken"))
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .update_time_entry(owner.entry.id, user, &an_entry(other.project.id, 24))
                .unwrap_err(),
            TimeEntryWriteError::Store(StoreError::NotFound)
        ));
        assert!(matches!(
            store
                .update_time_entry_note(owner.entry.id, user, Some("taken"))
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .switch_running_time_entry(owner.entry.id, user, &an_entry(other.project.id, 24))
                .unwrap_err(),
            SwitchEntryError::Store(StoreError::NotFound)
        ));
        assert!(matches!(
            store
                .update_project_budget(
                    owner.budget.id,
                    user,
                    &SaveProjectBudget {
                        project_id: other.project.id,
                        budget_minutes: 60,
                        due_date: "2026-11-30".into(),
                    },
                )
                .unwrap_err(),
            StoreError::NotFound
        ));
        let absence = || SaveAbsence {
            absence_type: "sick".into(),
            date: "2026-05-25".into(),
        };
        assert!(matches!(
            store
                .update_absence(owner.absence.id, user, &absence())
                .unwrap_err(),
            StoreError::NotFound
        ));
        // The replaced and the updated absence are named by id as well.
        assert!(matches!(
            store
                .save_absences(user, &[absence()], &[owner.absence.id], None)
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .save_absences(user, &[absence()], &[], Some(owner.absence.id))
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .update_overtime_entry(
                    owner.overtime.id,
                    user,
                    &SaveOvertimeEntry {
                        effective_date: "2026-05-26".into(),
                        minutes: 120,
                        kind: "adjustment".into(),
                        origin: None,
                        note: None,
                    },
                )
                .unwrap_err(),
            OvertimeWriteError::Store(StoreError::NotFound)
        ));

        assert_eq!(store.list_projects(owner.user_id).unwrap(), [owner.project]);
        assert_eq!(
            store
                .list_time_entries(owner.user_id, &ListRange::default())
                .unwrap(),
            [owner.entry]
        );
        assert_eq!(
            store.list_project_budgets(owner.user_id).unwrap(),
            [owner.budget]
        );
        assert_eq!(
            store
                .list_absences(owner.user_id, &ListRange::default())
                .unwrap(),
            [owner.absence]
        );
        assert_eq!(
            store.list_overtime_entries(owner.user_id).unwrap(),
            [owner.overtime]
        );
    }

    /// A delete is refused the same way, and it removes nothing on the way.
    #[test]
    fn answers_not_found_when_another_user_deletes_a_record() {
        let Some(store) = test_store() else {
            return;
        };
        let owner = records_of_a_new_user(&store, 4);
        let other = records_of_a_new_user(&store, 14);
        let user = other.user_id;

        assert!(matches!(
            store.delete_project(owner.project.id, user).unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store.delete_time_entry(owner.entry.id, user).unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .delete_project_budget(owner.budget.id, user)
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store.delete_absence(owner.absence.id, user).unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .delete_overtime_entry(owner.overtime.id, user)
                .unwrap_err(),
            StoreError::NotFound
        ));

        assert_eq!(store.list_projects(owner.user_id).unwrap(), [owner.project]);
        assert_eq!(
            store
                .list_time_entries(owner.user_id, &ListRange::default())
                .unwrap(),
            [owner.entry]
        );
        assert_eq!(
            store.list_project_budgets(owner.user_id).unwrap(),
            [owner.budget]
        );
        assert_eq!(
            store
                .list_absences(owner.user_id, &ListRange::default())
                .unwrap(),
            [owner.absence]
        );
        assert_eq!(
            store.list_overtime_entries(owner.user_id).unwrap(),
            [owner.overtime]
        );
    }

    /// An unknown id is refused like a foreign one, so a delete never reports a
    /// success that removed nothing.
    #[test]
    fn answers_not_found_when_a_delete_names_an_unknown_id() {
        let Some(store) = test_store() else {
            return;
        };
        let user = store.register_user(&unique_email(), "hash").unwrap().id;

        for error in [
            store.delete_project(404, user).unwrap_err(),
            store.delete_time_entry(404, user).unwrap_err(),
            store.delete_project_budget(404, user).unwrap_err(),
            store.delete_absence(404, user).unwrap_err(),
            store.delete_overtime_entry(404, user).unwrap_err(),
        ] {
            assert!(matches!(error, StoreError::NotFound), "{error:?}");
        }
    }

    /// A write that names a project is scoped as well, so a record cannot be
    /// attached to the project of another account.
    #[test]
    fn refuses_to_attach_a_record_to_a_project_of_another_user() {
        let Some(store) = test_store() else {
            return;
        };
        let owner = records_of_a_new_user(&store, 4);
        let other = records_of_a_new_user(&store, 14);
        let user = other.user_id;

        assert!(matches!(
            store
                .create_time_entry(user, &an_entry(owner.project.id, 24))
                .unwrap_err(),
            TimeEntryWriteError::Store(StoreError::NotFound)
        ));
        assert!(matches!(
            store
                .update_time_entry(other.entry.id, user, &an_entry(owner.project.id, 14))
                .unwrap_err(),
            TimeEntryWriteError::Store(StoreError::NotFound)
        ));
        assert!(matches!(
            store
                .insert_project_budget(
                    user,
                    &SaveProjectBudget {
                        project_id: owner.project.id,
                        budget_minutes: 60,
                        due_date: "2026-11-30".into(),
                    },
                )
                .unwrap_err(),
            StoreError::NotFound
        ));
        assert!(matches!(
            store
                .update_project_budget(
                    other.budget.id,
                    user,
                    &SaveProjectBudget {
                        project_id: owner.project.id,
                        budget_minutes: 60,
                        due_date: "2026-11-30".into(),
                    },
                )
                .unwrap_err(),
            StoreError::NotFound
        ));

        assert_eq!(
            store
                .list_time_entries(user, &ListRange::default())
                .unwrap()
                .len(),
            1
        );
        assert_eq!(store.list_project_budgets(user).unwrap(), [other.budget]);
    }
}
