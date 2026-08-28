use rusqlite::Connection;
use tauri::State;

use crate::{
    database::{self, Database},
    models::{
        Project, ProjectBudget, SaveProject, SaveProjectBudget, SaveTimeEntry, TimeEntry,
        WorkSettings,
    },
};

const OVERLAP: &str = "This time overlaps with another time entry";
const DUPLICATE_BUDGET: &str = "This project already has a budget";

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

#[tauri::command]
pub fn list_projects(database: State<'_, Database>) -> Result<Vec<Project>, String> {
    with_connection(&database, database::list_projects)
}

#[tauri::command]
pub fn create_project(
    database: State<'_, Database>,
    mut input: SaveProject,
) -> Result<Project, String> {
    input.validate().map_err(str::to_owned)?;
    with_connection(&database, |connection| {
        database::insert_project(connection, &input)
    })
}

#[tauri::command]
pub fn update_project(
    database: State<'_, Database>,
    id: i64,
    mut input: SaveProject,
) -> Result<Project, String> {
    input.validate().map_err(str::to_owned)?;
    with_connection(&database, |connection| {
        database::update_project(connection, id, &input)
    })
}

#[tauri::command]
pub fn delete_project(database: State<'_, Database>, id: i64) -> Result<(), String> {
    with_connection(&database, |connection| {
        database::delete_project(connection, id)
    })
}

#[tauri::command]
pub fn list_time_entries(database: State<'_, Database>) -> Result<Vec<TimeEntry>, String> {
    with_connection(&database, database::list_time_entries)
}

#[tauri::command]
pub fn create_time_entry(
    database: State<'_, Database>,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    if input.project_id.is_none() {
        return Err("Project is required".to_owned());
    }
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    if database::overlaps(
        &connection,
        &input.start_time,
        input.end_time.as_deref(),
        None,
    )
    .map_err(|error| error.to_string())?
    {
        return Err(OVERLAP.to_owned());
    }
    database::insert_time_entry(&connection, &input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_time_entry(
    database: State<'_, Database>,
    id: i64,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    if database::overlaps(
        &connection,
        &input.start_time,
        input.end_time.as_deref(),
        Some(id),
    )
    .map_err(|error| error.to_string())?
    {
        return Err(OVERLAP.to_owned());
    }
    database::update_time_entry(&connection, id, &input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_time_entry_note(
    database: State<'_, Database>,
    id: i64,
    note: Option<String>,
) -> Result<TimeEntry, String> {
    let note = note
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty());
    if note.as_ref().is_some_and(|note| note.chars().count() > 500) {
        return Err("invalid note".to_owned());
    }
    with_connection(&database, |connection| {
        database::update_time_entry_note(connection, id, note.as_deref())
    })
}

#[tauri::command]
pub fn switch_running_time_entry(
    database: State<'_, Database>,
    id: i64,
    mut input: SaveTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    if input.project_id.is_none() || input.end_time.is_some() {
        return Err("invalid timer switch".to_owned());
    }
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::switch_running_time_entry(&connection, id, &input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_time_entry(database: State<'_, Database>, id: i64) -> Result<(), String> {
    with_connection(&database, |connection| {
        database::delete_time_entry(connection, id)
    })
}

#[tauri::command]
pub fn list_project_budgets(database: State<'_, Database>) -> Result<Vec<ProjectBudget>, String> {
    with_connection(&database, database::list_project_budgets)
}

#[tauri::command]
pub fn create_project_budget(
    database: State<'_, Database>,
    mut input: SaveProjectBudget,
) -> Result<ProjectBudget, String> {
    input.validate().map_err(str::to_owned)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::insert_project_budget(&connection, &input).map_err(budget_error)
}

#[tauri::command]
pub fn update_project_budget(
    database: State<'_, Database>,
    id: i64,
    mut input: SaveProjectBudget,
) -> Result<ProjectBudget, String> {
    input.validate().map_err(str::to_owned)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::update_project_budget(&connection, id, &input).map_err(budget_error)
}

#[tauri::command]
pub fn delete_project_budget(database: State<'_, Database>, id: i64) -> Result<(), String> {
    with_connection(&database, |connection| {
        database::delete_project_budget(connection, id)
    })
}

#[tauri::command]
pub fn get_work_settings(database: State<'_, Database>) -> Result<WorkSettings, String> {
    with_connection(&database, database::read_settings)
}

#[tauri::command]
pub fn update_work_settings(
    database: State<'_, Database>,
    mut settings: WorkSettings,
) -> Result<WorkSettings, String> {
    settings.validate().map_err(str::to_owned)?;
    with_connection(&database, |connection| {
        database::write_settings(connection, &settings)
    })
}

#[tauri::command]
pub fn get_app_version(database: State<'_, Database>) -> Result<Option<String>, String> {
    with_connection(&database, database::read_app_version)
}
