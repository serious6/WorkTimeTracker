//! Storage abstraction implemented by the Postgres backend and managed by Tauri state.

use crate::{
    config::DbConfig,
    models::{
        Absence, AbsenceAudit, AuditLogEntry, Project, ProjectBudget, SaveAbsence, SaveProject,
        SaveProjectBudget, SaveTimeEntry, TimeEntry, TimeEntryAudit, User, WorkSettings,
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

/// Operations needed by the Tauri commands.
pub trait Store {
    fn list_projects(&self, user_id: i64) -> Result<Vec<Project>, StoreError>;
    fn insert_project(&self, user_id: i64, input: &SaveProject) -> Result<Project, StoreError>;
    fn update_project(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProject,
    ) -> Result<Project, StoreError>;
    fn delete_project(&self, id: i64, user_id: i64) -> Result<(), StoreError>;

    fn list_time_entries(&self, user_id: i64) -> Result<Vec<TimeEntry>, StoreError>;
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

    fn list_time_entry_audits(&self, user_id: i64) -> Result<Vec<TimeEntryAudit>, StoreError>;
    fn list_audit_log(&self, user_id: i64) -> Result<Vec<AuditLogEntry>, StoreError>;

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

    fn list_absences(&self, user_id: i64) -> Result<Vec<Absence>, StoreError>;
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
    fn list_absence_audits(&self, user_id: i64) -> Result<Vec<AbsenceAudit>, StoreError>;

    fn read_settings(&self, user_id: i64) -> Result<WorkSettings, StoreError>;
    fn write_settings(
        &self,
        user_id: i64,
        settings: &WorkSettings,
    ) -> Result<WorkSettings, StoreError>;

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
        let store = PostgresStore::connect(url).map_err(|error| {
            OpenError(format!(
                "postgres: could not connect using DATABASE_URL ({}): {error}",
                crate::config::redact_database_url(url)
            ))
        })?;
        Ok(Self(Box::new(store)))
    }
}
