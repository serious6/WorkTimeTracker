mod commands;
mod database;
mod models;
mod window_state;

use database::Database;
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = Database::open(data_dir.join("work-time-tracker.sqlite"))?;
            app.manage(database);
            if let Some(window) = app.get_webview_window("main") {
                window_state::restore(&window.as_ref().window_ref());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                window_state::save(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::list_time_entries,
            commands::create_time_entry,
            commands::update_time_entry,
            commands::update_time_entry_note,
            commands::switch_running_time_entry,
            commands::delete_time_entry,
            commands::get_work_settings,
            commands::update_work_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorkTimeTracker");
}
