use rusqlite::Connection;
use tauri::State;

use crate::{
    auth::{self, Session},
    database::{self, Database},
    models::{
        Credentials, Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry,
        TimeEntry, User, WorkSettings,
    },
};

const OVERLAP: &str = "This time overlaps with another time entry";
const DUPLICATE_BUDGET: &str = "This project already has a budget";
const NOT_SIGNED_IN: &str = "Please sign in first";
const INVALID_CREDENTIALS: &str = "Email or password is incorrect";
const DUPLICATE_EMAIL: &str = "An account with this email already exists";

fn budget_error(error: rusqlite::Error) -> String {
    if matches!(
        &error,
        rusqlite::Error::SqliteFailure(error, _)
            if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    ) {
        return DUPLICATE_BUDGET.to_owned();
    }
    error.to_string()
}

fn with_connection<T>(
    database: &State<'_, Database>,
    action: impl FnOnce(&Connection) -> rusqlite::Result<T>,
) -> Result<T, String> {
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    action(&connection).map_err(|error| error.to_string())
}

/// Every command works on the data of the signed in user only.
fn current_user(session: &State<'_, Session>) -> Result<i64, String> {
    session.user_id()?.ok_or_else(|| NOT_SIGNED_IN.to_owned())
}

fn with_user<T>(
    database: &State<'_, Database>,
    session: &State<'_, Session>,
    action: impl FnOnce(&Connection, i64) -> rusqlite::Result<T>,
) -> Result<T, String> {
    let user_id = current_user(session)?;
    with_connection(database, |connection| action(connection, user_id))
}

#[tauri::command]
pub fn register(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut credentials: Credentials,
) -> Result<User, String> {
    credentials.validate_registration().map_err(str::to_owned)?;
    let password_hash = auth::hash_password(&credentials.password)?;
    let mut connection = database.0.lock().map_err(|error| error.to_string())?;
    let user = database::register_user(&mut connection, &credentials.email, &password_hash)
        .map_err(|error| {
            if matches!(
                &error,
                rusqlite::Error::SqliteFailure(error, _)
                    if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
            ) {
                DUPLICATE_EMAIL.to_owned()
            } else {
                error.to_string()
            }
        })?;
    session.set(Some(user.id))?;
    Ok(user)
}

#[tauri::command]
pub fn login(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut credentials: Credentials,
) -> Result<User, String> {
    credentials.validate().map_err(|_| INVALID_CREDENTIALS)?;
    let user = with_connection(&database, |connection| {
        database::read_password_hash(connection, &credentials.email)
    })?
    .filter(|(_, hash)| auth::verify_password(&credentials.password, hash))
    .map(|(id, _)| id)
    .ok_or_else(|| INVALID_CREDENTIALS.to_owned())?;
    let user = with_connection(&database, |connection| {
        database::read_user(connection, user)
    })?
    .ok_or_else(|| INVALID_CREDENTIALS.to_owned())?;
    session.set(Some(user.id))?;
    Ok(user)
}

#[tauri::command]
pub fn logout(session: State<'_, Session>) -> Result<(), String> {
    session.set(None)
}

#[tauri::command]
pub fn current_session(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> Result<Option<User>, String> {
    let Some(user_id) = session.user_id()? else {
        return Ok(None);
    };
    with_connection(&database, |connection| {
        database::read_user(connection, user_id)
    })
}

#[tauri::command]
pub fn list_projects(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> Result<Vec<Project>, String> {
    with_user(&database, &session, database::list_projects)
}

#[tauri::command]
pub fn create_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveProject,
) -> Result<Project, String> {
    input.validate().map_err(str::to_owned)?;
    with_user(&database, &session, |connection, user_id| {
        database::insert_project(connection, user_id, &input)
    })
}

#[tauri::command]
pub fn update_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveProject,
) -> Result<Project, String> {
    input.validate().map_err(str::to_owned)?;
    with_user(&database, &session, |connection, user_id| {
        database::update_project(connection, id, user_id, &input)
    })
}

#[tauri::command]
pub fn delete_project(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> Result<(), String> {
    with_user(&database, &session, |connection, user_id| {
        database::delete_project(connection, id, user_id)
    })
}

#[tauri::command]
pub fn list_time_entries(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> Result<Vec<TimeEntry>, String> {
    with_user(&database, &session, database::list_time_entries)
}

#[tauri::command]
pub fn create_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    if input.project_id.is_none() {
        return Err("Project is required".to_owned());
    }
    let user_id = current_user(&session)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    if database::overlaps(
        &connection,
        user_id,
        &input.start_time,
        input.end_time.as_deref(),
        None,
    )
    .map_err(|error| error.to_string())?
    {
        return Err(OVERLAP.to_owned());
    }
    database::insert_time_entry(&connection, user_id, &input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    let user_id = current_user(&session)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    if database::overlaps(
        &connection,
        user_id,
        &input.start_time,
        input.end_time.as_deref(),
        Some(id),
    )
    .map_err(|error| error.to_string())?
    {
        return Err(OVERLAP.to_owned());
    }
    database::update_time_entry(&connection, id, user_id, &input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_time_entry_note(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    note: Option<String>,
) -> Result<TimeEntry, String> {
    let note = note
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty());
    if note.as_ref().is_some_and(|note| note.chars().count() > 500) {
        return Err("invalid note".to_owned());
    }
    with_user(&database, &session, |connection, user_id| {
        database::update_time_entry_note(connection, id, user_id, note.as_deref())
    })
}

#[tauri::command]
pub fn switch_running_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    if input.project_id.is_none() || input.end_time.is_some() {
        return Err("invalid timer switch".to_owned());
    }
    with_user(&database, &session, |connection, user_id| {
        database::switch_running_time_entry(connection, id, user_id, &input)
    })
}

#[tauri::command]
pub fn delete_time_entry(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> Result<(), String> {
    with_user(&database, &session, |connection, user_id| {
        database::delete_time_entry(connection, id, user_id)
    })
}

#[tauri::command]
pub fn list_project_budgets(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> Result<Vec<ProjectBudget>, String> {
    with_user(&database, &session, database::list_project_budgets)
}

#[tauri::command]
pub fn create_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut input: SaveProjectBudget,
) -> Result<ProjectBudget, String> {
    input.validate().map_err(str::to_owned)?;
    let user_id = current_user(&session)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::insert_project_budget(&connection, user_id, &input).map_err(budget_error)
}

#[tauri::command]
pub fn update_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
    mut input: SaveProjectBudget,
) -> Result<ProjectBudget, String> {
    input.validate().map_err(str::to_owned)?;
    let user_id = current_user(&session)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::update_project_budget(&connection, id, user_id, &input).map_err(budget_error)
}

#[tauri::command]
pub fn delete_project_budget(
    database: State<'_, Database>,
    session: State<'_, Session>,
    id: i64,
) -> Result<(), String> {
    with_user(&database, &session, |connection, user_id| {
        database::delete_project_budget(connection, id, user_id)
    })
}

#[tauri::command]
pub fn get_work_settings(
    database: State<'_, Database>,
    session: State<'_, Session>,
) -> Result<WorkSettings, String> {
    with_user(&database, &session, database::read_settings)
}

#[tauri::command]
pub fn update_work_settings(
    database: State<'_, Database>,
    session: State<'_, Session>,
    mut settings: WorkSettings,
) -> Result<WorkSettings, String> {
    settings.validate().map_err(str::to_owned)?;
    with_user(&database, &session, |connection, user_id| {
        database::write_settings(connection, user_id, &settings)
    })
}

#[tauri::command]
pub fn get_app_version(database: State<'_, Database>) -> Result<Option<String>, String> {
    with_connection(&database, database::read_app_version)
}
