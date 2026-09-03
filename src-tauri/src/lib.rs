mod auth;
mod commands;
mod config;
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    /// The manifest of the backend, read at compile time so the assertions below
    /// describe the crate that is actually built.
    const MANIFEST: &str = include_str!("../Cargo.toml");

    /// The manifest without its comments, so that the comment explaining the
    /// devtools rule does not read as a declaration. No value of this manifest
    /// contains a `#`.
    fn manifest_declarations() -> String {
        MANIFEST
            .lines()
            .filter_map(|line| line.split('#').next())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Every Rust source of the backend, the `src` tree walked instead of a
    /// fixed list so that a file or a module directory added later is read too.
    fn backend_sources() -> Vec<(String, String)> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut sources = Vec::new();
        collect_sources(&root, &root, &mut sources);
        sources.sort();

        let names: Vec<&str> = sources.iter().map(|(name, _)| name.as_str()).collect();
        assert!(
            names.len() > 10,
            "the backend sources were not found: {names:?}"
        );
        sources
    }

    /// Reads `directory` into `sources` as pairs of the path below `root` and
    /// the source itself.
    fn collect_sources(root: &Path, directory: &Path, sources: &mut Vec<(String, String)>) {
        let entries = fs::read_dir(directory).expect("the backend sources are readable");
        for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
            if path.is_dir() {
                collect_sources(root, &path, sources);
                continue;
            }
            if path.extension().is_some_and(|extension| extension == "rs") {
                let name = path
                    .strip_prefix(root)
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| path.clone());
                let source = fs::read_to_string(&path).expect("a backend source is readable");
                sources.push((name.display().to_string(), source));
            }
        }
    }

    /// The part of a source in front of its test module, so that the scan below
    /// does not read the string literals of a test as production code.
    fn production_part(source: &str) -> &str {
        source
            .split("\nmod tests {")
            .next()
            .expect("a source always has a first part")
    }

    /// Whether a line reaches the devtools, that is code rather than a comment
    /// or the attribute that guards the code.
    fn reaches_the_devtools(line: &str) -> bool {
        let code = line.trim();
        code.contains("devtools") && !code.starts_with("//") && !code.starts_with('#')
    }

    /// Whether a line holds a condition that is true in a debug build only.
    /// `not(debug_assertions)` names the opposite and guards nothing.
    fn debug_build_only(line: &str) -> bool {
        line.contains("debug_assertions") && !line.contains("not(debug_assertions)")
    }

    #[test]
    fn devtools_stay_out_of_a_release_build() {
        let declarations = manifest_declarations();

        assert!(
            !declarations.contains("devtools"),
            "no cargo feature may enable tauri's devtools: the web inspector of a \
             shipped build would expose the session id and every IPC payload, and \
             without the feature tauri gates it on debug_assertions"
        );
        assert!(
            !declarations.contains("debug-assertions"),
            "no profile may set debug-assertions: tauri gates the devtools on that \
             flag, so a release build that turns it on ships the web inspector"
        );
    }

    #[test]
    fn a_devtools_call_carries_a_debug_assertions_guard() {
        for (name, source) in backend_sources() {
            let lines: Vec<&str> = production_part(&source).lines().collect();
            for (index, line) in lines.iter().enumerate() {
                if !reaches_the_devtools(line) {
                    continue;
                }

                // The guard has to stand in the same block of lines as the call,
                // that is without an empty line in between.
                let guarded = lines[..index]
                    .iter()
                    .rev()
                    .take_while(|previous| !previous.trim().is_empty())
                    .any(|previous| debug_build_only(previous));

                assert!(
                    guarded,
                    "{name}:{} reaches the devtools without a debug_assertions guard",
                    index + 1
                );
            }
        }
    }
}
