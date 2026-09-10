//! The outcome of the application startup, kept so the window can show it.
//!
//! A failing database or configuration no longer ends the process before a
//! window exists: the setup records the failure here, the window opens and the
//! user interface renders it in the look and feel of the application. The
//! stored message is the same redacted text the startup dialog would have
//! shown, so no credential, hash, e-mail address or token reaches the window.

use std::error::Error;
use std::sync::{Mutex, PoisonError};

use crate::config::DbConfig;
use crate::store::Database;

/// What the user interface asks for while it boots.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum StartupStatus {
    Ready,
    Failed { message: String },
}

/// The startup outcome in Tauri managed state. It is written once by the setup
/// and again by every retry, so the mutex is never contended for long.
pub struct StartupState(Mutex<StartupStatus>);

impl Default for StartupState {
    fn default() -> Self {
        Self(Mutex::new(StartupStatus::Ready))
    }
}

impl StartupState {
    pub fn status(&self) -> StartupStatus {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Records a failure of the startup. The message is redacted like a log
    /// line and names the log file once the logger writes one.
    pub fn record_failure(&self, error: &dyn Error) {
        let (_, message) = crate::startup_failure::format_startup_failure(
            error,
            crate::logging::file_path().as_deref(),
        );
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = StartupStatus::Failed { message };
    }

    pub fn mark_ready(&self) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = StartupStatus::Ready;
    }
}

/// Resolves the settings and opens the configured database. Shared by the
/// setup and by the retry of a failed start, so both report the same failures.
pub fn open_database() -> Result<Database, Box<dyn Error>> {
    let settings = crate::portable::settings()?;
    let config = DbConfig::resolve(&settings)?;
    Ok(Database::open(&config)?)
}

/// Logs a startup failure under one source before it reaches the window.
pub fn log_failure(error: &dyn Error) {
    crate::logging::error("setup", &format!("database: {error}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigError;
    use crate::store::OpenError;

    #[test]
    fn starts_ready() {
        assert_eq!(StartupState::default().status(), StartupStatus::Ready);
    }

    #[test]
    fn records_a_failure_with_its_message() {
        let state = StartupState::default();

        state.record_failure(&ConfigError::MissingDatabaseUrl);

        let StartupStatus::Failed { message } = state.status() else {
            panic!("the failure has to be recorded");
        };
        assert!(message.contains("DATABASE_URL"));
    }

    #[test]
    fn redacts_credentials_of_a_recorded_failure() {
        let password = "top-secret-password";
        let state = StartupState::default();

        state.record_failure(&OpenError(format!(
            "postgres: could not connect to postgresql://user:{password}@localhost/work"
        )));

        let StartupStatus::Failed { message } = state.status() else {
            panic!("the failure has to be recorded");
        };
        assert!(!message.contains(password), "{message}");
        assert!(message.contains("could not connect"), "{message}");
    }

    #[test]
    fn a_successful_retry_returns_to_ready() {
        let state = StartupState::default();
        state.record_failure(&ConfigError::MissingDatabaseUrl);

        state.mark_ready();

        assert_eq!(state.status(), StartupStatus::Ready);
    }

    #[test]
    fn serializes_the_status_for_the_user_interface() {
        assert_eq!(
            serde_json::to_string(&StartupStatus::Ready).unwrap_or_default(),
            r#"{"status":"ready"}"#
        );
        assert_eq!(
            serde_json::to_string(&StartupStatus::Failed {
                message: "no database".to_owned()
            })
            .unwrap_or_default(),
            r#"{"status":"failed","message":"no database"}"#
        );
    }
}
