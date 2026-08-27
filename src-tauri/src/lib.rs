mod commands;
mod database;
mod models;

use database::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = Database::open(data_dir.join("work-time-tracker.sqlite"))
                .map_err(|error| error.to_string())?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_time_entries,
            commands::create_time_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorkTimeTracker");
}
