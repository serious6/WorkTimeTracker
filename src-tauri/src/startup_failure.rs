use std::cell::Cell;
use std::error::Error;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const TITLE: &str = "WorkTimeTracker could not start";

static STARTUP_IN_PROGRESS: AtomicBool = AtomicBool::new(true);
static FAILURE_REPORTED: AtomicBool = AtomicBool::new(false);
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

    // The log file only exists once the logger has been initialized; an earlier
    // failure must not point the user at a file that was never written.
    let log_file_path = crate::logging::file_path();
    if let Some(text) = deliver(error, log_file_path.as_deref(), show_dialog) {
        eprintln!("{text}");
    }
}

/// Shows the failure to the user and returns the text that still has to reach
/// stderr because no dialog could be opened.
fn deliver(
    error: &dyn Error,
    log_file_path: Option<&Path>,
    show: impl FnOnce(&str, &str) -> bool,
) -> Option<String> {
    let (title, body) = format_startup_failure(error, log_file_path);
    if show(&title, &body) {
        return None;
    }
    Some(format!("{title}\n\n{body}"))
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

/// Builds the startup failure dialog text as `(title, body)`. The message runs
/// through the same redaction as a log line, so credentials, hashes, e-mail
/// addresses and file system paths never reach the dialog or stderr. The log
/// file is only named once the logger writes one.
pub fn format_startup_failure(error: &dyn Error, log_file_path: Option<&Path>) -> (String, String) {
    let message = crate::logging::redact_keeping_layout(&redact_database_urls(&error.to_string()));
    let body = match log_file_path {
        Some(path) => format!(
            "{message}\n\nSee the log file for details:\n{}",
            path.display()
        ),
        None => message,
    };
    (TITLE.to_owned(), body)
}

/// Redacts the credentials of every database URL first, so that the host of the
/// connection survives the general redaction as a diagnostic hint.
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
    let Some(start) = database_url_start(token) else {
        return token.to_owned();
    };
    let end = start + trimmed_end(&token[start..]);
    format!(
        "{}{}{}",
        &token[..start],
        crate::config::redact_database_url(&token[start..end]),
        &token[end..]
    )
}

/// The byte offset of a database URL inside a token, which may carry a prefix
/// such as `url=` or an opening bracket.
fn database_url_start(token: &str) -> Option<usize> {
    let lower = token.to_ascii_lowercase();
    ["postgresql://", "postgres://"]
        .iter()
        .filter_map(|scheme| lower.find(scheme))
        .min()
}

/// The end of the URL inside a token, with the punctuation that closes a
/// bracket or ends a sentence excluded, so that it survives the redaction.
fn trimmed_end(token: &str) -> usize {
    token
        .char_indices()
        .rev()
        .find(|(_, character)| !is_trailing_character(*character))
        .map_or(0, |(index, character)| index + character.len_utf8())
}

fn is_trailing_character(character: char) -> bool {
    matches!(
        character,
        ')' | ']' | '}' | '"' | '\'' | ',' | ';' | '.' | '!' | '?'
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigError;
    use crate::store::OpenError;

    fn body_of(error: &dyn Error) -> String {
        format_startup_failure(error, Some(Path::new("/tmp/wtt.log"))).1
    }

    #[test]
    fn formats_concrete_config_error_with_log_path() {
        let (title, body) = format_startup_failure(
            &ConfigError::MissingDatabaseUrl,
            Some(Path::new("/tmp/work-time-tracker.log")),
        );

        assert_eq!(title, TITLE);
        assert!(body.contains("DATABASE_URL"));
        assert!(body.contains("/tmp/work-time-tracker.log"));
    }

    #[test]
    fn formats_concrete_open_error_with_log_path() {
        let error = OpenError("postgres: could not connect".to_owned());
        let (_, body) = format_startup_failure(&error, Some(Path::new("/tmp/wtt.log")));

        assert!(body.contains("postgres: could not connect"));
        assert!(body.contains("/tmp/wtt.log"));
    }

    #[test]
    fn omits_the_log_file_hint_before_the_logger_writes() {
        let (_, body) = format_startup_failure(&ConfigError::MissingDatabaseUrl, None);

        assert!(!body.contains("log file"));
        assert!(body.contains("DATABASE_URL"));
    }

    #[test]
    fn redacts_database_credentials_from_boxed_errors() {
        let password = "top-secret-password";
        let error: Box<dyn Error> = Box::new(std::io::Error::other(format!(
            "failed to connect with postgresql://user:{password}@localhost:5432/work_time_tracker"
        )));
        let body = body_of(error.as_ref());

        assert!(!body.contains(password));
        assert!(body.contains("/tmp/wtt.log"));
    }

    #[test]
    fn redacts_a_database_url_that_does_not_start_its_token() {
        let password = "top-secret-password";
        let error: Box<dyn Error> = Box::new(std::io::Error::other(format!(
            "(url=postgresql://user:{password}@localhost/work)"
        )));

        assert!(!body_of(error.as_ref()).contains(password));
    }

    #[test]
    fn keeps_whitespace_layout_while_redacting_urls() {
        let password = "supersecret";
        let message = format!("line 1:\n  postgresql://user:{password}@localhost/work\nline 2");
        let error: Box<dyn Error> = Box::new(std::io::Error::other(message));
        let body = body_of(error.as_ref());

        assert!(body.contains("line 1:\n"));
        assert!(body.contains("\nline 2"));
        assert!(!body.contains(password));
    }

    #[test]
    fn redacts_tokens_hashes_emails_and_paths_like_a_log_line() {
        let error: Box<dyn Error> = Box::new(std::io::Error::other(
            "token=abc123 for jane@example.com with $argon2id$v=19$hash\nat /home/jane/app.db",
        ));
        let body = body_of(error.as_ref());

        assert!(!body.contains("abc123"));
        assert!(!body.contains("jane@example.com"));
        assert!(!body.contains("$argon2id"));
        assert!(!body.contains("/home/jane/app.db"));
        assert!(body.contains("[redacted path]"));
    }

    #[test]
    fn falls_back_to_stderr_when_no_dialog_can_be_shown() {
        let error = ConfigError::MissingDatabaseUrl;

        let text = deliver(&error, Some(Path::new("/tmp/wtt.log")), |_, _| false)
            .expect("the text has to reach stderr");

        assert!(text.starts_with(TITLE));
        assert!(text.contains("/tmp/wtt.log"));
    }

    #[test]
    fn keeps_stderr_quiet_once_the_dialog_was_shown() {
        let error = ConfigError::MissingDatabaseUrl;

        assert_eq!(deliver(&error, None, |_, _| true), None);
    }
}
