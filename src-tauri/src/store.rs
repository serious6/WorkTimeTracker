//! Backend-agnostic storage abstraction. [`Store`] is the contract that both
//! the SQLite (default) and Postgres backends implement; [`Database`] holds
//! whichever one [`crate::config::DbConfig`] selected at startup and is put
//! into Tauri managed state.

use crate::{
    config::{DbBackend, DbConfig},
    database::{self, SqliteDatabase, SwitchRunningTimeEntryError},
    models::{
        AuditLogEntry, Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry,
        TimeEntry, TimeEntryAudit, User, WorkSettings,
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

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        match &error {
            rusqlite::Error::QueryReturnedNoRows => Self::NotFound,
            rusqlite::Error::SqliteFailure(failure, _)
                if failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
            {
                Self::UniqueViolation
            }
            _ => Self::Backend(error.to_string()),
        }
    }
}

impl<T> From<std::sync::PoisonError<T>> for StoreError {
    fn from(error: std::sync::PoisonError<T>) -> Self {
        Self::Backend(error.to_string())
    }
}

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

impl From<rusqlite::Error> for TimeEntryWriteError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Store(error.into())
    }
}

/// Backend-agnostic mirror of [`database::SwitchRunningTimeEntryError`].
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

impl From<SwitchRunningTimeEntryError> for SwitchEntryError {
    fn from(error: SwitchRunningTimeEntryError) -> Self {
        match error {
            SwitchRunningTimeEntryError::InvalidTimer => Self::InvalidTimer,
            SwitchRunningTimeEntryError::Overlap => Self::Overlap,
            SwitchRunningTimeEntryError::Database(error) => Self::Store(error.into()),
        }
    }
}

/// Operations needed by the Tauri commands, implemented once per backend.
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
    // exercised directly by `store::tests`); overlap checks are performed
    // inline by the write methods below to keep them atomic under a single
    // lock/transaction, so this is not currently called by the commands.
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

/// The SQLite backend: wraps today's `rusqlite`-based free functions.
pub struct SqliteStore(pub SqliteDatabase);

impl Store for SqliteStore {
    fn list_projects(&self, user_id: i64) -> Result<Vec<Project>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::list_projects(&connection, user_id)?)
    }

    fn insert_project(&self, user_id: i64, input: &SaveProject) -> Result<Project, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::insert_project(&connection, user_id, input)?)
    }

    fn update_project(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProject,
    ) -> Result<Project, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::update_project(&connection, id, user_id, input)?)
    }

    fn delete_project(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::delete_project(&connection, id, user_id)?)
    }

    fn list_time_entries(&self, user_id: i64) -> Result<Vec<TimeEntry>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::list_time_entries(&connection, user_id)?)
    }

    fn overlaps(
        &self,
        user_id: i64,
        start_time: &str,
        end_time: Option<&str>,
        exclude_id: Option<i64>,
    ) -> Result<bool, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::overlaps(
            &connection,
            user_id,
            start_time,
            end_time,
            exclude_id,
        )?)
    }

    fn create_time_entry(
        &self,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let connection = self.0 .0.lock().map_err(StoreError::from)?;
        if database::overlaps(
            &connection,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        Ok(database::insert_time_entry(&connection, user_id, input)?)
    }

    fn update_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, TimeEntryWriteError> {
        let connection = self.0 .0.lock().map_err(StoreError::from)?;
        if input.project_id.is_some()
            && input.entry_type.is_none()
            && database::entry_is_break(&connection, id, user_id)?
        {
            return Err(TimeEntryWriteError::InvalidBreak);
        }
        if database::overlaps(
            &connection,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            Some(id),
        )? {
            return Err(TimeEntryWriteError::Overlap);
        }
        Ok(database::update_time_entry(
            &connection,
            id,
            user_id,
            input,
        )?)
    }

    fn update_time_entry_note(
        &self,
        id: i64,
        user_id: i64,
        note: Option<&str>,
    ) -> Result<TimeEntry, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::update_time_entry_note(
            &connection,
            id,
            user_id,
            note,
        )?)
    }

    fn switch_running_time_entry(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveTimeEntry,
    ) -> Result<TimeEntry, SwitchEntryError> {
        let connection = self.0 .0.lock().map_err(StoreError::from)?;
        Ok(database::switch_running_time_entry(
            &connection,
            id,
            user_id,
            input,
        )?)
    }

    fn delete_time_entry(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::delete_time_entry(&connection, id, user_id)?)
    }

    fn list_time_entry_audits(&self, user_id: i64) -> Result<Vec<TimeEntryAudit>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::list_time_entry_audits(&connection, user_id)?)
    }

    fn list_audit_log(&self, user_id: i64) -> Result<Vec<AuditLogEntry>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::list_audit_log(&connection, user_id)?)
    }

    fn list_project_budgets(&self, user_id: i64) -> Result<Vec<ProjectBudget>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::list_project_budgets(&connection, user_id)?)
    }

    fn insert_project_budget(
        &self,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::insert_project_budget(
            &connection,
            user_id,
            input,
        )?)
    }

    fn update_project_budget(
        &self,
        id: i64,
        user_id: i64,
        input: &SaveProjectBudget,
    ) -> Result<ProjectBudget, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::update_project_budget(
            &connection,
            id,
            user_id,
            input,
        )?)
    }

    fn delete_project_budget(&self, id: i64, user_id: i64) -> Result<(), StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::delete_project_budget(&connection, id, user_id)?)
    }

    fn read_settings(&self, user_id: i64) -> Result<WorkSettings, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::read_settings(&connection, user_id)?)
    }

    fn write_settings(
        &self,
        user_id: i64,
        settings: &WorkSettings,
    ) -> Result<WorkSettings, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::write_settings(&connection, user_id, settings)?)
    }

    fn read_app_version(&self) -> Result<Option<String>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::read_app_version(&connection)?)
    }

    fn read_user(&self, id: i64) -> Result<Option<User>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::read_user(&connection, id)?)
    }

    fn read_password_hash(&self, email: &str) -> Result<Option<(i64, String)>, StoreError> {
        let connection = self.0 .0.lock()?;
        Ok(database::read_password_hash(&connection, email)?)
    }

    fn register_user(&self, email: &str, password_hash: &str) -> Result<User, StoreError> {
        let mut connection = self.0 .0.lock()?;
        Ok(database::register_user(
            &mut connection,
            email,
            password_hash,
        )?)
    }
}

/// Failure while opening the configured backend at startup.
#[derive(Debug)]
pub struct OpenError(pub String);

impl std::fmt::Display for OpenError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl std::error::Error for OpenError {}

/// Backend-agnostic handle put into Tauri managed state.
pub struct Database(pub Box<dyn Store + Send + Sync>);

impl Database {
    /// Opens the backend selected by `config`, running its migrations.
    pub fn open(config: &DbConfig) -> Result<Self, OpenError> {
        match config.backend {
            DbBackend::Sqlite => {
                let database = SqliteDatabase::open(&config.sqlite_path)
                    .map_err(|error| OpenError(format!("sqlite: {error}")))?;
                Ok(Self(Box::new(SqliteStore(database))))
            }
            DbBackend::Postgres => {
                let url = config.database_url.as_deref().ok_or_else(|| {
                    OpenError("DATABASE_URL must be set when WTT_DB_BACKEND=postgres".to_owned())
                })?;
                let store = PostgresStore::connect(url).map_err(|error| {
                    OpenError(format!(
                        "postgres: could not connect using DATABASE_URL ({}): {error}",
                        crate::config::redact_database_url(url)
                    ))
                })?;
                Ok(Self(Box::new(store)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{self, migrate};
    use rusqlite::Connection;

    fn sqlite_store() -> SqliteStore {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        migrate(&mut connection).unwrap();
        SqliteStore(SqliteDatabase(std::sync::Mutex::new(connection)))
    }

    /// `Store::overlaps` is the trait-level entry point kept for backend
    /// parity (see the problem statement's method list); exercise it
    /// directly so both implementations are covered even though the
    /// in-process command handlers currently perform overlap checks inline.
    #[test]
    fn overlaps_detects_and_ignores_non_overlapping_entries() {
        let store = sqlite_store();
        let user_id = database::insert_user(
            &store.0 .0.lock().unwrap(),
            "overlaps@example.com",
            "argon2-hash",
        )
        .unwrap()
        .id;

        store
            .create_time_entry(
                user_id,
                &SaveTimeEntry {
                    project_id: None,
                    start_time: "2026-01-01T08:00:00.000Z".to_owned(),
                    end_time: Some("2026-01-01T09:00:00.000Z".to_owned()),
                    note: None,
                },
            )
            .unwrap();

        assert!(store
            .overlaps(user_id, "2026-01-01T08:30:00.000Z", None, None)
            .unwrap());
        assert!(!store
            .overlaps(user_id, "2026-01-01T09:00:00.000Z", None, None)
            .unwrap());
    }
}
