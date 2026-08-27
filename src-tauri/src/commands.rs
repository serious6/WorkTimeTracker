use tauri::State;

use crate::{
    database::{self, Database},
    models::{CreateTimeEntry, TimeEntry},
};

#[tauri::command]
pub fn list_time_entries(database: State<'_, Database>) -> Result<Vec<TimeEntry>, String> {
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::list(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_time_entry(
    database: State<'_, Database>,
    input: CreateTimeEntry,
) -> Result<TimeEntry, String> {
    if input.project.trim().is_empty() || !(1..=1_440).contains(&input.duration_minutes) {
        return Err("invalid time entry".into());
    }
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::insert(&connection, &input).map_err(|error| error.to_string())
}
