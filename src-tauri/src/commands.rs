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
    mut input: CreateTimeEntry,
) -> Result<TimeEntry, String> {
    input.validate().map_err(str::to_owned)?;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    database::insert(&connection, &input).map_err(|error| error.to_string())
}
