use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, SecondsFormat};

use crate::error::AppResult;

const FILE_NAME: &str = "work-time-tracker.log";
const ROTATED_FILE_NAME: &str = "work-time-tracker.log.1";
/// Above this size the log is rotated once, so the file cannot grow forever.
const MAX_BYTES: u64 = 512 * 1024;
const MAX_MESSAGE_CHARS: usize = 2_000;
const REDACTED: &str = "[redacted]";
const REDACTED_PATH: &str = "[redacted path]";

/// Words whose value is never written to the log.
const SENSITIVE_KEYS: [&str; 11] = [
    "password",
    "passwort",
    "secret",
    "token",
    "hash",
    "credential",
    "credentials",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
];

/// Prefixes of the password hash formats that may appear in a message.
const HASH_PREFIXES: [&str; 6] = ["$argon2", "$pbkdf2", "$scrypt", "$2a$", "$2b$", "$2y$"];

static LOG_FILE: OnceLock<Mutex<PathBuf>> = OnceLock::new();

/// Points the logger at `<directory>/logs`. Logging before this call is a no-op,
/// so tests and the browser fallback never touch the file system.
pub fn init(directory: &Path) {
    let logs = directory.join("logs");
    if fs::create_dir_all(&logs).is_err() {
        return;
    }
    let _ = LOG_FILE.set(Mutex::new(logs.join(FILE_NAME)));
}

/// Appends one redacted error line. Failures of the logger itself are swallowed:
/// an unwritable log must never break the running application.
pub fn error(source: &str, message: &str) {
    write_line("ERROR", source, message);
}

/// Logs the failure of a command and hands the result back unchanged.
pub fn logged<T>(command: &str, action: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    let result = action();
    if let Err(failure) = &result {
        error(
            command,
            &format!("{}: {}", failure.kind(), failure.message()),
        );
    }
    result
}

fn write_line(level: &str, source: &str, message: &str) {
    let Some(path) = LOG_FILE.get() else {
        return;
    };
    let Ok(path) = path.lock() else {
        return;
    };
    // The lock also serializes rotation and appending, so lines cannot interleave.
    rotate(&path);
    append(&path, &format_line(level, source, message));
}

fn format_line(level: &str, source: &str, message: &str) -> String {
    format!(
        "{} {} [{}] {}\n",
        timestamp(),
        level,
        redact(&clamp(source)),
        redact(&clamp(message))
    )
}

fn append(path: &Path, line: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn rotate(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_BYTES {
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = fs::rename(path, parent.join(ROTATED_FILE_NAME));
    }
}

fn timestamp() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    i64::try_from(elapsed.as_secs())
        .ok()
        .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
        .map(|time| time.to_rfc3339_opts(SecondsFormat::Secs, true))
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_owned())
}

fn clamp(message: &str) -> String {
    message.chars().take(MAX_MESSAGE_CHARS).collect()
}

/// Removes credentials, hashes, e-mail addresses and file system paths from a
/// message. Both backends redact, so a log line is safe wherever it originates.
pub fn redact(message: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut redact_next = false;

    for token in message.split_whitespace() {
        if redact_next {
            redact_next = false;
            parts.push(REDACTED.to_owned());
            continue;
        }
        match split_pair(token) {
            Some((key, separator, value)) if is_sensitive_key(key) => {
                if value.is_empty() {
                    redact_next = true;
                    parts.push(format!("{key}{separator}"));
                } else {
                    parts.push(format!("{key}{separator}{REDACTED}"));
                }
            }
            Some((key, separator, value)) if !is_path(token) && needs_redaction(value) => {
                parts.push(format!("{key}{separator}{}", replacement(value)));
            }
            _ if needs_redaction(token) => parts.push(replacement(token).to_owned()),
            _ => parts.push(token.to_owned()),
        }
    }

    parts.join(" ")
}

fn replacement(token: &str) -> &'static str {
    if is_path(token) {
        REDACTED_PATH
    } else {
        REDACTED
    }
}

fn needs_redaction(token: &str) -> bool {
    contains_email(token) || is_hash(token) || is_path(token)
}

fn split_pair(token: &str) -> Option<(&str, char, &str)> {
    let index = token.find(['=', ':'])?;
    let separator = token[index..].chars().next()?;
    Some((&token[..index], separator, &token[index + 1..]))
}

fn is_sensitive_key(key: &str) -> bool {
    let key = key
        .trim_matches(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .to_ascii_lowercase();
    SENSITIVE_KEYS.contains(&key.as_str())
}

fn contains_email(token: &str) -> bool {
    let Some((local, domain)) = token.split_once('@') else {
        return false;
    };
    let local = local.trim_matches(|character: char| !character.is_ascii_alphanumeric());
    let Some((label, rest)) = domain.split_once('.') else {
        return false;
    };
    !local.is_empty()
        && !label.is_empty()
        && rest
            .chars()
            .any(|character| character.is_ascii_alphanumeric())
}

/// Password hashes carry their algorithm as a prefix, `$argon2id$...` here.
fn is_hash(token: &str) -> bool {
    let token = token.to_ascii_lowercase();
    HASH_PREFIXES.iter().any(|prefix| token.starts_with(prefix))
}

fn is_path(token: &str) -> bool {
    let windows = token
        .as_bytes()
        .get(1)
        .is_some_and(|character| *character == b':')
        && token.contains('\\');
    (token.starts_with('/') && token.len() > 1) || token.starts_with("\\\\") || windows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_ordinary_messages_readable() {
        assert_eq!(
            redact("This time overlaps with another time entry"),
            "This time overlaps with another time entry"
        );
    }

    #[test]
    fn removes_email_addresses() {
        assert_eq!(
            redact("login failed for jane.doe@example.com twice"),
            "login failed for [redacted] twice"
        );
        assert_eq!(
            redact("email=jane@example.com"),
            "email=[redacted]".to_owned()
        );
    }

    #[test]
    fn removes_values_of_sensitive_keys() {
        assert_eq!(redact("token: abc123"), "token: [redacted]");
        assert_eq!(redact("Authorization=Bearer"), "Authorization=[redacted]");
    }

    #[test]
    fn keeps_shell_style_variables() {
        assert_eq!(redact("reading $HOME failed"), "reading $HOME failed");
    }

    #[test]
    fn removes_password_hashes() {
        assert_eq!(
            redact("stored $argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$hash"),
            "stored [redacted]"
        );
    }

    #[test]
    fn removes_file_system_paths() {
        assert_eq!(
            redact("unable to open /home/jane/.local/share/db.sqlite"),
            "unable to open [redacted path]"
        );
        assert_eq!(
            redact("unable to open C:\\Users\\jane\\db.sqlite"),
            "unable to open [redacted path]"
        );
    }

    #[test]
    fn keeps_plain_words_that_only_look_similar() {
        assert_eq!(
            redact("Email or password is incorrect"),
            "Email or password is incorrect"
        );
        assert_eq!(redact("ratio 1:2 stays"), "ratio 1:2 stays");
    }

    #[test]
    fn clamps_long_messages() {
        let message = "a".repeat(MAX_MESSAGE_CHARS + 100);

        assert_eq!(clamp(&message).chars().count(), MAX_MESSAGE_CHARS);
    }

    #[test]
    fn logging_without_initialization_is_a_no_op() {
        error("test", "nothing is written");
    }

    #[test]
    fn writes_a_redacted_line_with_level_and_source() {
        let line = format_line("ERROR", "login", "failed for jane@example.com");

        assert!(line.starts_with(&timestamp()));
        assert!(line.ends_with("ERROR [login] failed for [redacted]\n"));
    }

    #[test]
    fn appends_every_line_to_the_same_file() {
        let path =
            std::env::temp_dir().join(format!("work-time-tracker-log-{}.log", std::process::id()));
        let _ = fs::remove_file(&path);

        append(&path, "first\n");
        append(&path, "second\n");

        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "first\nsecond\n".to_owned()
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rotates_the_log_once_it_grows_too_large() {
        let directory =
            std::env::temp_dir().join(format!("work-time-tracker-rotate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        fs::write(&path, "x".repeat(MAX_BYTES as usize + 1)).unwrap();

        rotate(&path);

        assert!(!path.exists());
        assert!(directory.join(ROTATED_FILE_NAME).exists());
        let _ = fs::remove_dir_all(&directory);
    }
}
