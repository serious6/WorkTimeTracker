mod auth;
mod commands;
mod config;
mod connection;
#[cfg(test)]
mod contract;
mod error;
mod logging;
mod models;
mod portable;
mod postgres_store;
mod startup_failure;
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
        let panic_error = startup_panic_error(info.payload());
        startup_failure::report_startup_panic(&panic_error);
        previous(info);
    }));
}

fn panic_payload_message(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|message| (*message).to_owned())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "panic payload was not a string".to_owned())
}

fn panic_summary(message: &str) -> String {
    let first_line = message.lines().next().unwrap_or(message).trim();
    let summary = first_line
        .split('{')
        .next()
        .unwrap_or(first_line)
        .trim()
        .trim_end_matches(':');
    if summary.is_empty() {
        "panic payload was not a string".to_owned()
    } else {
        summary.to_owned()
    }
}

fn startup_panic_error(payload: &(dyn std::any::Any + Send)) -> std::io::Error {
    let message = panic_payload_message(payload);
    std::io::Error::other(format!(
        "WorkTimeTracker stopped unexpectedly during startup: {}",
        panic_summary(&message)
    ))
}

/// Applies the schema migrations to the configured database. A deployed
/// database is shared, so it is migrated by this deliberate step instead of by
/// every client that starts; see `examples/migrate.rs` and
/// `architecture/decisions.md#separate-local-development-databases-from-verified-production-databases`.
pub fn migrate() -> Result<(), Box<dyn std::error::Error>> {
    let db_config = DbConfig::for_migration()?;
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
    log_panics();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                startup_failure::remember_app_handle(app.handle().clone());
                let data_dir = app
                    .path()
                    .app_data_dir()
                    .inspect_err(|error| startup_failure::report(error))?;
                std::fs::create_dir_all(&data_dir)
                    .inspect_err(|error| startup_failure::report(error))?;
                logging::init(&data_dir);
                // A portable installation carries its settings next to the
                // application; every other build resolves the process
                // environment alone, which is what `portable::settings`
                // returns without a file.
                let settings = portable::settings()
                    .inspect_err(|error| logging::error("setup", &format!("database: {error}")))
                    .inspect_err(|error| startup_failure::report(error))?;
                let db_config = DbConfig::resolve(&settings)
                    .inspect_err(|error| logging::error("setup", &format!("database: {error}")))
                    .inspect_err(|error| startup_failure::report(error))?;
                let database = Database::open(&db_config)
                    .inspect_err(|error| logging::error("setup", &format!("database: {error}")))
                    .inspect_err(|error| startup_failure::report(error))?;
                app.manage(database);
                app.manage(Sessions::default());
                if let Some(window) = app.get_webview_window("main") {
                    window_state::restore(&window.as_ref().window_ref());
                }
                startup_failure::mark_startup_complete();
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
                commands::delete_account,
                commands::get_app_version,
                commands::log_client_error
            ])
            .run(tauri::generate_context!())
    }));

    match result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => exit_after_startup_failure(&error),
        Err(payload) => exit_after_startup_failure(&startup_panic_error(payload.as_ref())),
    }
}

/// The exit code of a start that never reached the window, so that a shell or a
/// launcher sees the failure the dialog reports.
const FAILURE_EXIT_CODE: i32 = 1;

/// Reports a failure that prevents the application from starting and ends the
/// process. Reporting comes first, so the user is never left with a window that
/// silently disappears.
fn exit_after_startup_failure(error: &dyn std::error::Error) -> ! {
    startup_failure::mark_startup_complete();
    startup_failure::report(error);
    std::process::exit(FAILURE_EXIT_CODE);
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

    /// A line without its comment and without the content of its string and
    /// character literals, so that neither a comment that mentions the devtools
    /// nor a brace inside a literal is read as code.
    fn code_of(line: &str) -> String {
        let mut code = String::new();
        let mut characters = line.chars().peekable();
        let mut literal: Option<char> = None;
        while let Some(character) = characters.next() {
            match literal {
                Some(quote) => {
                    if character == '\\' {
                        characters.next();
                    } else if character == quote {
                        literal = None;
                    }
                }
                None => match character {
                    '/' if characters.peek() == Some(&'/') => break,
                    '"' | '\'' => literal = Some(character),
                    _ => code.push(character),
                },
            }
        }
        code
    }

    /// Whether a predicate of a `cfg` is true in a debug build only, that is
    /// false as soon as `debug_assertions` is off. Every other flag counts as
    /// on, so `any(debug_assertions, windows)` guards nothing while
    /// `all(debug_assertions, windows)` does.
    fn holds_only_in_a_debug_build(predicate: &str) -> bool {
        !holds_without_debug_assertions(predicate)
    }

    /// Evaluates a `cfg` predicate with `debug_assertions` off and every other
    /// flag on.
    fn holds_without_debug_assertions(predicate: &str) -> bool {
        let predicate = predicate.trim();
        if let Some(inner) = argument_of(predicate, "not") {
            return !holds_without_debug_assertions(inner);
        }
        if let Some(inner) = argument_of(predicate, "any") {
            return terms_of(inner)
                .iter()
                .any(|term| holds_without_debug_assertions(term));
        }
        if let Some(inner) = argument_of(predicate, "all") {
            return terms_of(inner)
                .iter()
                .all(|term| holds_without_debug_assertions(term));
        }
        predicate != "debug_assertions"
    }

    /// The argument of `name(...)`, if the predicate is that call.
    fn argument_of<'a>(predicate: &'a str, name: &str) -> Option<&'a str> {
        predicate
            .strip_prefix(name)?
            .strip_prefix('(')?
            .strip_suffix(')')
    }

    /// The arguments of an `any` or `all`, split on the commas that stand
    /// outside of a nested call.
    fn terms_of(arguments: &str) -> Vec<&str> {
        let mut terms = Vec::new();
        let mut depth = 0usize;
        let mut start = 0usize;
        for (index, character) in arguments.char_indices() {
            match character {
                '(' => depth += 1,
                ')' => depth = depth.saturating_sub(1),
                ',' if depth == 0 => {
                    terms.push(arguments[start..index].trim());
                    start = index + 1;
                }
                _ => {}
            }
        }
        terms.push(arguments[start..].trim());
        terms
    }

    /// Whether a line of code carries a `cfg` or a `cfg!` whose predicate holds
    /// in a debug build only.
    fn guards_a_debug_build(code: &str) -> bool {
        let mut rest = code;
        while let Some(index) = rest.find("cfg") {
            let after = &rest[index + "cfg".len()..];
            let after = after.strip_prefix('!').unwrap_or(after);
            rest = after;
            let Some(predicate) = after.strip_prefix('(').and_then(balanced_argument) else {
                continue;
            };
            if predicate.contains("debug_assertions") && holds_only_in_a_debug_build(predicate) {
                return true;
            }
        }
        false
    }

    /// The text up to the parenthesis that closes the one already consumed.
    fn balanced_argument(arguments: &str) -> Option<&str> {
        let mut depth = 0usize;
        for (index, character) in arguments.char_indices() {
            match character {
                '(' => depth += 1,
                ')' if depth == 0 => return Some(&arguments[..index]),
                ')' => depth -= 1,
                _ => {}
            }
        }
        None
    }

    /// The lines of a source that reach the devtools without a
    /// `debug_assertions` condition that governs them: an attribute on the item
    /// or the statement itself, an attribute on an enclosing item or block, or
    /// a `cfg!` around the block the call stands in.
    fn unguarded_devtools_lines(source: &str) -> Vec<usize> {
        let mut findings = Vec::new();
        // Whether the block opened by a `{` is compiled in a debug build only,
        // one entry per open block.
        let mut blocks: Vec<bool> = Vec::new();
        // A `#[cfg(...)]` that has been read but not yet attached to its item.
        let mut attached = false;
        // A `#![cfg(...)]` guards everything that follows it in the file.
        let mut whole_file = false;

        for (index, line) in source.lines().enumerate() {
            let code = code_of(line);
            let trimmed = code.trim();
            if trimmed.is_empty() {
                continue;
            }

            let debug_only = guards_a_debug_build(trimmed);
            if trimmed.starts_with("#![") {
                whole_file = whole_file || debug_only;
                continue;
            }
            if trimmed.starts_with("#[") {
                attached = attached || debug_only;
                continue;
            }

            let guarded = whole_file || debug_only || attached || blocks.iter().any(|block| *block);
            if trimmed.contains("devtools") && !guarded {
                findings.push(index + 1);
            }

            let opened = trimmed.matches('{').count();
            let closed = trimmed.matches('}').count();
            for _ in 0..closed {
                blocks.pop();
            }
            for _ in 0..opened {
                blocks.push(debug_only || attached);
            }
            // The attribute belongs to this item, and to it alone: the next
            // statement needs a guard of its own.
            attached = false;
        }

        findings
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
            let findings = unguarded_devtools_lines(production_part(&source));
            assert!(
                findings.is_empty(),
                "{name} reaches the devtools without a debug_assertions guard, line(s) {findings:?}"
            );
        }
    }

    #[test]
    fn a_guard_that_governs_the_call_is_accepted() {
        let guarded = [
            "#[cfg(debug_assertions)]\nwindow.open_devtools();",
            "#[cfg(all(debug_assertions, windows))]\nwindow.open_devtools();",
            "// the inspector\n#[cfg(debug_assertions)]\nwindow.open_devtools();",
            "#[cfg(debug_assertions)]\nfn inspect() {\n    window.open_devtools();\n}",
            "if cfg!(debug_assertions) {\n    window.open_devtools();\n}",
            "#![cfg(debug_assertions)]\nfn inspect() {\n    window.open_devtools();\n}",
            "// open_devtools is only compiled in a debug build",
        ];
        for source in guarded {
            assert!(
                unguarded_devtools_lines(source).is_empty(),
                "the guard of {source:?} was not seen"
            );
        }
    }

    #[test]
    fn a_guard_that_governs_nothing_is_rejected() {
        let unguarded = [
            "window.open_devtools();",
            "// available with debug_assertions\nwindow.open_devtools();",
            "#[cfg(debug_assertions)]\nlet inspect = true;\nwindow.open_devtools();",
            "#[cfg(debug_assertions)]\nfn inspect() {\n    let on = true;\n}\nwindow.open_devtools();",
            "#[cfg(any(debug_assertions, windows))]\nwindow.open_devtools();",
            "#[cfg(not(debug_assertions))]\nwindow.open_devtools();",
            "#[cfg(all(any(debug_assertions, windows), unix))]\nwindow.open_devtools();",
            "if cfg!(debug_assertions) {\n    let on = true;\n}\nwindow.open_devtools();",
            "let message = \"debug_assertions\";\nwindow.open_devtools();",
        ];
        for source in unguarded {
            assert!(
                !unguarded_devtools_lines(source).is_empty(),
                "the missing guard of {source:?} was not seen"
            );
        }
    }

    #[test]
    fn panic_summary_keeps_the_first_line() {
        assert_eq!(
            super::panic_summary("startup failed\nwith details"),
            "startup failed"
        );
    }

    #[test]
    fn panic_summary_drops_struct_tail_after_an_opening_brace() {
        assert_eq!(
            super::panic_summary("Failed: BoolError { message: \"x\" }"),
            "Failed: BoolError"
        );
    }

    #[test]
    fn panic_summary_falls_back_for_an_empty_message() {
        assert_eq!(
            super::panic_summary("   "),
            "panic payload was not a string".to_owned()
        );
    }

    /// Set in the child process below, which reports a fatal startup instead of
    /// running the test body.
    const SUBPROCESS_ENV: &str = "WORK_TIME_TRACKER_FATAL_STARTUP_TEST";

    /// Starts this test binary again, filtered down to `test`, so that the
    /// child can end its process on the fatal startup path. Returns its exit
    /// code and its stderr.
    fn fatal_startup_child(test: &str) -> (Option<i32>, String) {
        let binary = std::env::current_exe().expect("the test binary is known");
        let output = std::process::Command::new(binary)
            .args([&format!("tests::{test}"), "--exact", "--nocapture"])
            .env(SUBPROCESS_ENV, "1")
            .output()
            .expect("the test binary starts itself");

        (
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).into_owned(),
        )
    }

    fn is_fatal_startup_child() -> bool {
        std::env::var_os(SUBPROCESS_ENV).is_some()
    }

    #[test]
    fn a_failed_setup_is_reported_and_exits_non_zero() {
        let secret = "top-secret-password";
        if is_fatal_startup_child() {
            super::exit_after_startup_failure(&std::io::Error::other(format!(
                "the database is unreachable: postgresql://user:{secret}@localhost/work"
            )));
        }

        let (code, stderr) = fatal_startup_child("a_failed_setup_is_reported_and_exits_non_zero");

        assert_eq!(
            code,
            Some(super::FAILURE_EXIT_CODE),
            "a failed start has to end with a non-zero exit code: {stderr}"
        );
        assert!(
            stderr.contains("WorkTimeTracker could not start"),
            "without a dialog the failure has to reach stderr: {stderr}"
        );
        assert!(stderr.contains("the database is unreachable"), "{stderr}");
        assert!(!stderr.contains(secret), "{stderr}");
    }

    #[test]
    fn a_panicking_setup_is_reported_and_exits_non_zero() {
        if is_fatal_startup_child() {
            let payload: Box<dyn std::any::Any + Send> = Box::new("the setup panicked".to_owned());
            super::exit_after_startup_failure(&super::startup_panic_error(payload.as_ref()));
        }

        let (code, stderr) =
            fatal_startup_child("a_panicking_setup_is_reported_and_exits_non_zero");

        assert_eq!(code, Some(super::FAILURE_EXIT_CODE), "{stderr}");
        assert!(
            stderr.contains("stopped unexpectedly during startup"),
            "{stderr}"
        );
        assert!(stderr.contains("the setup panicked"), "{stderr}");
    }
}
