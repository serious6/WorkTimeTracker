use rusqlite::Connection;
use tauri::State;

use crate::{
    auth::{self, LoginAttempts, Session},
    database::{self, Database, SwitchRunningTimeEntryError},
    error::{AppError, AppResult},
    logging,
    models::{
        Credentials, Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry,
        TimeEntry, TimeEntryAudit, User, WorkSettings,
    },
};

const OVERLAP: &str = "This time overlaps with another time entry";
const DUPLICATE_BUDGET: &str = "This project already has a budget";
const INVALID_CREDENTIALS: &str = "Email or password is incorrect";
const DUPLICATE_EMAIL: &str = "An account with this email already exists";

fn is_unique_violation(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(failure, _)
            if failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    )
}

fn unique_error(message: &'static str) -> impl Fn(rusqlite::Error) -> AppError {
    move |error| {
        if is_unique_violation(&error) {
            AppError::conflict(message)
        } else {
            AppError::from(error)
        }
    }
}

fn with_connection<T>(
    database: &State<'_, Database>,
    action: impl FnOnce(&Connection) -> rusqlite::Result<T>,
) -> AppResult<T> {
    let connection = database.0.lock()?;
    Ok(action(&connection)?)
}

/// Every command works on the data of the signed in user only.
fn current_user(session: &State<'_, Session>) -> AppResult<i64> {
    session.user_id()?.ok_or_else(AppError::not_signed_in)
}

fn with_user<T>(
    database: &State<'_, Database>,
    session: &State<'_, Session>,
    action: impl FnOnce(&Connection, i64) -> rusqlite::Result<T>,
) -> AppResult<T> {
    let user_id = current_user(session)?;
    with_connection(database, |connection| action(connection, user_id))
}

#[tauri::command]
pub fn register(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut credentials: Credentials,
) -> AppResult<User> {
    logging::logged("register", || {
        credentials.validate_registration()?;
        let password_hash = auth::hash_password(&credentials.password)?;
        let mut connection = database.0.lock()?;
        let user = database::register_user(&mut connection, &credentials.email, &password_hash)
            .map_err(unique_error(DUPLICATE_EMAIL))?;
        session.set(Some(user.id))?;
        Ok(user)
    })
}

#[tauri::command]
pub fn login(
    database: State<'_, Database>,
    session: State<'_, Session>,
    attempts: State<'_, LoginAttempts>,
    mut credentials: Credentials,
) -> AppResult<User> {
    logging::logged("login", || {
        credentials
            .validate()
            .map_err(|_| AppError::validation(INVALID_CREDENTIALS))?;
        attempts.check(&credentials.email)?;
        let user = with_connection(&database, |connection| {
            database::read_password_hash(connection, &credentials.email)
        })?
        .filter(|(_, hash)| auth::verify_password(&credentials.password, hash))
        .map(|(id, _)| id);
        let user = match user {
            Some(user) => user,
            None => {
                attempts.record_failure(&credentials.email)?;
                return Err(AppError::validation(INVALID_CREDENTIALS));
            }
        };
        let user = with_connection(&database, |connection| {
            database::read_user(connection, user)
        })?
        .ok_or_else(|| AppError::validation(INVALID_CREDENTIALS))?;
        attempts.record_success(&credentials.email)?;
        session.set(Some(user.id))?;
        Ok(user)
    })
}

#[tauri::command]
pub fn logout(session: State<'_, Session>) -> AppResult<()> {
    logging::logged("logout", || session.set(None))
}

#[tauri::command]
pub fn current_session(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<Option<User>> {
    logging::logged("current_session", || {
        let Some(user_id) = session.user_id()? else {
            return Ok(None);
        };
        with_connection(&database, |connection| {
            database::read_user(connection, user_id)
        })
    })
}

#[tauri::command]
pub fn list_projects(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<Vec<Project>> {
    logging::logged("list_projects", || {
        with_user(&database, &session, database::list_projects)
    })
}

#[tauri::command]
pub fn create_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveProject,
) -> AppResult<Project> {
    logging::logged("create_project", || {
        input.validate()?;
        with_user(&database, &session, |connection, user_id| {
            database::insert_project(connection, user_id, &input)
        })
    })
}

#[tauri::command]
pub fn update_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveProject,
) -> AppResult<Project> {
    logging::logged("update_project", || {
        input.validate()?;
        with_user(&database, &session, |connection, user_id| {
            database::update_project(connection, id, user_id, &input)
        })
    })
}

#[tauri::command]
pub fn delete_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_project", || {
        with_user(&database, &session, |connection, user_id| {
            database::delete_project(connection, id, user_id)
        })
    })
}

#[tauri::command]
pub fn list_time_entries(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<Vec<TimeEntry>> {
    logging::logged("list_time_entries", || {
        with_user(&database, &session, database::list_time_entries)
    })
}

#[tauri::command]
pub fn create_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("create_time_entry", || {
        input.validate()?;
        if input.project_id.is_none() && !input.is_break() {
            return Err(AppError::validation("Project is required"));
        }
        let user_id = current_user(&session)?;
        let connection = database.0.lock()?;
        if database::overlaps(
            &connection,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            None,
        )? {
            return Err(AppError::conflict(OVERLAP));
        }
        Ok(database::insert_time_entry(&connection, user_id, &input)?)
    })
}

#[tauri::command]
pub fn update_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("update_time_entry", || {
        input.validate()?;
        let user_id = current_user(&session)?;
        let connection = database.0.lock()?;
        if database::overlaps(
            &connection,
            user_id,
            &input.start_time,
            input.end_time.as_deref(),
            Some(id),
        )? {
            return Err(AppError::conflict(OVERLAP));
        }
        Ok(database::update_time_entry(
            &connection,
            id,
            user_id,
            &input,
        )?)
    })
}

#[tauri::command]
pub fn update_time_entry_note(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    note: Option<String>,
) -> AppResult<TimeEntry> {
    logging::logged("update_time_entry_note", || {
        let note = note
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty());
        if note.as_ref().is_some_and(|note| note.chars().count() > 500) {
            return Err(AppError::validation("invalid note"));
        }
        with_user(&database, &session, |connection, user_id| {
            database::update_time_entry_note(connection, id, user_id, note.as_deref())
        })
    })
}

#[tauri::command]
pub fn switch_running_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveTimeEntry,
) -> AppResult<TimeEntry> {
    logging::logged("switch_running_time_entry", || {
        input.validate()?;
        if input.project_id.is_none() || input.end_time.is_some() {
            return Err(AppError::validation("invalid timer switch"));
        }
        let user_id = current_user(&session)?;
        let connection = database.0.lock()?;
        database::switch_running_time_entry(&connection, id, user_id, &input).map_err(|error| {
            match error {
                SwitchRunningTimeEntryError::InvalidTimer => {
                    AppError::validation("invalid timer switch")
                }
                SwitchRunningTimeEntryError::Overlap => AppError::conflict(OVERLAP),
                SwitchRunningTimeEntryError::Database(error) => AppError::from(error),
            }
        })
    })
}

#[tauri::command]
pub fn delete_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_time_entry", || {
        with_user(&database, &session, |connection, user_id| {
            database::delete_time_entry(connection, id, user_id)
        })
    })
}

/// The audit trail is read only, it has no command that changes or removes it.
#[tauri::command]
pub fn list_time_entry_audits(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<Vec<TimeEntryAudit>> {
    logging::logged("list_time_entry_audits", || {
        with_user(&database, &session, database::list_time_entry_audits)
    })
}

#[tauri::command]
pub fn list_project_budgets(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<Vec<ProjectBudget>> {
    logging::logged("list_project_budgets", || {
        with_user(&database, &session, database::list_project_budgets)
    })
}

#[tauri::command]
pub fn create_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveProjectBudget,
) -> AppResult<ProjectBudget> {
    logging::logged("create_project_budget", || {
        input.validate()?;
        let user_id = current_user(&session)?;
        let connection = database.0.lock()?;
        database::insert_project_budget(&connection, user_id, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    })
}

#[tauri::command]
pub fn update_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveProjectBudget,
) -> AppResult<ProjectBudget> {
    logging::logged("update_project_budget", || {
        input.validate()?;
        let user_id = current_user(&session)?;
        let connection = database.0.lock()?;
        database::update_project_budget(&connection, id, user_id, &input)
            .map_err(unique_error(DUPLICATE_BUDGET))
    })
}

#[tauri::command]
pub fn delete_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> AppResult<()> {
    logging::logged("delete_project_budget", || {
        with_user(&database, &session, |connection, user_id| {
            database::delete_project_budget(connection, id, user_id)
        })
    })
}

#[tauri::command]
pub fn get_work_settings(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> AppResult<WorkSettings> {
    logging::logged("get_work_settings", || {
        with_user(&database, &session, database::read_settings)
    })
}

#[tauri::command]
pub fn update_work_settings(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut settings: WorkSettings,
) -> AppResult<WorkSettings> {
    logging::logged("update_work_settings", || {
        settings.validate()?;
        with_user(&database, &session, |connection, user_id| {
            database::write_settings(connection, user_id, &settings)
        })
    })
}

#[tauri::command]
pub fn get_app_version(database: State<'_, Database>) -> AppResult<Option<String>> {
    logging::logged("get_app_version", || {
        with_connection(&database, database::read_app_version)
    })
}

/// Writes a failure of the user interface into the same log file. The message is
/// redacted by the logger, so client-side data cannot leak into the log either.
#[tauri::command]
pub fn log_client_error(source: String, message: String) -> AppResult<()> {
    let source: String = source
        .trim()
        .chars()
        .take(logging::MAX_MESSAGE_CHARS)
        .collect();
    let message: String = message
        .trim()
        .chars()
        .take(logging::MAX_MESSAGE_CHARS)
        .collect();
    logging::error(&format!("ui/{source}"), &message);
    Ok(())
}
