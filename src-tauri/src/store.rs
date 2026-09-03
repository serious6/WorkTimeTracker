//! Storage abstraction implemented by the Postgres backend and managed by Tauri state.

use crate::{
    config::DbConfig,
    models::{
        Absence, AbsenceAudit, AuditLogEntry, ListRange, OvertimeAudit, OvertimeEntry, Project,
        ProjectBudget, SaveAbsence, SaveOvertimeEntry, SaveProject, SaveProjectBudget,
        SaveTimeEntry, SecurityAudit, TimeEntry, TimeEntryAudit, User, WorkSettings,
    },
    postgres_store::PostgresStore,
};

/// Backend-agnostic failure of a storage operation.
#[derive(Debug)]
pub enum StoreError {
    NotFound,
    UniqueViolation,
    Backend(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(formatter, "the record was not found"),
            Self::UniqueViolation => write!(formatter, "a unique constraint was violated"),
            Self::Backend(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for StoreError {}

/// A time entry write failed because it would overlap with another one, or
/// because a break was booked on a project.
#[derive(Debug)]
pub enum TimeEntryWriteError {
    Overlap,
    InvalidBreak,
    Store(StoreError),
}

impl From<StoreError> for TimeEntryWriteError {
    fn from(error: StoreError) -> Self {
        Self::Store(error)
    }
}

/// An overtime write failed because a second opening balance was set; only one
/// opening balance can exist per user.
#[derive(Debug)]
pub enum OvertimeWriteError {
    SecondOpening,
    Store(StoreError),
}

impl From<StoreError> for OvertimeWriteError {
    fn from(error: StoreError) -> Self {
        Self::Store(error)
    }
}

#[derive(Debug)]
pub enum SwitchEntryError {
    InvalidTimer,
    Overlap,
    Store(StoreError),
}

impl From<StoreError> for SwitchEntryError {
    fn from(error: StoreError) -> Self {
        Self::Store(error)
    }
}

/// Failed logins of one email. Persisted, so a restart does not clear a lockout.
/// Read by the tests of the counters only; the login itself works with the
/// count that [`LoginAttemptStore::reserve_login_attempt`] answers.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub struct LoginAttempt {
    pub failures: i64,
    /// ISO 8601 UTC timestamp of the last failure, as written by the backend.
    pub last_failure: String,
}

/// Counters behind the login lockout, kept apart from `Store` so the rule can
/// be tested without the rest of the storage.
pub trait LoginAttemptStore {
    /// Counts one login attempt of `email` and answers how many attempts are
    /// counted for it since its last successful login, this one included.
    ///
    /// Evicting the expired counters, reading the counter and counting the
    /// attempt are one atomic operation, so concurrent logins cannot all read
    /// the same count before any of them is written and thereby exceed the
    /// limit together. A counter whose last attempt lies at or before
    /// `expired_before` has served its lockout and starts over at one, and a
    /// counter that already passed `limit` is answered unchanged, so a locked
    /// out email cannot extend its own lockout.
    fn reserve_login_attempt(
        &self,
        email: &str,
        now: &str,
        expired_before: &str,
        limit: i64,
    ) -> Result<i64, StoreError>;
    /// The stored counter, used by the tests of the lockout rule.
    #[allow(dead_code)]
    fn read_login_attempt(&self, email: &str) -> Result<Option<LoginAttempt>, StoreError>;
    fn clear_login_attempts(&self, email: &str) -> Result<(), StoreError>;
}

/// Operations needed by the Tauri commands.
pub trait Store: LoginAttemptStore {
    fn list_projects(&self, user_id: i64) -> Result<Vec<Project>, StoreError>;
    fn insert_project(&self, user_id: i64, input: &SaveProject) -> Result<Project, StoreError>;
    fn update_project(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProject,
    ) -> Result<Project, StoreError>;
    fn delete_project(&self, id: i64, user_id: i64) -> Result<(), StoreError>;

    fn list_time_entries(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<TimeEntry>, StoreError>;
    // Kept for backend parity with the operations named in the design (and
    // exercised directly by Postgres integration tests); overlap checks are
    // performed inline by write methods below to keep them atomic.
    #[allow(dead_code)]
    fn overlaps(
        &self,
        user_id: i64,
        start_time: &str,
        end_time: Option<&str>,
        exclude_id: Option<i64>,
    ) -> Result<bool, StoreError>;
    fn create_time_entry(
        &self,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError>;
    fn update_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError>;
    fn update_time_entry_note(
        &self,
        id: i64,
        user_id: i64,
        note: Option<&str>,
    ) -> Result<TimeEntry, StoreError>;
    fn switch_running_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, SwitchEntryError>;
    fn delete_time_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError>;

    fn list_time_entry_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<TimeEntryAudit>, StoreError>;
    fn list_audit_log(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<AuditLogEntry>, StoreError>;

    fn list_project_budgets(&self, user_id: i64) -> Result<Vec<ProjectBudget>, StoreError>;
    fn insert_project_budget(
        &self,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError>;
    fn update_project_budget(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError>;
    fn delete_project_budget(&self, id: i64, user_id: i64) -> Result<(), StoreError>;

    fn list_absences(&self, user_id: i64, range: &ListRange) -> Result<Vec<Absence>, StoreError>;
    fn insert_absence(&self, user_id: i64, input: &SaveAbsence) -> Result<Absence, StoreError>;
    fn update_absence(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveAbsence,
    ) -> Result<Absence, StoreError>;
    fn save_absences(
        &self,
        user_id: i64,
        inputs: &[SaveAbsence],
        replacement_ids: &[i64],
        update_id: Option<i64>,
    ) -> Result<Vec<Absence>, StoreError>;
    fn delete_absence(&self, id: i64, user_id: i64) -> Result<(), StoreError>;
    fn list_absence_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<AbsenceAudit>, StoreError>;

    fn list_overtime_entries(&self, user_id: i64) -> Result<Vec<OvertimeEntry>, StoreError>;
    fn insert_overtime_entry(
        &self,
        user_id: i64,
        input: &SaveOvertimeEntry,
    ) -> Result<OvertimeEntry, OvertimeWriteError>;
    fn update_overtime_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveOvertimeEntry,
    ) -> Result<OvertimeEntry, OvertimeWriteError>;
    fn delete_overtime_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError>;
    fn list_overtime_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<OvertimeAudit>, StoreError>;

    fn read_settings(&self, user_id: i64) -> Result<WorkSettings, StoreError>;
    fn write_settings(
        &self,
        user_id: i64,
        settings: &WorkSettings,
    ) -> Result<WorkSettings, StoreError>;

    /// The identity and configuration records of the signed in user. The trail
    /// is append-only: no method of this trait updates or deletes a record.
    fn list_security_audits(
        &self,
        user_id: i64,
        range: &ListRange,
    ) -> Result<Vec<SecurityAudit>, StoreError>;
    /// Records a failed login or a lockout of `email`. Runs without a session,
    /// because a rejected login has none, and never stores credentials.
    fn record_auth_event(&self, email: &str, action: &str) -> Result<(), StoreError>;

    fn read_app_version(&self) -> Result<Option<String>, StoreError>;

    fn read_user(&self, id: i64) -> Result<Option<User>, StoreError>;
    fn read_password_hash(&self, email: &str) -> Result<Option<(i64, String)>, StoreError>;
    fn register_user(&self, email: &str, password_hash: &str) -> Result<User, StoreError>;
}

/// Failure while opening the configured database at startup.
#[derive(Debug)]
pub struct OpenError(pub String);

impl std::fmt::Display for OpenError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl std::error::Error for OpenError {}

/// Database handle put into Tauri managed state.
pub struct Database(pub Box<dyn Store + Send + Sync>);

impl Database {
    /// Opens Postgres and runs its migrations.
    pub fn open(config: &DbConfig) -> Result<Self, OpenError> {
        let url = config.database_url.as_str();
        let store = PostgresStore::open(config).map_err(|error| {
            OpenError(format!(
                "postgres: could not connect to the {} database ({}): {error}",
                config.mode,
                crate::config::redact_database_url(url)
            ))
        })?;
        Ok(Self(Box::new(store)))
    }
}
