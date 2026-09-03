mod auth;
mod commands;
mod config;
mod connection;
#[cfg(test)]
mod contract;
mod error;
mod logging;
mod models;
mod postgres_store;
mod store;
#[cfg(test)]
mod test_support;
mod window_state;

use auth::Sessions;
use config::DbConfig;
use store::Database;
use tauri::{Manager, WindowEvent};

/// Panics of the backend end up in the log file instead of only on stderr.
fn log_panics() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown location".to_owned());
        logging::error("panic", &format!("{location} {info}"));
        previous(info);
    }));
}

/// Applies the schema migrations to the configured database. A deployed
/// database is shared, so it is migrated by this deliberate step instead of by
/// every client that starts; see `examples/migrate.rs` and decision 12.
pub fn migrate() -> Result<(), Box<dyn std::error::Error>> {
    let db_config = DbConfig::from_env()?;
    if !db_config.run_migrations {
        return Err(format!(
            "the {} database may only be migrated with {}=true",
            db_config.mode,
            config::MIGRATE_ENV
        )
        .into());
    }
    Database::open(&db_config)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            logging::init(&data_dir);
            log_panics();
            let db_config = DbConfig::from_env()
                .inspect_err(|error| logging::error("setup", &format!("database: {error}")))?;
            let database = Database::open(&db_config)
                .inspect_err(|error| logging::error("setup", &format!("database: {error}")))?;
            app.manage(database);
            app.manage(Sessions::default());
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
            commands::register,
            commands::login,
            commands::logout,
            commands::current_session,
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
            commands::list_time_entry_audits,
            commands::list_audit_log,
            commands::list_security_audits,
            commands::list_project_budgets,
            commands::create_project_budget,
            commands::update_project_budget,
            commands::delete_project_budget,
            commands::list_absences,
            commands::create_absence,
            commands::update_absence,
            commands::save_absences,
            commands::delete_absence,
            commands::list_absence_audits,
            commands::list_overtime_entries,
            commands::create_overtime_entry,
            commands::update_overtime_entry,
            commands::delete_overtime_entry,
            commands::list_overtime_audits,
            commands::get_work_settings,
            commands::update_work_settings,
            commands::get_app_version,
            commands::log_client_error
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorkTimeTracker");
}
