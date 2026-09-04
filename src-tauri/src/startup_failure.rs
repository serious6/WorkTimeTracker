use std::cell::Cell;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const TITLE: &str = "WorkTimeTracker could not start";

static STARTUP_IN_PROGRESS: AtomicBool = AtomicBool::new(true);
static FAILURE_REPORTED: AtomicBool = AtomicBool::new(false);
static LOG_FILE_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static APP_HANDLE: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

thread_local! {
    static REPORTING: Cell<bool> = const { Cell::new(false) };
}

pub fn remember_app_handle(handle: AppHandle) {
    let slot = APP_HANDLE.get_or_init(|| Mutex::new(None));
    if let Ok(mut value) = slot.lock() {
        if value.is_none() {
            *value = Some(handle);
        }
    }
}

pub fn remember_log_file_path(path: PathBuf) {
    let slot = LOG_FILE_PATH.get_or_init(|| Mutex::new(None));
    if let Ok(mut value) = slot.lock() {
        *value = Some(path);
    }
}

pub fn report(error: &dyn Error) {
    report_internal(error);
}

pub fn mark_startup_complete() {
    STARTUP_IN_PROGRESS.store(false, Ordering::SeqCst);
}

pub fn report_startup_panic(error: &dyn Error) {
    if !STARTUP_IN_PROGRESS.load(Ordering::SeqCst) {
        return;
    }
    report_internal(error);
}

fn report_internal(error: &dyn Error) {
    if FAILURE_REPORTED.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::logging::error("startup", &error.to_string());

    let log_file_path = configured_log_file_path();
    let (title, body) = format_startup_failure(error, &log_file_path);
    let shown = show_dialog(&title, &body);
    if !shown {
        eprintln!("{title}\n\n{body}");
    }
}

fn configured_log_file_path() -> PathBuf {
    LOG_FILE_PATH
        .get()
        .and_then(|slot| slot.lock().ok())
        .and_then(|value| value.clone())
        .unwrap_or_else(fallback_log_file_path)
}

fn fallback_log_file_path() -> PathBuf {
    crate::logging::log_file_path_for(Path::new("<app data>"))
}

fn show_dialog(title: &str, body: &str) -> bool {
    let Some(handle) = APP_HANDLE
        .get()
        .and_then(|slot| slot.lock().ok())
        .and_then(|value| value.clone())
    else {
        return false;
    };

    REPORTING.with(|reporting| {
        if reporting.replace(true) {
            return false;
        }
        // A dialog panic re-enters the panic hook; this guard keeps the hook
        // from recursively trying to open the same dialog on that thread.
        let shown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            handle
                .dialog()
                .message(body)
                .title(title)
                .kind(MessageDialogKind::Error)
                .blocking_show()
        }))
        .is_ok_and(|result| result);
        reporting.set(false);
        shown
    })
}

/// Builds the startup failure dialog text as `(title, body)` and redacts
/// database credentials before formatting the user-facing body.
pub fn format_startup_failure(error: &dyn Error, log_file_path: &Path) -> (String, String) {
    let message = redact_database_urls(&error.to_string());
    (
        TITLE.to_owned(),
        format!(
            "{message}\n\nSee the log file for details:\n{}",
            log_file_path.display()
        ),
    )
}

fn redact_database_urls(message: &str) -> String {
    let mut redacted = String::new();
    let mut token = String::new();

    for character in message.chars() {
        if character.is_whitespace() {
            if !token.is_empty() {
                redacted.push_str(&redact_token_if_database_url(&token));
                token.clear();
            }
            redacted.push(character);
            continue;
        }
        token.push(character);
    }

    if !token.is_empty() {
        redacted.push_str(&redact_token_if_database_url(&token));
    }
    redacted
}

fn redact_token_if_database_url(token: &str) -> String {
    let (start, end) = trimmed_bounds(token);
    let trimmed = &token[start..end];
    if !looks_like_database_url(trimmed) {
        return token.to_owned();
    }
    format!(
        "{}{}{}",
        &token[..start],
        crate::config::redact_database_url(trimmed),
        &token[end..]
    )
}

fn looks_like_database_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("postgres://") || lower.starts_with("postgresql://")
}

/// The byte offsets of the token content after punctuation around the URL was
/// stripped. Offsets are returned so the redacted URL can be spliced back into
/// the original token without losing the original surrounding punctuation.
fn trimmed_bounds(token: &str) -> (usize, usize) {
    let start = token
        .char_indices()
        .find(|(_, character)| !is_trimmed_character(*character))
        .map_or(token.len(), |(index, _)| index);
    let end = token
        .char_indices()
        .rev()
        .find(|(_, character)| !is_trimmed_character(*character))
        .map_or(start, |(index, character)| index + character.len_utf8());
    (start, end)
}

fn is_trimmed_character(character: char) -> bool {
    matches!(
        character,
        '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\'' | ',' | ';'
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigError;
    use crate::store::OpenError;

    #[test]
    fn formats_concrete_config_error_with_log_path() {
        let (title, body) = format_startup_failure(
            &ConfigError::MissingDatabaseUrl,
            Path::new("/tmp/work-time-tracker.log"),
        );

        assert_eq!(title, TITLE);
        assert!(body.contains("DATABASE_URL"));
        assert!(body.contains("/tmp/work-time-tracker.log"));
    }

    #[test]
    fn formats_concrete_open_error_with_log_path() {
        let error = OpenError("postgres: could not connect".to_owned());
        let (_, body) = format_startup_failure(&error, Path::new("/tmp/wtt.log"));

        assert!(body.contains("postgres: could not connect"));
        assert!(body.contains("/tmp/wtt.log"));
    }

    #[test]
    fn redacts_database_credentials_from_boxed_errors() {
        let password = "top-secret-password";
        let error: Box<dyn Error> = Box::new(std::io::Error::other(format!(
            "failed to connect with postgresql://user:{password}@localhost:5432/work_time_tracker"
        )));
        let (_, body) = format_startup_failure(error.as_ref(), Path::new("/tmp/wtt.log"));

        assert!(!body.contains(password));
        assert!(body.contains("/tmp/wtt.log"));
    }

    #[test]
    fn keeps_whitespace_layout_while_redacting_urls() {
        let password = "supersecret";
        let message = format!("line 1:\n  postgresql://user:{password}@localhost/work\nline 2");
        let error: Box<dyn Error> = Box::new(std::io::Error::other(message));
        let (_, body) = format_startup_failure(error.as_ref(), Path::new("/tmp/wtt.log"));

        assert!(body.contains("line 1:\n"));
        assert!(body.contains("\nline 2"));
        assert!(!body.contains(password));
    }
}
